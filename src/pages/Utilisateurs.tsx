import { useEffect, useMemo, useState } from 'react';
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

const emptyAddForm = { email: '', password: '', first_name: '', last_name: '', phone: '' };

export default function Utilisateurs() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadProfiles = async () => {
    const [{ data, error: fetchErr }, { data: boardRoles, error: boardRolesErr }, { data: crmUsers, error: crmUsersErr }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('board_account_roles').select('user_id'),
      supabase.from('crm_users').select('id'),
    ]);
    if (fetchErr) {
      setError(fetchErr.message);
      setProfiles([]);
    } else if (boardRolesErr) {
      setError(boardRolesErr.message);
      setProfiles([]);
    } else if (crmUsersErr) {
      setError(crmUsersErr.message);
      setProfiles([]);
    } else {
      setError(null);
      const boardIds = new Set(
        (boardRoles ?? []).map((r: { user_id?: string | null }) => r.user_id ?? '').filter(Boolean)
      );
      const crmIds = new Set(
        (crmUsers ?? []).map((r: { id?: string | null }) => r.id ?? '').filter(Boolean)
      );
      const filtered = (data ?? []).filter((p: Profile) => !boardIds.has(p.id) && !crmIds.has(p.id));
      const sorted = filtered.sort((a: Profile, b: Profile) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      });
      setProfiles(sorted as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleAddUser = async () => {
    setAdding(true);
    setAddError(null);
    const { data, error: invokeErr } = await supabase.functions.invoke('manage-app-users', {
      body: addForm,
    });
    if (invokeErr || data?.error) {
      setAddError(String(data?.error ?? invokeErr?.message ?? 'Erreur inconnue.'));
      setAdding(false);
      return;
    }
    setShowAdd(false);
    setAddForm(emptyAddForm);
    setLoading(true);
    await loadProfiles();
    setAdding(false);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const displayName = (p: Profile) => {
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.prenom && p.nom ? `${p.prenom} ${p.nom}` : p.prenom || p.nom) || p.email;
    return name || '—';
  };

  const filteredProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const name = displayName(p).toLowerCase();
      const email = (p.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [profiles, query]);

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;
  if (error) return <p style={{ color: '#B91C1C' }}>Erreur : {error}</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Utilisateurs</h1>
        <button
          onClick={() => { setAddError(null); setShowAdd(true); }}
          style={{ padding: '10px 18px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer', fontSize: 14 }}
        >
          + Ajouter un utilisateur
        </button>
      </div>
      <p style={{ color: '#666', margin: '0 0 32px' }}>
        Personnes ayant créé un compte sur l&apos;application. Les comptes d&apos;accès au board sont gérés séparément.
      </p>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => !adding && setShowAdd(false)}>
          <div style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>Ajouter un utilisateur app</h3>
            {addError && (
              <p style={{ margin: '0 0 16px', padding: 12, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 14 }}>{addError}</p>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Prénom</label>
              <input
                type="text"
                value={addForm.first_name}
                onChange={(e) => setAddForm((p) => ({ ...p, first_name: e.target.value }))}
                style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Nom</label>
              <input
                type="text"
                value={addForm.last_name}
                onChange={(e) => setAddForm((p) => ({ ...p, last_name: e.target.value }))}
                style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Téléphone</label>
              <input
                type="tel"
                value={addForm.phone}
                onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Email</label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                required
                style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Mot de passe (8 caractères min.)</label>
              <input
                type="text"
                value={addForm.password}
                onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                required
                style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                disabled={adding}
                style={{ padding: '12px 20px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleAddUser()}
                disabled={adding || !addForm.email.trim() || addForm.password.length < 8}
                style={{ padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: adding ? 'wait' : 'pointer' }}
              >
                {adding ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher par nom ou email..."
        style={{ width: '100%', maxWidth: 420, marginBottom: 16, border: '1px solid #DDD', borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
      />

      <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        {filteredProfiles.length === 0 ? (
          <p style={{ padding: 32, color: '#666' }}>{profiles.length === 0 ? 'Aucun utilisateur.' : 'Aucun résultat.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
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
              {filteredProfiles.map((p) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
