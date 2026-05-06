import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, MapPin, Tablet, Settings, Users, Megaphone, Target, LogOut, RotateCcw } from 'lucide-react';
import Accueil from './pages/Accueil';
import Appareils from './pages/Appareils';
import Emplacements from './pages/Emplacements';
import EmplacementDetail from './pages/EmplacementDetail';
import MachineDetail from './pages/MachineDetail';
import Transactions from './pages/Transactions';
import Marketing from './pages/Marketing';
import Missions from './pages/Missions';
import Remboursements from './pages/Remboursements';
import Utilisateurs from './pages/Utilisateurs';
import ProfileDetail from './pages/ProfileDetail';
import Login from './pages/Login';
import CrmAccueil from './pages/crm/CrmAccueil';
import CrmLaveries from './pages/crm/CrmLaveries';
import CrmLaverieDetail from './pages/crm/CrmLaverieDetail';
import CrmInterventions from './pages/crm/CrmInterventions';
import CrmInterventionCreate from './pages/crm/CrmInterventionCreate';
import CrmTournee from './pages/crm/CrmTournee';
import CrmCommande from './pages/crm/CrmCommande';
import CrmProspection from './pages/crm/CrmProspection';
import CrmAccesUtilisateurs from './pages/crm/CrmAccesUtilisateurs';
import CrmUtilisateurDetail from './pages/crm/CrmUtilisateurDetail';
import { useAuth } from './contexts/AuthContext';
import { useBoardAccess } from './contexts/BoardAccessContext';
import { supabase } from './supabaseClient';

function App() {
  const { user, loading, signOut } = useAuth();
  const { loading: accessLoading, isPatron, isResidence } = useBoardAccess();
  const navigate = useNavigate();
  const [pendingRefundCount, setPendingRefundCount] = useState(0);
  const [crmLoading, setCrmLoading] = useState(true);
  const [crmActive, setCrmActive] = useState(false);
  const [crmRole, setCrmRole] = useState<'patron' | 'salarie' | null>(null);

  const fetchPendingRefundCount = useCallback(async () => {
    if (!isPatron) {
      setPendingRefundCount(0);
      return;
    }
    const { count, error } = await supabase
      .from('refund_requests')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'pending');
    if (!error) setPendingRefundCount(count ?? 0);
  }, [isPatron]);

  useEffect(() => {
    if (!user || !isPatron) return;
    fetchPendingRefundCount();
  }, [user, isPatron, fetchPendingRefundCount]);

  useEffect(() => {
    if (!user || !isPatron) return;
    const channel = supabase
      .channel('sidebar-refund-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'refund_requests' },
        () => {
          fetchPendingRefundCount();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isPatron, fetchPendingRefundCount]);

  useEffect(() => {
    if (!user || !isPatron) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchPendingRefundCount();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user, isPatron, fetchPendingRefundCount]);

  useEffect(() => {
    if (!user || !isPatron) return;
    const t = setInterval(() => fetchPendingRefundCount(), 45_000);
    return () => clearInterval(t);
  }, [user, isPatron, fetchPendingRefundCount]);

  useEffect(() => {
    const loadCrmRole = async () => {
      if (!user) {
        setCrmActive(false);
        setCrmRole(null);
        setCrmLoading(false);
        return;
      }
      setCrmLoading(true);
      const { data, error } = await supabase
        .from('crm_users')
        .select('role, is_active')
        .eq('id', user.id)
        .maybeSingle();
      if (error || !data) {
        setCrmActive(false);
        setCrmRole(null);
        setCrmLoading(false);
        return;
      }
      setCrmActive(Boolean(data.is_active));
      setCrmRole((data.role as 'patron' | 'salarie') ?? null);
      setCrmLoading(false);
    };
    void loadCrmRole();
  }, [user]);

  // Règle métier : un compte CRM "salarié" ne doit JAMAIS voir le board, même s'il a un rôle board.
  const isCrmOnly = crmActive && crmRole === 'salarie';

  const canUseBoard = !isCrmOnly && (isPatron || isResidence);
  const canUseCrm = isPatron || (crmActive && (crmRole === 'patron' || crmRole === 'salarie'));
  const canManageCrmUsers = isPatron || (crmActive && crmRole === 'patron');

  if (loading || accessLoading || crmLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', height: '100%', backgroundColor: '#F8F9FA' }}>
        <p style={{ color: '#666', fontSize: 16 }}>Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onSuccess={() => navigate('/')} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        backgroundColor: '#F8F9FA',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* BARRE LATÉRALE (SIDEBAR) */}
      <div
        style={{
          width: 250,
          flexShrink: 0,
          alignSelf: 'stretch',
          minHeight: 0,
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid #EEE',
          padding: 20,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ padding: '0 15px', marginBottom: 24 }}>
          <img src="/logo_washpro.png" alt="Wash Pro" style={{ height: 40, objectFit: 'contain', display: 'block' }} />
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 15, flex: 1 }}>
          {/* En mode CRM-only, l'accueil doit aller vers le CRM */}
          <MenuLink icon={<LayoutDashboard size={20}/>} label="Accueil" to={isCrmOnly ? '/crm/accueil' : '/'} />
          {canUseBoard && <MenuLink icon={<MapPin size={20}/>} label="Emplacements" to="/emplacements" />}
          {canUseBoard && isPatron && (
            <>
              <MenuLink icon={<Receipt size={20}/>} label="Transactions" to="/transactions" />
              <MenuLink icon={<Tablet size={20}/>} label="Appareils" to="/appareils" />
              <MenuLink icon={<Megaphone size={20}/>} label="Marketing" to="/marketing" />
              <MenuLink icon={<Target size={20}/>} label="Missions" to="/missions" />
              <MenuLink icon={<RotateCcw size={20}/>} label="Remboursements" to="/remboursements" badge={pendingRefundCount} />
              <hr style={{ width: '100%', border: '0.5px solid #F0F0F0', margin: '10px 0' }} />
              <MenuLink icon={<Users size={20}/>} label="Utilisateurs" to="/utilisateurs" />
              <MenuLink icon={<Settings size={20}/>} label="Configuration" to="/configuration" />
            </>
          )}
          {canUseCrm && (
            <>
              <hr style={{ width: '100%', border: '0.5px solid #F0F0F0', margin: '10px 0' }} />
              <MenuLink icon={<LayoutDashboard size={20}/>} label="Accueil CRM" to="/crm/accueil" />
              <MenuLink icon={<MapPin size={20}/>} label="Laveries" to="/crm/laveries" />
              <MenuLink icon={<Target size={20}/>} label="Interventions" to="/crm/interventions" />
              <MenuLink icon={<Receipt size={20}/>} label="Planning tournée" to="/crm/planning-tournee" />
              <MenuLink icon={<Tablet size={20}/>} label="Commande" to="/crm/commande" />
              <MenuLink icon={<Megaphone size={20}/>} label="Prospection" to="/crm/prospection" />
              {canManageCrmUsers && <MenuLink icon={<Users size={20}/>} label="Utilisateurs & accès" to="/crm/utilisateurs" />}
            </>
          )}
        </nav>
        <button
          onClick={() => signOut().then(() => navigate('/'))}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 15px',
            marginTop: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#666',
            fontSize: 14,
            borderRadius: 8,
          }}
        >
          <LogOut size={20} />
          Se déconnecter
        </button>
      </div>

      {/* CONTENU PRINCIPAL — minHeight:0 indispensable pour que overflow fonctionne en flex */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          padding: 40,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Routes>
          {/* Mode CRM-only (salarié CRM) : pas d'accès aux pages board */}
          {isCrmOnly ? (
            <>
              <Route path="/" element={<Navigate to="/crm/accueil" replace />} />
              <Route path="/crm/accueil" element={<CrmAccueil />} />
              <Route path="/crm/laveries" element={<CrmLaveries />} />
              <Route path="/crm/laveries/:id" element={<CrmLaverieDetail />} />
              <Route path="/crm/laveries/board/:emplacementId" element={<CrmLaverieDetail />} />
              <Route path="/crm/interventions" element={<CrmInterventions />} />
              <Route path="/crm/intervention-create" element={<CrmInterventionCreate />} />
              <Route path="/crm/interventions/:id/edit" element={<CrmInterventionCreate />} />
              <Route path="/crm/planning-tournee" element={<CrmTournee />} />
              <Route path="/crm/commande" element={<CrmCommande />} />
              <Route path="/crm/prospection" element={<CrmProspection />} />
              <Route path="*" element={<Navigate to="/crm/accueil" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Accueil />} />
              <Route path="/emplacements" element={<Emplacements />} />
              <Route path="/emplacements/:id" element={<EmplacementDetail />} />
              {isPatron ? (
                <>
                  <Route path="/appareils" element={<Appareils />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/machines/:id" element={<MachineDetail />} />
                  <Route path="/marketing" element={<Marketing />} />
                  <Route path="/missions" element={<Missions />} />
                  <Route path="/remboursements" element={<Remboursements />} />
                  <Route path="/utilisateurs" element={<Utilisateurs />} />
                  <Route path="/utilisateurs/:id" element={<ProfileDetail />} />
                  <Route path="/gerants-residences" element={<Navigate to="/crm/utilisateurs?tab=gerants" replace />} />
                  <Route path="/configuration" element={<ConfigurationPlaceholder />} />
                </>
              ) : null}
              {canUseCrm ? (
                <>
                  <Route path="/crm/accueil" element={<CrmAccueil />} />
                  <Route path="/crm/laveries" element={<CrmLaveries />} />
                  <Route path="/crm/laveries/:id" element={<CrmLaverieDetail />} />
                  <Route path="/crm/laveries/board/:emplacementId" element={<CrmLaverieDetail />} />
                  <Route path="/crm/interventions" element={<CrmInterventions />} />
                  <Route path="/crm/intervention-create" element={<CrmInterventionCreate />} />
                  <Route path="/crm/interventions/:id/edit" element={<CrmInterventionCreate />} />
                  <Route path="/crm/planning-tournee" element={<CrmTournee />} />
                  <Route path="/crm/commande" element={<CrmCommande />} />
                  <Route path="/crm/prospection" element={<CrmProspection />} />
                  {canManageCrmUsers && <Route path="/crm/utilisateurs" element={<CrmAccesUtilisateurs />} />}
                  {canManageCrmUsers && <Route path="/crm/utilisateurs/:id" element={<CrmUtilisateurDetail />} />}
                </>
              ) : null}
              <Route path="*" element={<Navigate to={isResidence ? '/emplacements' : '/'} replace />} />
            </>
          )}
        </Routes>
      </div>
    </div>
  );
}

const MenuLink = ({
  icon,
  label,
  to,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  badge?: number;
}) => (
  <NavLink
    to={to}
    style={({ isActive }) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 15px',
      borderRadius: 8,
      textDecoration: 'none',
      backgroundColor: isActive ? '#E8F0FC' : 'transparent',
      color: isActive ? '#1C69D3' : '#444',
      fontWeight: isActive ? '700' : '400',
    })}
  >
    {icon}
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      {label}
      {badge != null && badge > 0 && (
        <span
          aria-label={`${badge} demande${badge > 1 ? 's' : ''} en attente`}
          style={{
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 999,
            backgroundColor: '#EF4444',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
  </NavLink>
);

function ConfigurationPlaceholder() {
  return (
    <>
      <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000' }}>Configuration</h1>
      <p style={{ color: '#666' }}>Page en cours de développement.</p>
    </>
  );
}

export default App;
