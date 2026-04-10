import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

interface Machine {
  id: string;
  nom: string;
  esp32_id: string;
}

export default function Appareils() {
  const navigate = useNavigate();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('machines').select('id, nom, esp32_id').then(({ data, error }) => {
      if (!error) setMachines(data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 24px' }}>Appareils</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
        {machines.map((m) => (
          <div
            key={m.id}
            onClick={() => navigate(`/machines/${m.id}`)}
            style={{
              padding: 20,
              backgroundColor: '#FFF',
              borderRadius: 12,
              border: '1px solid #EEE',
              cursor: 'pointer',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: '600', color: '#000' }}>{m.nom}</h3>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>ID ESP32 : {m.esp32_id}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
