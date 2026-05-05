import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { fetchTransactionsForRevenue } from '../utils/fetchTransactionsForRevenue';
import { Plus } from 'lucide-react';
import { useBoardAccess } from '../contexts/BoardAccessContext';

interface EmplacementRow {
  id: string;
  name: string;
  address?: string;
  created_at: string;
  nbMachines: number;
  revenu30Jours: number;
}

interface AddressSuggestion {
  label: string;
  latitude: number | null;
  longitude: number | null;
}

export default function Emplacements() {
  const navigate = useNavigate();
  const { isResidence, allowedEmplacementIds } = useBoardAccess();
  const [rows, setRows] = useState<EmplacementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', latitude: null as number | null, longitude: null as number | null });
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [geocodeNotice, setGeocodeNotice] = useState<string | null>(null);
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
      if (isResidence && allowedEmplacementIds.length === 0) {
        setRows([]);
        return;
      }

      let emplacementsQuery = supabase
        .from('emplacements')
        .select('id, name, address, created_at')
        .order('created_at', { ascending: false });
      if (isResidence) {
        emplacementsQuery = emplacementsQuery.in('id', allowedEmplacementIds);
      }
      const { data: emplacements, error: empErr } = await emplacementsQuery;
      if (empErr) throw new Error(empErr.message);

      let machinesQuery = supabase.from('machines').select('id, emplacement_id');
      if (isResidence) {
        machinesQuery = machinesQuery.in('emplacement_id', allowedEmplacementIds);
      }
      const { data: machines, error: machErr } = await machinesQuery;
      if (machErr) throw new Error(machErr.message);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString();
      const endDate = new Date().toISOString();

      const transactions = await fetchTransactionsForRevenue(supabase, {
        startIso: startDate,
        endIso: endDate,
        machineIds: (machines ?? [])
          .map((m: { id?: string | null }) => m.id ?? '')
          .filter(Boolean),
      });

      const machineToEmp: Record<string, string> = {};
      const nbByEmp: Record<string, number> = {};
      (machines ?? []).forEach((m: { id?: string; emplacement_id?: string }) => {
        const eid = m.emplacement_id ?? '_sans_';
        if (m.id) machineToEmp[m.id] = eid;
        nbByEmp[eid] = (nbByEmp[eid] ?? 0) + 1;
      });

      const revenuByEmp: Record<string, number> = {};
      transactions.forEach((t) => {
        if (!t.machine_id || !t.created_at || t.payment_method === 'test' || t.payment_method === 'promo') return;
        if (t.status === 'refunded') return;
        const eid = machineToEmp[t.machine_id] ?? '_sans_';
        const euros = Number(t.montant ?? t.amount ?? 0);
        revenuByEmp[eid] = (revenuByEmp[eid] ?? 0) + euros;
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
  }, [allowedEmplacementIds, isResidence]);

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
      const suggestions = (data.features ?? []).map((f: { properties?: { label?: string }; geometry?: { coordinates?: number[] } }) => {
        const label = f.properties?.label ?? '';
        const lng = Number(f.geometry?.coordinates?.[0]);
        const lat = Number(f.geometry?.coordinates?.[1]);
        return {
          label,
          latitude: Number.isFinite(lat) ? lat : null,
          longitude: Number.isFinite(lng) ? lng : null,
        };
      }).filter((s: AddressSuggestion) => Boolean(s.label));
      setAddressSuggestions(suggestions);
    } catch {
      setAddressSuggestions([]);
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const handleAddressChange = useCallback((value: string) => {
    setForm((p) => ({ ...p, address: value, latitude: null, longitude: null }));
    setGeocodeNotice(null);
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

  const handleAddressSelect = useCallback((suggestion: AddressSuggestion) => {
    setForm((p) => ({
      ...p,
      address: suggestion.label,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    }));
    if (suggestion.latitude != null && suggestion.longitude != null) {
      setGeocodeNotice(`Coordonnées détectées: ${suggestion.latitude.toFixed(6)}, ${suggestion.longitude.toFixed(6)}`);
    } else {
      setGeocodeNotice('Coordonnées non trouvées automatiquement pour cette adresse.');
    }
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
      let latitude = form.latitude;
      let longitude = form.longitude;
      if ((latitude == null || longitude == null) && form.address.trim().length >= 3) {
        try {
          const res = await fetch(
            `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(form.address.trim())}&limit=1`
          );
          const dataGeo = await res.json();
          const first = dataGeo?.features?.[0];
          const lng = Number(first?.geometry?.coordinates?.[0]);
          const lat = Number(first?.geometry?.coordinates?.[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            latitude = lat;
            longitude = lng;
            setGeocodeNotice(`Coordonnées détectées: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          }
        } catch {
          // géocodage optionnel, ne bloque pas la création
        }
      }

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        address: form.address.trim() || null,
      };
      if (latitude != null && longitude != null) {
        payload.latitude = latitude;
        payload.longitude = longitude;
      }

      let { data, error: insertErr } = await supabase
        .from('emplacements')
        .insert(payload)
        .select('id')
        .single();
      if (insertErr && (insertErr.message.includes('latitude') || insertErr.message.includes('longitude'))) {
        ({ data, error: insertErr } = await supabase
          .from('emplacements')
          .insert({ name: form.name.trim(), address: form.address.trim() || null })
          .select('id')
          .single());
      }
      if (insertErr) throw insertErr;

      setShowAdd(false);
      setForm({ name: '', address: '', latitude: null, longitude: null });
      setAddressSuggestions([]);
      setShowSuggestions(false);
      setGeocodeNotice(null);
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
        {!isResidence && (
          <button
            onClick={() => { setAddError(null); setGeocodeNotice(null); setForm({ name: '', address: '', latitude: null, longitude: null }); setAddressSuggestions([]); setShowAdd(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer', fontSize: 15 }}
          >
            <Plus size={20} /> Créer une laverie
          </button>
        )}
      </div>

      {!isResidence && showAdd && (
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
                        key={addr.label}
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
                        {addr.label}
                      </li>
                    ))}
                  </ul>
                )}
                {geocodeNotice && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#1F2937' }}>{geocodeNotice}</p>
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
                  {isResidence ? 'Aucune laverie attribuée à ce compte.' : 'Aucun emplacement. Cliquez pour en ajouter.'}
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
