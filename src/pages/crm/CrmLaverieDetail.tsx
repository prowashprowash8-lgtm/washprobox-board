import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

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
  technicien_nom: string;
  date_intervention: string;
  motif: string;
  description: string;
  compte_rendu: string;
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
      let targetId = id ?? null;
      if (!targetId && emplacementId) {
        const empRes = await supabase.from('emplacements').select('id, name, address, created_at').eq('id', emplacementId).single();
        if (!empRes.error && empRes.data) {
          const name = (empRes.data.name ?? '').trim();
          const address = (empRes.data.address ?? 'Adresse non renseignée').trim();

          const existing = await supabase
            .from('laveries')
            .select('*')
            .eq('nom', name)
            .eq('adresse', address)
            .maybeSingle();

          if (!existing.error && existing.data) {
            targetId = existing.data.id as string;
          } else {
            targetId = await ensureLaverieFromBoard(emplacementId);
            if (!targetId) {
              // Fallback: on affiche quand meme une fiche basee sur le board.
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
        } else {
          setLoading(false);
          return;
        }
      }
      if (!targetId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [lavRes, histRes] = await Promise.all([
        supabase.from('laveries').select('*').eq('id', targetId).single(),
        supabase.from('historique').select('id, technicien_nom, date_intervention, motif, description, compte_rendu').eq('laverie_id', targetId).order('date_intervention', { ascending: false }),
      ]);
      if (!lavRes.error) {
        setLaverie(lavRes.data as Laverie);
        setStorageFolderId((lavRes.data as Laverie).id);
        setNotesValue((lavRes.data as Laverie).infos_supplementaires ?? '');
      }
      if (!histRes.error) setHistorique((histRes.data ?? []) as Historique[]);
      await loadPhotos(targetId);
      setLoading(false);
    };
    void load();
  }, [id, emplacementId]);

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
  if (!laverie) return <p style={{ color: '#666' }}>Laverie introuvable.</p>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <button onClick={() => navigate('/crm/laveries')} style={{ marginBottom: 12 }}>Retour</button>
        <h1 style={{ margin: 0, fontSize: 30 }}>{laverie.nom}</h1>
        <p style={{ margin: '8px 0 0', color: '#666' }}>
          {laverie.ville} - Ajoutee le {new Date(laverie.created_at).toLocaleDateString('fr-FR')}
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Historique des interventions</h2>
          {historique.length === 0 ? (
            <p style={{ color: '#777' }}>Aucune intervention cloturee.</p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {historique.map((item) => (
                <div key={item.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{item.motif}</p>
                  <p style={{ margin: '6px 0', color: '#666' }}>
                    {new Date(item.date_intervention).toLocaleDateString('fr-FR')} - {item.technicien_nom}
                  </p>
                  <p style={{ margin: '0 0 6px' }}>{item.description}</p>
                  <p style={{ margin: 0, color: '#444' }}>{item.compte_rendu}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Album photos</h2>
              <label style={{ background: '#1c69d3', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 600 }}>
                + Ajouter
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={uploadPhotos} />
              </label>
            </div>
            {notice && <p style={{ margin: '0 0 10px', color: '#b91c1c' }}>{notice}</p>}
            {photosLoading ? (
              <p style={{ color: '#666' }}>Chargement des photos...</p>
            ) : photos.length === 0 ? (
              <p style={{ color: '#777' }}>Aucune photo.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 10 }}>
                {photos.map((photo) => (
                  <div key={photo.id} style={{ position: 'relative' }}>
                    <img
                      src={photo.url}
                      alt={photo.id}
                      style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', cursor: 'pointer' }}
                      onClick={() => window.open(photo.url, '_blank')}
                    />
                    <button
                      onClick={() => void deletePhoto(photo.id)}
                      style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'rgba(220,38,38,0.92)', color: '#fff', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', fontSize: 12 }}
                    >
                      Suppr
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {laverie.photo_principale && (
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, overflow: 'hidden' }}>
              <img src={laverie.photo_principale} alt={laverie.nom} style={{ width: '100%', height: 260, objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Informations</h2>
            <p><strong>Adresse:</strong> {laverie.adresse}</p>
            <p><strong>Code postal:</strong> {laverie.code_postal}</p>
            <p><strong>Ville:</strong> {laverie.ville}</p>
            {laverie.telephone && <p><strong>Telephone:</strong> {laverie.telephone}</p>}
            {laverie.email && <p><strong>Email:</strong> {laverie.email}</p>}
            {laverie.infos_supplementaires && <p><strong>Infos supplementaires:</strong> {laverie.infos_supplementaires}</p>}
            <div style={{ marginTop: 14, borderTop: '1px solid #f1f1f1', paddingTop: 12 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Notes / Infos supplémentaires</p>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={5}
                placeholder="Ajoute ici des informations utiles (consignes, accès, détails techniques...)."
                style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: 10, fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={() => void saveNotes()}
                  disabled={savingNotes}
                  style={{ border: 'none', background: '#1c69d3', color: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: savingNotes ? 'wait' : 'pointer' }}
                >
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
