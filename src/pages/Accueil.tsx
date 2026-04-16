import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { TrendingUp, Cpu, Euro } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  type Periode,
  type ChartPoint,
  PERIODE_LABELS,
  sumRevenue,
  buildChartData,
  getRevenueQueryIsoRange,
  filterTransactionsForChartWindow,
} from '../utils/revenueStats';
import { fetchTransactionsForRevenue } from '../utils/fetchTransactionsForRevenue';
import { useBoardAccess } from '../contexts/BoardAccessContext';

export default function Accueil() {
  const { isResidence, allowedEmplacementIds } = useBoardAccess();
  const [periode, setPeriode] = useState<Periode>('mois');
  const [ca, setCa] = useState<number | null>(null);
  const [nbAppareils, setNbAppareils] = useState<number>(0);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      if (isResidence && allowedEmplacementIds.length === 0) {
        setNbAppareils(0);
        setCa(0);
        setChartData([]);
        return;
      }

      let machinesQuery = supabase
        .from('machines')
        .select('id, emplacement_id', { count: 'exact' });
      if (isResidence) {
        machinesQuery = machinesQuery.in('emplacement_id', allowedEmplacementIds);
      }
      const { data: machinesData, count, error: machinesError } = await machinesQuery;
      if (machinesError) throw machinesError;
      setNbAppareils(count ?? 0);

      const { startIso, endIso, chartStart, chartEnd } = getRevenueQueryIsoRange(periode);
      const machineIds = (machinesData ?? [])
        .map((m: { id?: string | null }) => m.id ?? '')
        .filter(Boolean);

      const raw = await fetchTransactionsForRevenue(supabase, {
        startIso,
        endIso,
        machineIds: isResidence ? machineIds : undefined,
      });
      const rows = filterTransactionsForChartWindow(raw, chartStart, chartEnd, periode);
      setCa(sumRevenue(rows));
      setChartData(buildChartData(rows, periode, { start: chartStart, end: chartEnd }));
    } catch (err) {
      setCa(0);
      setChartData([]);
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [allowedEmplacementIds, isResidence, periode]);

  useEffect(() => {
    fetchStats(true);
  }, [fetchStats]);

  useEffect(() => {
    const channel = supabase
      .channel('accueil-revenues')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => fetchStats(false)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchStats(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [fetchStats]);

  useEffect(() => {
    const t = setInterval(() => fetchStats(false), 45_000);
    return () => clearInterval(t);
  }, [fetchStats]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Bienvenue Victor !</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>
            {isResidence
              ? 'Vue résidence : uniquement vos laveries et leur chiffre d’affaires.'
              : 'Statistiques de vos appareils connectés (ESP32). Revenus = cartes + portefeuille (hors codes promo gratuits).'}
            <span style={{ display: 'block', marginTop: 6, fontSize: 13, color: '#999' }}>
              « Aujourd’hui » = uniquement le jour en cours. Pour inclure les paiements d’hier, utilisez « Ce mois » ou « Cette année ».
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['jour', 'mois', 'annee'] as const).map((p) => (
            <button
              key={p}
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

      {error && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
        <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 10, backgroundColor: '#E8F0FC', borderRadius: 12 }}>
              <Euro size={24} color="#1C69D3" />
            </div>
            <span style={{ fontSize: 14, color: '#666', fontWeight: '500' }}>Chiffre d'affaires ({PERIODE_LABELS[periode]})</span>
          </div>
          {loading ? (
            <p style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>...</p>
          ) : (
            <p style={{ fontSize: 32, fontWeight: '800', color: '#000', margin: 0 }}>
              {ca !== null ? `${ca.toFixed(2)} €` : '0,00 €'}
            </p>
          )}
        </div>

        <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 10, backgroundColor: '#E8F5FF', borderRadius: 12 }}>
              <Cpu size={24} color="#2196F3" />
            </div>
            <span style={{ fontSize: 14, color: '#666', fontWeight: '500' }}>Appareils connectés (ESP32)</span>
          </div>
          {loading ? (
            <p style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>...</p>
          ) : (
            <p style={{ fontSize: 32, fontWeight: '800', color: '#000', margin: 0 }}>{nbAppareils}</p>
          )}
        </div>

        <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 10, backgroundColor: '#FFF3E0', borderRadius: 12 }}>
              <TrendingUp size={24} color="#FF9800" />
            </div>
            <span style={{ fontSize: 14, color: '#666', fontWeight: '500' }}>CA moyen / appareil</span>
          </div>
          {loading ? (
            <p style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>...</p>
          ) : (
            <p style={{ fontSize: 32, fontWeight: '800', color: '#000', margin: 0 }}>
              {nbAppareils > 0 && ca !== null ? `${(ca / nbAppareils).toFixed(2)} €` : '0,00 €'}
            </p>
          )}
        </div>
      </div>

      <div style={{ marginTop: 32, padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: 18, fontWeight: '600', color: '#000', margin: '0 0 24px' }}>Revenus — {PERIODE_LABELS[periode]}</h2>
        {loading ? (
          <p style={{ color: '#666', padding: 40 }}>Chargement du graphique...</p>
        ) : chartData.length === 0 ? (
          <p style={{ color: '#666', padding: 40 }}>Aucune donnée pour cette période.</p>
        ) : chartData.every((p) => p.montant === 0) ? (
          <p style={{ color: '#666', padding: 40 }}>Aucun encaissement sur cette période (promos gratuits exclus).</p>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
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
    </div>
  );
}
