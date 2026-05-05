import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './laveries.module.css';

type Laverie = {
  id: string;
  nom: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  source?: 'crm' | 'board';
};

export default function CrmLaveries() {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Laverie[]>([]);

  const load = async () => {
    setLoading(true);
    const [crmRes, boardRes] = await Promise.all([
      supabase
        .from('laveries')
        .select('id, nom, adresse, code_postal, ville, telephone, email')
        .order('nom', { ascending: true }),
      supabase
        .from('emplacements')
        .select('id, name, address')
        .order('name', { ascending: true }),
    ]);

    const crmRows: Laverie[] = (crmRes.data ?? []).map((row) => ({
      ...(row as Laverie),
      source: 'crm',
    }));

    const existing = new Set(
      crmRows.map((row) => `${(row.nom ?? '').trim().toLowerCase()}|${(row.adresse ?? '').trim().toLowerCase()}`),
    );

    const boardFallbackRows: Laverie[] = (boardRes.data ?? [])
      .filter((row) => !existing.has(`${(row.name ?? '').trim().toLowerCase()}|${(row.address ?? '').trim().toLowerCase()}`))
      .map((row) => ({
        id: `board-${row.id}`,
        nom: row.name ?? 'Sans nom',
        adresse: row.address ?? 'Adresse non renseignée',
        code_postal: null,
        ville: null,
        telephone: null,
        email: null,
        source: 'board',
      }));

    const merged = [...crmRows, ...boardFallbackRows].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    void load();

    const channel = supabase
      .channel('crm-laveries-board-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'emplacements' },
        async () => {
          // La synchro board -> CRM est gérée en base via trigger SECURITY DEFINER.
          await load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const importFromBoard = async () => {
    setImporting(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc('backfill_emplacements_to_crm');
      if (error) throw error;
      const imported = (data ?? []).filter((row: { status?: string }) => row.status === 'ok').length;
      setNotice(imported ? `${imported} laverie(s) board synchronisée(s).` : 'Aucune nouvelle laverie à synchroniser.');
      await load();
    } catch (error) {
      const err = error as { message?: string; details?: string; hint?: string; code?: string };
      const message = [err?.message, err?.details, err?.hint, err?.code].filter(Boolean).join(' | ') || 'Erreur sync';
      setNotice(`Erreur sync DB. Exécute les scripts SQL de synchro (trigger + backfill). Détail: ${message}`);
    } finally {
      setImporting(false);
    }
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.nom, row.ville, row.code_postal, row.adresse].some((value) =>
        (value ?? '').toLowerCase().includes(q),
      ),
    );
  }, [query, rows]);

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>Laveries CRM</h1>
      <div className={styles.header}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom, ville, code postal, adresse..."
          className={styles.searchInput}
        />
        <button className={styles.btnImport} onClick={() => void importFromBoard()} disabled={importing}>
          {importing ? 'Import...' : 'Importer depuis Board'}
        </button>
      </div>
      {notice && <p className={styles.notice}>{notice}</p>}
      {loading ? (
        <p style={{ color: '#666' }}>Chargement...</p>
      ) : (
        <div className={styles.grid}>
          {filteredRows.map((row) => (
            <Link
              to={row.source === 'crm' ? `/crm/laveries/${row.id}` : `/crm/laveries/board/${row.id.replace('board-', '')}`}
              key={row.id}
              className={styles.card}
            >
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{row.nom}</p>
              <p style={{ margin: '8px 0 4px', color: '#555' }}>
                {[row.adresse, row.code_postal, row.ville].filter(Boolean).join(', ')}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#777' }}>
                {row.telephone ?? 'Sans téléphone'} - {row.email ?? 'Sans email'}
              </p>
              {row.source === 'board' && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#1c69d3', fontWeight: 600 }}>
                  Source: Board
                </p>
              )}
            </Link>
          ))}
          {filteredRows.length === 0 && <p style={{ color: '#666' }}>Aucune laverie trouvée.</p>}
        </div>
      )}
      </div>
    </div>
  );
}
