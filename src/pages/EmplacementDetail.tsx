import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, Plus, Settings, Euro, TrendingUp, Cpu, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { inferMachineKind, type MachineKind } from '../utils/machineKind';
import {
  type Periode,
  type ChartPoint,
  PERIODE_LABELS,
  sumRevenue,
  buildChartData,
  revenueByMachine,
  getRevenueQueryIsoRange,
  filterTransactionsForChartWindow,
} from '../utils/revenueStats';
import { fetchTransactionsForRevenue } from '../utils/fetchTransactionsForRevenue';
import { useBoardAccess } from '../contexts/BoardAccessContext';

interface Machine {
  id: string;
  nom: string;
  esp32_id: string;
  numero_serie?: string;
  marque?: string;
  modele?: string;
  prix_centimes?: number;
  actif?: boolean;
  hors_service?: boolean;
  machine_kind?: string | null;
  type?: string | null;
}

export default function EmplacementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isResidence, canAccessEmplacement } = useBoardAccess();
  const [emplacement, setEmplacement] = useState<{ id: string; name: string; address?: string } | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [revenusByMachine, setRevenusByMachine] = useState<Record<string, number>>({});
  const [periode, setPeriode] = useState<Periode>('mois');
  const [caLaverie, setCaLaverie] = useState<number | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [formMachine, setFormMachine] = useState({
    nom: '',
    esp32_id: '',
    numero_serie: '',
    marque: '',
    modele: '',
    prix_centimes: 300,
    actif: true,
    machine_kind: 'lavage' as MachineKind,
  });
  const [formLaverie, setFormLaverie] = useState({ name: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    if (isResidence && !canAccessEmplacement(id)) {
      setLoading(false);
      setError('Accès refusé à cette laverie.');
      setMachines([]);
      setEmplacement(null);
      return;
    }
    setLoading(true);
    setError(null);
    setMachines([]);
    setCaLaverie(null);
    setChartData([]);
    setRevenusByMachine({});
    setRevenueError(null);
    try {
      const [empRes, machRes] = await Promise.all([
        supabase.from('emplacements').select('id, name, address').eq('id', id).single(),
        supabase.from('machines').select('id, nom, esp32_id, numero_serie, marque, modele, prix_centimes, actif, hors_service, machine_kind, type').eq('emplacement_id', id),
      ]);
      if (empRes.error) throw new Error(empRes.error.message);
      setEmplacement(empRes.data ?? null);
      let machineList = (machRes.data ?? []) as Machine[];
      if (machRes.error) {
        const fallback = await supabase.from('machines').select('id, nom, esp32_id, prix_centimes, actif, machine_kind, type').eq('emplacement_id', id);
        machineList = (fallback.data ?? []) as Machine[];
      }
      setMachines(machineList);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [canAccessEmplacement, id, isResidence]);

  const refreshRevenue = useCallback(
    async (showSpinner = true) => {
      if (!id || loading || machines.length === 0) {
        if (machines.length === 0) {
          setCaLaverie(0);
          setChartData([]);
          setRevenusByMachine({});
          setRevenueError(null);
        }
        return;
      }
      if (showSpinner) setRevenueLoading(true);
      setRevenueError(null);
      try {
        const { startIso, endIso, chartStart, chartEnd } = getRevenueQueryIsoRange(periode);
        const machineIds = machines.map((m) => m.id);
        const idSet = new Set(machineIds);
        const raw = await fetchTransactionsForRevenue(supabase, {
          startIso,
          endIso,
          machineIds,
        });
        const rows = filterTransactionsForChartWindow(raw, chartStart, chartEnd, periode);
        setCaLaverie(sumRevenue(rows));
        setChartData(buildChartData(rows, periode, { start: chartStart, end: chartEnd }));
        setRevenusByMachine(revenueByMachine(rows, idSet));
      } catch (err) {
        setCaLaverie(0);
        setChartData([]);
        setRevenusByMachine({});
        setRevenueError(err instanceof Error ? err.message : 'Erreur CA');
      } finally {
        setRevenueLoading(false);
      }
    },
    [id, loading, machines, periode]
  );

  useEffect(() => {
    if (!id || loading) return;
    if (machines.length === 0) {
      setCaLaverie(0);
      setChartData([]);
      setRevenusByMachine({});
      setRevenueError(null);
      return;
    }
    refreshRevenue(true);
  }, [id, periode, machines, loading, refreshRevenue]);

  useEffect(() => {
    if (!id || loading || machines.length === 0) return;
    const channel = supabase
      .channel(`emplacement-${id}-revenue-tx`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => refreshRevenue(false)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loading, machines.length, refreshRevenue]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && id && !loading && machines.length > 0) {
        refreshRevenue(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [id, loading, machines.length, refreshRevenue]);

  useEffect(() => {
    if (!id || loading || machines.length === 0) return;
    const t = setInterval(() => refreshRevenue(false), 45_000);
    return () => clearInterval(t);
  }, [id, loading, machines.length, refreshRevenue]);

  useEffect(() => {
    if (emplacement) {
      setFormLaverie({ name: emplacement.name, address: emplacement.address ?? '' });
    }
  }, [emplacement]);

  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !formMachine.nom.trim() || !formMachine.esp32_id.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nom: formMachine.nom.trim(),
        esp32_id: formMachine.esp32_id.trim(),
        emplacement_id: id,
        prix_centimes: formMachine.prix_centimes,
        actif: formMachine.actif,
        machine_kind: formMachine.machine_kind,
        type: formMachine.machine_kind,
      };
      if (formMachine.numero_serie.trim()) payload.numero_serie = formMachine.numero_serie.trim();
      if (formMachine.marque.trim()) payload.marque = formMachine.marque.trim();
      if (formMachine.modele.trim()) payload.modele = formMachine.modele.trim();
      await supabase.from('machines').insert(payload);
      setShowAddMachine(false);
      setFormMachine({
        nom: '',
        esp32_id: '',
        numero_serie: '',
        marque: '',
        modele: '',
        prix_centimes: 300,
        actif: true,
        machine_kind: 'lavage',
      });
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLaverie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await supabase.from('emplacements').update({
        name: formLaverie.name.trim(),
        address: formLaverie.address.trim() || null,
      }).eq('id', id);
      setShowParams(false);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLaverie = async () => {
    if (!id || !emplacement) return;
    const nom = emplacement.name || 'cette laverie';
    const first =
      `Supprimer « ${nom} » ?\n\n` +
      `Cette action est irréversible : les machines de cet emplacement seront supprimées, ainsi que les données liées (selon votre base de données).\n\n` +
      `Cliquez sur OK pour continuer.`;
    if (!window.confirm(first)) return;
    const second = `Êtes-vous vraiment sûr(e) de vouloir supprimer définitivement « ${nom} » ?`;
    if (!window.confirm(second)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { error: delErr } = await supabase.from('emplacements').delete().eq('id', id);
      if (delErr) throw delErr;
      setShowParams(false);
      navigate('/emplacements');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Suppression impossible');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;
  if (error) return (
    <div>
      <button
        onClick={() => navigate('/emplacements')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14 }}
      >
        <ArrowLeft size={18} /> Retour aux emplacements
      </button>
      <p style={{ color: '#B91C1C', padding: 20, backgroundColor: '#FEE2E2', borderRadius: 12 }}>Erreur : {error}</p>
    </div>
  );
  if (!emplacement) return <p style={{ color: '#B91C1C' }}>Emplacement introuvable.</p>;

  return (
    <div>
      <button
        onClick={() => navigate('/emplacements')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14 }}
      >
        <ArrowLeft size={18} /> Retour aux emplacements
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>{emplacement.name}</h1>
          {emplacement.address && <p style={{ margin: 0, fontSize: 14, color: '#666' }}>{emplacement.address}</p>}
        </div>
        {!isResidence && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowAddMachine(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer', fontSize: 15 }}
            >
              <Plus size={20} /> Créer une machine
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setShowParams(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer', fontSize: 15 }}
            >
              <Settings size={20} /> Paramètres laverie
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 8, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: '600', color: '#000', margin: 0 }}>Chiffre d&apos;affaires — cette laverie</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['jour', 'mois', 'annee'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriode(p)}
              style={{
                padding: '10px 18px',
                border: periode === p ? '2px solid #1C69D3' : '1px solid #E0E0E0',
                borderRadius: 10,
                backgroundColor: periode === p ? '#E8F0FC' : '#FFF',
                color: periode === p ? '#1a1a1a' : '#666',
                fontWeight: periode === p ? '600' : '500',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {PERIODE_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {revenueError && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>{revenueError}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, marginBottom: 24 }}>
        <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 10, backgroundColor: '#E8F0FC', borderRadius: 12 }}>
              <Euro size={22} color="#1C69D3" />
            </div>
            <span style={{ fontSize: 13, color: '#666', fontWeight: '500' }}>CA ({PERIODE_LABELS[periode]})</span>
          </div>
          {revenueLoading ? (
            <p style={{ fontSize: 28, fontWeight: '700', margin: 0 }}>...</p>
          ) : (
            <p style={{ fontSize: 28, fontWeight: '800', color: '#000', margin: 0 }}>{caLaverie !== null ? `${caLaverie.toFixed(2)} €` : '—'}</p>
          )}
        </div>
        <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 10, backgroundColor: '#E8F5FF', borderRadius: 12 }}>
              <Cpu size={22} color="#2196F3" />
            </div>
            <span style={{ fontSize: 13, color: '#666', fontWeight: '500' }}>Machines sur place</span>
          </div>
          <p style={{ fontSize: 28, fontWeight: '800', color: '#000', margin: 0 }}>{machines.length}</p>
        </div>
        <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 10, backgroundColor: '#FFF3E0', borderRadius: 12 }}>
              <TrendingUp size={22} color="#FF9800" />
            </div>
            <span style={{ fontSize: 13, color: '#666', fontWeight: '500' }}>CA moyen / machine</span>
          </div>
          {revenueLoading ? (
            <p style={{ fontSize: 28, fontWeight: '700', margin: 0 }}>...</p>
          ) : (
            <p style={{ fontSize: 28, fontWeight: '800', color: '#000', margin: 0 }}>
              {machines.length > 0 && caLaverie !== null ? `${(caLaverie / machines.length).toFixed(2)} €` : '0,00 €'}
            </p>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 32, padding: 24, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h3 style={{ fontSize: 17, fontWeight: '600', color: '#000', margin: '0 0 8px' }}>Revenus — {PERIODE_LABELS[periode]}</h3>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>
          Carte + portefeuille (hors codes promo gratuits). Courbe = tous les jours / créneaux de la période.
        </p>
        {revenueLoading ? (
          <p style={{ color: '#666', padding: 32 }}>Chargement du graphique...</p>
        ) : chartData.length === 0 ? (
          <p style={{ color: '#666', padding: 32 }}>Aucune donnée pour cette période.</p>
        ) : chartData.every((p) => p.montant === 0) ? (
          <p style={{ color: '#666', padding: 32 }}>Aucun encaissement sur cette période pour cette laverie (promos exclus).</p>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#666' }} stroke="#9CA3AF" />
                <YAxis tick={{ fontSize: 12, fill: '#666' }} stroke="#9CA3AF" tickFormatter={(v) => `${v} €`} />
                <Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(2)} €`} />
                <Line type="monotone" dataKey="montant" stroke="#1C69D3" strokeWidth={2} dot={{ fill: '#1C69D3', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {!isResidence && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: '600', margin: '0 0 16px', paddingBottom: 12, borderBottom: '2px solid #1C69D3' }}>Appareils</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {machines.length === 0 ? (
              <div style={{ padding: 40, backgroundColor: '#F9FAFB', borderRadius: 12, border: '1px dashed #E5E7EB', color: '#6B7280', fontSize: 14 }}>
                Aucune machine. Cliquez sur "Créer une machine" pour en ajouter.
              </div>
            ) : (
              machines.map((m) => {
                const prixEur = (m.prix_centimes ?? 300) / 100;
                return (
                  <div
                    key={m.id}
                    onClick={() => navigate(`/machines/${m.id}`)}
                    style={{
                      padding: 20,
                      backgroundColor: '#FFF',
                      borderRadius: 12,
                      border: '1px solid #EEE',
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'box-shadow 0.2s, border-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                      e.currentTarget.style.borderColor = '#1C69D3';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                      e.currentTarget.style.borderColor = '#EEE';
                    }}
                  >
                    <div style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: '600', color: '#000' }}>{m.nom}</h3>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                          padding: '4px 10px',
                          borderRadius: 6,
                          backgroundColor: inferMachineKind(m) === 'sechage' ? '#FEF3C7' : '#D1E3FA',
                          color: inferMachineKind(m) === 'sechage' ? '#92400E' : '#1B2430',
                        }}
                      >
                        {inferMachineKind(m) === 'sechage' ? 'Sèche-linge' : 'Lave-linge'}
                      </span>
                    </div>
                    <div style={{ padding: '12px 0', borderTop: '1px solid #F0F0F0', borderBottom: '1px solid #F0F0F0', marginBottom: 12 }}>
                      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#666' }}>{PERIODE_LABELS[periode]}</p>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: '700', color: '#000' }}>
                        {revenueLoading ? '…' : `${(revenusByMachine[m.id] ?? 0).toFixed(2)} EUR`}
                      </p>
                      <p style={{ margin: '12px 0 0', fontSize: 13, color: '#666' }}>Prix du cycle</p>
                      <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: '600', color: '#000' }}>{prixEur.toFixed(2)} EUR</p>
                    </div>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: '600',
                        backgroundColor: m.actif ? '#D1E3FA' : '#F3F4F6',
                        color: m.actif ? '#1B2430' : '#6B7280',
                      }}
                    >
                      {m.actif ? 'Visible app' : 'Inactive'}
                    </span>
                    {m.hors_service ? (
                      <span
                        style={{
                          display: 'inline-block',
                          marginLeft: 8,
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: '600',
                          backgroundColor: '#FEE2E2',
                          color: '#B91C1C',
                        }}
                      >
                        Hors service
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {!isResidence && showAddMachine && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAddMachine(false)}>
          <div style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>Créer une machine</h3>
            <form onSubmit={handleAddMachine}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Nom</label>
                <input
                  type="text"
                  value={formMachine.nom}
                  onChange={(e) => setFormMachine((p) => ({ ...p, nom: e.target.value }))}
                  placeholder="Ex: Machine 1"
                  required
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Type d&apos;appareil
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['lavage', 'sechage'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFormMachine((p) => ({ ...p, machine_kind: k }))}
                      style={{
                        flex: 1,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: formMachine.machine_kind === k ? '2px solid #1C69D3' : '1px solid #E5E7EB',
                        backgroundColor: formMachine.machine_kind === k ? '#E8F1FC' : '#FFF',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        color: '#111',
                      }}
                    >
                      {k === 'lavage' ? 'Lave-linge' : 'Sèche-linge'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>ID ESP32</label>
                <input
                  type="text"
                  value={formMachine.esp32_id}
                  onChange={(e) => setFormMachine((p) => ({ ...p, esp32_id: e.target.value }))}
                  placeholder="Ex: WASH_307"
                  required
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Numéro de série</label>
                <input
                  type="text"
                  value={formMachine.numero_serie}
                  onChange={(e) => setFormMachine((p) => ({ ...p, numero_serie: e.target.value }))}
                  placeholder="Ex: SN-12345678"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Marque</label>
                <input
                  type="text"
                  value={formMachine.marque}
                  onChange={(e) => setFormMachine((p) => ({ ...p, marque: e.target.value }))}
                  placeholder="Ex: Miele, Electrolux"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Modèle</label>
                <input
                  type="text"
                  value={formMachine.modele}
                  onChange={(e) => setFormMachine((p) => ({ ...p, modele: e.target.value }))}
                  placeholder="Ex: WSD 323"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Prix du cycle (EUR)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formMachine.prix_centimes / 100}
                  onChange={(e) => setFormMachine((p) => ({ ...p, prix_centimes: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Etat initial
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setFormMachine((p) => ({ ...p, actif: true }))}
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: formMachine.actif ? '2px solid #1C69D3' : '1px solid #E5E7EB',
                      backgroundColor: formMachine.actif ? '#E8F1FC' : '#FFF',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      color: '#111',
                    }}
                  >
                    En service
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMachine((p) => ({ ...p, actif: false }))}
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: !formMachine.actif ? '2px solid #B91C1C' : '1px solid #E5E7EB',
                      backgroundColor: !formMachine.actif ? '#FEE2E2' : '#FFF',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      color: '#111',
                    }}
                  >
                    Hors service
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddMachine(false)} style={{ padding: '12px 20px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving} style={{ padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!isResidence && showParams && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => {
            setShowParams(false);
            setDeleteError(null);
          }}
        >
          <div style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>Paramètres laverie</h3>
            <form onSubmit={handleSaveLaverie}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Nom</label>
                <input
                  type="text"
                  value={formLaverie.name}
                  onChange={(e) => setFormLaverie((p) => ({ ...p, name: e.target.value }))}
                  required
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Adresse</label>
                <input
                  type="text"
                  value={formLaverie.address}
                  onChange={(e) => setFormLaverie((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Adresse de la laverie"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowParams(false); setDeleteError(null); }} style={{ padding: '12px 20px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving || deleting} style={{ padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid #E5E7EB' }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: '600', color: '#991B1B' }}>Zone de danger</p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                La suppression retire cet emplacement. Les machines rattachées sont supprimées en cascade (conformément à votre schéma Supabase).
              </p>
              {deleteError && (
                <p style={{ margin: '0 0 12px', padding: 10, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 13 }}>{deleteError}</p>
              )}
              <button
                type="button"
                onClick={handleDeleteLaverie}
                disabled={deleting || saving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 18px',
                  backgroundColor: '#FEF2F2',
                  color: '#B91C1C',
                  border: '1px solid #FECACA',
                  borderRadius: 10,
                  fontWeight: '600',
                  cursor: deleting || saving ? 'wait' : 'pointer',
                  fontSize: 14,
                }}
              >
                <Trash2 size={18} />
                {deleting ? 'Suppression...' : 'Supprimer cette laverie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
