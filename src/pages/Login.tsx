import { useState } from 'react';
import { supabase } from '../supabaseClient';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8F9FA',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: 40,
          backgroundColor: '#FFF',
          borderRadius: 20,
          boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
          border: '1px solid #EEE',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo_washpro.png" alt="Wash Pro" style={{ height: 48, objectFit: 'contain', marginBottom: 24 }} />
          <h1 style={{ fontSize: 24, fontWeight: '700', color: '#000', margin: '0 0 8px' }}>Tableau de bord</h1>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>Connectez-vous pour accéder à l'interface</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                padding: 12,
                marginBottom: 20,
                backgroundColor: '#FEE2E2',
                color: '#B91C1C',
                borderRadius: 10,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: '500', color: '#374151' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@washpro.fr"
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: 14,
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                fontSize: 15,
                boxSizing: 'border-box',
                backgroundColor: '#FFFFFF',
                color: '#000',
              }}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: '500', color: '#374151' }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: 14,
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                fontSize: 15,
                boxSizing: 'border-box',
                backgroundColor: '#FFFFFF',
                color: '#000',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 16,
              backgroundColor: loading ? '#94A3B8' : '#1C69D3',
              color: '#FFF',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: '600',
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
