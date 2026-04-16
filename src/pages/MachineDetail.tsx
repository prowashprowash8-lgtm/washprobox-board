import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Coins, Settings } from 'lucide-react';
import { inferMachineKind, type MachineKind } from '../utils/machineKind';
import { fetchAllTransactionsBoard } from '../utils/fetchAllTransactionsBoard';

interface Machine {
  id: string;
  nom: string;
  esp32_id: string;
  numero_serie?: string;
  marque?: string;
  modele?: string;
  prix_centimes?: number;
  actif?: boolean;
  hors_service?: boolean;
  emplacement_id?: string;
  machine_kind?: string | null;
  type?: string | null;
}

interface Emplacement {
  id: string;
  name: string;
  address?: string;
}

export default function MachineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [emplacement, setEmplacement] = useState<Emplacement | null>(null);
  const [stats, setStats] = useState({ revenu30: 0, nbCycles30: 0, nbCyclesPromo30: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [updatingServiceState, setUpdatingServiceState] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [formMachine, setFormMachine] = useState({
    nom: '',
    esp32_id: '',
    numero_serie: '',
    marque: '',
    modele: '',
    prix_centimes: 300,
    actif: true,
    machine_kind: 'lavage' as MachineKind,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (machine) {
      setFormMachine({
        nom: machine.nom,
        esp32_id: machine.esp32_id,
        numero_serie: machine.numero_serie ?? '',
        marque: machine.marque ?? '',
        modele: machine.modele ?? '',
        prix_centimes: machine.prix_centimes ?? 300,
        actif: machine.actif ?? true,
        machine_kind: inferMachineKind(machine),
      });
    }
  }, [machine]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        let machRes = await supabase
          .from('machines')
          .select('id, nom, esp32_id, numero_serie, marque, modele, prix_centimes, actif, hors_service, emplacement_id, machine_kind, type')
          .eq('id', id)
          .single();
        if (machRes.error) {
          machRes = await supabase
            .from('machines')
            .select('id, nom, esp32_id, prix_centimes, actif, emplacement_id, machine_kind, type')
            .eq('id', id)
            .single();
        }
        if (machRes.error) throw machRes.error;
        setMachine(machRes.data as Machine);
        if (machRes.data?.emplacement_id) {
          const empRes = await supabase.from('emplacements').select('id, name, address').eq('id', machRes.data.emplacement_id).single();
          setEmplacement(empRes.data ?? null);
        }
        const allTx = await fetchAllTransactionsBoard(supabase);
        const machineTx = (allTx ?? []).filter((t: { machine_id?: string }) => t.machine_id === id);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const start = thirtyDaysAgo.toISOString();
        let revenu30 = 0;
        let nbCycles30 = 0;
        let nbCyclesPromo30 = 0;
        machineTx.forEach((t: { amount?: number; payment_method?: string; created_at?: string }) => {
          if (t.created_at && t.created_at >= start && t.payment_method !== 'test') {
            const isPromo = t.payment_method === 'promo';
            if (isPromo) {
              nbCyclesPromo30 += 1;
            } else {
              nbCycles30 += 1;
              revenu30 += Number(t.amount ?? 0);
            }
          }
        });
        setStats({ revenu30, nbCycles30, nbCyclesPromo30 });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <p style={{ color: '#666' }}>Chargement...</p>;
  if (error || !machine) return <p style={{ color: '#B91C1C' }}>{error || 'Machine introuvable.'}</p>;

  const prixEur = (machine.prix_centimes ?? 300) / 100;

  const handleDeleteMachine = async () => {
    if (!id || !confirm('Supprimer cette machine ? Cette action est irréversible.')) return;
    setDeleting(true);
    setSendError(null);
    try {
      const { error } = await supabase.from('machines').delete().eq('id', id);
      if (error) throw error;
      setShowEdit(false);
      if (emplacement) navigate(`/emplacements/${emplacement.id}`);
      else navigate('/appareils');
    } catch (err) {
      const msg = (err && typeof err === 'object' && 'message' in err)
        ? (err as { message: string }).message
        : err instanceof Error ? err.message : String(err);
      setSendError(`Erreur suppression : ${msg}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setSendError(null);
    try {
      const nomTrim = formMachine.nom.trim();
      const payload = {
        nom: nomTrim,
        name: nomTrim,
        esp32_id: formMachine.esp32_id.trim(),
        numero_serie: formMachine.numero_serie.trim() || null,
        marque: formMachine.marque.trim() || null,
        modele: formMachine.modele.trim() || null,
        prix_centimes: formMachine.prix_centimes,
        actif: formMachine.actif,
        machine_kind: formMachine.machine_kind,
        type: formMachine.machine_kind,
      };

      const { data: updated, error } = await supabase
        .from('machines')
        .update(payload)
        .eq('id', id)
        .select('id, nom, esp32_id, numero_serie, marque, modele, prix_centimes, actif, hors_service, emplacement_id, machine_kind, type')
        .single();
      if (error) throw error;
      if (updated) {
        setMachine(updated as Machine);
      } else {
        setMachine((m) => m ? { ...m, ...payload } as Machine : null);
      }
      setShowEdit(false);
    } catch (err) {
      const msg = (err && typeof err === 'object' && 'message' in err)
        ? (err as { message: string }).message
        : err instanceof Error ? err.message : String(err);
      setSendError(`Erreur : ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMachineService = async () => {
    if (!machine || !id) return;
    setUpdatingServiceState(true);
    setSendError(null);
    try {
      const nextHorsService = !(machine.hors_service ?? false);
      const { data: updated, error } = await supabase
        .from('machines')
        .update({ hors_service: nextHorsService })
        .eq('id', id)
        .select('id, nom, esp32_id, numero_serie, marque, modele, prix_centimes, actif, hors_service, emplacement_id, machine_kind, type')
        .single();
      if (error) throw error;
      if (updated) {
        setMachine(updated as Machine);
      } else {
        setMachine((prev) => (prev ? { ...prev, hors_service: nextHorsService } : prev));
      }
    } catch (err) {
      const msg = (err && typeof err === 'object' && 'message' in err)
        ? (err as { message: string }).message
        : err instanceof Error ? err.message : String(err);
      setSendError(`Erreur : ${msg}`);
    } finally {
      setUpdatingServiceState(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => (emplacement ? navigate(`/emplacements/${emplacement.id}`) : navigate('/appareils'))}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14 }}
      >
        <ArrowLeft size={18} /> Retour {emplacement ? `à ${emplacement.name}` : 'aux appareils'}
      </button>
      <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>{machine.nom}</h1>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#1C69D3' }}>
              {inferMachineKind(machine) === 'sechage' ? 'Sèche-linge' : 'Lave-linge'}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>ID ESP32 : {machine.esp32_id}</p>
            {machine.numero_serie && (
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#666' }}>N° série : {machine.numero_serie}</p>
            )}
            {emplacement && (
              <p style={{ margin: '8px 0 0', fontSize: 14, color: '#666' }}>Laverie : {emplacement.name}</p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setSendError(null); setShowEdit(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer', fontSize: 14 }}
            >
              <Settings size={18} /> Modifier les infos
            </button>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: '600',
                backgroundColor: machine.actif ? '#D1E3FA' : '#F3F4F6',
                color: machine.actif ? '#1B2430' : '#6B7280',
              }}
            >
              {machine.actif ? 'Visible app' : 'Inactive'}
            </span>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: '600',
                backgroundColor: machine.hors_service ? '#FEE2E2' : '#DCFCE7',
                color: machine.hors_service ? '#B91C1C' : '#166534',
              }}
            >
              {machine.hors_service ? 'Hors service' : 'En service'}
            </span>
          </div>
        </div>
      </div>

      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowEdit(false)}>
          <div style={{ backgroundColor: '#FFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: '600', color: '#000' }}>Modifier les infos</h3>
            {sendError && (
              <p style={{ margin: '0 0 16px', padding: 12, backgroundColor: '#FEE2E2', color: '#B91C1C', borderRadius: 8, fontSize: 14 }}>{sendError}</p>
            )}
            <form onSubmit={handleSaveMachine}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Nom</label>
                <input
                  type="text"
                  value={formMachine.nom}
                  onChange={(e) => setFormMachine((p) => ({ ...p, nom: e.target.value }))}
                  placeholder="Ex: Machine 1"
                  required
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Type d&apos;appareil
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['lavage', 'sechage'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFormMachine((p) => ({ ...p, machine_kind: k }))}
                      style={{
                        flex: 1,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: formMachine.machine_kind === k ? '2px solid #1C69D3' : '1px solid #E5E7EB',
                        backgroundColor: formMachine.machine_kind === k ? '#E8F1FC' : '#FFF',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        color: '#111',
                      }}
                    >
                      {k === 'lavage' ? 'Lave-linge' : 'Sèche-linge'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>ID ESP32</label>
                <input
                  type="text"
                  value={formMachine.esp32_id}
                  onChange={(e) => setFormMachine((p) => ({ ...p, esp32_id: e.target.value }))}
                  placeholder="Ex: WASH_307"
                  required
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Numéro de série</label>
                <input
                  type="text"
                  value={formMachine.numero_serie}
                  onChange={(e) => setFormMachine((p) => ({ ...p, numero_serie: e.target.value }))}
                  placeholder="Ex: SN-12345678"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Marque</label>
                <input
                  type="text"
                  value={formMachine.marque}
                  onChange={(e) => setFormMachine((p) => ({ ...p, marque: e.target.value }))}
                  placeholder="Ex: Miele, Electrolux"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Modèle</label>
                <input
                  type="text"
                  value={formMachine.modele}
                  onChange={(e) => setFormMachine((p) => ({ ...p, modele: e.target.value }))}
                  placeholder="Ex: WSD 323"
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: '500', color: '#374151' }}>Prix du cycle (EUR)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formMachine.prix_centimes / 100}
                  onChange={(e) => setFormMachine((p) => ({ ...p, prix_centimes: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                  style={{ width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="hors-service"
                    checked={!formMachine.actif}
                    onChange={(e) => setFormMachine((p) => ({ ...p, actif: !e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <label htmlFor="hors-service" style={{ fontSize: 14, fontWeight: '500', color: '#374151', cursor: 'pointer' }}>
                    Masquer la machine dans l&apos;app
                  </label>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#666' }}>
                  Une machine inactive n&apos;apparait pas dans la laverie sur l&apos;app.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleDeleteMachine}
                  disabled={deleting}
                  style={{ padding: '12px 20px', backgroundColor: '#FEE2E2', color: '#B91C1C', border: 'none', borderRadius: 10, fontWeight: '600', cursor: deleting ? 'wait' : 'pointer' }}
                >
                  {deleting ? 'Suppression...' : 'Supprimer'}
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setShowEdit(false)} style={{ padding: '12px 20px', backgroundColor: '#F5F5F5', color: '#444', border: 'none', borderRadius: 10, fontWeight: '600', cursor: 'pointer' }}>
                    Annuler
                  </button>
                  <button type="submit" disabled={saving} style={{ padding: '12px 20px', backgroundColor: '#1C69D3', color: '#FFF', border: 'none', borderRadius: 10, fontWeight: '600', cursor: saving ? 'wait' : 'pointer' }}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
        <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Prix du cycle</p>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#000' }}>{prixEur.toFixed(2)} EUR</p>
        </div>
        <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Revenu (30 jours)</p>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#000' }}>{stats.revenu30.toFixed(2)} EUR</p>
        </div>
        <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Cycles (paiements)</p>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#000' }}>{stats.nbCycles30}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#999' }}>30 derniers jours</p>
        </div>
        <div style={{ padding: 24, backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #EEE' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Cycles via code promo</p>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: '700', color: '#059669' }}>{stats.nbCyclesPromo30}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#999' }}>30 derniers jours</p>
        </div>
      </div>

      <div style={{ padding: 28, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #EEE' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: '600', color: '#000' }}>Fonctions machine</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#666' }}>
          Depuis ici, vous pouvez mettre la machine hors service sans la masquer de l&apos;app, ou lancer des actions techniques de test.
        </p>
        {sendError && (
          <p style={{ margin: '0 0 16px', color: '#B91C1C', fontSize: 14 }}>{sendError}</p>
        )}
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ padding: 18, borderRadius: 14, border: '1px solid #FECACA', backgroundColor: '#FEF2F2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#991B1B' }}>Etat de service</p>
                <p style={{ margin: 0, fontSize: 13, color: '#7F1D1D', maxWidth: 520 }}>
                  La machine reste visible dans l&apos;app, mais les utilisateurs ne peuvent plus la payer ni la demarrer tant qu&apos;elle est hors service.
                </p>
              </div>
              <button
                onClick={handleToggleMachineService}
                disabled={updatingServiceState}
                style={{
                  padding: '12px 18px',
                  backgroundColor: machine.hors_service ? '#DCFCE7' : '#FEE2E2',
                  color: machine.hors_service ? '#166534' : '#B91C1C',
                  border: machine.hors_service ? '1px solid #BBF7D0' : '1px solid #FECACA',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: '600',
                  cursor: updatingServiceState ? 'wait' : 'pointer',
                }}
              >
                {updatingServiceState
                  ? 'Mise a jour...'
                  : machine.hors_service
                    ? 'Remettre en service'
                    : 'Mettre hors service'}
              </button>
            </div>
          </div>

          <div style={{ padding: 18, borderRadius: 14, border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#1E3A8A' }}>Cycle de test</p>
                <p style={{ margin: 0, fontSize: 13, color: '#1D4ED8', maxWidth: 520 }}>
                  Envoie une commande START a l&apos;ESP32 sans comptabiliser un vrai paiement client.
                </p>
              </div>
              <button
                onClick={async () => {
                  const normalizedEsp32Id = (machine?.esp32_id ?? '').trim().toUpperCase();
                  if (!normalizedEsp32Id) {
                    setSendError('ID ESP32 manquant sur cette machine.');
                    return;
                  }
                  setSendError(null);
                  setSending(true);
                  try {
                    let transactionUserId: string | null = null;
                    const { data: profileById, error: profileByIdErr } = await supabase
                      .from('profiles')
                      .select('id')
                      .eq('id', user!.id)
                      .maybeSingle();
                    if (profileByIdErr) {
                      throw new Error(`Profil utilisateur introuvable (id) : ${profileByIdErr.message}`);
                    }
                    if (profileById?.id) {
                      transactionUserId = profileById.id;
                    } else if (user?.email) {
                      const { data: profileByEmail, error: profileByEmailErr } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('email', user.email)
                        .maybeSingle();
                      if (profileByEmailErr) {
                        throw new Error(`Profil utilisateur introuvable (email) : ${profileByEmailErr.message}`);
                      }
                      transactionUserId = profileByEmail?.id ?? null;
                    }
                    if (!transactionUserId) {
                      throw new Error('Aucun profil lié à cet utilisateur. Créez une ligne dans profiles puis réessayez.');
                    }

                    const { data: txData, error: txErr } = await supabase
                      .from('transactions')
                      .insert({
                        user_id: transactionUserId,
                        machine_id: machine.id,
                        emplacement_id: machine.emplacement_id ?? null,
                        amount: 0,
                        montant: 0,
                        payment_method: 'test',
                      })
                      .select('id')
                      .single();
                    if (txErr) {
                      throw new Error(`Transaction : ${txErr.message}`);
                    }
                    if (!txData?.id) {
                      throw new Error('Transaction test non créée.');
                    }

                    const { data: cmdData, error: cmdErr } = await supabase
                      .from('machine_commands')
                      .insert({
                        machine_id: machine.id,
                        esp32_id: normalizedEsp32Id,
                        command: 'START',
                        status: 'pending',
                        user_id: transactionUserId,
                        transaction_id: txData.id,
                      })
                      .select('id')
                      .single();
                    if (cmdErr) {
                      throw new Error(`Commande ESP32 : ${cmdErr.message}`);
                    }
                    if (!cmdData?.id) {
                      throw new Error('Commande ESP32 non créée.');
                    }

                    const { error: txLinkErr } = await supabase
                      .from('transactions')
                      .update({ machine_command_id: cmdData.id })
                      .eq('id', txData.id);
                    if (txLinkErr) {
                      throw new Error(`Lien transaction/commande : ${txLinkErr.message}`);
                    }

                    await supabase
                      .from('machines')
                      .update({ statut: 'occupe', estimated_end_time: null })
                      .eq('id', machine.id);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    setSendError(msg);
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={!machine.esp32_id || sending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 18px',
                  backgroundColor: '#1C69D3',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: '600',
                  cursor: sending ? 'wait' : 'pointer',
                }}
              >
                <Coins size={18} />
                {sending ? 'Envoi en cours...' : 'Lancer un cycle de test'}
              </button>
            </div>
          </div>

          <div style={{ padding: 18, borderRadius: 14, border: '1px solid #A7F3D0', backgroundColor: '#ECFDF5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#065F46' }}>Liberer la machine</p>
                <p style={{ margin: 0, fontSize: 13, color: '#047857', maxWidth: 520 }}>
                  Force le retour a l&apos;etat disponible si la machine est restee bloquee en occupee.
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!machine?.esp32_id) return;
                  setSendError(null);
                  try {
                    const { error } = await supabase.rpc('release_machine', { p_esp32_id: machine.esp32_id });
                    if (error) throw error;
                    setMachine((m) => m ? { ...m, statut: 'disponible', estimated_end_time: null } : null);
                  } catch (err) {
                    setSendError(err instanceof Error ? err.message : 'Erreur');
                  }
                }}
                style={{
                  padding: '12px 18px',
                  backgroundColor: '#059669',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Repasser en disponible
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
