import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { COLORS } from '../../lib/constants';
import styles from './tournee.module.css';

interface User {
  id: string;
  first_name: string;
  role: 'patron' | 'salarie';
  email?: string;
}

interface Intervention {
  id: number;
  user_id: string;
  laverie_id: string;
  laverie_name: string;
  laverie_ville: string;
  motif: string;
  description: string | null;
  date: string;
  statut: string;
  created_at?: string;
}

interface Piece {
  nom: string;
  quantite: number;
}

export default function CrmTournee() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [authMissing, setAuthMissing] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    compteRendu: '',
    pieces: [{ nom: '', quantite: 1 }] as Piece[],
    photos: [] as string[],
  });

  const getUserColor = (userId: string) => {
    const index = users.findIndex((u) => u.id === userId);
    return COLORS.userColors[index % COLORS.userColors.length];
  };

  const loadData = useCallback(async (currentUserData: User) => {
    setIsLoading(true);
    try {
      let usersData: User[] = [];

      if (currentUserData.role === 'patron') {
        const crmList = await supabase
          .from('crm_users')
          .select('id, first_name, role, email')
          .eq('is_active', true)
          .order('first_name', { ascending: true });
        if (!crmList.error && crmList.data?.length) {
          usersData = crmList.data as User[];
        } else {
          const { data } = await supabase.from('users').select('*').order('first_name', { ascending: true });
          if (data) usersData = data as User[];
        }
        setSelectedUserId('ALL');
      } else {
        usersData = [currentUserData];
        setSelectedUserId(currentUserData.id);
      }

      setUsers(usersData);

      let interventionsQuery = supabase.from('interventions').select('*').neq('statut', 'termine');
      if (currentUserData.role === 'salarie') {
        interventionsQuery = interventionsQuery.eq('user_id', currentUserData.id);
      }
      const { data: interventionsData } = await interventionsQuery.order('date', { ascending: true });
      if (interventionsData) setInterventions(interventionsData as Intervention[]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthMissing(true);
        setIsLoading(false);
        return;
      }

      const crm = await supabase.from('crm_users').select('*').eq('id', user.id).maybeSingle();
      let profile: User | null = null;
      if (crm.data) {
        profile = {
          id: crm.data.id,
          first_name: crm.data.first_name ?? '',
          role: crm.data.role as 'patron' | 'salarie',
          email: crm.data.email ?? undefined,
        };
      } else {
        const u = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        if (u.data) profile = u.data as User;
      }

      if (!profile && user) {
        profile = {
          id: user.id,
          first_name:
            (user.user_metadata?.first_name as string | undefined) ||
            user.email?.split('@')[0] ||
            'Utilisateur',
          role: 'patron',
        };
      }

      if (!profile) {
        setAuthMissing(true);
        setIsLoading(false);
        return;
      }

      setCurrentUser(profile);
      await loadData(profile);
    };
    void init();
  }, [loadData]);

  const interventionsFiltrees =
    selectedUserId === 'ALL'
      ? interventions
          .filter((i) => i.statut !== 'termine')
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      : interventions
          .filter((i) => i.user_id === selectedUserId && i.statut !== 'termine')
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleOpenModal = (intervention: Intervention) => {
    setSelectedIntervention(intervention);
    setModalError(null);
    setFormData({
      compteRendu: '',
      pieces: [{ nom: '', quantite: 1 }],
      photos: [],
    });
    setShowModal(true);
  };

  const handleAddPiece = () => {
    setFormData((prev) => ({ ...prev, pieces: [...prev.pieces, { nom: '', quantite: 1 }] }));
  };

  const handleRemovePiece = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      pieces: prev.pieces.length > 1 ? prev.pieces.filter((_, i) => i !== index) : prev.pieces,
    }));
  };

  const handleUpdatePiece = (index: number, field: 'nom' | 'quantite', value: string | number) => {
    setFormData((prev) => {
      const newPieces = [...prev.pieces];
      newPieces[index] = { ...newPieces[index], [field]: value };
      return { ...prev, pieces: newPieces };
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const newPhotos: string[] = [];
    let loadedCount = 0;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newPhotos.push(reader.result as string);
        loadedCount++;
        if (loadedCount === files.length) {
          setFormData((prev) => ({ ...prev, photos: [...prev.photos, ...newPhotos] }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemovePhoto = (index: number) => {
    setFormData((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== index) }));
  };

  const handleCloturer = async () => {
    if (!selectedIntervention || !currentUser) return;
    setModalError(null);

    if (!formData.compteRendu.trim()) {
      setModalError('Veuillez remplir le compte-rendu.');
      return;
    }

    setSubmitting(true);
    try {
      const maintenant = new Date().toISOString();
      const tech = users.find((u) => u.id === selectedIntervention.user_id);

      const validPieces = formData.pieces.filter((p) => p.nom.trim() !== '');
      const piecesChangees =
        validPieces.length > 0 ? validPieces.map((p) => `${p.nom.trim()} (×${p.quantite})`).join(', ') : null;

      const historiquePayload: Record<string, unknown> = {
        laverie_id: selectedIntervention.laverie_id,
        technicien_id: currentUser.id,
        technicien_nom: tech?.first_name || 'Inconnu',
        date_intervention: maintenant,
        motif: selectedIntervention.motif,
        description: selectedIntervention.description ?? '',
        compte_rendu: formData.compteRendu.trim(),
        photos: formData.photos.length > 0 ? formData.photos : null,
      };
      if (piecesChangees) historiquePayload.pieces_changees = piecesChangees;

      const { error: histoError } = await supabase.from('historique').insert([historiquePayload]);
      if (histoError) {
        setModalError(`Erreur historique : ${histoError.message}`);
        setSubmitting(false);
        return;
      }

      if (validPieces.length > 0) {
        const { error: commandeError } = await supabase.from('commandes').insert([
          {
            laverie_id: selectedIntervention.laverie_id,
            technicien_id: currentUser.id,
            statut: 'commandé',
            date_commande: maintenant,
            articles: validPieces.map((p) => ({ nom: p.nom.trim(), quantite: p.quantite })),
            notes: `Pièces utilisées pour intervention du ${new Date(selectedIntervention.date).toLocaleDateString('fr-FR')} — ${selectedIntervention.laverie_name}`,
          },
        ]);
        if (commandeError) {
          setModalError(`Erreur commande : ${commandeError.message}`);
          setSubmitting(false);
          return;
        }
      }

      const { error: deleteError } = await supabase.from('interventions').delete().eq('id', selectedIntervention.id);
      if (deleteError) {
        setModalError(`Erreur suppression : ${deleteError.message}`);
        setSubmitting(false);
        return;
      }

      await loadData(currentUser);
      setShowModal(false);
      setSelectedIntervention(null);
      setFormData({
        compteRendu: '',
        pieces: [{ nom: '', quantite: 1 }],
        photos: [],
      });
    } catch {
      setModalError('Erreur lors de la clôture.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatMotif = (motif: string) => {
    switch (motif) {
      case 'gestion':
        return 'Gestion';
      case 'reparation':
        return 'Réparation';
      case 'gestion-reparation':
        return 'Gestion & Réparation';
      default:
        return motif;
    }
  };

  const getMotifColor = (motif: string) => {
    switch (motif) {
      case 'gestion':
        return '#43e97b';
      case 'reparation':
        return '#fa709a';
      case 'gestion-reparation':
        return '#667eea';
      default:
        return '#95a5a6';
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (authMissing || !currentUser) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <p style={{ color: '#64748b', lineHeight: 1.6 }}>
            Compte introuvable dans <strong>crm_users</strong> ou <strong>users</strong>. Utilise un compte CRM
            (technicien / patron) pour la tournée.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {currentUser.role === 'patron' && (
          <div className={styles.techniciensSection}>
            <div className={styles.sectionHeader}>
              <h2>Techniciens</h2>
            </div>
            <div className={styles.techList}>
              <div
                className={`${styles.techCard} ${selectedUserId === 'ALL' ? styles.techCardActive : ''}`}
                style={{ borderColor: 'red' }}
                onClick={() => setSelectedUserId('ALL')}
              >
                <div className={styles.techInfo}>
                  <div className={styles.techColor} style={{ background: 'red' }} />
                  <span className={styles.techName}>Global</span>
                  <span className={styles.techCount}>
                    {interventions.filter((i) => i.statut !== 'termine').length} intervention(s)
                  </span>
                </div>
              </div>
              {users.map((user) => (
                <div
                  key={user.id}
                  className={`${styles.techCard} ${selectedUserId === user.id ? styles.techCardActive : ''}`}
                  style={{ borderColor: getUserColor(user.id) }}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <div className={styles.techInfo}>
                    <div className={styles.techColor} style={{ background: getUserColor(user.id) }} />
                    <span className={styles.techName}>{user.first_name}</span>
                    <span className={styles.techCount}>
                      {interventions.filter((i) => i.user_id === user.id && i.statut !== 'termine').length}{' '}
                      intervention(s)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedUserId && (
          <div className={styles.interventionsSection}>
            <div className={styles.sectionHeaderr}>
              <h2>
                {selectedUserId === 'ALL'
                  ? 'Tournée de tous les techniciens'
                  : `Tournée de ${users.find((u) => u.id === selectedUserId)?.first_name}`}
                {currentUser.role === 'salarie' && ' (Ma tournée)'}
              </h2>
            </div>

            {interventionsFiltrees.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyText}>Aucune intervention planifiée</p>
                <button type="button" className={styles.btnEmptyAction} onClick={() => navigate('/crm/interventions')}>
                  Aller au planning
                </button>
              </div>
            ) : (
              <div className={styles.interventionsList}>
                {interventionsFiltrees.map((intervention) => (
                  <div key={intervention.id} className={styles.interventionCard}>
                    <div className={styles.interventionTop}>
                      <div>
                        <h3 className={styles.interventionLaverie}>{intervention.laverie_name}</h3>
                        <p className={styles.interventionVille}>{intervention.laverie_ville}</p>
                        {selectedUserId === 'ALL' && (
                          <p className={styles.interventionTechnicien}>
                            {users.find((u) => u.id === intervention.user_id)?.first_name || 'Inconnu'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className={styles.interventionDetails}>
                      <div className={styles.interventionDate}>
                        {new Date(intervention.date).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </div>
                      <div
                        className={styles.interventionMotif}
                        style={{ background: getMotifColor(intervention.motif) }}
                      >
                        {formatMotif(intervention.motif)}
                      </div>
                      {intervention.description && (
                        <div className={styles.interventionDescription}>{intervention.description}</div>
                      )}
                    </div>
                    <button type="button" className={styles.btnCloturer} onClick={() => handleOpenModal(intervention)}>
                      Clôturer l&apos;intervention
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && selectedIntervention && (
        <div className={styles.modalOverlay} onClick={() => !submitting && setShowModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Clôturer l&apos;intervention</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => !submitting && setShowModal(false)}
                disabled={submitting}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Détails de l&apos;intervention</h3>
                <div className={styles.modalSection}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Laverie</span>
                    <span className={styles.detailValue}>{selectedIntervention.laverie_name}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Ville</span>
                    <span className={styles.detailValue}>{selectedIntervention.laverie_ville}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Type</span>
                    <span className={styles.detailValue}>{formatMotif(selectedIntervention.motif)}</span>
                  </div>
                </div>
              </div>

              <div className={styles.modalSection}>
                <label className={styles.modalLabel}>
                  Compte-rendu<span className={styles.required}> *</span>
                </label>
                <textarea
                  value={formData.compteRendu}
                  onChange={(e) => setFormData({ ...formData, compteRendu: e.target.value })}
                  placeholder="Décrivez les travaux effectués, les problèmes rencontrés..."
                  className={styles.modalTextarea}
                  rows={4}
                  disabled={submitting}
                />
              </div>

              <div className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Pièces utilisées (optionnel)</h3>
                <div className={styles.piecesList}>
                  {formData.pieces.map((piece, index) => (
                    <div key={index} className={styles.pieceItem}>
                      <span className={styles.pieceNumber}>{index + 1}</span>
                      <input
                        type="text"
                        placeholder="Nom de la pièce"
                        value={piece.nom}
                        onChange={(e) => handleUpdatePiece(index, 'nom', e.target.value)}
                        className={styles.pieceInput}
                        disabled={submitting}
                      />
                      <input
                        type="number"
                        placeholder="Qté"
                        value={piece.quantite}
                        onChange={(e) => handleUpdatePiece(index, 'quantite', parseInt(e.target.value, 10) || 1)}
                        min={1}
                        max={999}
                        className={styles.pieceQty}
                        disabled={submitting}
                      />
                      {formData.pieces.length > 1 && (
                        <button
                          type="button"
                          className={styles.pieceBtnRemove}
                          onClick={() => handleRemovePiece(index)}
                          disabled={submitting}
                          aria-label="Retirer la pièce"
                        >
                          <Trash2 size={16} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className={styles.btnAddPiece} onClick={handleAddPiece} disabled={submitting}>
                  Ajouter une pièce
                </button>
              </div>

              <div className={styles.modalSection}>
                <label className={styles.modalLabel}>Photos (optionnel)</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className={styles.fileInput}
                  disabled={submitting}
                />
                {formData.photos.length > 0 && (
                  <div className={styles.photoGrid}>
                    {formData.photos.map((photo, index) => (
                      <div key={index} className={styles.photoItem}>
                        <img src={photo} alt="" className={styles.photoPreview} />
                        <button
                          type="button"
                          className={styles.btnRemovePhoto}
                          onClick={() => handleRemovePhoto(index)}
                          disabled={submitting}
                        >
                          Supprimer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {modalError && (
                <p style={{ margin: 0, color: '#b91c1c', fontWeight: 600 }}>{modalError}</p>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalBtnCancel}
                onClick={() => setShowModal(false)}
                disabled={submitting}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.modalBtnConfirm}
                onClick={() => void handleCloturer()}
                disabled={submitting || !formData.compteRendu.trim()}
              >
                {submitting ? 'Clôture en cours...' : 'Valider la clôture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
