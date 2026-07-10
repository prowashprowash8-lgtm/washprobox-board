import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useBoardAccess } from '../contexts/BoardAccessContext';
import { useAuth } from '../contexts/AuthContext';
import { Send, AlertCircle, Clock, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import { resolveCrmSiteIdForEmplacement } from '../lib/resolveCrmSiteForEmplacement';

interface Emplacement {
  id: string;
  name: string;
  address?: string | null;
}

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
  resolved_at: string | null;
  resolved_by: string | null;
  emplacement?: Emplacement;
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

export default function MessagerieResidence() {
  const { user } = useAuth();
  const { allowedEmplacementIds, isPatron } = useBoardAccess();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [messages, setMessages] = useState<ResidenceMessage[]>([]);
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    emplacement_id: '',
    subject: '',
    message: '',
    priority: 'normal' as 'low' | 'normal' | 'high' | 'urgent',
  });
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchEmplacements = async () => {
    try {
      const { data, error } = await supabase
        .from('emplacements')
        .select('id, name, address')
        .in('id', allowedEmplacementIds)
        .order('name');

      if (error) throw error;
      setEmplacements(data || []);
    } catch (err) {
      console.error('Error fetching emplacements:', err);
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('residence_messages')
        .select(`
          *,
          emplacement:emplacements(id, name, address),
          replies:residence_message_replies(*)
        `)
        .order('created_at', { ascending: false });
      if (!isPatron) {
        query = query.eq('sender_id', user?.id);
      }
      const { data, error } = await query;

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (isPatron) {
      fetchMessages();
      return;
    }
    if (allowedEmplacementIds.length > 0) {
      fetchEmplacements();
      fetchMessages();
    }
  }, [user, allowedEmplacementIds, isPatron]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('residence-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'residence_messages' },
        () => fetchMessages()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase
        .from('residence_messages')
        .insert({
          sender_id: user?.id,
          sender_email: user?.email,
          emplacement_id: form.emplacement_id || null,
          subject: form.subject.trim(),
          message: form.message.trim(),
          priority: form.priority,
        });

      if (error) throw error;

      setSuccess('Message envoyé avec succès !');
      setForm({
        emplacement_id: '',
        subject: '',
        message: '',
        priority: 'normal',
      });
      setShowForm(false);
      await fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi du message');
    } finally {
      setSending(false);
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

      if (isPatron) {
        const message = messages.find((m) => m.id === messageId);
        if (message?.status === 'new') {
          await supabase.from('residence_messages').update({ status: 'in_progress' }).eq('id', messageId);
        }
      }

      setReplyText('');
      setReplyingTo(null);
      await fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi de la réponse');
    } finally {
      setSendingReply(false);
    }
  };

  const resolveMessage = async (message: ResidenceMessage) => {
    setResolvingId(message.id);
    setError(null);
    try {
      const { crmSiteId, linkUpsertError } = await resolveCrmSiteIdForEmplacement(
        supabase,
        message.emplacement_id ?? '',
        message.emplacement?.name,
        message.emplacement?.address
      );
      if (linkUpsertError) throw new Error(linkUpsertError);
      if (crmSiteId) {
        const { error: histErr } = await supabase.from('historique').insert({
          laverie_id: crmSiteId,
          technicien_nom: user?.email ?? 'Patron',
          date_intervention: new Date().toISOString().slice(0, 10),
          motif: 'gestion',
          description: message.subject,
          compte_rendu: message.message,
          source: 'demande_residence',
          residence_message_id: message.id,
        });
        if (histErr) throw histErr;
      }

      const { error: updateErr } = await supabase
        .from('residence_messages')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user?.id })
        .eq('id', message.id);
      if (updateErr) throw updateErr;

      await fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la résolution du message');
    } finally {
      setResolvingId(null);
    }
  };

  const renderMessageCard = (msg: ResidenceMessage) => (
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
          backgroundColor: `${msg.status === 'resolved' || msg.status === 'closed' ? STATUS_COLORS.resolved : PRIORITY_COLORS[msg.priority]}20`,
          color: msg.status === 'resolved' || msg.status === 'closed' ? STATUS_COLORS.resolved : PRIORITY_COLORS[msg.priority],
        }}
      >
        {msg.status === 'resolved' || msg.status === 'closed' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: '600', color: '#000', margin: '0 0 4px' }}>
              {msg.subject}
            </h3>
            <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
              {msg.emplacement?.name || 'Laverie non spécifiée'}
              {isPatron ? ` — ${msg.sender_email}` : ''}
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
              }}
            >
              Répondre
            </button>
            {isPatron && msg.status !== 'resolved' && msg.status !== 'closed' && (
              <button
                onClick={() => resolveMessage(msg)}
                disabled={resolvingId === msg.id}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#DCFCE7',
                  color: '#166534',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: '600',
                  fontSize: 13,
                  cursor: resolvingId === msg.id ? 'wait' : 'pointer',
                }}
              >
                {resolvingId === msg.id ? 'Résolution...' : 'Marquer comme résolu'}
              </button>
            )}
          </div>
        )}

        <p style={{ fontSize: 13, color: '#999', margin: 0 }}>
          Envoyé le {formatDate(msg.created_at)}
        </p>
      </div>
    </div>
  );

  const messagesEnCours = messages.filter((m) => m.status !== 'resolved' && m.status !== 'closed');
  const messagesResolues = messages.filter((m) => m.status === 'resolved' || m.status === 'closed');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>
            Messagerie
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            {isPatron
              ? 'Messages envoyés par les gérants de résidence.'
              : 'Signalez un problème dans votre laverie au patron'}
          </p>
        </div>
        {!isPatron && (
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setError(null);
              setSuccess(null);
            }}
            style={{
              padding: '12px 20px',
              backgroundColor: '#1C69D3',
              color: '#FFF',
              border: 'none',
              borderRadius: 10,
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Send size={18} />
            Nouveau message
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#DCFCE7', color: '#166534', borderRadius: 10 }}>
          {success}
        </div>
      )}

      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{
              backgroundColor: '#FFF',
              borderRadius: 16,
              padding: 32,
              width: '100%',
              maxWidth: 560,
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>
              Nouveau message
            </h3>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Laverie concernée
                </label>
                <select
                  value={form.emplacement_id}
                  onChange={(e) => setForm({ ...form, emplacement_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #E5E7EB',
                    borderRadius: 10,
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Sélectionnez une laverie</option>
                  {emplacements.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.address ? `(${emp.address})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Sujet
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  required
                  placeholder="Ex: Machine HS, Problème de paiement..."
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #E5E7EB',
                    borderRadius: 10,
                    fontSize: 15,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Priorité
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm({ ...form, priority: p })}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: form.priority === p ? '2px solid #1C69D3' : '1px solid #E5E7EB',
                        backgroundColor: form.priority === p ? '#E8F1FC' : '#FFF',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        color: '#111',
                      }}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Message
                </label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  required
                  rows={5}
                  placeholder="Décrivez le problème en détail..."
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #E5E7EB',
                    borderRadius: 10,
                    fontSize: 15,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#F5F5F5',
                    color: '#444',
                    border: 'none',
                    borderRadius: 10,
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#1C69D3',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: 10,
                    fontWeight: '600',
                    cursor: sending ? 'wait' : 'pointer',
                  }}
                >
                  {sending ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
          <p style={{ padding: 32, color: '#666' }}>Chargement...</p>
        </div>
      ) : messages.length === 0 ? (
        <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
          <div style={{ padding: 48, textAlign: 'center' }}>
            <MessageSquare size={48} color="#9CA3AF" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: '#666', fontSize: 16 }}>
              {isPatron ? 'Aucun message reçu pour le moment.' : 'Aucun message envoyé pour le moment.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: 18, fontWeight: '700', color: '#000', margin: '0 0 12px' }}>
            Demandes en cours ({messagesEnCours.length})
          </h2>
          <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden', marginBottom: 32 }}>
            {messagesEnCours.length === 0 ? (
              <p style={{ padding: 32, color: '#666' }}>Aucune demande en cours.</p>
            ) : (
              <div>{messagesEnCours.map((msg) => renderMessageCard(msg))}</div>
            )}
          </div>

          <h2 style={{ fontSize: 18, fontWeight: '700', color: '#000', margin: '0 0 12px' }}>
            Demandes résolues ({messagesResolues.length})
          </h2>
          <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
            {messagesResolues.length === 0 ? (
              <p style={{ padding: 32, color: '#666' }}>Aucune demande résolue.</p>
            ) : (
              <div>{messagesResolues.map((msg) => renderMessageCard(msg))}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
