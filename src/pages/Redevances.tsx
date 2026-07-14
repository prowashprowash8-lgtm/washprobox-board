import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useBoardAccess } from '../contexts/BoardAccessContext';
import { fetchAllTransactionsBoard } from '../utils/fetchAllTransactionsBoard';
import {
  type Periode,
  type ChartPoint,
  PERIODE_LABELS,
  buildChartData,
  getRevenueQueryIsoRange,
  filterTransactionsForChartWindow,
  filterTxForMoneyRevenue,
} from '../utils/revenueStats';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const TVA_RATE = 0.20;

interface EmplacementOption {
  id: string;
  name: string;
  redevance_pourcentage: number | null;
}

interface TxDetailRow {
  id: string;
  created_at: string;
  machine_name: string;
  montantTTC: number;
}

export default function Redevances() {
  const { allowedEmplacementIds } = useBoardAccess();
  const [emplacements, setEmplacements] = useState<EmplacementOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [periode, setPeriode] = useState<Periode>('mois');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [caTTC, setCaTTC] = useState(0);
  const [detailRows, setDetailRows] = useState<TxDetailRow[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    const loadEmplacements = async () => {
      if (allowedEmplacementIds.length === 0) {
        setEmplacements([]);
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('emplacements')
        .select('id, name, redevance_pourcentage')
        .in('id', allowedEmplacementIds)
        .order('name');
      if (err) {
        setError(err.message);
        setEmplacements([]);
      } else {
        setEmplacements((data ?? []) as EmplacementOption[]);
        if (data && data.length > 0) setSelectedId((prev) => prev || data[0].id);
      }
    };
    loadEmplacements();
  }, [allowedEmplacementIds]);

  const fetchStats = useCallback(async () => {
    if (!selectedId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { startIso, endIso, chartStart, chartEnd } = getRevenueQueryIsoRange(periode);
      const all = await fetchAllTransactionsBoard(supabase);

      const rowsForEmplacement = all.filter(
        (r) => String(r.emplacement_id ?? '') === selectedId
      );

      const inWindow = rowsForEmplacement.filter((r) => {
        const t = r.created_at ? new Date(String(r.created_at)).getTime() : NaN;
        return !Number.isNaN(t) && t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime();
      });

      const chartRows = filterTransactionsForChartWindow(
        inWindow.map((r) => ({
          machine_id: r.machine_id as string | undefined,
          amount: r.amount != null ? Number(r.amount) : undefined,
          montant: r.amount != null ? Number(r.amount) : undefined,
          payment_method: r.payment_method as string | undefined,
          status: r.status as string | undefined,
          created_at: r.created_at as string | undefined,
        })),
        chartStart,
        chartEnd,
        periode
      );

      setChartData(buildChartData(chartRows, periode, { start: chartStart, end: chartEnd }));

      const moneyRows = filterTxForMoneyRevenue(chartRows);
      const total = moneyRows.reduce((sum, r) => sum + Number(r.montant ?? r.amount ?? 0), 0);
      setCaTTC(total);

      const detail: TxDetailRow[] = inWindow
        .filter((r) => {
          const t = r.created_at ? new Date(String(r.created_at)).getTime() : NaN;
          if (Number.isNaN(t)) return false;
          if (t < chartStart.getTime() || t > chartEnd.getTime()) return false;
          return r.payment_method !== 'test' && r.payment_method !== 'promo' && String(r.status ?? '').toLowerCase() !== 'refunded';
        })
        .map((r) => ({
          id: String(r.id),
          created_at: String(r.created_at),
          machine_name: String(r.machine_name ?? '—'),
          montantTTC: Number(r.amount ?? 0),
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setDetailRows(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setChartData([]);
      setCaTTC(0);
      setDetailRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId, periode]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const channel = supabase
      .channel('redevances-transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchStats())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  const selectedEmplacement = emplacements.find((e) => e.id === selectedId) ?? null;
  const redevancePct = selectedEmplacement?.redevance_pourcentage ?? null;
  const tva = caTTC - caTTC / (1 + TVA_RATE);
  const caHT = caTTC / (1 + TVA_RATE);
  const montantRedevance = redevancePct != null ? caHT * (redevancePct / 100) : null;

  const eur = (n: number) => `${n.toFixed(2)} €`;

  if (emplacements.length === 0 && !loading) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>Redevances</h1>
        <p style={{ color: '#666' }}>Aucune laverie associée à votre compte.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Redevances</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>
            Détail du montant à percevoir sur le chiffre d'affaires de votre laverie.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

      {emplacements.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Laverie</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, minWidth: 260 }}
          >
            {emplacements.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>
          {error}
        </div>
      )}

      {redevancePct == null && !loading && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEF3C7', color: '#92400E', borderRadius: 10 }}>
          Aucun pourcentage de redevance n'a encore été configuré pour cette laverie. Le patron peut le renseigner depuis les paramètres de la laverie.
        </div>
      )}

      <div style={{ marginBottom: 32, padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: 18, fontWeight: '600', color: '#000', margin: '0 0 24px' }}>Revenus — {PERIODE_LABELS[periode]}</h2>
        {loading ? (
          <p style={{ color: '#666', padding: 40 }}>Chargement du graphique...</p>
        ) : chartData.length === 0 || chartData.every((p) => p.montant === 0) ? (
          <p style={{ color: '#666', padding: 40 }}>Aucun encaissement sur cette période.</p>
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

      <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: 18, fontWeight: '600', color: '#000', margin: '0 0 24px' }}>Détail du calcul — {PERIODE_LABELS[periode]}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div style={{ padding: 18, backgroundColor: '#F8F9FA', borderRadius: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Chiffre d'affaires TTC</p>
            <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#000' }}>{loading ? '...' : eur(caTTC)}</p>
          </div>
          <div style={{ padding: 18, backgroundColor: '#F8F9FA', borderRadius: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>TVA (20%)</p>
            <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#000' }}>{loading ? '...' : eur(tva)}</p>
          </div>
          <div style={{ padding: 18, backgroundColor: '#F8F9FA', borderRadius: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Chiffre d'affaires HT</p>
            <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#000' }}>{loading ? '...' : eur(caHT)}</p>
          </div>
          <div style={{ padding: 18, backgroundColor: '#F8F9FA', borderRadius: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Pourcentage de redevance</p>
            <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#000' }}>
              {redevancePct != null ? `${redevancePct}%` : '—'}
            </p>
          </div>
          <div style={{ padding: 18, backgroundColor: '#E8F0FC', borderRadius: 12, border: '2px solid #1C69D3' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#1C69D3', fontWeight: 600 }}>Montant de la redevance</p>
            <p style={{ margin: '8px 0 0', fontSize: 26, fontWeight: '800', color: '#1C69D3' }}>
              {loading ? '...' : montantRedevance != null ? eur(montantRedevance) : '—'}
            </p>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>
          Calcul : CA HT ({eur(caHT)}) × {redevancePct ?? 0}% = {montantRedevance != null ? eur(montantRedevance) : '—'}.
          Le CA HT est obtenu en retirant la TVA à 20% du chiffre d'affaires TTC encaissé.
        </p>

        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          style={{ padding: '10px 18px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer', fontSize: 14 }}
        >
          {showDetail ? 'Masquer le détail des transactions' : 'Voir le détail des transactions'}
        </button>

        {showDetail && (
          <div style={{ marginTop: 20, overflowX: 'auto' }}>
            {detailRows.length === 0 ? (
              <p style={{ color: '#666' }}>Aucune transaction sur cette période.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
                    <th style={{ padding: '8px 10px' }}>Date</th>
                    <th style={{ padding: '8px 10px' }}>Machine</th>
                    <th style={{ padding: '8px 10px' }}>Prix TTC</th>
                    <th style={{ padding: '8px 10px' }}>Prix HT</th>
                    <th style={{ padding: '8px 10px' }}>Part redevance</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row) => {
                    const ht = row.montantTTC / (1 + TVA_RATE);
                    const part = redevancePct != null ? ht * (redevancePct / 100) : null;
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '8px 10px' }}>{new Date(row.created_at).toLocaleString('fr-FR')}</td>
                        <td style={{ padding: '8px 10px' }}>{row.machine_name}</td>
                        <td style={{ padding: '8px 10px' }}>{eur(row.montantTTC)}</td>
                        <td style={{ padding: '8px 10px' }}>{eur(ht)}</td>
                        <td style={{ padding: '8px 10px' }}>{part != null ? eur(part) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
