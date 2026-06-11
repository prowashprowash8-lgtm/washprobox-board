import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { TrendingUp, Cpu, Euro, MessageSquare, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
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
import { useAuth } from '../contexts/AuthContext';

interface ResidenceMessage {
  id: string;
  sender_id: string;
  sender_email: string;
  emplacement_id: string | null;
  subject: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'new' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  emplacement?: {
    id: string;
    name: string;
    address?: string | null;
  };
  replies?: ResidenceMessageReply[];
}

interface ResidenceMessageReply {
  id: string;
  message_id: string;
  sender_id: string;
  sender_email: string;
  reply: string;
  created_at: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Faible',
  normal: 'Normal',
  high: 'Élevé',
  urgent: 'Urgent',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#10B981',
  normal: '#3B82F6',
  high: '#F59E0B',
  urgent: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  in_progress: 'En cours',
  resolved: 'Résolu',
  closed: 'Fermé',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  new: <AlertCircle size={16} />,
  in_progress: <Clock size={16} />,
  resolved: <CheckCircle size={16} />,
  closed: <XCircle size={16} />,
};

const STATUS_COLORS: Record<string, string> = {
  new: '#EF4444',
  in_progress: '#F59E0B',
  resolved: '#10B981',
  closed: '#6B7280',
};

export default function Accueil() {
  const { user } = useAuth();
  const { isResidence, allowedEmplacementIds, isPatron } = useBoardAccess();
  const [periode, setPeriode] = useState<Periode>('mois');
  const [ca, setCa] = useState<number | null>(null);
  const [nbAppareils, setNbAppareils] = useState<number>(0);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ResidenceMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

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

  const fetchMessages = useCallback(async () => {
    if (!isPatron) return;
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('residence_messages')
        .select(`
          *,
          emplacement:emplacements(id, name, address),
          replies:residence_message_replies(*)
        `)
        .in('status', ['new', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [isPatron]);

  useEffect(() => {
    if (!isPatron) return;
    fetchMessages();
  }, [isPatron, fetchMessages]);

  useEffect(() => {
    if (!isPatron) return;
    const channel = supabase
      .channel('accueil-residence-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'residence_messages' },
        () => fetchMessages()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPatron, fetchMessages]);

  const updateMessageStatus = async (messageId: string, newStatus: 'in_progress' | 'resolved' | 'closed') => {
    try {
      const { error } = await supabase
        .from('residence_messages')
        .update({ 
          status: newStatus,
          resolved_at: newStatus === 'resolved' || newStatus === 'closed' ? new Date().toISOString() : null,
        })
        .eq('id', messageId);
      
      if (error) throw error;
      await fetchMessages();
    } catch (err) {
      console.error('Error updating message status:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const sendReply = async (messageId: string) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      const { error } = await supabase
        .from('residence_message_replies')
        .insert({
          message_id: messageId,
          sender_id: user?.id,
          sender_email: user?.email,
          reply: replyText.trim(),
        });
      
      if (error) throw error;
      
      setReplyText('');
      setReplyingTo(null);
      await fetchMessages();
    } catch (err) {
      console.error('Error sending reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Bienvenue Victor !</h1>
          <p style={{ color: '#666', margin: '8px 0 0' }}>
            {isResidence
              ? 'Vue résidence : uniquement vos laveries et leur chiffre d’affaires.'
              : 'Statistiques de vos appareils connectés.'}
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

      {isPatron && (
        <div style={{ marginTop: 32, padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: '600', color: '#000', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={20} />
              Messages des gérants de résidence
            </h2>
            <span style={{ fontSize: 13, color: '#666' }}>
              {messages.filter(m => m.status === 'new').length} nouveau(x)
            </span>
          </div>
          {messagesLoading ? (
            <p style={{ color: '#666', padding: 40 }}>Chargement des messages...</p>
          ) : messages.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <MessageSquare size={48} color="#9CA3AF" style={{ margin: '0 auto 16px' }} />
              <p style={{ color: '#666', fontSize: 16 }}>Aucun message des gérants de résidence.</p>
            </div>
          ) : (
            <div>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    padding: 20,
                    borderBottom: '1px solid #F0F0F0',
                    display: 'flex',
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: `${PRIORITY_COLORS[msg.priority]}20`,
                      color: PRIORITY_COLORS[msg.priority],
                    }}
                  >
                    <AlertCircle size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: '600', color: '#000', margin: '0 0 4px' }}>
                          {msg.subject}
                        </h3>
                        <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
                          {msg.emplacement?.name || 'Laverie non spécifiée'} • {msg.sender_email || 'Gérant inconnu'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            backgroundColor: `${PRIORITY_COLORS[msg.priority]}15`,
                            color: PRIORITY_COLORS[msg.priority],
                            fontSize: 12,
                            fontWeight: '600',
                          }}
                        >
                          {PRIORITY_LABELS[msg.priority]}
                        </span>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            backgroundColor: `${STATUS_COLORS[msg.status]}15`,
                            color: STATUS_COLORS[msg.status],
                            fontSize: 12,
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {STATUS_ICONS[msg.status]}
                          {STATUS_LABELS[msg.status]}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: 15, color: '#333', margin: '0 0 12px', lineHeight: 1.5 }}>
                      {msg.message}
                    </p>
                    
                    {msg.replies && msg.replies.length > 0 && (
                      <div style={{ marginBottom: 16, padding: 16, backgroundColor: '#F8F9FA', borderRadius: 10 }}>
                        <p style={{ fontSize: 13, fontWeight: '600', color: '#666', margin: '0 0 12px' }}>
                          Réponses ({msg.replies.length})
                        </p>
                        {msg.replies.map((reply) => (
                          <div
                            key={reply.id}
                            style={{
                              padding: 12,
                              backgroundColor: '#FFF',
                              borderRadius: 8,
                              marginBottom: 8,
                              border: '1px solid #E5E7EB',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: '600', color: '#333' }}>
                                {reply.sender_email}
                              </span>
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {formatDate(reply.created_at)}
                              </span>
                            </div>
                            <p style={{ fontSize: 14, color: '#444', margin: 0, lineHeight: 1.5 }}>
                              {reply.reply}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {replyingTo === msg.id ? (
                      <div style={{ marginBottom: 12, padding: 16, backgroundColor: '#F0F9FF', borderRadius: 10, border: '1px solid #BAE6FD' }}>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Écrivez votre réponse..."
                          rows={3}
                          style={{
                            width: '100%',
                            padding: 12,
                            border: '1px solid #BAE6FD',
                            borderRadius: 8,
                            fontSize: 14,
                            boxSizing: 'border-box',
                            resize: 'vertical',
                            marginBottom: 8,
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyText('');
                            }}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: '#F5F5F5',
                              color: '#444',
                              border: 'none',
                              borderRadius: 8,
                              fontWeight: '600',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => sendReply(msg.id)}
                            disabled={sendingReply || !replyText.trim()}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: '#1C69D3',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: 8,
                              fontWeight: '600',
                              fontSize: 13,
                              cursor: sendingReply || !replyText.trim() ? 'not-allowed' : 'pointer',
                              opacity: sendingReply || !replyText.trim() ? 0.6 : 1,
                            }}
                          >
                            {sendingReply ? 'Envoi...' : 'Envoyer'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReplyingTo(msg.id)}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: '#1C69D3',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: '600',
                          fontSize: 13,
                          cursor: 'pointer',
                          marginBottom: 12,
                        }}
                      >
                        Répondre
                      </button>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: 13, color: '#999', margin: 0 }}>
                        Envoyé le {formatDate(msg.created_at)}
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {msg.status === 'new' && (
                          <button
                            onClick={() => updateMessageStatus(msg.id, 'in_progress')}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: '#F59E0B',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: 8,
                              fontWeight: '600',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            Marquer en cours
                          </button>
                        )}
                        {msg.status === 'in_progress' && (
                          <button
                            onClick={() => updateMessageStatus(msg.id, 'resolved')}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: '#10B981',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: 8,
                              fontWeight: '600',
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            Marquer résolu
                          </button>
                        )}
                        <button
                          onClick={() => updateMessageStatus(msg.id, 'closed')}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#6B7280',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: '600',
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                        >
                          Fermer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
