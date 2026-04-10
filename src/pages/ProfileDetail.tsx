import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, MapPin, RotateCcw, TicketPercent } from 'lucide-react';

interface Profile {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  nom?: string | null;
  prenom?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

interface TransactionWithDetails {
  id: string;
  machine_id: string | null;
  amount?: number;
  montant?: number;
  payment_method?: string;
  promo_code?: string | null;
  created_at: string;
  status?: string;
  refunded?: boolean;
  machine_nom?: string | null;
  machine_name?: string | null;
  emplacement_name?: string | null;
}

export default function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);

  const displayName = (p: Profile) => {
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.prenom && p.nom ? `${p.prenom} ${p.nom}` : p.prenom || p.nom) || p.email;
    return name || '—';
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { data: profData, error: profErr } = await supabase.from('profiles').select('*').eq('id', id).single();
      if (profErr) throw profErr;
      setProfile(profData as Profile);

      const { data: txData, error: txErr } = await supabase.rpc('get_user_transactions', { p_user_id: id });

      if (txErr) throw txErr;

      const txs = (txData ?? []) as TransactionWithDetails[];
      setTransactions(txs.map((t) => ({
        ...t,
        machine_nom: (t as { machine_name?: string }).machine_name ?? t.machine_nom,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleRefund = async (txId: string) => {
    if (!confirm('Confirmer le remboursement de cette transaction ?')) return;
    setRefunding(txId);
    try {
      const { error } = await supabase.rpc('refund_transaction', { p_transaction_id: txId, p_reason: 'Remboursé depuis le board' });
      if (error) {
        const fallback = await supabase.from('transactions').update({ status: 'refunded', refunded_at: new Date().toISOString() }).eq('id', txId);
        if (fallback.error) throw error;
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du remboursement');
    } finally {
      setRefunding(null);
    }
  };

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;
  if (error || !profile) return <p style={{ color: '#B91C1C' }}>{error || 'Profil introuvable.'}</p>;

  const isRefunded = (t: TransactionWithDetails) => t.status === 'refunded' || t.refunded;
  const getAmount = (t: TransactionWithDetails) => Number(t.amount ?? t.montant ?? 0);
  const getDisplayAmount = (t: TransactionWithDetails) => t.payment_method === 'promo' ? 0 : getAmount(t);
  const txSansTest = transactions.filter((t) => t.payment_method !== 'test');
  const totalDepense = txSansTest.filter((t) => !isRefunded(t)).reduce((s, t) => s + getDisplayAmount(t), 0);
  const totalRembourse = txSansTest.filter((t) => isRefunded(t)).reduce((s, t) => s + getDisplayAmount(t), 0);
  const nbCyclesPromo = txSansTest.filter((t) => t.payment_method === 'promo' && !isRefunded(t)).length;
  const nbCyclesPayes = txSansTest.filter((t) => t.payment_method !== 'promo' && !isRefunded(t)).length;

  return (
    <div>
      <button
        onClick={() => navigate('/utilisateurs')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14 }}
      >
        <ArrowLeft size={18} /> Retour aux utilisateurs
      </button>

      <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>{displayName(profile)}</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#666' }}>{profile.email || '—'}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20, marginBottom: 24 }}>
        <div style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Total dépensé</p>
          <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: '700', color: '#000' }}>{totalDepense.toFixed(2)} €</p>
        </div>
        <div style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Remboursements</p>
          <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: '700', color: '#B91C1C' }}>{totalRembourse.toFixed(2)} €</p>
        </div>
        <div style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Cycles via code promo</p>
          <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: '700', color: '#059669' }}>{nbCyclesPromo}</p>
        </div>
        <div style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Cycles payés</p>
          <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: '700', color: '#000' }}>{nbCyclesPayes}</p>
        </div>
      </div>

      <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        <h2 style={{ margin: 0, padding: '20px 24px', fontSize: 18, fontWeight: '600', color: '#000', borderBottom: '1px solid #EEE' }}>Activité</h2>
        {transactions.length === 0 ? (
          <p style={{ padding: 40, color: '#666' }}>Aucune transaction pour cet utilisateur.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #EEE' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Date</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Laverie</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Machine</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Source</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#666' }}>Montant</th>
                <th style={{ padding: '12px 20px', width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#444' }}>{formatDate(t.created_at)}</td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>
                    {t.emplacement_name ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={14} />{t.emplacement_name}</span> : '—'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#000', fontWeight: '500' }}>{t.machine_nom || '—'}</td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>
                    {t.payment_method === 'test' ? (
                      <span style={{ fontStyle: 'italic', color: '#6B7280' }}>Lavage test</span>
                    ) : t.payment_method === 'promo' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <TicketPercent size={14} color="#059669" /> {t.promo_code || 'Code promo'}
                      </span>
                    ) : (
                      'Carte'
                    )}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: '600', color: isRefunded(t) ? '#B91C1C' : t.payment_method === 'test' ? '#6B7280' : '#000', textAlign: 'right' }}>
                    {isRefunded(t) ? '(Remboursé) ' : ''}{t.payment_method === 'test' ? '—' : t.payment_method === 'promo' ? 'Gratuit' : `${getAmount(t).toFixed(2)} €`}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    {!isRefunded(t) && t.payment_method !== 'promo' && t.payment_method !== 'test' && (
                      <button
                        onClick={() => handleRefund(t.id)}
                        disabled={refunding === t.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', backgroundColor: '#FEE2E2', color: '#B91C1C', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: '600', cursor: refunding === t.id ? 'wait' : 'pointer' }}
                      >
                        <RotateCcw size={14} /> {refunding === t.id ? '...' : 'Rembourser'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
