import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { TrendingUp, Cpu, Euro } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  type Periode,
  type ChartPoint,
  PERIODE_LABELS,
  getPeriodBounds,
  sumRevenue,
  buildChartData,
} from '../utils/revenueStats';

export default function Accueil() {
  const [periode, setPeriode] = useState<Periode>('mois');
  const [ca, setCa] = useState<number | null>(null);
  const [nbAppareils, setNbAppareils] = useState<number>(0);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const { count, error: machinesError } = await supabase
        .from('machines')
        .select('*', { count: 'exact', head: true });
      if (machinesError) throw machinesError;
      setNbAppareils(count ?? 0);

      const { start, end } = getPeriodBounds(periode);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('montant, amount, payment_method, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true });

      if (txError) throw txError;

      const rows = txData ?? [];
      setCa(sumRevenue(rows));
      setChartData(buildChartData(rows, periode));
    } catch (err) {
      setCa(0);
      setChartData([]);
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [periode]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Bienvenue Victor !</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>Statistiques de vos appareils connectés (ESP32).</p>
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
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#666' }} stroke="#9CA3AF" />
                <YAxis tick={{ fontSize: 12, fill: '#666' }} stroke="#9CA3AF" tickFormatter={(v) => `${v} €`} />
                <Tooltip formatter={(v: number) => `${Number(v).toFixed(2)} €`} />
                <Line type="monotone" dataKey="montant" stroke="#1C69D3" strokeWidth={2} dot={{ fill: '#1C69D3', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
