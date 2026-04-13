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
}

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
    user_name: (t.user_name && String(t.user_name).trim()) || '—',
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
      setTransactions(mapRpcRowsToTransactions(txData as Record<string, unknown>[]));
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Transactions</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>
            Tous les paiements effectués par les clients.
            {!loading && transactions.length > 0 ? (
              <span style={{ marginLeft: 8, color: '#999' }}>({transactions.length} ligne{transactions.length > 1 ? 's' : ''})</span>
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
        ) : transactions.length === 0 ? (
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
                <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#666' }}>Montant</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t.id}
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
                  <td style={{ padding: '16px 20px', fontSize: 14, fontWeight: '600', color: t.status === 'refunded' ? '#B91C1C' : t.payment_method === 'test' ? '#6B7280' : '#000', textAlign: 'right' }}>
                    {t.status === 'refunded' ? '(Remboursé) ' : ''}{t.payment_method === 'test' ? '—' : t.payment_method === 'promo' ? 'Gratuit' : `${(Number(t.amount ?? t.montant) ?? 0).toFixed(2)} €`}
                  </td>
                  <td style={{ padding: '16px 8px' }}>{t.machine_id && <ChevronRight size={18} color="#999" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
