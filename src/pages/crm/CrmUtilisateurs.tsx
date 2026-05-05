import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import styles from './comptes.module.css';

type Role = 'patron' | 'salarie';
type CrmUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  role: Role;
  is_active: boolean;
};

export default function CrmUtilisateurs() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<CrmUser[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ email: '', first_name: '', role: 'salarie' as Role });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('crm_users')
      .select('id, email, first_name, role, is_active')
      .order('first_name', { ascending: true });
    if (!error) setRows((data ?? []) as CrmUser[]);
    if (error) setNotice(error.message);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('crm_users').insert([
      { email: newUser.email.trim(), first_name: newUser.first_name.trim() || null, role: newUser.role, is_active: true },
    ]);
    if (error) {
      setNotice(error.message);
      setSaving(false);
      return;
    }
    setNotice('Compte CRM créé.');
    setNewUser({ email: '', first_name: '', role: 'salarie' });
    await load();
    setSaving(false);
  };

  const patchUser = async (id: string, patch: Partial<Pick<CrmUser, 'first_name' | 'role' | 'is_active'>>) => {
    const { error } = await supabase.from('crm_users').update(patch).eq('id', id);
    if (error) setNotice(error.message);
    await load();
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
      <h1 className={styles.title}>Comptes CRM</h1>
      <p className={styles.subtitle}>Crée et gère les comptes salariés/patrons du CRM.</p>
      {notice && <div className={styles.notice}>{notice}</div>}
      <form onSubmit={createUser} className={styles.form}>
        <input
          type="email"
          placeholder="Email"
          value={newUser.email}
          onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
          required
        />
        <input
          type="text"
          placeholder="Prénom"
          value={newUser.first_name}
          onChange={(e) => setNewUser((prev) => ({ ...prev, first_name: e.target.value }))}
        />
        <select value={newUser.role} onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value as Role }))}>
          <option value="salarie">Salarié</option>
          <option value="patron">Patron</option>
        </select>
        <button type="submit" disabled={saving}>{saving ? 'Création...' : 'Créer le compte'}</button>
      </form>
      <div className={styles.tableWrap}>
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <table className={styles.table}>
            <thead><tr><th>Email</th><th>Prénom</th><th>Rôle</th><th>Actif</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td><input className={styles.inlineInput} value={row.first_name ?? ''} onChange={(e) => setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, first_name: e.target.value } : item)))} onBlur={(e) => void patchUser(row.id, { first_name: e.target.value || null })} /></td>
                  <td><select value={row.role} onChange={(e) => void patchUser(row.id, { role: e.target.value as Role })}><option value="salarie">Salarié</option><option value="patron">Patron</option></select></td>
                  <td><input type="checkbox" checked={row.is_active} onChange={(e) => void patchUser(row.id, { is_active: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </div>
  );
}
