import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { COLORS } from '../../lib/constants';
import styles from './planning.module.css';

interface User { id: string; first_name: string; role: 'patron' | 'salarie'; email: string }
interface Intervention { id: number; user_id: string; laverie_name: string; laverie_ville: string; motif: 'gestion' | 'reparation' | 'gestion-reparation'; description: string; date: string }

export default function CrmInterventions() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());

  const loadData = async () => {
    setIsLoading(true);
    const [usersRes, interRes] = await Promise.all([
      supabase.from('users').select('*').order('first_name', { ascending: true }),
      supabase.from('interventions').select('*').order('date', { ascending: true }),
    ]);
    if (!usersRes.error) setUsers((usersRes.data ?? []) as User[]);
    if (!interRes.error) setInterventions((interRes.data ?? []) as Intervention[]);
    setIsLoading(false);
  };

  useEffect(() => { void loadData(); }, []);

  const getUserColor = (userId: string) => COLORS.userColors[users.findIndex((u) => u.id === userId) % COLORS.userColors.length];
  const getWeekDays = (baseDate: Date) => {
    const weekStart = new Date(baseDate);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  };
  const getInterventionsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return (selectedUserId === 'ALL' ? interventions : interventions.filter((i) => i.user_id === selectedUserId)).filter((i) => i.date === dateStr);
  };
  const goToPreviousWeek = () => setCurrentWeekDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7));
  const goToNextWeek = () => setCurrentWeekDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7));
  const handleDeleteIntervention = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette intervention ?')) return;
    await supabase.from('interventions').delete().eq('id', id);
    await loadData();
  };
  const formatMotif = (motif: string) => (motif === 'gestion' ? 'Gestion' : motif === 'reparation' ? 'Réparation' : 'Gestion & Réparation');
  const getMotifColor = (motif: string) => (motif === 'gestion' ? '#43e97b' : motif === 'reparation' ? '#fa709a' : '#667eea');
  const interventionsFiltrees = (selectedUserId === 'ALL' ? interventions : interventions.filter((i) => i.user_id === selectedUserId)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (isLoading) return <div className={styles.container}><div className={styles.loading}><div className={styles.spinner}></div><p>Chargement...</p></div></div>;

  const weekDays = getWeekDays(currentWeekDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.techniciensSection}>
          <div className={styles.sectionHeader}><h2>Techniciens</h2></div>
          <div className={styles.techList}>
            <div className={`${styles.techCard} ${selectedUserId === 'ALL' ? styles.techCardActive : ''}`} style={{ borderColor: 'red' }} onClick={() => setSelectedUserId('ALL')}>
              <div className={styles.techInfo}><div className={styles.techColor} style={{ background: 'red' }}></div><span className={styles.techName}>Global</span><span className={styles.techCount}>{interventions.length} intervention(s)</span></div>
            </div>
            {users.map((user) => (
              <div key={user.id} className={`${styles.techCard} ${selectedUserId === user.id ? styles.techCardActive : ''}`} style={{ borderColor: getUserColor(user.id) }} onClick={() => setSelectedUserId(user.id)}>
                <div className={styles.techInfo}><div className={styles.techColor} style={{ background: getUserColor(user.id) }}></div><span className={styles.techName}>{user.first_name}</span><span className={styles.techCount}>{interventions.filter((i) => i.user_id === user.id).length} intervention(s)</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.interventionsSection}>
          <div className={styles.interventionHeader}>
            <h2>{selectedUserId === 'ALL' ? 'Planning de toutes les interventions' : `Planning de ${users.find((u) => u.id === selectedUserId)?.first_name}`}</h2>
            <button className={styles.btnNewIntervention} onClick={() => navigate('/crm/intervention-create')}>Nouvelle intervention</button>
          </div>
          <div className={styles.calendar}>
            <div className={styles.calendarHeader}><button onClick={goToPreviousWeek} className={styles.calendarNavBtn}>◀</button><h3 className={styles.calendarTitle}>Semaine : {weekDays[0].toLocaleDateString('fr-FR')} → {weekDays[6].toLocaleDateString('fr-FR')}</h3><button onClick={goToNextWeek} className={styles.calendarNavBtn}>▶</button></div>
            <div className={styles.calendarWeekdays}>{['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => <div key={d} className={styles.calendarWeekday}>{d}</div>)}</div>
            <div className={styles.calendarGrid}>{weekDays.map((date, idx) => { const day = getInterventionsForDate(date); const isToday = date.getTime() === today.getTime(); const isPast = date < today; return <div key={idx} className={`${styles.calendarDay} ${isToday ? styles.calendarDayToday : ''} ${isPast ? styles.calendarDayPast : ''}`}><div className={styles.calendarDayNumber}>{date.getDate()}</div>{day.length > 0 && <div className={styles.calendarDayInterventions}>{day.map((inter) => <div key={inter.id} className={styles.calendarIntervention} style={{ background: getUserColor(inter.user_id) }}>{selectedUserId === 'ALL' && <span className={styles.interventionTech}>{users.find((u) => u.id === inter.user_id)?.first_name?.substring(0, 3)} - </span>}{inter.laverie_name.substring(0, 12)}...</div>)}</div>}</div>; })}</div>
          </div>
          <h2 className={styles.interventionsHeader}>Toutes les interventions</h2>
          {interventionsFiltrees.length === 0 ? (
            <div className={styles.emptyState}><p className={styles.emptyText}>Aucune intervention planifiée</p><button className={styles.btnEmptyAction} onClick={() => navigate('/crm/intervention-create')}>Créer une intervention</button></div>
          ) : (
            <div className={styles.interventionsList}>
              {interventionsFiltrees.map((intervention) => (
                <div key={intervention.id} className={styles.interventionCard}>
                  <div className={styles.interventionTop}><div><h3 className={styles.interventionLaverie}>{intervention.laverie_name}</h3><p className={styles.interventionVille}>{intervention.laverie_ville}</p>{selectedUserId === 'ALL' && <p className={styles.interventionTechnicien}>{users.find((u) => u.id === intervention.user_id)?.first_name || 'Inconnu'}</p>}</div><button className={styles.btnDeleteIntervention} onClick={() => void handleDeleteIntervention(intervention.id)}><Trash2 size={16} strokeWidth={2} /></button></div>
                  <div className={styles.interventionDetails}><div className={styles.interventionDate}>{new Date(intervention.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div><div className={styles.interventionMotif} style={{ background: getMotifColor(intervention.motif) }}>{formatMotif(intervention.motif)}</div>{intervention.description && <div className={styles.interventionDescription}>{intervention.description}</div>}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
