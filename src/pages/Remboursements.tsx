import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

interface RefundRequest {
  id: string;
  transaction_id: string;
  user_id: string;
  motif: string;
  statut: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  compensation_promo_code?: string | null;
  created_at: string;
  transaction?: {
    amount: number;
    payment_method: string;
    promo_code: string | null;
    machine_name?: string;
    emplacement_name?: string;
  };
  user_email?: string;
  user_name?: string;
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'En attente', color: '#B45309', bg: '#FEF3C7' },
  approved: { label: 'Approuvé',   color: '#065F46', bg: '#D1FAE5' },
  rejected: { label: 'Refusé',     color: '#991B1B', bg: '#FEE2E2' },
};

export default function Remboursements() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [adminNoteMap, setAdminNoteMap] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('refund_requests')
      .select(`
        *,
        transactions:transaction_id (
          amount, payment_method, promo_code,
          machines:machine_id ( nom, name ),
          emplacements:emplacement_id ( name )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) { console.error(error); setLoading(false); return; }

    // Enrichir avec infos utilisateur
    const enriched: RefundRequest[] = await Promise.all(
      (data || []).map(async (r: any) => {
        let user_email = '—';
        let user_name = '—';
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', r.user_id)
            .maybeSingle();
          if (profile) {
            user_name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—';
            user_email = profile.email || '—';
          }
        } catch {}

        const tx = r.transactions;
        return {
          ...r,
          user_email,
          user_name,
          transaction: tx ? {
            amount: tx.amount,
            payment_method: tx.payment_method,
            promo_code: tx.promo_code,
            machine_name: tx.machines?.nom || tx.machines?.name || '—',
            emplacement_name: tx.emplacements?.name || '—',
          } : undefined,
        };
      })
    );

    setRequests(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const updateStatut = async (id: string, statut: 'approved' | 'rejected') => {
    setUpdating(id);
    const note = adminNoteMap[id] || '';
    const { data, error } = await supabase.rpc('approve_or_reject_refund_request', {
      p_request_id: id,
      p_statut: statut,
      p_admin_note: note,
    });
    setUpdating(null);
    if (error) {
      console.error(error);
      window.alert(`Erreur lors du traitement: ${error.message}`);
      return;
    }
    const payload = data as { success?: boolean; compensation_promo_code?: string | null } | null;
    if (payload && payload.success === false) {
      const err = (payload as any).error || 'unknown_error';
      window.alert(`Traitement refusé: ${err}`);
      return;
    }
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              statut,
              admin_note: note || null,
              compensation_promo_code:
                statut === 'approved'
                  ? payload?.compensation_promo_code ?? r.compensation_promo_code ?? null
                  : null,
            }
          : r
      )
    );
  };

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.statut === filter);
  const pending = requests.filter((r) => r.statut === 'pending').length;

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', margin: 0 }}>
            Remboursements
            {pending > 0 && (
              <span style={{ marginLeft: 10, fontSize: 14, background: '#EF4444', color: '#fff', borderRadius: 99, padding: '2px 10px', fontWeight: '700', verticalAlign: 'middle' }}>
                {pending} en attente
              </span>
            )}
          </h1>
          <p style={{ color: '#666', margin: '4px 0 0' }}>Demandes de remboursement envoyées par les utilisateurs.</p>
        </div>
        <button onClick={fetchRequests} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#444' }}>
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: filter === f ? '700' : '400',
              background: filter === f ? '#1C69D3' : '#F3F4F6',
              color: filter === f ? '#fff' : '#444',
            }}
          >
            {f === 'all' ? 'Toutes' : STATUT_LABELS[f].label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#666' }}>Chargement...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <Clock size={48} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 16 }}>Aucune demande{filter !== 'all' ? ' dans cette catégorie' : ''}.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((r) => {
            const s = STATUT_LABELS[r.statut] || STATUT_LABELS.pending;
            return (
              <div key={r.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontWeight: '700', fontSize: 15, color: '#111' }}>{r.user_name}</span>
                      <span style={{ fontSize: 12, color: '#666' }}>{r.user_email}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>{formatDate(r.created_at)}</div>
                  </div>
                  <span style={{ background: s.bg, color: s.color, borderRadius: 99, padding: '4px 12px', fontSize: 12, fontWeight: '700' }}>
                    {s.label}
                  </span>
                </div>

                {/* Transaction */}
                {r.transaction && (
                  <div style={{ background: '#F8F9FA', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#444' }}>
                    <strong>Transaction :</strong>{' '}
                    {r.transaction.machine_name} — {r.transaction.emplacement_name}
                    {r.transaction.payment_method !== 'promo'
                      ? <span style={{ marginLeft: 8, fontWeight: '700', color: '#111' }}>€ {Number(r.transaction.amount).toFixed(2)}</span>
                      : <span style={{ marginLeft: 8, color: '#059669' }}>Code promo</span>
                    }
                  </div>
                )}

                {/* Motif */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 4 }}>MOTIF</div>
                  <div style={{ fontSize: 14, color: '#111', lineHeight: 1.5, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px' }}>
                    {r.motif}
                  </div>
                </div>

                {/* Actions si pending */}
                {r.statut === 'pending' && (
                  <div>
                    <textarea
                      placeholder="Note admin (optionnelle)..."
                      value={adminNoteMap[r.id] || ''}
                      onChange={(e) => setAdminNoteMap((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      style={{ width: '100%', borderRadius: 8, border: '1px solid #ddd', padding: '8px 12px', fontSize: 13, resize: 'vertical', marginBottom: 10, fontFamily: 'inherit', boxSizing: 'border-box' }}
                      rows={2}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => updateStatut(r.id, 'approved')}
                        disabled={updating === r.id}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: '700', fontSize: 14, cursor: 'pointer' }}
                      >
                        <CheckCircle size={16} /> Approuver
                      </button>
                      <button
                        onClick={() => updateStatut(r.id, 'rejected')}
                        disabled={updating === r.id}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontWeight: '700', fontSize: 14, cursor: 'pointer' }}
                      >
                        <XCircle size={16} /> Refuser
                      </button>
                    </div>
                  </div>
                )}

                {/* Note admin si traitée */}
                {r.statut === 'approved' && r.compensation_promo_code && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: '#ECFDF5', borderRadius: 8, border: '1px solid #A7F3D0', fontSize: 14, color: '#065F46' }}>
                    <strong>Code promo généré :</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: '700' }}>{r.compensation_promo_code}</span>
                  </div>
                )}

                {r.statut !== 'pending' && r.admin_note && (
                  <div style={{ fontSize: 13, color: '#555', fontStyle: 'italic', borderTop: '1px solid #eee', paddingTop: 10, marginTop: 4 }}>
                    Note : {r.admin_note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
