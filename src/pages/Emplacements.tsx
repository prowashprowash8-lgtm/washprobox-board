import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Plus } from 'lucide-react';

interface EmplacementRow {
  id: string;
  name: string;
  address?: string;
  created_at: string;
  nbMachines: number;
  revenu30Jours: number;
}

export default function Emplacements() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EmplacementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '' });
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addressDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: emplacements, error: empErr } = await supabase
        .from('emplacements')
        .select('id, name, address, created_at')
        .order('created_at', { ascending: false });
      if (empErr) throw new Error(empErr.message);

      const { data: machines, error: machErr } = await supabase.from('machines').select('id, emplacement_id');
      if (machErr) throw new Error(machErr.message);

      let transactions: { machine_id?: string; montant?: number; payment_method?: string; created_at?: string }[] = [];
      const txRes = await supabase.from('transactions').select('machine_id, montant, payment_method, created_at');
      if (!txRes.error) transactions = txRes.data ?? [];

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString();

      const machineToEmp: Record<string, string> = {};
      const nbByEmp: Record<string, number> = {};
      (machines ?? []).forEach((m: { id?: string; emplacement_id?: string }) => {
        const eid = m.emplacement_id ?? '_sans_';
        if (m.id) machineToEmp[m.id] = eid;
        nbByEmp[eid] = (nbByEmp[eid] ?? 0) + 1;
      });

      const revenuByEmp: Record<string, number> = {};
      transactions.forEach((t) => {
        if (!t.machine_id || !t.created_at || t.created_at < startDate || t.payment_method === 'test') return;
        const eid = machineToEmp[t.machine_id] ?? '_sans_';
        revenuByEmp[eid] = (revenuByEmp[eid] ?? 0) + Number(t.montant ?? 0);
      });

      const result: EmplacementRow[] = (emplacements ?? []).map((e: { id: string; name: string; address?: string; created_at?: string }) => ({
        id: e.id,
        name: e.name,
        address: e.address,
        created_at: e.created_at ?? '',
        nbMachines: nbByEmp[e.id] ?? 0,
        revenu30Jours: revenuByEmp[e.id] ?? 0,
      }));
      setRows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchAddressSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    setAddressLoading(true);
    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query.trim())}&limit=5`
      );
      const data = await res.json();
      const labels = (data.features ?? []).map((f: { properties?: { label?: string } }) => f.properties?.label).filter(Boolean);
      setAddressSuggestions(labels);
    } catch {
      setAddressSuggestions([]);
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const handleAddressChange = useCallback((value: string) => {
    setForm((p) => ({ ...p, address: value }));
    setShowSuggestions(true);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (value.trim().length < 3) {
      setAddressSuggestions([]);
      return;
    }
    addressDebounceRef.current = setTimeout(() => {
      fetchAddressSuggestions(value);
    }, 300);
  }, [fetchAddressSuggestions]);

  const handleAddressSelect = useCallback((address: string) => {
    setForm((p) => ({ ...p, address }));
    setAddressSuggestions([]);
    setShowSuggestions(false);
  }, []);

  useEffect(() => {
    return () => {
      if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    };
  }, []);

  const handleAddEmplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setAddError(null);
    try {
      const { data, error: insertErr } = await supabase
        .from('emplacements')
        .insert({ name: form.name.trim(), address: form.address.trim() || null })
        .select('id')
        .single();
      if (insertErr) throw insertErr;
      setShowAdd(false);
      setForm({ name: '', address: '' });
      setAddressSuggestions([]);
      setShowSuggestions(false);
      await fetchData();
      if (data?.id) navigate(`/emplacements/${data.id}`);
    } catch (err) {
      setAddError((err && typeof err === 'object' && 'message' in err) ? (err as { message: string }).message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;
  if (error) return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: '0 0 24px' }}>Emplacements</h1>
      <p style={{ color: '#B91C1C', padding: 20, backgroundColor: '#FEE2E2', borderRadius: 12 }}>
        Erreur : {error}
      </p>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000', margin: 0 }}>Emplacements</h1>
        <button
          onClick={() => { setAddError(null); setForm({ name: '', address: '' }); setAddressSuggestions([]); setShowAdd(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer', fontSize: 15 }}
        >
          <Plus size={20} /> Créer une laverie
        </button>
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAdd(false)}>
          <div style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>Nouvelle laverie</h3>
            {addError && (
              <p style={{ margin: '0 0 16px', padding: 12, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 14 }}>{addError}</p>
            )}
            <form onSubmit={handleAddEmplacement}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Nom *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Laverie Mortier"
                  required
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 24, position: 'relative' }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Adresse</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Ex: 12 rue de la Paix, 75001 Paris"
                  autoComplete="off"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
                {addressLoading && (
                  <span style={{ position: 'absolute', right: 14, top: 42, fontSize: 12, color: '#6B7280' }}>Recherche...</span>
                )}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <ul
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      margin: 0,
                      padding: 0,
                      listStyle: 'none',
                      backgroundColor: '#FFF',
                      border: '1px solid #E5E7EB',
                      borderRadius: 10,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      maxHeight: 200,
                      overflowY: 'auto',
                      zIndex: 10,
                    }}
                  >
                    {addressSuggestions.map((addr) => (
                      <li
                        key={addr}
                        onClick={() => handleAddressSelect(addr)}
                        style={{
                          padding: '12px 14px',
                          cursor: 'pointer',
                          fontSize: 14,
                          borderBottom: '1px solid #F0F0F0',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#F5F5F5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#FFF';
                        }}
                      >
                        {addr}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '12px 20px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving} style={{ padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8F9FA', borderBottom: '1px solid #EEE' }}>
              <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: '600', color: '#666' }}>
                Nom de l'emplacement
              </th>
              <th style={{ padding: '14px 20px', textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#666' }}>
                Nombre de machines
              </th>
              <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#666' }}>
                30 jours
              </th>
              <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#666' }}>
                Créé
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#666' }}>
                  Aucun emplacement. Cliquez pour en ajouter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/emplacements/${r.id}`)}
                  style={{
                    borderBottom: '1px solid #F0F0F0',
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ padding: '16px 20px', fontSize: 15, fontWeight: '500', color: '#000' }}>{r.name}</td>
                  <td style={{ padding: '16px 20px', fontSize: 14, color: '#666', textAlign: 'center' }}>{r.nbMachines}</td>
                  <td style={{ padding: '16px 20px', fontSize: 14, color: '#000', fontWeight: '500', textAlign: 'right' }}>
                    {r.revenu30Jours.toFixed(2)} EUR
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: 14, color: '#666', textAlign: 'right' }}>{formatDate(r.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
