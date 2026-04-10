import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Copy, Trash2 } from 'lucide-react';

type AppliesTo = 'both' | 'lavage' | 'sechage';

interface PromoCode {
  id: string;
  code: string;
  type: string;
  value: number;
  max_uses: number | null;
  used_count: number;
  uses_remaining?: number | null;
  created_at: string;
  expires_at: string | null;
  applies_to?: AppliesTo | string | null;
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(length = 8): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

function appliesToLabel(appliesTo: string | null | undefined): string {
  const v = String(appliesTo || 'both').toLowerCase();
  if (v === 'lavage') return 'Lave-linge uniquement';
  if (v === 'sechage') return 'Sèche-linge uniquement';
  return 'Lave-linge & sèche-linge';
}

export default function Marketing() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customCode, setCustomCode] = useState('');
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [appliesTo, setAppliesTo] = useState<AppliesTo>('both');

  const fetchCodes = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('promo_codes')
        .select('id, code, type, value, max_uses, used_count, uses_remaining, created_at, expires_at, applies_to')
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setCodes((data ?? []) as PromoCode[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, []);

  const createCode = async (codeToUse: string) => {
    if (!codeToUse.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        code: codeToUse.trim().toUpperCase(),
        type: 'free',
        value: 100,
        applies_to: appliesTo,
      };
      const max = parseInt(maxUses, 10);
      if (!isNaN(max) && max > 0) {
        payload.max_uses = max;
        payload.uses_remaining = max;
        payload.used_count = 0;
      } else {
        payload.uses_remaining = 999;
      }
      if (expiresAt.trim()) payload.expires_at = expiresAt.trim() + 'T23:59:59Z';
      const { error: insertErr } = await supabase.from('promo_codes').insert(payload);
      if (insertErr) throw insertErr;
      setCustomCode('');
      setMaxUses('');
      setExpiresAt('');
      await fetchCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = () => createCode(generateCode(8));
  const handleCreateCustom = () => createCode(customCode);
  const copyToClipboard = (code: string) => navigator.clipboard.writeText(code);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce code promo ? Il ne pourra plus être utilisé.')) return;
    setDeletingId(id);
    setError(null);
    try {
      const { error: deleteErr } = await supabase.from('promo_codes').delete().eq('id', id);
      if (deleteErr) throw deleteErr;
      await fetchCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>Marketing — Codes promo</h1>
      <p style={{ color: '#666', margin: '0 0 32px' }}>Générez des codes pour offrir des cycles gratuits. Vous pouvez limiter un code au lave-linge, au sèche-linge, ou aux deux.</p>

      {error && (
        <div style={{ padding: 12, marginBottom: 20, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 10 }}>{error}</div>
      )}

      <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>Créer un code promo</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: '500', color: '#666' }}>Code personnalisé</label>
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
              placeholder="Ex: LAVAGE_OFFERT"
              style={{ padding: '12px 16px', border: '1px solid #E0E0E0', borderRadius: 10, fontSize: 15, width: 200 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: '500', color: '#666' }}>Utilisations max</label>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Illimité"
              style={{ padding: '12px 16px', border: '1px solid #E0E0E0', borderRadius: 10, fontSize: 15, width: 120 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: '500', color: '#666' }}>Expire le</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              style={{ padding: '12px 16px', border: '1px solid #E0E0E0', borderRadius: 10, fontSize: 15 }}
            />
          </div>
          <div style={{ minWidth: 260 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: '500', color: '#666' }}>Valable pour</label>
            <select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as AppliesTo)}
              style={{ padding: '12px 16px', border: '1px solid #E0E0E0', borderRadius: 10, fontSize: 15, width: '100%', backgroundColor: '#fff' }}
            >
              <option value="both">Lave-linge et sèche-linge</option>
              <option value="lavage">Lave-linge uniquement</option>
              <option value="sechage">Sèche-linge uniquement</option>
            </select>
          </div>
          <button
            onClick={customCode.trim() ? handleCreateCustom : handleGenerate}
            disabled={creating}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', backgroundColor: '#1C69D3', color: '#fff', border: 'none', borderRadius: 10, fontWeight: '600', cursor: creating ? 'wait' : 'pointer', fontSize: 15 }}
          >
            <Plus size={20} /> {creating ? 'Création...' : customCode.trim() ? 'Créer ce code' : 'Générer un code'}
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: '600', color: '#000' }}>Codes existants</h2>
        {loading ? (
          <p style={{ padding: 24, color: '#666' }}>Chargement...</p>
        ) : codes.length === 0 ? (
          <p style={{ padding: 24, color: '#666' }}>Aucun code promo. Créez-en un ci-dessus.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #EEE' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Code</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Machines</th>
                <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#666' }}>Utilisations</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>Expiration</th>
                <th style={{ padding: '12px 20px', width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F0F0F0' }}>
                  <td style={{ padding: '14px 20px', fontSize: 15, fontWeight: '600', color: '#000', fontFamily: 'monospace' }}>
                    {c.code}
                    <button onClick={() => copyToClipboard(c.code)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#666' }} title="Copier">
                      <Copy size={16} />
                    </button>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#444' }}>{appliesToLabel(c.applies_to)}</td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666', textAlign: 'center' }}>
                    {c.max_uses != null ? `${c.used_count ?? 0} / ${c.max_uses}` : (c.uses_remaining != null ? `${c.uses_remaining} restants` : 'Illimité')}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: 14, color: '#666' }}>
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      title="Supprimer"
                      style={{ background: 'none', border: 'none', cursor: deletingId === c.id ? 'wait' : 'pointer', padding: 6, color: '#B91C1C', borderRadius: 6 }}
                    >
                      <Trash2 size={18} />
                    </button>
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
