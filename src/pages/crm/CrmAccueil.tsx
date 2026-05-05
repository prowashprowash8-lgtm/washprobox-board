import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';

type StatRow = { label: string; value: number; color: string };

export default function CrmAccueil() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatRow[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      const [lav, inter, cmd, pros] = await Promise.all([
        supabase.from('laveries').select('*', { count: 'exact', head: true }),
        supabase.from('interventions').select('*', { count: 'exact', head: true }),
        supabase.from('commandes').select('*', { count: 'exact', head: true }),
        supabase.from('prospects').select('*', { count: 'exact', head: true }),
      ]);
      if (!alive) return;
      setStats([
        { label: 'Laveries', value: lav.count ?? 0, color: '#1C69D3' },
        { label: 'Interventions', value: inter.count ?? 0, color: '#7C3AED' },
        { label: 'Commandes', value: cmd.count ?? 0, color: '#D97706' },
        { label: 'Prospects', value: pros.count ?? 0, color: '#059669' },
      ]);
      setLoading(false);
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 20px' }}>Accueil CRM</h1>
      {loading ? (
        <p style={{ color: '#666' }}>Chargement...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid #EEE', borderRadius: 12, padding: 16 }}>
              <p style={{ margin: 0, color: '#666', fontSize: 13 }}>{s.label}</p>
              <p style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 700, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
