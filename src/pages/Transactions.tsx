import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Receipt, Euro, ChevronRight, TicketPercent, Wallet } from 'lucide-react';
import { fetchAllTransactionsBoard } from '../utils/fetchAllTransactionsBoard';

interface Transaction {
  id: string;
  machine_id: string | null;
  emplacement_id: string | null;
  amount?: number;
  montant?: number;
  payment_method?: string;
  promo_code?: string | null;
  user_id?: string | null;
  status?: string;
  created_at: string;
  machine_nom?: string | null;
  emplacement_name?: string | null;
  user_name?: string | null;
  transaction_finished_at?: string | null;
  sort_anchor_at?: string | null;
}

interface MachineEventRow {
  transaction_id: string | null;
  event_type: string;
  created_at: string;
}

type DisplayRow =
  | { kind: 'transaction'; t: Transaction }
  | { kind: 'stop'; txId: string; machine_id: string | null; user_name?: string | null; machine_nom?: string | null; emplacement_name?: string | null; created_at: string };

function mapRpcRowsToTransactions(txData: Record<string, unknown>[]): Transaction[] {
  return txData.map((t) => ({
    id: String(t.id),
    machine_id: (t.machine_id as string) ?? null,
    emplacement_id: (t.emplacement_id as string) ?? null,
    amount: t.amount as number | undefined,
    montant: t.amount as number | undefined,
    payment_method: t.payment_method as string | undefined,
    promo_code: t.promo_code as string | null,
    user_id: t.user_id as string | null,
    status: t.status as string | undefined,
    created_at: String(t.created_at),
    machine_nom: (t.machine_name as string) || '—',
    emplacement_name: (t.emplacement_name as string) || '—',
    user_name: typeof t.user_name === 'string' && t.user_name.trim() ? t.user_name.trim() : '—',
  }));
}

export default function Transactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async (showLoading = true) => {
    setError(null);
    if (showLoading) setLoading(true);
    try {
      const txData = await fetchAllTransactionsBoard(supabase);
      const txs = mapRpcRowsToTransactions(txData as Record<string, unknown>[]);
      const txIds = txs.map((t) => t.id).filter(Boolean);
      let finishedByTx = new Map<string, string>();
      if (txIds.length > 0) {
        const { data: evData } = await supabase
          .from('machine_event_history')
          .select('transaction_id,event_type,created_at')
          .in('transaction_id', txIds)
          .eq('event_type', 'transaction_finished')
          .order('created_at', { ascending: false });
        for (const ev of (evData ?? []) as MachineEventRow[]) {
          if (!ev.transaction_id) continue;
          if (!finishedByTx.has(ev.transaction_id)) finishedByTx.set(ev.transaction_id, ev.created_at);
        }
      }
      const refundDateByPromoCode = new Map<string, string>();
      const hasPromoTransactions = txs.some((t) => t.payment_method === 'promo' && !!t.promo_code);
      if (hasPromoTransactions) {
        // Source de vérité pour les codes de compensation.
        // On ne filtre pas par .in(...) pour éviter tout problème de casse / espaces.
        const { data: refundData } = await supabase
          .from('refund_requests')
          .select('compensation_promo_code,created_at,statut')
          .not('compensation_promo_code', 'is', null)
          .eq('statut', 'approved')
          .order('created_at', { ascending: false });
        for (const row of (refundData ?? []) as Array<{ compensation_promo_code: string | null; created_at: string }>) {
          const code = (row.compensation_promo_code ?? '').trim().toUpperCase();
          if (!code) continue;
          if (!refundDateByPromoCode.has(code)) refundDateByPromoCode.set(code, row.created_at);
        }
      }

      const mappedTxs = txs.map((t) => {
        const promoCode = (t.promo_code ?? '').trim().toUpperCase();
        const refundAnchor = t.payment_method === 'promo' ? refundDateByPromoCode.get(promoCode) ?? null : null;
        return {
          ...t,
          transaction_finished_at: finishedByTx.get(t.id) ?? null,
          // Tri affichage: si code de compensation remboursé, on s'aligne sur la date
          // du remboursement (refund_requests.created_at), sinon sur la date transaction.
          sort_anchor_at: refundAnchor || t.created_at,
        };
      });

      mappedTxs.sort((a, b) => {
        const aTs = new Date(a.sort_anchor_at ?? a.created_at).getTime();
        const bTs = new Date(b.sort_anchor_at ?? b.created_at).getTime();
        return bTs - aTs;
      });

      setTransactions(mappedTxs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions(true);
  }, [fetchTransactions]);

  useEffect(() => {
    const channel = supabase
      .channel('board-transactions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          fetchTransactions(false);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTransactions]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchTransactions(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [fetchTransactions]);

  const nonRefunded = transactions.filter((t) => t.status !== 'refunded' && t.payment_method !== 'test');
  const total = nonRefunded.reduce((s, t) => s + (t.payment_method === 'promo' ? 0 : Number(t.amount ?? t.montant ?? 0)), 0);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const eventBadge = (kind: 'start' | 'finish') => {
    const borderColor = kind === 'start' ? '#16A34A' : '#DC2626';
    const textColor = kind === 'start' ? '#166534' : '#991B1B';
    const label = kind === 'start' ? 'Départ' : 'Cycle fini';
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 8px',
          borderRadius: 999,
          border: `1px solid ${borderColor}`,
          color: textColor,
          backgroundColor: '#FFF',
          fontWeight: 600,
          fontSize: 11,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    );
  };

  const displayRows: DisplayRow[] = [];
  for (const t of transactions) {
    if (t.transaction_finished_at) {
      displayRows.push({
        kind: 'stop',
        txId: t.id,
        machine_id: t.machine_id,
        user_name: t.user_name,
        machine_nom: t.machine_nom,
        emplacement_name: t.emplacement_name,
        created_at: t.transaction_finished_at,
      });
    }
    displayRows.push({ kind: 'transaction', t });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Transactions</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>
            Tous les paiements effectués par les clients.
            {!loading && displayRows.length > 0 ? (
              <span style={{ marginLeft: 8, color: '#999' }}>({displayRows.length} ligne{displayRows.length > 1 ? 's' : ''})</span>
            ) : null}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', backgroundColor: '#E8F0FC', borderRadius: 12, border: '1px solid #D1E3FA' }}>
          <Euro size={24} color="#1C69D3" />
          <div>
            <span style={{ fontSize: 12, color: '#666' }}>Total affiché</span>
            <p style={{ margin: 0, fontSize: 22, fontWeight: '700', color: '#000' }}>{total.toFixed(2)} €</p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>{error}</div>
      )}

      <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#666' }}>Chargement...</div>
        ) : displayRows.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center', color: '#666' }}>
            <Receipt size={48} color="#CCC" style={{ marginBottom: 16 }} />
            <p style={{ margin: 0, fontSize: 16 }}>Aucune transaction pour le moment.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #EEE' }}>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Date</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Client</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Machine</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Laverie</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Source</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Événement</th>
                <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#666' }}>Montant</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                if (row.kind === 'transaction') {
                  const t = row.t;
                  return (
                    <tr
                      key={`tx-${t.id}`}
                      style={{ borderBottom: '1px solid #F0F0F0', cursor: t.machine_id ? 'pointer' : 'default' }}
                      onClick={() => t.machine_id && navigate(`/machines/${t.machine_id}`)}
                    >
                      <td style={{ padding: '16px 20px', fontSize: 14, color: '#444' }}>{formatDate(t.created_at)}</td>
                      <td style={{ padding: '16px 20px', fontSize: 14, color: '#666' }}>{t.user_name || '—'}</td>
                      <td style={{ padding: '16px 20px', fontSize: 14, color: '#000', fontWeight: '500' }}>{t.machine_nom || '—'}</td>
                      <td style={{ padding: '16px 20px', fontSize: 14, color: '#666' }}>{t.emplacement_name || '—'}</td>
                      <td style={{ padding: '16px 20px', fontSize: 14, color: '#666' }}>
                        {t.payment_method === 'test' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6B7280', fontStyle: 'italic' }}>
                            Lavage test
                          </span>
                        ) : t.payment_method === 'promo' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <TicketPercent size={16} color="#059669" /> Code promo {t.promo_code && <code style={{ fontSize: 12, backgroundColor: '#E5E7EB', padding: '2px 6px', borderRadius: 4 }}>{t.promo_code}</code>}
                          </span>
                        ) : t.payment_method === 'wallet' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Wallet size={16} color="#1C69D3" /> Portefeuille
                          </span>
                        ) : (
                          'Carte'
                        )}
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: 12, color: '#555' }}>{eventBadge('start')}</td>
                      <td style={{ padding: '16px 20px', fontSize: 14, fontWeight: '600', color: t.status === 'refunded' ? '#B91C1C' : t.payment_method === 'test' ? '#6B7280' : '#000', textAlign: 'right' }}>
                        {t.status === 'refunded' ? '(Remboursé) ' : ''}{t.payment_method === 'test' ? '—' : t.payment_method === 'promo' ? 'Gratuit' : `${(Number(t.amount ?? t.montant) ?? 0).toFixed(2)} €`}
                      </td>
                      <td style={{ padding: '16px 8px' }}>{t.machine_id && <ChevronRight size={18} color="#999" />}</td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={`stop-${row.txId}`}
                    style={{ borderBottom: '1px solid #F0F0F0', backgroundColor: '#FFF' }}
                  >
                    <td style={{ padding: '16px 20px', fontSize: 14, color: '#444' }}>{formatDate(row.created_at)}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, color: '#666' }}>{row.user_name || '—'}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, color: '#000', fontWeight: '500' }}>{row.machine_nom || '—'}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, color: '#666' }}>{row.emplacement_name || '—'}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, color: '#666' }}>
                      <span style={{ color: '#9CA3AF' }}>Système</span>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: 12, color: '#555' }}>{eventBadge('finish')}</td>
                    <td style={{ padding: '16px 20px', fontSize: 14, fontWeight: '600', color: '#9CA3AF', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '16px 8px' }}>{row.machine_id && <ChevronRight size={18} color="#999" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
