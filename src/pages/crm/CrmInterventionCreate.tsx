import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './intervention.module.css';

interface User {
  id: string;
  first_name: string;
  role: 'patron' | 'salarie';
  email?: string;
  is_active?: boolean;
}
interface Laverie {
  id: string;
  nom: string;
  ville: string | null;
  code_postal: string;
}
interface Emplacement {
  id: string;
  name: string | null;
  address: string | null;
}

export default function CrmInterventionCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editId = String(id ?? '').trim();
  const isEdit = Boolean(editId);
  const [users, setUsers] = useState<User[]>([]);
  const [crmLaveries, setCrmLaveries] = useState<Laverie[]>([]);
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    userId: '',
    laverieId: '',
    motif: 'gestion' as 'gestion' | 'reparation' | 'gestion-reparation',
    description: '',
    date: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadData = async () => {
      setLoadError(null);
      const [crmUsersData, usersData, laveriesData, emplacementsData, interventionData] = await Promise.all([
        supabase.from('crm_users').select('id, first_name, role, email, is_active').eq('is_active', true).order('first_name', { ascending: true }),
        supabase.from('users').select('id, first_name, role, email').order('first_name', { ascending: true }),
        supabase.from('laveries').select('*').order('nom', { ascending: true }),
        supabase.from('emplacements').select('id, name, address').order('name', { ascending: true }),
        isEdit ? supabase.from('interventions').select('*').eq('id', Number(editId)).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (!crmUsersData.error && crmUsersData.data?.length) setUsers(crmUsersData.data as User[]);
      else if (!usersData.error) setUsers((usersData.data ?? []) as User[]);

      if (laveriesData.error) {
        setLoadError(`Laveries : ${laveriesData.error.message}`);
        setCrmLaveries([]);
      } else {
        setCrmLaveries((laveriesData.data ?? []) as Laverie[]);
      }
      if (emplacementsData.error) {
        setLoadError((prev) => (prev ? `${prev} — ` : '') + `Emplacements : ${emplacementsData.error.message}`);
      } else {
        setEmplacements((emplacementsData.data ?? []) as Emplacement[]);
      }

      if (isEdit) {
        if (interventionData?.error) {
          setLoadError((prev) => (prev ? `${prev} — ` : '') + `Intervention : ${interventionData.error.message}`);
        } else if (interventionData?.data) {
          const it = interventionData.data as {
            id: number;
            user_id: string;
            laverie_id: string;
            motif: 'gestion' | 'reparation' | 'gestion-reparation';
            description: string;
            date: string;
          };
          setFormData({
            userId: it.user_id,
            laverieId: it.laverie_id,
            motif: it.motif,
            description: it.description ?? '',
            date: it.date,
          });
        } else {
          setLoadError((prev) => (prev ? `${prev} — ` : '') + 'Intervention introuvable.');
        }
      }
      setLoading(false);
    };
    void loadData();
  }, [isEdit, editId]);

  const boardLaverieOptions = emplacements.filter(
    (emp) =>
      emp.name &&
      !crmLaveries.some(
        (lav) => lav.nom.trim().toLowerCase() === (emp.name ?? '').trim().toLowerCase()
      )
  );

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.userId) newErrors.userId = 'Veuillez sélectionner un technicien';
    if (!formData.laverieId) newErrors.laverieId = 'Veuillez sélectionner une laverie';
    if (!formData.date) newErrors.date = 'Veuillez sélectionner une date';
    // En édition, on autorise de garder une date passée (cas intervention déjà échue mais pas clôturée).
    if (!isEdit) {
      const selectedDate = new Date(formData.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) newErrors.date = 'La date doit être dans le futur';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const crmLaveriesById = useMemo(() => new Map(crmLaveries.map((l) => [l.id, l])), [crmLaveries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validateForm()) return;
    setSubmitting(true);

    const user = users.find((u) => u.id === formData.userId);
    if (!user) {
      setSubmitting(false);
      return;
    }

    let laverieId = formData.laverieId;
    let laverieName = '';
    let laverieVille = '';

    // En édition, `laverieId` est déjà un id CRM (uuid) car l'intervention stocke `laverie_id`.
    if (!isEdit && laverieId.startsWith('board:')) {
      const empId = laverieId.replace('board:', '');
      const emp = emplacements.find((item) => item.id === empId);
      if (!emp?.name?.trim()) {
        setSubmitError('Emplacement board introuvable.');
        setSubmitting(false);
        return;
      }

      const { data: ensured, error: ensureErr } = await supabase.rpc('ensure_crm_link_for_emplacement', {
        p_emplacement_id: empId,
      });
      if (ensureErr || ensured == null || String(ensured).trim() === '') {
        setSubmitError(
          ensureErr?.message ??
            'Impossible de lier cette laverie au CRM. Exécutez supabase-ensure-crm-link-for-emplacement.sql (ou le one-shot) sur Supabase.'
        );
        setSubmitting(false);
        return;
      }
      laverieId = String(ensured).trim();
      const lavRes = await supabase.from('laveries').select('nom, ville').eq('id', laverieId).single();
      laverieName = (lavRes.data?.nom ?? emp.name ?? '').trim() || 'Sans nom';
      laverieVille = (lavRes.data?.ville ?? '').trim() || 'Ville à compléter';
    } else {
      const laverie = crmLaveriesById.get(laverieId) ?? null;
      if (!laverie) {
        setSubmitting(false);
        return;
      }
      laverieName = laverie.nom;
      laverieVille = (laverie.ville || '').trim() || 'Ville à compléter';
    }

    const payload = {
      user_id: user.id,
      laverie_id: laverieId,
      laverie_name: laverieName,
      laverie_ville: laverieVille,
      motif: formData.motif,
      description: formData.description,
      date: formData.date,
      statut: 'planifie',
    };

    const { error } = isEdit
      ? await supabase.from('interventions').update(payload).eq('id', Number(editId))
      : await supabase.from('interventions').insert([payload]);
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    navigate('/crm/interventions');
  };

  const selectedUser = users.find((u) => u.id === formData.userId);
  const selectedCrm = crmLaveries.find((l) => l.id === formData.laverieId);
  const selectedBoard = formData.laverieId.startsWith('board:')
    ? emplacements.find((e) => e.id === formData.laverieId.replace('board:', ''))
    : null;
  const selectedLaverieLabel = selectedCrm
    ? `${selectedCrm.nom} - ${selectedCrm.ville ?? ''}`
    : selectedBoard?.name
      ? `${selectedBoard.name} (Board)`
      : '—';

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <button className={styles.btnBack} onClick={() => navigate(-1)}>
          Retour
        </button>
        <div className={styles.headerSection}>
          <h1 className={styles.title}>{isEdit ? 'Modifier une Intervention' : 'Créer une Intervention'}</h1>
          <p className={styles.subtitle}>
            {isEdit ? 'Modifiez une intervention planifiée' : 'Planifiez une nouvelle intervention pour un technicien'}
          </p>
        </div>
        {loadError && (
          <p className={styles.errorMessage} style={{ marginBottom: 16 }}>
            {loadError}
          </p>
        )}
        <div className={styles.contentGrid}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Technicien</h2>
              <div className={styles.formGroup}>
                <label className={styles.label}>Sélectionner un technicien *</label>
                <select
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  className={styles.select}
                >
                  <option value="">-- Choisir un technicien --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.role === 'patron' ? '(Patron)' : '(Technicien)'}
                    </option>
                  ))}
                </select>
                {errors.userId && <span className={styles.errorMessage}>{errors.userId}</span>}
              </div>
            </div>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Laverie</h2>
              <div className={styles.formGroup}>
                <label className={styles.label}>Sélectionner une laverie *</label>
                <select
                  value={formData.laverieId}
                  onChange={(e) => setFormData({ ...formData, laverieId: e.target.value })}
                  className={styles.select}
                  disabled={isEdit}
                >
                  <option value="">-- Choisir une laverie --</option>
                  {crmLaveries.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom} - {l.ville}
                    </option>
                  ))}
                  {!isEdit && boardLaverieOptions.map((emp) => (
                    <option key={`board-${emp.id}`} value={`board:${emp.id}`}>
                      {(emp.name ?? 'Sans nom').trim()} (Board)
                    </option>
                  ))}
                </select>
                {errors.laverieId && <span className={styles.errorMessage}>{errors.laverieId}</span>}
                {crmLaveries.length === 0 && emplacements.length === 0 && (
                  <p className={styles.errorMessage} style={{ marginTop: 8 }}>
                    Aucune laverie CRM ni emplacement board. Vérifiez les tables ou les droits (RLS).
                  </p>
                )}
              </div>
            </div>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Date</h2>
              <div className={styles.formGroup}>
                <label className={styles.label}>Choisir une date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className={styles.input}
                />
                {errors.date && <span className={styles.errorMessage}>{errors.date}</span>}
              </div>
            </div>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Type d&apos;Intervention</h2>
              <div className={styles.radioGroupContainer}>
                <label
                  className={`${styles.radioOption} ${formData.motif === 'gestion' ? styles.radioOptionActive : ''}`}
                >
                  <input
                    type="radio"
                    name="motif"
                    value="gestion"
                    checked={formData.motif === 'gestion'}
                    onChange={(e) => setFormData({ ...formData, motif: e.target.value as 'gestion' })}
                  />
                  <span className={styles.radioLabel}>Gestion</span>
                  <span className={styles.radioDescription}>Maintenance et gestion</span>
                </label>
                <label
                  className={`${styles.radioOption} ${formData.motif === 'reparation' ? styles.radioOptionActive : ''}`}
                >
                  <input
                    type="radio"
                    name="motif"
                    value="reparation"
                    checked={formData.motif === 'reparation'}
                    onChange={(e) => setFormData({ ...formData, motif: e.target.value as 'reparation' })}
                  />
                  <span className={styles.radioLabel}>Réparation</span>
                  <span className={styles.radioDescription}>Dépannage et réparation</span>
                </label>
                <label
                  className={`${styles.radioOption} ${formData.motif === 'gestion-reparation' ? styles.radioOptionActive : ''}`}
                >
                  <input
                    type="radio"
                    name="motif"
                    value="gestion-reparation"
                    checked={formData.motif === 'gestion-reparation'}
                    onChange={(e) =>
                      setFormData({ ...formData, motif: e.target.value as 'gestion-reparation' })
                    }
                  />
                  <span className={styles.radioLabel}>Gestion & Réparation</span>
                  <span className={styles.radioDescription}>Les deux à la fois</span>
                </label>
              </div>
            </div>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Description (optionnel)</h2>
              <div className={styles.formGroup}>
                <label className={styles.label}>Détails de l&apos;intervention</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ajoutez des détails sur l'intervention..."
                  className={styles.textarea}
                  rows={4}
                />
              </div>
            </div>
            {submitError && <p className={styles.errorMessage}>{submitError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnCancel} onClick={() => navigate(-1)} disabled={submitting}>
                Annuler
              </button>
              <button type="submit" className={styles.btnSubmit} disabled={submitting}>
                {submitting ? 'Création en cours...' : "Créer l'intervention"}
              </button>
            </div>
          </form>
          <div className={styles.sidebar}>
            <div className={styles.summaryCard}>
              <h3 className={styles.summaryTitle}>Résumé</h3>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Technicien</span>
                <span className={styles.summaryValue}>{selectedUser?.first_name || '—'}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Laverie</span>
                <span className={styles.summaryValue}>{selectedLaverieLabel}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Date</span>
                <span className={styles.summaryValue}>
                  {formData.date
                    ? new Date(formData.date).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Type</span>
                <span className={styles.summaryValue}>
                  {formData.motif === 'gestion' && 'Gestion'}
                  {formData.motif === 'reparation' && 'Réparation'}
                  {formData.motif === 'gestion-reparation' && 'Gestion & Réparation'}
                </span>
              </div>
              {formData.description && (
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Description</span>
                  <span className={styles.summaryValue}>{formData.description}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
