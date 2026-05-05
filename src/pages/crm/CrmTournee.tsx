import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { COLORS } from '../../lib/constants';
import styles from './tournee.module.css';

type CrmUser = { id: string; first_name: string | null };
type Intervention = {
  id: number;
  user_id: string;
  laverie_id: string;
  laverie_name: string;
  laverie_ville: string | null;
  motif: string;
  description: string | null;
  date: string;
  statut: string;
};

export default function CrmTournee() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [rows, setRows] = useState<Intervention[]>([]);
  const [selectedUser, setSelectedUser] = useState('ALL');

  const load = async () => {
    setLoading(true);
    const [u, i] = await Promise.all([
      supabase.from('users').select('id, first_name').order('first_name', { ascending: true }),
      supabase.from('interventions').select('*').neq('statut', 'termine').order('date', { ascending: true }),
    ]);
    if (!u.error) setUsers((u.data ?? []) as CrmUser[]);
    if (!i.error) setRows((i.data ?? []) as Intervention[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    if (selectedUser === 'ALL') return rows;
    return rows.filter((row) => row.user_id === selectedUser);
  }, [rows, selectedUser]);

  const getUserColor = (userId: string) => COLORS.userColors[users.findIndex((u) => u.id === userId) % COLORS.userColors.length];
  const cloturer = async (row: Intervention) => {
    const compteRendu = window.prompt('Compte-rendu de clôture');
    if (!compteRendu || !compteRendu.trim()) return;
    const user = users.find((item) => item.id === row.user_id);
    await supabase.from('historique').insert([
      {
        laverie_id: row.laverie_id,
        technicien_nom: user?.first_name ?? 'Inconnu',
        date_intervention: new Date().toISOString(),
        motif: row.motif,
        description: row.description,
        compte_rendu: compteRendu.trim(),
      },
    ]);
    await supabase.from('interventions').delete().eq('id', row.id);
    await load();
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.techniciensSection}>
          <div className={styles.sectionHeader}><h2>Techniciens</h2></div>
          <div className={styles.techList}>
            <div className={`${styles.techCard} ${selectedUser === 'ALL' ? styles.techCardActive : ''}`} style={{ borderColor: 'red' }} onClick={() => setSelectedUser('ALL')}>
              <div className={styles.techInfo}><div className={styles.techColor} style={{ background: 'red' }}></div><span className={styles.techName}>Global</span><span className={styles.techCount}>{rows.length} intervention(s)</span></div>
            </div>
            {users.map((user) => (
              <div key={user.id} className={`${styles.techCard} ${selectedUser === user.id ? styles.techCardActive : ''}`} style={{ borderColor: getUserColor(user.id) }} onClick={() => setSelectedUser(user.id)}>
                <div className={styles.techInfo}><div className={styles.techColor} style={{ background: getUserColor(user.id) }}></div><span className={styles.techName}>{user.first_name}</span><span className={styles.techCount}>{rows.filter((i) => i.user_id === user.id).length} intervention(s)</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.interventionsSection}>
          <div className={styles.sectionHeaderr}><h2>{selectedUser === 'ALL' ? 'Tournée de tous les techniciens' : `Tournée de ${users.find((u) => u.id === selectedUser)?.first_name}`}</h2></div>
          {loading ? <div className={styles.loading}><div className={styles.spinner}></div><p>Chargement...</p></div> : filteredRows.length === 0 ? (
            <div className={styles.emptyState}><p className={styles.emptyText}>Aucune intervention planifiée</p></div>
          ) : (
            <div className={styles.interventionsList}>
              {filteredRows.map((row) => (
                <div key={row.id} className={styles.interventionCard}>
                  <div className={styles.interventionTop}><div><h3 className={styles.interventionLaverie}>{row.laverie_name}</h3><p className={styles.interventionVille}>{row.laverie_ville}</p>{selectedUser === 'ALL' && <p className={styles.interventionTechnicien}>{users.find((u) => u.id === row.user_id)?.first_name || 'Inconnu'}</p>}</div></div>
                  <div className={styles.interventionDetails}><div className={styles.interventionDate}>{new Date(row.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div><div className={styles.interventionMotif}>{row.motif}</div>{row.description && <div className={styles.interventionDescription}>{row.description}</div>}</div>
                  <button className={styles.btnCloturer} onClick={() => void cloturer(row)}>Clôturer l'intervention</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
