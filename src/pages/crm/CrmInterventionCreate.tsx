import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './intervention.module.css';

interface User { id: string; first_name: string; role: 'patron' | 'salarie'; email?: string; is_active?: boolean }
interface Laverie { id: string; nom: string; ville: string | null; code_postal: string }

export default function CrmInterventionCreate() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [laveries, setLaveries] = useState<Laverie[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ userId: '', laverieId: '', motif: 'gestion' as 'gestion' | 'reparation' | 'gestion-reparation', description: '', date: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadData = async () => {
      const [crmUsersData, usersData, laveriesData] = await Promise.all([
        supabase.from('crm_users').select('id, first_name, role, email, is_active').eq('is_active', true).order('first_name', { ascending: true }),
        supabase.from('users').select('id, first_name, role, email').order('first_name', { ascending: true }),
        supabase.from('laveries').select('*').order('nom', { ascending: true }),
      ]);
      if (!crmUsersData.error && crmUsersData.data?.length) setUsers(crmUsersData.data as User[]);
      else if (!usersData.error) setUsers((usersData.data ?? []) as User[]);
      if (!laveriesData.error) setLaveries((laveriesData.data ?? []) as Laverie[]);
      setLoading(false);
    };
    void loadData();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.userId) newErrors.userId = 'Veuillez sélectionner un technicien';
    if (!formData.laverieId) newErrors.laverieId = 'Veuillez sélectionner une laverie';
    if (!formData.date) newErrors.date = 'Veuillez sélectionner une date';
    const selectedDate = new Date(formData.date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selectedDate < today) newErrors.date = 'La date doit être dans le futur';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    const user = users.find((u) => u.id === formData.userId);
    const laverie = laveries.find((l) => l.id === formData.laverieId);
    if (!user || !laverie) return;
    const { error } = await supabase.from('interventions').insert([{
      user_id: user.id, laverie_id: laverie.id, laverie_name: laverie.nom, laverie_ville: (laverie.ville || '').trim() || 'Ville à compléter',
      motif: formData.motif, description: formData.description, date: formData.date, statut: 'planifie',
    }]);
    setSubmitting(false);
    if (!error) navigate('/crm/interventions');
  };

  if (loading) return <div className={styles.container}><div className={styles.loading}><div className={styles.spinner}></div><p>Chargement...</p></div></div>;
  const selectedUser = users.find((u) => u.id === formData.userId);
  const selectedLaverie = laveries.find((l) => l.id === formData.laverieId);

  return (
    <div className={styles.container}><div className={styles.wrapper}>
      <button className={styles.btnBack} onClick={() => navigate(-1)}>Retour</button>
      <div className={styles.headerSection}><h1 className={styles.title}>Créer une Intervention</h1><p className={styles.subtitle}>Planifiez une nouvelle intervention pour un technicien</p></div>
      <div className={styles.contentGrid}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formSection}><h2 className={styles.sectionTitle}>Technicien</h2><div className={styles.formGroup}><label className={styles.label}>Sélectionner un technicien *</label><select value={formData.userId} onChange={(e) => setFormData({ ...formData, userId: e.target.value })} className={styles.select}><option value="">-- Choisir un technicien --</option>{users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.role === 'patron' ? '(Patron)' : '(Technicien)'}</option>)}</select>{errors.userId && <span className={styles.errorMessage}>{errors.userId}</span>}</div></div>
          <div className={styles.formSection}><h2 className={styles.sectionTitle}>Laverie</h2><div className={styles.formGroup}><label className={styles.label}>Sélectionner une laverie *</label><select value={formData.laverieId} onChange={(e) => setFormData({ ...formData, laverieId: e.target.value })} className={styles.select}><option value="">-- Choisir une laverie --</option>{laveries.map((l) => <option key={l.id} value={l.id}>{l.nom} - {l.ville}</option>)}</select>{errors.laverieId && <span className={styles.errorMessage}>{errors.laverieId}</span>}</div></div>
          <div className={styles.formSection}><h2 className={styles.sectionTitle}>Date</h2><div className={styles.formGroup}><label className={styles.label}>Choisir une date *</label><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className={styles.input} />{errors.date && <span className={styles.errorMessage}>{errors.date}</span>}</div></div>
          <div className={styles.formSection}><h2 className={styles.sectionTitle}>Type d'Intervention</h2><div className={styles.radioGroupContainer}>
            <label className={`${styles.radioOption} ${formData.motif === 'gestion' ? styles.radioOptionActive : ''}`}><input type="radio" name="motif" value="gestion" checked={formData.motif === 'gestion'} onChange={(e) => setFormData({ ...formData, motif: e.target.value as any })} /><span className={styles.radioLabel}>Gestion</span><span className={styles.radioDescription}>Maintenance et gestion</span></label>
            <label className={`${styles.radioOption} ${formData.motif === 'reparation' ? styles.radioOptionActive : ''}`}><input type="radio" name="motif" value="reparation" checked={formData.motif === 'reparation'} onChange={(e) => setFormData({ ...formData, motif: e.target.value as any })} /><span className={styles.radioLabel}>Réparation</span><span className={styles.radioDescription}>Dépannage et réparation</span></label>
            <label className={`${styles.radioOption} ${formData.motif === 'gestion-reparation' ? styles.radioOptionActive : ''}`}><input type="radio" name="motif" value="gestion-reparation" checked={formData.motif === 'gestion-reparation'} onChange={(e) => setFormData({ ...formData, motif: e.target.value as any })} /><span className={styles.radioLabel}>Gestion & Réparation</span><span className={styles.radioDescription}>Les deux à la fois</span></label>
          </div></div>
          <div className={styles.formSection}><h2 className={styles.sectionTitle}>Description (optionnel)</h2><div className={styles.formGroup}><label className={styles.label}>Détails de l'intervention</label><textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Ajoutez des détails sur l'intervention..." className={styles.textarea} rows={4} /></div></div>
          <div className={styles.formActions}><button type="button" className={styles.btnCancel} onClick={() => navigate(-1)} disabled={submitting}>Annuler</button><button type="submit" className={styles.btnSubmit} disabled={submitting}>{submitting ? 'Création en cours...' : "Créer l'intervention"}</button></div>
        </form>
        <div className={styles.sidebar}><div className={styles.summaryCard}><h3 className={styles.summaryTitle}>Résumé</h3><div className={styles.summaryItem}><span className={styles.summaryLabel}>Technicien</span><span className={styles.summaryValue}>{selectedUser?.first_name || '—'}</span></div><div className={styles.summaryItem}><span className={styles.summaryLabel}>Laverie</span><span className={styles.summaryValue}>{selectedLaverie?.nom || '—'}</span></div><div className={styles.summaryItem}><span className={styles.summaryLabel}>Date</span><span className={styles.summaryValue}>{formData.date ? new Date(formData.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span></div><div className={styles.summaryItem}><span className={styles.summaryLabel}>Type</span><span className={styles.summaryValue}>{formData.motif === 'gestion' && 'Gestion'}{formData.motif === 'reparation' && 'Réparation'}{formData.motif === 'gestion-reparation' && 'Gestion & Réparation'}</span></div>{formData.description && <div className={styles.summaryItem}><span className={styles.summaryLabel}>Description</span><span className={styles.summaryValue}>{formData.description}</span></div>}</div></div>
      </div>
    </div></div>
  );
}
