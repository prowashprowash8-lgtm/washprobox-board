import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

type Role = 'patron' | 'salarie';

type CrmUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  role: Role;
  is_active: boolean;
};

type Intervention = {
  id: number;
  user_id: string;
  laverie_id: string;
  laverie_name: string;
  laverie_ville: string;
  motif: string;
  description: string | null;
  date: string;
  statut?: string | null;
};

type Historique = {
  id: number;
  laverie_id: string;
  technicien_id?: string | null;
  technicien_nom: string;
  date_intervention: string;
  motif: string;
  description: string;
  compte_rendu: string;
  pieces_changees: string | null;
};

type Commande = {
  id: string;
  laverie_id: string;
  statut: string;
  date_commande: string;
  notes?: string | null;
  articles: Array<{ nom: string; quantite: number; recu?: number }>;
  technicien_id?: string | null;
};

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function CrmUtilisateurDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const userId = String(id ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [historique, setHistorique] = useState<Historique[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [laveriesById, setLaveriesById] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      if (!userId) {
        setNotice('Utilisateur introuvable (id manquant).');
        setLoading(false);
        return;
      }
      setLoading(true);
      setNotice(null);
      try {
        const [u, i, h, c, l] = await Promise.all([
          supabase.from('crm_users').select('id, email, first_name, role, is_active').eq('id', userId).maybeSingle(),
          supabase.from('interventions').select('*').eq('user_id', userId).order('date', { ascending: false }),
          supabase
            .from('historique')
            .select('id, laverie_id, technicien_id, technicien_nom, date_intervention, motif, description, compte_rendu, pieces_changees')
            .eq('technicien_id', userId)
            .order('date_intervention', { ascending: false }),
          supabase.from('commandes').select('*').eq('technicien_id', userId).order('date_commande', { ascending: false }),
          supabase.from('laveries').select('id, nom'),
        ]);

        if (u.error) throw u.error;
        if (!u.data) {
          setUser(null);
          setNotice('Utilisateur CRM introuvable.');
          setLoading(false);
          return;
        }

        if (i.error) setNotice((prev) => prev ?? `Planning indisponible: ${i.error.message}`);
        if (h.error) setNotice((prev) => prev ?? `Historique indisponible: ${h.error.message}`);
        if (c.error) setNotice((prev) => prev ?? `Commandes indisponibles: ${c.error.message}`);

        const map = ((l.data ?? []) as Array<{ id: string; nom: string }>).reduce<Record<string, string>>((acc, row) => {
          acc[row.id] = row.nom;
          return acc;
        }, {});
        setLaveriesById(map);

        setUser(u.data as CrmUser);
        setInterventions(((i.data ?? []) as Intervention[]) ?? []);
        setHistorique(((h.data ?? []) as Historique[]) ?? []);
        setCommandes((((c.data ?? []) as Commande[]) ?? []).map((row) => ({ ...row, articles: Array.isArray(row.articles) ? row.articles : [] })));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [userId]);

  const piecesCommandeCount = useMemo(
    () => commandes.reduce((sum, cmd) => sum + (cmd.articles?.reduce((s, a) => s + (Number(a.quantite) || 0), 0) ?? 0), 0),
    [commandes]
  );

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <button onClick={() => navigate('/crm/utilisateurs')} style={{ marginBottom: 12 }}>
        Retour
      </button>

      {notice && (
        <div style={{ padding: 12, marginBottom: 16, backgroundColor: '#fff4d6', color: '#7a5a00', borderRadius: 10 }}>
          {notice}
        </div>
      )}

      {!user ? <p style={{ color: '#666' }}>Utilisateur introuvable.</p> : (
        <>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 26 }}>
              {user.first_name || user.email || user.id}
            </h1>
            <p style={{ margin: '8px 0 0', color: '#666' }}>
              {user.email ?? 'Email inconnu'} · {user.role === 'patron' ? 'Patron' : 'Salarié'} · {user.is_active ? 'Actif' : 'Inactif'}
            </p>
            <p style={{ margin: '8px 0 0', color: '#666' }}>
              Planning : <strong>{interventions.length}</strong> · Clôtures : <strong>{historique.length}</strong> · Pièces commandées : <strong>{piecesCommandeCount}</strong>
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Planning (interventions)</h2>
              {interventions.length === 0 ? (
                <p style={{ color: '#777' }}>Aucune intervention planifiée.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {interventions.map((it) => (
                    <div key={it.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{it.laverie_name}</div>
                      <div style={{ color: '#666', marginTop: 4 }}>{fmtDate(it.date)} · {it.laverie_ville} · {it.motif}</div>
                      {it.description ? <div style={{ marginTop: 6 }}>{it.description}</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>Clôtures (historique)</h2>
              {historique.length === 0 ? (
                <p style={{ color: '#777' }}>Aucune clôture enregistrée pour ce compte.</p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {historique.map((h) => (
                    <div key={h.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{laveriesById[h.laverie_id] ?? 'Laverie'}</div>
                      <div style={{ color: '#666', marginTop: 4 }}>{fmtDate(h.date_intervention)} · {h.motif}</div>
                      <div style={{ marginTop: 6 }}>{h.compte_rendu}</div>
                      {h.pieces_changees ? (
                        <div style={{ marginTop: 8, color: '#444' }}>
                          <strong>Pièces :</strong> {h.pieces_changees}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16, marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>Commandes / pièces</h2>
            {commandes.length === 0 ? (
              <p style={{ color: '#777' }}>Aucune commande associée à ce compte.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {commandes.map((c) => (
                  <div key={c.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>{laveriesById[c.laverie_id] ?? 'Laverie'}</div>
                    <div style={{ color: '#666', marginTop: 4 }}>{fmtDate(c.date_commande)} · {c.statut}</div>
                    {c.notes ? <div style={{ marginTop: 6, color: '#444' }}>{c.notes}</div> : null}
                    {c.articles?.length ? (
                      <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                        {c.articles.map((a, idx) => (
                          <li key={idx}>
                            {a.nom} (×{a.quantite}{typeof a.recu === 'number' ? `, reçu ${a.recu}` : ''})
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

