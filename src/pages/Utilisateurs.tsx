import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

interface Profile {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  nom?: string | null;
  prenom?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export default function Utilisateurs() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data, error: fetchErr } = await supabase.from('profiles').select('*');
      if (fetchErr) {
        setError(fetchErr.message);
        setProfiles([]);
      } else {
        setError(null);
        const sorted = (data ?? []).sort((a: Profile, b: Profile) => {
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          return db - da;
        });
        setProfiles(sorted as Profile[]);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const displayName = (p: Profile) => {
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.prenom && p.nom ? `${p.prenom} ${p.nom}` : p.prenom || p.nom) || p.email;
    return name || '—';
  };

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;
  if (error) return <p style={{ color: '#B91C1C' }}>Erreur : {error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>Utilisateurs</h1>
      <p style={{ color: '#666', margin: '0 0 32px' }}>Personnes ayant créé un compte sur l&apos;application.</p>

      <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        {profiles.length === 0 ? (
          <p style={{ padding: 32, color: '#666' }}>Aucun utilisateur.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #EEE' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Utilisateur</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Email</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Inscription</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Dernière connexion</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/utilisateurs/${p.id}`)}
                  style={{ borderBottom: '1px solid #F0F0F0', cursor: 'pointer' }}
                >
                  <td style={{ padding: '14px 20px', fontSize: 15, fontWeight: '600', color: '#000' }}>{displayName(p)}</td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>{p.email || '—'}</td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>{formatDate(p.created_at ?? null)}</td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>{formatDate(p.last_login_at ?? p.updated_at ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
