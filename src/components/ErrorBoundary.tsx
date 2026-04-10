import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            backgroundColor: '#F8F9FA',
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ maxWidth: 500, padding: 32, backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #FEE2E2' }}>
            <h2 style={{ color: '#B91C1C', margin: '0 0 16px' }}>Une erreur s'est produite</h2>
            <p style={{ color: '#666', margin: '0 0 20px', fontSize: 14 }}>{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                backgroundColor: '#1C69D3',
                color: '#FFF',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
