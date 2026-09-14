import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("AMPLIFY Caught Fatal Exception:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.removeItem('spoty_recent_ids');
      localStorage.removeItem('spoty_recent_songs');
      localStorage.removeItem('spoty_active_bg_id');
      localStorage.removeItem('spoty_bg_mode');
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(ellipse at 50% 30%, #151a2d 0%, #080a12 100%)',
          color: '#f8fafc',
          fontFamily: "'Outfit', -apple-system, sans-serif",
          zIndex: 99999,
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            background: 'rgba(17, 24, 39, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 20px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(249, 115, 22, 0.1))',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px'
            }}>
              ⚠️
            </div>

            <h2 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '1.6rem',
              fontWeight: 700,
              letterSpacing: '1px',
              marginBottom: '12px',
              background: 'linear-gradient(135deg, #ffffff 40%, #cbd5e1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Something Went Wrong
            </h2>

            <p style={{
              fontSize: '0.95rem',
              color: '#94a3b8',
              lineHeight: 1.6,
              marginBottom: '28px'
            }}>
              AMPLIFY encountered an unexpected issue while rendering. Your music files and playlists in local storage are safe.
            </p>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <button
                onClick={this.handleReload}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: '14px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(14, 165, 233, 0.3)',
                  transition: 'transform 0.2s, opacity 0.2s'
                }}
              >
                Reload Player
              </button>

              <button
                onClick={this.handleReset}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: '#cbd5e1',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                Clear Temp Cache & Restart
              </button>
            </div>

            {this.state.error && (
              <details style={{
                marginTop: '20px',
                textAlign: 'left',
                fontSize: '0.75rem',
                color: '#64748b',
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '10px 14px',
                borderRadius: '10px',
                wordBreak: 'break-all'
              }}>
                <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>Technical Details</summary>
                <p style={{ marginTop: '8px', color: '#f87171' }}>{this.state.error.toString()}</p>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
