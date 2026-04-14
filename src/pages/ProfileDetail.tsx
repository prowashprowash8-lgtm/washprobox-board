import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, MapPin, TicketPercent, Wallet } from 'lucide-react';

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

interface WalletStatsRow {
  wallet_balance_centimes: number;
  total_recharged_centimes: number | string;
  total_wallet_refunded_centimes?: number | string;
}

interface WalletActivityLine {
  id: string;
  activity_kind: string;
  amount_centimes: number;
  created_at: string;
  ref_hint?: string | null;
}

type ActivityRow =
  | { kind: 'machine'; created_at: string; t: TransactionWithDetails }
  | { kind: 'wallet'; created_at: string; w: WalletActivityLine };

function buildActivityRows(transactions: TransactionWithDetails[], wallet: WalletActivityLine[]): ActivityRow[] {
  const rows: ActivityRow[] = [
    ...transactions.map((t) => ({ kind: 'machine' as const, created_at: t.created_at, t })),
    ...wallet.map((w) => ({ kind: 'wallet' as const, created_at: w.created_at, w })),
  ];
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows;
}

function walletActivityLabel(kind: string): string {
  switch (kind) {
    case 'wallet_recharge':
      return 'Recharge portefeuille (Stripe)';
    case 'wallet_refund':
      return 'Remboursement portefeuille (Stripe)';
    case 'wallet_machine_debit':
      return 'Paiement machine (solde portefeuille)';
    default:
      return 'Portefeuille';
  }
}

function centimesToEuros(c: number | string | null | undefined): string {
  const n = typeof c === 'string' ? Number(c) : Number(c ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return (n / 100).toFixed(2);
}

export default function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [walletActivity, setWalletActivity] = useState<WalletActivityLine[]>([]);
  const [walletStats, setWalletStats] = useState<WalletStatsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const [{ data: walletData, error: walletErr }, { data: walActData, error: walActErr }] = await Promise.all([
        supabase.rpc('get_user_wallet_stats', { p_user_id: id }),
        supabase.rpc('get_user_wallet_activity', { p_user_id: id }),
      ]);

      if (!walletErr && walletData != null) {
        const row = Array.isArray(walletData) ? (walletData[0] as WalletStatsRow | undefined) : (walletData as WalletStatsRow);
        if (row && typeof row.wallet_balance_centimes !== 'undefined') {
          setWalletStats(row);
        } else {
          setWalletStats(null);
        }
      } else {
        setWalletStats(null);
      }

      if (!walActErr && walActData != null) {
        const list = Array.isArray(walActData) ? walActData : [walActData];
        setWalletActivity(list as WalletActivityLine[]);
      } else {
        setWalletActivity([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  /** Stats portefeuille + lignes d’activité (remboursements, recharges…) sans recharger toute la page. */
  const refreshWalletPanel = useCallback(async () => {
    if (!id) return;
    const [{ data: walletData, error: walletErr }, { data: walActData, error: walActErr }] = await Promise.all([
      supabase.rpc('get_user_wallet_stats', { p_user_id: id }),
      supabase.rpc('get_user_wallet_activity', { p_user_id: id }),
    ]);
    if (!walletErr && walletData != null) {
      const row = Array.isArray(walletData) ? (walletData[0] as WalletStatsRow | undefined) : (walletData as WalletStatsRow);
      if (row && typeof row.wallet_balance_centimes !== 'undefined') {
        setWalletStats(row);
      }
    }
    if (!walActErr && walActData != null) {
      const list = Array.isArray(walActData) ? walActData : [walActData];
      setWalletActivity(list as WalletActivityLine[]);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    const handle = setInterval(() => {
      void refreshWalletPanel();
    }, 8000);
    return () => clearInterval(handle);
  }, [id, refreshWalletPanel]);

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

  const activityRows = buildActivityRows(transactions, walletActivity);

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
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Total versé (recharges portefeuille)</p>
          <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: '700', color: '#1C69D3' }}>
            {walletStats ? `${centimesToEuros(walletStats.total_recharged_centimes)} €` : '—'}
          </p>
        </div>
        <div style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Solde portefeuille disponible</p>
          <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: '700', color: '#059669' }}>
            {walletStats ? `${centimesToEuros(walletStats.wallet_balance_centimes)} €` : '—'}
          </p>
        </div>
        <div style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Remboursements portefeuille (Stripe)</p>
          <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: '700', color: '#B45309' }}>
            {walletStats && typeof walletStats.total_wallet_refunded_centimes !== 'undefined'
              ? `${centimesToEuros(walletStats.total_wallet_refunded_centimes)} €`
              : '—'}
          </p>
        </div>
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
        {activityRows.length === 0 ? (
          <p style={{ padding: 40, color: '#666' }}>Aucune activité pour cet utilisateur.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #EEE' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Date</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Laverie</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Machine</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Source</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#666' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {activityRows.map((row) =>
                row.kind === 'machine' ? (
                  (() => {
                    const t = row.t;
                    return (
                      <tr key={`m-${t.id}`} style={{ borderBottom: '1px solid #F0F0F0' }}>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#444' }}>{formatDate(t.created_at)}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>
                          {t.emplacement_name ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <MapPin size={14} />
                              {t.emplacement_name}
                            </span>
                          ) : (
                            '—'
                          )}
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
                        <td
                          style={{
                            padding: '14px 20px',
                            fontSize: 14,
                            fontWeight: '600',
                            color: isRefunded(t) ? '#B91C1C' : t.payment_method === 'test' ? '#6B7280' : '#000',
                            textAlign: 'right',
                          }}
                        >
                          {isRefunded(t) ? '(Remboursé) ' : ''}
                          {t.payment_method === 'test' ? '—' : t.payment_method === 'promo' ? 'Gratuit' : `${getAmount(t).toFixed(2)} €`}
                        </td>
                      </tr>
                    );
                  })()
                ) : (
                  (() => {
                    const w = row.w;
                    const k = w.activity_kind;
                    const eur = (w.amount_centimes / 100).toFixed(2);
                    const isCredit = k === 'wallet_recharge';
                    const amountColor = isCredit ? '#1C69D3' : k === 'wallet_refund' ? '#B45309' : '#111827';
                    const amountLabel = isCredit ? `+${eur} €` : `−${eur} €`;
                    return (
                      <tr key={`w-${w.id}`} style={{ borderBottom: '1px solid #F0F0F0', backgroundColor: '#FAFBFC' }}>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#444' }}>{formatDate(w.created_at)}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#9CA3AF' }}>—</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#9CA3AF' }}>—</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: '#444' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
                            <Wallet size={16} color="#6B7280" style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>
                              <span style={{ fontWeight: 500 }}>{walletActivityLabel(k)}</span>
                              {w.ref_hint ? (
                                <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF', marginTop: 4, wordBreak: 'break-all' }}>
                                  {w.ref_hint}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: '600', color: amountColor, textAlign: 'right' }}>
                          {amountLabel}
                        </td>
                      </tr>
                    );
                  })()
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
