import React from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
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
import { useAuth } from './contexts/AuthContext';

function App() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
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
          <MenuLink icon={<LayoutDashboard size={20}/>} label="Accueil" to="/" />
          <MenuLink icon={<Receipt size={20}/>} label="Transactions" to="/transactions" />
          <MenuLink icon={<MapPin size={20}/>} label="Emplacements" to="/emplacements" />
          <MenuLink icon={<Tablet size={20}/>} label="Appareils" to="/appareils" />
          <MenuLink icon={<Megaphone size={20}/>} label="Marketing" to="/marketing" />
          <MenuLink icon={<Target size={20}/>} label="Missions" to="/missions" />
          <MenuLink icon={<RotateCcw size={20}/>} label="Remboursements" to="/remboursements" />
          <hr style={{ width: '100%', border: '0.5px solid #F0F0F0', margin: '10px 0' }} />
          <MenuLink icon={<Users size={20}/>} label="Utilisateurs" to="/utilisateurs" />
          <MenuLink icon={<Settings size={20}/>} label="Configuration" to="/configuration" />
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
          <Route path="/" element={<Accueil />} />
          <Route path="/appareils" element={<Appareils />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/emplacements" element={<Emplacements />} />
          <Route path="/emplacements/:id" element={<EmplacementDetail />} />
          <Route path="/machines/:id" element={<MachineDetail />} />
          <Route path="/marketing" element={<Marketing />} />
          <Route path="/missions" element={<Missions />} />
          <Route path="/remboursements" element={<Remboursements />} />
          <Route path="/utilisateurs" element={<Utilisateurs />} />
          <Route path="/utilisateurs/:id" element={<ProfileDetail />} />
          <Route path="/configuration" element={<Placeholder title="Configuration" />} />
        </Routes>
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1 style={{ fontSize: 28, fontWeight: '700', color: '#000' }}>{title}</h1>
      <p style={{ color: '#666' }}>Page en cours de développement.</p>
    </>
  );
}

const MenuLink = ({ icon, label, to }: { icon: React.ReactNode; label: string; to: string }) => (
  <NavLink
    to={to}
    style={({ isActive }) => ({
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 15px', 
      borderRadius: 8, textDecoration: 'none',
      backgroundColor: isActive ? '#E8F0FC' : 'transparent',
      color: isActive ? '#1C69D3' : '#444',
      fontWeight: isActive ? '700' : '400',
    })}
  >
    {icon} <span>{label}</span>
  </NavLink>
);

export default App;
