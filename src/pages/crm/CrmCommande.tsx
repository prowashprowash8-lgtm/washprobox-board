import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Package } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { COLORS } from '../../lib/constants';
import styles from './commandes.module.css';

type Article = { nom: string; quantite: number; recu?: number };
type Commande = {
  id: string;
  laverie_id: string;
  laverie_name?: string;
  statut: 'commandé' | 'en attente' | 'reçu';
  date_commande: string;
  date_livraison_prevue?: string | null;
  notes?: string | null;
  articles: Article[];
};
type Laverie = { id: string; nom: string };
type Emplacement = { id: string; name: string | null; address: string | null };

export default function CrmCommande() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Commande[]>([]);
  const [laveries, setLaveries] = useState<Record<string, string>>({});
  const [laverieOptions, setLaverieOptions] = useState<Laverie[]>([]);
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filterStatut, setFilterStatut] = useState<'all' | 'attente' | 'reçu'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    laverie_id: '',
    date_livraison_prevue: '',
    notes: '',
    articles: [{ nom: '', quantite: 1 }] as Article[],
  });

  const load = async () => {
    setLoading(true);
    const [l, c, e] = await Promise.all([
      supabase.from('laveries').select('id, nom'),
      supabase.from('commandes').select('*').order('date_commande', { ascending: false }),
      supabase.from('emplacements').select('id, name, address').order('name', { ascending: true }),
    ]);
    if (!l.error) {
      const options = (l.data ?? []) as Laverie[];
      setLaverieOptions(options);
      const map = options.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = item.nom;
        return acc;
      }, {});
      setLaveries(map);
    }
    if (!e.error) setEmplacements((e.data ?? []) as Emplacement[]);
    if (!c.error) {
      const hydrated = ((c.data ?? []) as Commande[]).map((item) => ({
        ...item,
        laverie_name: l.data?.find((lav) => lav.id === item.laverie_id)?.nom ?? 'Inconnu',
        articles: Array.isArray(item.articles) ? item.articles : [],
      }));
      setRows(hydrated);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const checkAutoStatusUpdate = async () => {
      const toReceived = rows.filter((c) => c.statut !== 'reçu' && calculateProgress(c.articles) === 100);
      const toInProgress = rows.filter((c) => c.statut !== 'en attente' && calculateProgress(c.articles) > 0 && calculateProgress(c.articles) < 100);
      const toOrdered = rows.filter((c) => c.statut !== 'commandé' && calculateProgress(c.articles) === 0);
      for (const commande of toReceived) await updateStatus(commande.id, 'reçu');
      for (const commande of toInProgress) await updateStatus(commande.id, 'en attente');
      for (const commande of toOrdered) await updateStatus(commande.id, 'commandé');
    };
    if (rows.length > 0) void checkAutoStatusUpdate();
  }, [rows]);

  const stats = useMemo(() => {
    const pending = rows.filter((row) => row.statut === 'commandé' || row.statut === 'en attente').length;
    const received = rows.filter((row) => row.statut === 'reçu').length;
    return { total: rows.length, pending, received };
  }, [rows]);

  const updateStatus = async (id: string, statut: Commande['statut']) => {
    setUpdatingId(id);
    await supabase.from('commandes').update({ statut }).eq('id', id);
    await load();
    setUpdatingId(null);
  };

  const updateArticleRecu = async (commandeId: string, articleIndex: number, quantiteRecue: number) => {
    setUpdatingId(commandeId);
    const commande = rows.find((c) => c.id === commandeId);
    if (!commande) return;
    const updatedArticles = [...commande.articles];
    updatedArticles[articleIndex] = { ...updatedArticles[articleIndex], recu: quantiteRecue };
    await supabase.from('commandes').update({ articles: updatedArticles }).eq('id', commandeId);
    await load();
    setUpdatingId(null);
  };

  const addCreateArticle = () => {
    setCreateForm((prev) => ({ ...prev, articles: [...prev.articles, { nom: '', quantite: 1 }] }));
  };

  const removeCreateArticle = (index: number) => {
    setCreateForm((prev) => ({ ...prev, articles: prev.articles.filter((_, i) => i !== index) }));
  };

  const updateCreateArticle = (index: number, patch: Partial<Article>) => {
    setCreateForm((prev) => ({
      ...prev,
      articles: prev.articles.map((article, i) => (i === index ? { ...article, ...patch } : article)),
    }));
  };

  const createCommande = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.laverie_id) return;
    setCreateError(null);

    let targetLaverieId = createForm.laverie_id;
    if (targetLaverieId.startsWith('board:')) {
      const empId = targetLaverieId.replace('board:', '');
      const emp = emplacements.find((item) => item.id === empId);
      if (!emp?.name) {
        setCreateError('Impossible de retrouver la laverie board sélectionnée.');
        return;
      }

      // Tente de créer/synchroniser la laverie CRM depuis le board.
      try {
        await supabase.rpc('backfill_emplacements_to_crm');
      } catch {
        // no-op: on tente quand même de retrouver la laverie CRM existante.
      }

      const crmMatch = await supabase
        .from('laveries')
        .select('id')
        .eq('nom', emp.name.trim())
        .eq('adresse', (emp.address ?? 'Adresse non renseignée').trim())
        .maybeSingle();

      if (crmMatch.error || !crmMatch.data?.id) {
        setCreateError('Cette laverie board n’est pas encore synchronisée côté CRM.');
        return;
      }
      targetLaverieId = crmMatch.data.id as string;
    }

    const validArticles = createForm.articles
      .map((article) => ({ nom: article.nom.trim(), quantite: Number(article.quantite) || 0 }))
      .filter((article) => article.nom && article.quantite > 0);
    if (!validArticles.length) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      laverie_id: targetLaverieId,
      statut: 'commandé',
      date_commande: new Date().toISOString(),
      articles: validArticles,
      notes: createForm.notes.trim() || null,
    };
    if (createForm.date_livraison_prevue) {
      payload.date_livraison_prevue = new Date(createForm.date_livraison_prevue).toISOString();
    }
    const { error } = await supabase.from('commandes').insert(payload);
    setSaving(false);
    if (error) {
      setCreateError(error.message);
      return;
    }
    setCreateForm({ laverie_id: '', date_livraison_prevue: '', notes: '', articles: [{ nom: '', quantite: 1 }] });
    setShowCreate(false);
    await load();
  };

  const getStatusColor = (statut: string) => (statut === 'commandé' ? COLORS.status.pending : statut === 'en attente' ? '#f59e0b' : COLORS.status.completed);
  const getStatusLabel = (statut: string) => (statut === 'commandé' ? 'Commandé' : statut === 'en attente' ? 'En attente' : 'Reçu');
  const formatDate = (date: string) => new Date(date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const calculateProgress = (articles: Article[]) => {
    if (!articles.length) return 0;
    const totalQty = articles.reduce((sum, a) => sum + a.quantite, 0);
    const receivedQty = articles.reduce((sum, a) => sum + (a.recu || 0), 0);
    return Math.round((receivedQty / totalQty) * 100);
  };
  const rowsFiltered = filterStatut === 'all'
    ? rows
    : filterStatut === 'attente'
    ? rows.filter((c) => c.statut === 'commandé' || c.statut === 'en attente')
    : rows.filter((c) => c.statut === 'reçu');

  return (
    <div className={styles.commandesContainer}>
      <div className={styles.commandesContent}>
        <div className={styles.header}>
          <h1>Gestion des commandes</h1>
          <button className={styles.btnNewCommande} onClick={() => setShowCreate(true)}>Nouvelle commande</button>
        </div>
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${filterStatut === 'all' ? styles.statCardActive : ''}`} onClick={() => setFilterStatut('all')}><div className={styles.statIcon}><Package size={28} /></div><div className={styles.statContent}><div className={styles.statValue}>{stats.total}</div><div className={styles.statLabel}>Commandes au total</div></div></div>
          <div className={`${styles.statCard} ${filterStatut === 'attente' ? styles.statCardActive : ''}`} onClick={() => setFilterStatut('attente')}><div className={styles.statIcon}><Clock size={28} /></div><div className={styles.statContent}><div className={styles.statValue}>{stats.pending}</div><div className={styles.statLabel}>En attente</div></div></div>
          <div className={`${styles.statCard} ${filterStatut === 'reçu' ? styles.statCardActive : ''}`} onClick={() => setFilterStatut('reçu')}><div className={styles.statIcon}><CheckCircle size={28} /></div><div className={styles.statContent}><div className={styles.statValue}>{stats.received}</div><div className={styles.statLabel}>Reçues</div></div></div>
        </div>
        {loading ? <div className={styles.loading}><div className={styles.spinner}></div><p>Chargement...</p></div> : rowsFiltered.length === 0 ? (
          <div className={styles.emptyState}><p className={styles.emptyText}>Aucune commande</p></div>
        ) : (
          <div className={styles.commandesList}>
            {rowsFiltered.map((row) => (
              <div key={row.id} className={styles.commandeCard}>
                <div className={styles.commandeCardHeader} onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}>
                  <div className={styles.commandeInfoTop}><div><h3 className={styles.commandeLaverie}>{row.laverie_name || laveries[row.laverie_id] || 'Laverie inconnue'}</h3><p className={styles.commandeDate}>{formatDate(row.date_commande)}</p></div><div className={styles.commandeStatus} style={{ background: getStatusColor(row.statut) }}>{getStatusLabel(row.statut)}</div></div>
                  <div className={styles.progressContainer}><div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${calculateProgress(row.articles)}%`, background: calculateProgress(row.articles) === 100 ? '#34d399' : '#3b82f6' }}></div></div><span className={styles.progressText}>{calculateProgress(row.articles)}% reçu</span></div>
                </div>
                {expandedId === row.id && <div className={styles.commandeCardContent}>
                  <div className={styles.articlesSection}><h4>Articles commandés</h4><div className={styles.articlesList}>{row.articles.map((article, idx) => <div key={idx} className={styles.articleItem}><div className={styles.articleInfo}><span className={styles.articleName}>{article.nom}</span><span className={styles.articleQty}>Commandé: {article.quantite}</span></div><div className={styles.articleRecu}><input type="number" min="0" max={article.quantite} value={article.recu || 0} onChange={(e) => void updateStatus(row.id, (parseInt(e.target.value, 10) || 0) >= article.quantite ? 'reçu' : 'en attente')} className={styles.inputQty} /><span className={styles.labelRecu}>reçu</span></div></div>)}</div></div>
                  <div className={styles.articlesSection}><h4>Articles commandés</h4><div className={styles.articlesList}>{row.articles.map((article, idx) => <div key={idx} className={styles.articleItem}><div className={styles.articleInfo}><span className={styles.articleName}>{article.nom}</span><span className={styles.articleQty}>Commandé: {article.quantite}</span></div><div className={styles.articleRecu}><input type="number" min="0" max={article.quantite} value={article.recu || 0} onChange={(e) => void updateArticleRecu(row.id, idx, parseInt(e.target.value, 10) || 0)} className={styles.inputQty} disabled={updatingId === row.id} /><span className={styles.labelRecu}>reçu</span></div></div>)}</div></div>
                  <select value={row.statut} onChange={(e) => void updateStatus(row.id, e.target.value as Commande['statut'])} disabled={updatingId === row.id}>
                    <option value="commandé">Commandé</option><option value="en attente">En attente</option><option value="reçu">Reçu</option>
                  </select>
                </div>}
              </div>
            ))}
          </div>
        )}
        {showCreate && (
          <div className={styles.modalOverlay} onClick={() => setShowCreate(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <h2 className={styles.modalTitle}>Nouvelle commande</h2>
              <form onSubmit={createCommande}>
                <div className={styles.modalFields}>
                  <select className={styles.modalSelect} value={createForm.laverie_id} onChange={(e) => setCreateForm((prev) => ({ ...prev, laverie_id: e.target.value }))} required>
                    <option value="">Choisir une laverie</option>
                    {laverieOptions.map((lav) => <option key={lav.id} value={lav.id}>{lav.nom}</option>)}
                    {emplacements
                      .filter((emp) => emp.name && !laverieOptions.some((lav) => lav.nom.trim().toLowerCase() === (emp.name ?? '').trim().toLowerCase()))
                      .map((emp) => (
                        <option key={`board-${emp.id}`} value={`board:${emp.id}`}>
                          {(emp.name ?? 'Sans nom')} (Board)
                        </option>
                      ))}
                  </select>
                  <input className={styles.modalInput} type="date" value={createForm.date_livraison_prevue} onChange={(e) => setCreateForm((prev) => ({ ...prev, date_livraison_prevue: e.target.value }))} />
                  <textarea className={styles.modalTextarea} rows={3} value={createForm.notes} onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes (optionnel)" />
                </div>
                {createError && (
                  <p style={{ margin: '0 0 10px', color: '#b91c1c', fontWeight: 600 }}>{createError}</p>
                )}
                <div className={styles.articlesBlock}>
                  <p className={styles.articlesTitle}>Articles</p>
                  {createForm.articles.map((article, idx) => (
                    <div key={idx} className={styles.articleRow}>
                      <input className={styles.modalInput} type="text" placeholder="Nom de l'article" value={article.nom} onChange={(e) => updateCreateArticle(idx, { nom: e.target.value })} required />
                      <input className={styles.modalInput} type="number" min={1} placeholder="Qté" value={article.quantite} onChange={(e) => updateCreateArticle(idx, { quantite: parseInt(e.target.value, 10) || 1 })} required />
                      <button className={styles.btnDanger} type="button" onClick={() => removeCreateArticle(idx)} disabled={createForm.articles.length === 1}>Supprimer</button>
                    </div>
                  ))}
                  <button className={styles.btnSecondary} type="button" onClick={addCreateArticle}>+ Ajouter un article</button>
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.btnSecondary} type="button" onClick={() => setShowCreate(false)}>Annuler</button>
                  <button className={styles.btnNewCommande} type="submit" disabled={saving}>{saving ? 'Création...' : 'Créer la commande'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
