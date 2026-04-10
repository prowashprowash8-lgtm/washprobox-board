import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Send, MapPin } from 'lucide-react';

interface Emplacement {
  id: string;
  name: string;
  address?: string;
}

interface MissionSubmission {
  id: string;
  mission_id: string;
  user_id: string | null;
  emplacement_id: string;
  status: string;
  photo_urls: string[];
  completed_at: string | null;
  user_email?: string | null;
  user_name?: string | null;
}

interface Mission {
  id: string;
  titre: string;
  description: string | null;
  recompense: string | null;
  created_at: string;
  emplacements: { id: string; name: string }[];
  submissions?: MissionSubmission[];
}

export default function Missions() {
  const navigate = useNavigate();
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [recompense, setRecompense] = useState('Lavage gratuit');
  const [selectedEmplacements, setSelectedEmplacements] = useState<Set<string>>(new Set());

  const fetchEmplacements = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('emplacements')
      .select('id, name, address')
      .order('name');
    if (err) throw err;
    setEmplacements((data ?? []) as Emplacement[]);
  }, []);

  const fetchMissions = useCallback(async () => {
    const { data: missionsData, error: mErr } = await supabase
      .from('missions')
      .select('id, titre, description, recompense, created_at')
      .order('created_at', { ascending: false });
    if (mErr) throw mErr;

    const { data: meData } = await supabase
      .from('mission_emplacements')
      .select('mission_id, emplacement_id');
    const meByMission: Record<string, string[]> = {};
    (meData ?? []).forEach((r: { mission_id: string; emplacement_id: string }) => {
      if (!meByMission[r.mission_id]) meByMission[r.mission_id] = [];
      meByMission[r.mission_id].push(r.emplacement_id);
    });

    const { data: subData } = await supabase
      .from('mission_submissions')
      .select('id, mission_id, user_id, emplacement_id, status, photo_urls, completed_at');
    const subsByMission: Record<string, MissionSubmission[]> = {};
    const userIds = [...new Set((subData ?? []).map((s: { user_id?: string }) => s.user_id).filter(Boolean))];
    const { data: profilesData } = userIds.length > 0
      ? await supabase.from('profiles').select('id, email, first_name, last_name').in('id', userIds)
      : { data: [] };
    const profileMap = Object.fromEntries(
      (profilesData ?? []).map((p: { id: string; email?: string; first_name?: string; last_name?: string }) => [
        p.id,
        {
          email: p.email,
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—',
        },
      ])
    );

    (subData ?? []).forEach((s: { id: string; mission_id: string; user_id: string | null; emplacement_id: string; status: string; photo_urls: string[]; completed_at: string | null }) => {
      if (!subsByMission[s.mission_id]) subsByMission[s.mission_id] = [];
      const prof = s.user_id ? profileMap[s.user_id] : null;
      subsByMission[s.mission_id].push({
        ...s,
        user_email: prof?.email,
        user_name: prof?.name,
      });
    });

    const empMap = Object.fromEntries(emplacements.map((e) => [e.id, e.name]));
    const result: Mission[] = (missionsData ?? []).map((m: { id: string; titre: string; description: string | null; recompense: string | null; created_at: string }) => ({
      ...m,
      emplacements: (meByMission[m.id] ?? []).map((eid) => ({ id: eid, name: empMap[eid] ?? '—' })),
      submissions: (subsByMission[m.id] ?? []).sort(
        (a, b) => new Date(b.completed_at || b.id).getTime() - new Date(a.completed_at || a.id).getTime()
      ),
    }));
    setMissions(result);
  }, [emplacements]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchEmplacements();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchEmplacements]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (emplacements.length > 0) {
      fetchMissions();
    }
  }, [emplacements, fetchMissions]);

  const toggleEmplacement = (id: string) => {
    setSelectedEmplacements((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedEmplacements(new Set(emplacements.map((e) => e.id)));
  };

  const deselectAll = () => {
    setSelectedEmplacements(new Set());
  };

  const handleSend = async (toAll: boolean) => {
    if (!titre.trim()) {
      setError('Le titre est requis.');
      return;
    }
    const targetIds = toAll ? emplacements.map((e) => e.id) : Array.from(selectedEmplacements);
    if (targetIds.length === 0 && !toAll) {
      setError('Sélectionnez au moins une laverie.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const { data: missionData, error: insertErr } = await supabase
        .from('missions')
        .insert({
          titre: titre.trim(),
          description: description.trim() || null,
          recompense: recompense.trim() || 'Lavage gratuit',
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      if (!missionData?.id) throw new Error('Mission non créée');

      const idsToUse = toAll ? emplacements.map((e) => e.id) : targetIds;
      const rows = idsToUse.map((emplacement_id) => ({
        mission_id: missionData.id,
        emplacement_id,
      }));
      const { error: meErr } = await supabase.from('mission_emplacements').insert(rows);
      if (meErr) throw meErr;

      // Notifier les utilisateurs (non bloquant : si l'Edge Function n'est pas déployée, on continue quand même)
      try {
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mission-notifications`;
        await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            type: 'mission_posted',
            mission_id: missionData.id,
            emplacement_ids: idsToUse,
            titre: titre.trim(),
          }),
        });
      } catch {
        // Notification non critique : on continue même si elle échoue
      }

      setTitre('');
      setDescription('');
      setRecompense('Lavage gratuit');
      setSelectedEmplacements(new Set());
      await fetchMissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>Missions</h1>
      <p style={{ color: '#666', margin: '0 0 32px' }}>
        Envoyez des missions aux utilisateurs de la laverie (ex : laver les filtres pour gagner un lavage gratuit).
      </p>

      {error && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>{error}</div>
      )}

      <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>Créer une mission</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: '500', color: '#666' }}>Titre</label>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex: Laver les filtres"
              style={{ padding: '12px 16px', border: '1px solid #E0E0E0', borderRadius: 10, fontSize: 15, width: '100%', maxWidth: 400 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: '500', color: '#666' }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Nettoyez les filtres des machines à laver pour obtenir un lavage gratuit."
              rows={3}
              style={{ padding: '12px 16px', border: '1px solid #E0E0E0', borderRadius: 10, fontSize: 15, width: '100%', maxWidth: 400, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: '500', color: '#666' }}>Récompense</label>
            <input
              type="text"
              value={recompense}
              onChange={(e) => setRecompense(e.target.value)}
              placeholder="Lavage gratuit"
              style={{ padding: '12px 16px', border: '1px solid #E0E0E0', borderRadius: 10, fontSize: 15, width: 200 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: '500', color: '#666' }}>Envoyer à</label>
            {emplacements.length === 0 ? (
              <p style={{ color: '#666', fontSize: 14 }}>Aucune laverie. Créez d'abord des emplacements.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={selectAll}
                    style={{ padding: '8px 14px', fontSize: 13, backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: '500' }}
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    style={{ padding: '8px 14px', fontSize: 13, backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: '500' }}
                  >
                    Tout désélectionner
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {emplacements.map((e) => (
                    <label
                      key={e.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: `2px solid ${selectedEmplacements.has(e.id) ? '#1C69D3' : '#E2E8F0'}`,
                        backgroundColor: selectedEmplacements.has(e.id) ? '#E8F0FC' : '#FFF',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: selectedEmplacements.has(e.id) ? '600' : '400',
                        color: selectedEmplacements.has(e.id) ? '#1C69D3' : '#475569',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmplacements.has(e.id)}
                        onChange={() => toggleEmplacement(e.id)}
                        style={{ width: 18, height: 18, accentColor: '#1C69D3' }}
                      />
                      {e.name}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={() => handleSend(false)}
              disabled={sending || selectedEmplacements.size === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                backgroundColor: selectedEmplacements.size > 0 ? '#1C69D3' : '#94A3B8',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontWeight: '600',
                cursor: sending || selectedEmplacements.size === 0 ? 'not-allowed' : 'pointer',
                fontSize: 15,
              }}
            >
              <Send size={20} /> Envoyer aux laveries sélectionnées ({selectedEmplacements.size})
            </button>
            <button
              onClick={() => handleSend(true)}
              disabled={sending || emplacements.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                backgroundColor: emplacements.length > 0 ? '#509630' : '#94A3B8',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontWeight: '600',
                cursor: sending || emplacements.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: 15,
              }}
            >
              <Send size={20} /> Envoyer à toutes les laveries
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: '600', color: '#000' }}>Missions envoyées</h2>
        {missions.length === 0 ? (
          <p style={{ padding: 24, color: '#666' }}>Aucune mission. Créez-en une ci-dessus.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {missions.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #F0F0F0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: '600', color: '#000' }}>{m.titre}</span>
                    {m.recompense && (
                      <span style={{ marginLeft: 12, fontSize: 13, color: '#509630', fontWeight: '500' }}>— {m.recompense}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>
                    {new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {m.description && <p style={{ margin: 0, fontSize: 14, color: '#64748B' }}>{m.description}</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                  {m.emplacements.map((e) => (
                    <span
                      key={e.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        fontSize: 12,
                        backgroundColor: '#F1F5F9',
                        color: '#475569',
                        borderRadius: 6,
                      }}
                    >
                      <MapPin size={12} /> {e.name}
                    </span>
                  ))}
                </div>
                {m.submissions && m.submissions.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EEE' }}>
                    <div style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8 }}>
                      Soumissions ({m.submissions.length})
                    </div>
                    {m.submissions.map((sub) => (
                      <div
                        key={sub.id}
                        style={{
                          marginBottom: 12,
                          padding: 12,
                          backgroundColor: '#F8FAFC',
                          borderRadius: 10,
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 8 }}>
                          {sub.user_id ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/utilisateurs/${sub.user_id}`)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                color: '#1C69D3',
                                fontWeight: 600,
                                fontSize: 13,
                                textDecoration: 'underline',
                              }}
                            >
                              {sub.user_name || sub.user_email || 'Utilisateur'}
                            </button>
                          ) : (
                            <span>{sub.user_name || sub.user_email || 'Utilisateur'}</span>
                          )}
                          {' — '}
                          {sub.completed_at
                            ? new Date(sub.completed_at).toLocaleString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(sub.photo_urls || []).map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'block' }}
                            >
                              <img
                                src={url}
                                alt={`Photo ${idx + 1}`}
                                style={{
                                  width: 80,
                                  height: 80,
                                  objectFit: 'cover',
                                  borderRadius: 8,
                                  border: '1px solid #E2E8F0',
                                }}
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
