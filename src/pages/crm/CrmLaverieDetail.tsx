import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { resolveCrmSiteIdForEmplacement } from '../../lib/resolveCrmSiteForEmplacement';
import styles from './laverieDetail.module.css';

type Laverie = {
  id: string;
  nom: string;
  adresse: string;
  ville: string;
  code_postal: string;
  infos_supplementaires: string | null;
  telephone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_principale: string | null;
  created_at: string;
};

type Historique = {
  id: number;
  technicien_id?: string | null;
  technicien_nom: string;
  date_intervention: string;
  motif: string;
  description: string;
  compte_rendu: string;
  pieces_changees: string | null;
};

type Machine = {
  id: string;
  nom: string;
  esp32_id: string;
  actif: boolean | null;
  hors_service: boolean | null;
};

export default function CrmLaverieDetail() {
  const navigate = useNavigate();
  const { id, emplacementId } = useParams();
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageFolderId, setStorageFolderId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [laverie, setLaverie] = useState<Laverie | null>(null);
  const [historique, setHistorique] = useState<Historique[]>([]);
  const [linkedEmplacementId, setLinkedEmplacementId] = useState<string | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const [busyMachineId, setBusyMachineId] = useState<string | null>(null);

  const loadMachines = async (empId: string) => {
    setMachinesLoading(true);
    const { data, error } = await supabase
      .from('machines')
      .select('id, nom, esp32_id, actif, hors_service')
      .eq('emplacement_id', empId)
      .order('nom', { ascending: true });
    if (!error) setMachines((data ?? []) as Machine[]);
    setMachinesLoading(false);
  };

  const toggleMachineService = async (machine: Machine) => {
    setBusyMachineId(machine.id);
    setMachinesError(null);
    const nextHorsService = !(machine.hors_service ?? false);
    const { error } = await supabase.from('machines').update({ hors_service: nextHorsService }).eq('id', machine.id);
    if (error) {
      setMachinesError(error.message);
    } else {
      setMachines((prev) => prev.map((m) => (m.id === machine.id ? { ...m, hors_service: nextHorsService } : m)));
    }
    setBusyMachineId(null);
  };

  const releaseMachine = async (machine: Machine) => {
    setBusyMachineId(machine.id);
    setMachinesError(null);
    const { error } = await supabase.rpc('release_machine', { p_esp32_id: machine.esp32_id });
    if (error) setMachinesError(error.message);
    setBusyMachineId(null);
  };

  const launchTestCycle = async (machine: Machine) => {
    const normalizedEsp32Id = (machine.esp32_id || '').trim().toUpperCase();
    if (!normalizedEsp32Id) {
      setMachinesError('ID ESP32 manquant sur cette machine.');
      return;
    }
    setBusyMachineId(machine.id);
    setMachinesError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté.');

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (profileErr) throw new Error(`Profil introuvable : ${profileErr.message}`);
      if (!profile?.id) {
        throw new Error('Aucun profil client lié à ce compte. Le cycle de test nécessite un profil (id identique au compte connecté).');
      }

      const { data: txData, error: txErr } = await supabase
        .from('transactions')
        .insert({
          user_id: profile.id,
          machine_id: machine.id,
          emplacement_id: linkedEmplacementId,
          amount: 0,
          payment_method: 'test',
        })
        .select('id')
        .single();
      if (txErr) throw new Error(`Transaction : ${txErr.message}`);
      if (!txData?.id) throw new Error('Transaction test non créée.');

      const { data: cmdData, error: cmdErr } = await supabase
        .from('machine_commands')
        .insert({
          machine_id: machine.id,
          esp32_id: normalizedEsp32Id,
          command: 'START',
          status: 'pending',
          user_id: profile.id,
          transaction_id: txData.id,
        })
        .select('id')
        .single();
      if (cmdErr) throw new Error(`Commande ESP32 : ${cmdErr.message}`);
      if (!cmdData?.id) throw new Error('Commande ESP32 non créée.');

      await supabase.from('transactions').update({ machine_command_id: cmdData.id }).eq('id', txData.id);
      await supabase.from('machines').update({ statut: 'occupe', estimated_end_time: null }).eq('id', machine.id);
    } catch (err) {
      setMachinesError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyMachineId(null);
    }
  };

  const ensureLaverieFromBoard = async (boardEmplacementId: string) => {
    const empRes = await supabase.from('emplacements').select('id, name, address').eq('id', boardEmplacementId).single();
    if (empRes.error || !empRes.data) return null;
    const name = (empRes.data.name ?? '').trim();
    const address = (empRes.data.address ?? 'Adresse non renseignée').trim();
    if (!name) return null;

    const existing = await supabase
      .from('laveries')
      .select('id')
      .eq('nom', name)
      .eq('adresse', address)
      .maybeSingle();
    if (!existing.error && existing.data?.id) return existing.data.id as string;

    const inserted = await supabase
      .from('laveries')
      .insert({
        nom: name,
        adresse: address,
        code_postal: '00000',
        ville: 'Non renseignée',
      })
      .select('id')
      .single();
    if (inserted.error || !inserted.data?.id) return null;
    return inserted.data.id as string;
  };

  const loadPhotos = async (laverieId: string) => {
    setPhotosLoading(true);
    const listed = await supabase.storage.from('laveries-photos').list(laverieId);
    if (listed.error) {
      setPhotos([]);
      setPhotosLoading(false);
      return;
    }
    const values = (listed.data ?? []).map((file) => ({
      id: file.name,
      url: supabase.storage.from('laveries-photos').getPublicUrl(`${laverieId}/${file.name}`).data.publicUrl,
    }));
    setPhotos(values);
    setPhotosLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      setNotice(null);
      setLinkedEmplacementId(emplacementId ?? null);

      let targetId = id ?? null;

      if (!targetId && emplacementId) {
        const empRes = await supabase.from('emplacements').select('id, name, address, created_at').eq('id', emplacementId).single();
        if (empRes.error || !empRes.data) {
          setNotice(`Emplacement introuvable: ${empRes.error?.message ?? 'aucune donnée'}`);
          setLoading(false);
          return;
        }
        const name = (empRes.data.name ?? '').trim();
        const address = (empRes.data.address ?? 'Adresse non renseignée').trim();

        const { crmSiteId, linkUpsertError } = await resolveCrmSiteIdForEmplacement(supabase, emplacementId, name, address);
        if (linkUpsertError) {
          setNotice(linkUpsertError);
        }

        if (crmSiteId) {
          targetId = crmSiteId;
        } else {
          targetId = await ensureLaverieFromBoard(emplacementId);
          if (!targetId) {
            setLaverie({
              id: `board-${empRes.data.id}`,
              nom: name || 'Sans nom',
              adresse: address,
              ville: 'Non renseignée',
              code_postal: '00000',
              infos_supplementaires: null,
              telephone: null,
              email: null,
              latitude: null,
              longitude: null,
              photo_principale: null,
              created_at: empRes.data.created_at ?? new Date().toISOString(),
            });
            setNotesValue('');
            setHistorique([]);
            setStorageFolderId(empRes.data.id);
            await loadPhotos(empRes.data.id);
            setLoading(false);
            return;
          }
        }
      }

      if (!targetId) {
        setNotice('Identifiant laverie manquant.');
        setLoading(false);
        return;
      }

      if (!emplacementId) {
        const rev = await supabase.from('crm_laverie_links').select('emplacement_id').eq('crm_site_id', targetId).maybeSingle();
        if (!rev.error && rev.data?.emplacement_id) {
          setLinkedEmplacementId(String(rev.data.emplacement_id));
        }
      }

      setLoading(true);
      const [lavRes, histRes] = await Promise.all([
        supabase.from('laveries').select('*').eq('id', targetId).single(),
        supabase
          .from('historique')
          .select('id, technicien_id, technicien_nom, date_intervention, motif, description, compte_rendu, pieces_changees')
          .eq('laverie_id', targetId)
          .order('date_intervention', { ascending: false }),
      ]);
      if (lavRes.error) {
        setNotice(`Laverie introuvable: ${lavRes.error.message}`);
      } else {
        setLaverie(lavRes.data as Laverie);
        setStorageFolderId((lavRes.data as Laverie).id);
        setNotesValue((lavRes.data as Laverie).infos_supplementaires ?? '');
      }
      if (histRes.error) {
        setNotice((prev) => prev ?? `Historique indisponible: ${histRes.error.message}`);
      } else {
        setHistorique((histRes.data ?? []) as Historique[]);
      }
      await loadPhotos(targetId);
      setLoading(false);
    };
    void load();
  }, [id, emplacementId]);

  useEffect(() => {
    if (linkedEmplacementId) void loadMachines(linkedEmplacementId);
    else setMachines([]);
  }, [linkedEmplacementId]);

  const uploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!laverie || !storageFolderId) return;
    const files = e.target.files;
    if (!files || !files.length) return;
    setNotice(null);
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${storageFolderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const up = await supabase.storage.from('laveries-photos').upload(fileName, file);
      if (up.error) {
        setNotice(`Upload impossible: ${up.error.message}`);
      }
    }
    await loadPhotos(storageFolderId);
    e.target.value = '';
  };

  const deletePhoto = async (photoId: string) => {
    if (!laverie || !storageFolderId) return;
    if (!window.confirm('Supprimer cette photo ?')) return;
    const del = await supabase.storage.from('laveries-photos').remove([`${storageFolderId}/${photoId}`]);
    if (del.error) {
      setNotice(`Suppression impossible: ${del.error.message}`);
      return;
    }
    await loadPhotos(storageFolderId);
  };

  const saveNotes = async () => {
    if (!laverie) return;
    if (laverie.id.startsWith('board-')) {
      setNotice('Impossible de sauvegarder les notes: fiche CRM non creee pour cette laverie board.');
      return;
    }
    setSavingNotes(true);
    const { error } = await supabase
      .from('laveries')
      .update({ infos_supplementaires: notesValue.trim() || null })
      .eq('id', laverie.id);
    if (error) {
      setNotice(`Sauvegarde impossible: ${error.message}`);
      setSavingNotes(false);
      return;
    }
    setLaverie((prev) => (prev ? { ...prev, infos_supplementaires: notesValue.trim() || null } : prev));
    setNotice('Notes enregistrees.');
    setSavingNotes(false);
  };

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;
  if (!laverie) {
    return (
      <div className={styles.page}>
        {notice ? (
          <div style={{ padding: 12, marginBottom: 12, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>
            {notice}
          </div>
        ) : null}
        <p style={{ color: '#666' }}>Laverie introuvable.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerCard}>
        <button className={styles.backBtn} onClick={() => navigate('/crm/laveries')}>Retour</button>
        <h1 className={styles.title}>{laverie.nom}</h1>
        <p className={styles.subtitle}>
          {laverie.ville} - Ajoutee le {new Date(laverie.created_at).toLocaleDateString('fr-FR')}
        </p>
        {linkedEmplacementId ? (
          <button
            type="button"
            className={styles.boardLinkBtn}
            onClick={() => navigate(`/emplacements/${linkedEmplacementId}`)}
          >
            Voir la fiche board (machines, CA, même historique)
          </button>
        ) : null}
      </div>

      {linkedEmplacementId ? (
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <h2 className={styles.cardTitle}>Machines</h2>
          {machinesError && <p className={styles.notice}>{machinesError}</p>}
          {machinesLoading ? (
            <p className={styles.emptyText}>Chargement des machines...</p>
          ) : machines.length === 0 ? (
            <p className={styles.emptyText}>Aucune machine sur cette laverie.</p>
          ) : (
            <div className={styles.machineList}>
              {machines.map((m) => (
                <div key={m.id} className={styles.machineRow}>
                  <div className={styles.machineInfo}>
                    <p className={styles.machineName}>{m.nom}</p>
                    <p className={styles.machineMeta}>
                      ESP32 : {m.esp32_id} ·{' '}
                      <span style={{ color: m.hors_service ? '#B91C1C' : '#166534', fontWeight: 600 }}>
                        {m.hors_service ? 'Hors service' : 'En service'}
                      </span>
                    </p>
                  </div>
                  <div className={styles.machineActions}>
                    <button
                      type="button"
                      className={styles.machineBtnService}
                      disabled={busyMachineId === m.id}
                      onClick={() => void toggleMachineService(m)}
                    >
                      {m.hors_service ? 'Remettre en service' : 'Mettre hors service'}
                    </button>
                    <button
                      type="button"
                      className={styles.machineBtnTest}
                      disabled={busyMachineId === m.id || !m.esp32_id}
                      onClick={() => void launchTestCycle(m)}
                    >
                      Lancer un cycle test
                    </button>
                    <button
                      type="button"
                      className={styles.machineBtnRelease}
                      disabled={busyMachineId === m.id}
                      onClick={() => void releaseMachine(m)}
                    >
                      Repasser en disponible
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Historique des interventions</h2>
          {historique.length === 0 ? (
            <p className={styles.emptyText}>Aucune intervention cloturee.</p>
          ) : (
            <div className={styles.historiqueList}>
              {historique.map((item) => (
                <div key={item.id} className={styles.historiqueItem}>
                  <p className={styles.historiqueMotif}>{item.motif}</p>
                  <p className={styles.historiqueMeta}>
                    {new Date(item.date_intervention).toLocaleDateString('fr-FR')} - {item.technicien_nom}
                  </p>
                  <p className={styles.historiqueDesc}>{item.description}</p>
                  <p className={styles.historiqueCompteRendu}>{item.compte_rendu}</p>
                  {item.pieces_changees ? (
                    <p className={styles.historiquePieces}>
                      <strong>Pièces changées :</strong> {item.pieces_changees}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.column}>
          <div className={styles.card}>
            <div className={styles.photosHeader}>
              <h2 className={styles.cardTitle} style={{ marginBottom: 0 }}>Album photos</h2>
              <label className={styles.addPhotoBtn}>
                + Ajouter
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={uploadPhotos} />
              </label>
            </div>
            {notice && <p className={styles.notice}>{notice}</p>}
            {photosLoading ? (
              <p className={styles.emptyText}>Chargement des photos...</p>
            ) : photos.length === 0 ? (
              <p className={styles.emptyText}>Aucune photo.</p>
            ) : (
              <div className={styles.photoGrid}>
                {photos.map((photo) => (
                  <div key={photo.id} className={styles.photoItem}>
                    <img
                      src={photo.url}
                      alt={photo.id}
                      className={styles.photoImg}
                      onClick={() => window.open(photo.url, '_blank')}
                    />
                    <button className={styles.photoDeleteBtn} onClick={() => void deletePhoto(photo.id)}>
                      Suppr
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {laverie.photo_principale && (
            <div className={styles.photoPrincipaleWrap}>
              <img src={laverie.photo_principale} alt={laverie.nom} className={styles.photoPrincipaleImg} />
            </div>
          )}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Informations</h2>
            <p className={styles.infoText}><strong>Adresse:</strong> {laverie.adresse}</p>
            <p className={styles.infoText}><strong>Code postal:</strong> {laverie.code_postal}</p>
            <p className={styles.infoText}><strong>Ville:</strong> {laverie.ville}</p>
            {laverie.telephone && <p className={styles.infoText}><strong>Telephone:</strong> {laverie.telephone}</p>}
            {laverie.email && <p className={styles.infoText}><strong>Email:</strong> {laverie.email}</p>}
            {laverie.infos_supplementaires && (
              <p className={styles.infoText}><strong>Infos supplementaires:</strong> {laverie.infos_supplementaires}</p>
            )}
            <div className={styles.notesBlock}>
              <p className={styles.notesLabel}>Notes / Infos supplémentaires</p>
              <textarea
                className={styles.notesTextarea}
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={5}
                placeholder="Ajoute ici des informations utiles (consignes, accès, détails techniques...)."
              />
              <div className={styles.notesSaveWrap}>
                <button className={styles.saveBtn} onClick={() => void saveNotes()} disabled={savingNotes}>
                  {savingNotes ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
