import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';

type ProspectState = 'a-prospecter' | 'en-cours-attente' | 'a-recontacter' | 'thierry';
type Prospect = {
  id: number;
  titre: string;
  adresse: string;
  telephone: string | null;
  email: string | null;
  etat: ProspectState;
  notes: string | null;
};

export default function CrmProspection() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Prospect[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('prospects').select('*').order('id', { ascending: false });
    if (!error) setRows((data ?? []) as Prospect[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.titre.toLowerCase().includes(q) || row.adresse.toLowerCase().includes(q));
  }, [query, rows]);

  const updateEtat = async (id: number, etat: ProspectState) => {
    await supabase.from('prospects').update({ etat }).eq('id', id);
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, etat } : row)));
  };

  const removeProspect = async (id: number) => {
    if (!window.confirm('Supprimer ce prospect ?')) return;
    await supabase.from('prospects').delete().eq('id', id);
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>Prospection CRM</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un prospect..."
        style={{ width: '100%', maxWidth: 420, marginBottom: 16, border: '1px solid #DDD', borderRadius: 8, padding: '10px 12px' }}
      />
      {loading ? (
        <p style={{ color: '#666' }}>Chargement...</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredRows.map((row) => (
            <div key={row.id} style={{ background: '#fff', border: '1px solid #EEE', borderRadius: 10, padding: 12 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{row.titre}</p>
              <p style={{ margin: '6px 0', color: '#666' }}>{row.adresse}</p>
              <p style={{ margin: '0 0 8px', color: '#444' }}>{row.notes ?? 'Sans notes'}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={row.etat} onChange={(e) => void updateEtat(row.id, e.target.value as ProspectState)}>
                  <option value="a-prospecter">A prospecter</option>
                  <option value="en-cours-attente">En cours / Attente</option>
                  <option value="a-recontacter">A recontacter</option>
                  <option value="thierry">Thierry</option>
                </select>
                <button onClick={() => void removeProspect(row.id)}>Supprimer</button>
              </div>
            </div>
          ))}
          {filteredRows.length === 0 && <p style={{ color: '#666' }}>Aucun prospect.</p>}
        </div>
      )}
    </div>
  );
}
