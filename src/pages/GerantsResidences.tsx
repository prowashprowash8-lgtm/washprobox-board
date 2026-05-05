import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

type BoardRole = 'patron' | 'residence';

interface ProfileRow {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  prenom?: string | null;
  nom?: string | null;
}

interface RoleRow {
  user_id: string;
  role: BoardRole;
}

interface AccessRow {
  user_id: string;
  emplacement_id: string;
}

interface EmplacementRow {
  id: string;
  name: string;
  address?: string | null;
}

interface ManagerRow {
  id: string;
  email: string;
  name: string;
  role: BoardRole | null;
  emplacementIds: string[];
}

function displayName(p: ProfileRow): string {
  return (
    p.full_name ||
    [p.first_name, p.last_name].filter(Boolean).join(' ') ||
    (p.prenom && p.nom ? `${p.prenom} ${p.nom}` : p.prenom || p.nom) ||
    p.email ||
    '—'
  );
}

function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function resolveFunctionErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (err && typeof err === 'object' && 'context' in err) {
    const response = (err as { context?: unknown }).context;
    if (response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as {
          error?: unknown;
          message?: unknown;
        };
        if (typeof payload.error === 'string' && payload.error.trim()) {
          return payload.error;
        }
        if (typeof payload.message === 'string' && payload.message.trim()) {
          return payload.message;
        }
      } catch {
        // Ignore JSON parsing issues and try plain text below.
      }

      try {
        const text = await response.clone().text();
        if (text.trim()) return text;
      } catch {
        // Ignore body parsing issues and fall back to the generic error below.
      }
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

type GerantsResidencesProps = {
  embedded?: boolean;
};

export default function GerantsResidences({ embedded = false }: GerantsResidencesProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [emplacements, setEmplacements] = useState<EmplacementRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ManagerRow | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'residence' as BoardRole,
    emplacementIds: [] as string[],
  });

  const emplacementMap = useMemo(
    () => Object.fromEntries(emplacements.map((e) => [e.id, e])),
    [emplacements]
  );

  const resetForm = () => {
    setForm({
      email: '',
      password: '',
      role: 'residence',
      emplacementIds: [],
    });
  };

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setError(null);
    setSuccess(null);
    setShowCreate(true);
  };

  const openEdit = (manager: ManagerRow) => {
    setEditing(manager);
    setError(null);
    setSuccess(null);
    setForm({
      email: manager.email,
      password: '',
      role: manager.role ?? 'residence',
      emplacementIds: manager.emplacementIds,
    });
    setShowCreate(false);
  };

  const closeModal = () => {
    setShowCreate(false);
    setEditing(null);
    resetForm();
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: roles, error: rolesErr }, { data: accesses, error: accessesErr }, { data: emplacementsData, error: emplacementsErr }] =
        await Promise.all([
          supabase.from('board_account_roles').select('user_id, role'),
          supabase.from('board_account_emplacements').select('user_id, emplacement_id'),
          supabase.from('emplacements').select('id, name, address').order('name'),
        ]);

      if (rolesErr) throw rolesErr;
      if (accessesErr) throw accessesErr;
      if (emplacementsErr) throw emplacementsErr;

      const roleRows = (roles ?? []) as RoleRow[];
      const roleMap = new Map((roles ?? []).map((r: RoleRow) => [r.user_id, r.role]));
      const accessMap = new Map<string, string[]>();
      (accesses ?? []).forEach((row: AccessRow) => {
        const list = accessMap.get(row.user_id) ?? [];
        list.push(row.emplacement_id);
        accessMap.set(row.user_id, list);
      });

      let profileMap = new Map<string, ProfileRow>();
      const userIds = roleRows.map((r) => r.user_id);
      if (userIds.length > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);
        if (profilesErr) throw profilesErr;
        profileMap = new Map(
          (profiles ?? []).map((p: ProfileRow) => [p.id, p])
        );
      }

      const rows = roleRows.map((roleRow) => {
        const profile = profileMap.get(roleRow.user_id);
        return {
          id: roleRow.user_id,
          email: profile?.email ?? 'Email inconnu',
          name: profile ? displayName(profile) : roleRow.user_id,
          role: roleMap.get(roleRow.user_id) ?? null,
          emplacementIds: accessMap.get(roleRow.user_id) ?? [],
        };
      });

      setManagers(sortByName(rows));
      setEmplacements((emplacementsData ?? []) as EmplacementRow[]);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: unknown }).message ?? 'Erreur de chargement')
            : JSON.stringify(err);
      setError(message || 'Erreur de chargement');
      setManagers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleEmplacement = (emplacementId: string) => {
    setForm((prev) => ({
      ...prev,
      emplacementIds: prev.emplacementIds.includes(emplacementId)
        ? prev.emplacementIds.filter((id) => id !== emplacementId)
        : [...prev.emplacementIds, emplacementId],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('manage-board-accounts', {
        body: {
          mode: 'create',
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          emplacement_ids: form.role === 'residence' ? form.emplacementIds : [],
        },
      });

      if (invokeErr) {
        throw new Error(await resolveFunctionErrorMessage(invokeErr, 'Création impossible'));
      }
      if (data?.error) throw new Error(String(data.error));

      setSuccess('Compte créé avec succès.');
      closeModal();
      await fetchData();
    } catch (err) {
      const message = await resolveFunctionErrorMessage(err, 'Création impossible');
      setError(message || 'Création impossible');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('manage-board-accounts', {
        body: {
          mode: 'update',
          user_id: editing.id,
          role: form.role,
          emplacement_ids: form.role === 'residence' ? form.emplacementIds : [],
        },
      });

      if (invokeErr) {
        throw new Error(await resolveFunctionErrorMessage(invokeErr, 'Mise à jour impossible'));
      }
      if (data?.error) throw new Error(String(data.error));

      setSuccess('Accès mis à jour.');
      closeModal();
      await fetchData();
    } catch (err) {
      const message = await resolveFunctionErrorMessage(err, 'Mise à jour impossible');
      setError(message || 'Mise à jour impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: embedded ? 'flex-end' : 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 24,
        }}
      >
        {!embedded && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>Gérants de résidences</h1>
            <p style={{ color: '#666', margin: 0 }}>
              Ici, on gère uniquement les comptes ayant un accès au board en tant que patron ou résidence.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={openCreate}
          style={{ padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}
        >
          Créer un compte
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#DCFCE7', color: '#166534', borderRadius: 10 }}>
          {success}
        </div>
      )}

      <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: 32, color: '#666' }}>Chargement...</p>
        ) : managers.length === 0 ? (
          <p style={{ padding: 32, color: '#666' }}>Aucun gérant de résidence créé pour le moment.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #EEE' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Compte</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Rôle</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Laveries autorisées</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#666' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((manager) => (
                <tr key={manager.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontSize: 15, fontWeight: '600', color: '#000' }}>{manager.name}</div>
                    <div style={{ fontSize: 14, color: '#666' }}>{manager.email}</div>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#444' }}>
                    {manager.role === 'patron' ? 'Patron' : manager.role === 'residence' ? 'Résidence' : 'Non configuré'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>
                    {manager.role === 'residence'
                      ? manager.emplacementIds.length > 0
                        ? manager.emplacementIds
                            .map((id) => emplacementMap[id]?.name ?? 'Laverie supprimée')
                            .join(', ')
                        : 'Aucune laverie attribuée'
                      : 'Toutes les laveries'}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => openEdit(manager)}
                      style={{ padding: '10px 14px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}
                    >
                      Régler l’accès
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(showCreate || editing) && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={closeModal}
        >
          <div
            style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>
              {editing ? 'Régler l’accès du compte' : 'Créer un compte gérant'}
            </h3>
            <form onSubmit={editing ? handleUpdate : handleCreate}>
              {!editing && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      required
                      style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Mot de passe</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      required
                      minLength={8}
                      style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                    />
                  </div>
                </>
              )}

              {editing && (
                <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#F8F9FA', borderRadius: 10, fontSize: 14, color: '#444' }}>
                  <strong>{editing.name}</strong>
                  <div>{editing.email}</div>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Type d’accès</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['patron', 'residence'] as BoardRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, role, emplacementIds: role === 'patron' ? [] : prev.emplacementIds }))}
                      style={{
                        flex: 1,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: form.role === role ? '2px solid #1C69D3' : '1px solid #E5E7EB',
                        backgroundColor: form.role === role ? '#E8F1FC' : '#FFF',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        color: '#111',
                      }}
                    >
                      {role === 'patron' ? 'Patron' : 'Résidence'}
                    </button>
                  ))}
                </div>
              </div>

              {form.role === 'residence' && (
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                    Laveries autorisées
                  </label>
                  <div style={{ display: 'grid', gap: 10, maxHeight: 280, overflowY: 'auto', padding: 2 }}>
                    {emplacements.map((emplacement) => {
                      const checked = form.emplacementIds.includes(emplacement.id);
                      return (
                        <label
                          key={emplacement.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: 12,
                            border: checked ? '2px solid #1C69D3' : '1px solid #E5E7EB',
                            borderRadius: 10,
                            cursor: 'pointer',
                            backgroundColor: checked ? '#E8F1FC' : '#FFF',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEmplacement(emplacement.id)}
                            style={{ marginTop: 2 }}
                          />
                          <span>
                            <strong style={{ color: '#111', fontSize: 14 }}>{emplacement.name}</strong>
                            {emplacement.address ? (
                              <span style={{ display: 'block', color: '#666', fontSize: 13, marginTop: 4 }}>
                                {emplacement.address}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ padding: '12px 20px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: saving ? 'wait' : 'pointer' }}
                >
                  {saving ? 'Enregistrement...' : editing ? 'Mettre à jour' : 'Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
