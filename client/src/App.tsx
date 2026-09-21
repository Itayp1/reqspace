import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import api from './api/axios';
import { useAuthStore } from './store/authStore';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import AppScreen from './pages/AppScreen';
import AdminPage from './pages/AdminPage';
import { ContextMenuProvider } from './components/common/ContextMenuProvider';
import ForcePasswordChangeModal from './components/auth/ForcePasswordChangeModal';
import SharedCollectionPage from './pages/SharedCollectionPage';

// ── DB Error Banner ───────────────────────────────────────────────────────────
function DbErrorScreen({ dbType, dbError }: { dbType: string; dbError: string }) {
  const [showFix, setShowFix] = useState(false);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#f1f5f9',
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #ef4444',
        borderRadius: '16px',
        padding: '2.5rem',
        maxWidth: '560px',
        width: '100%',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem' }}>🚨</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', marginBottom: '0.5rem', color: '#f87171' }}>
          Database Connection Error
        </h2>
        <p style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          The server could not connect to the database. The application is unavailable until this is fixed.
        </p>

        <div style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, minWidth: '80px' }}>DB TYPE</span>
            <code style={{ color: '#fbbf24', fontSize: '0.85rem' }}>{dbType || 'unknown'}</code>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, minWidth: '80px' }}>ERROR</span>
            <code style={{ color: '#f87171', fontSize: '0.8rem', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{dbError}</code>
          </div>
        </div>

        <button
          onClick={() => setShowFix(!showFix)}
          style={{
            width: '100%', padding: '10px', background: '#3b82f6', color: 'white',
            border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem',
            cursor: 'pointer', marginBottom: '0.75rem',
          }}
        >
          {showFix ? '▲ Hide Fix Instructions' : '▼ How to fix this'}
        </button>

        {showFix && (
          <div style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: '8px',
            padding: '1rem', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.7',
          }}>
            <p style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>Common fixes:</p>
            <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>SQLite:</strong> Check that the file path is writable and the folder exists</li>
              <li><strong>MongoDB:</strong> Make sure MongoDB is running on the configured host/port</li>
              <li><strong>MySQL/PostgreSQL:</strong> Verify host, port, credentials, and that the DB exists</li>
              <li><strong>SQL Server:</strong> Verify server name, credentials and firewall rules</li>
            </ul>
            <p style={{ marginTop: '0.75rem', color: '#64748b' }}>
              Super admins can update the DB config at{' '}
              <code style={{ color: '#60a5fa' }}>/admin → 🗄️ Database</code>
            </p>
          </div>
        )}

        <button
          onClick={() => window.location.reload()}
          style={{
            width: '100%', padding: '10px', background: 'transparent', color: '#94a3b8',
            border: '1px solid #334155', borderRadius: '8px', fontWeight: 600,
            fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.5rem',
          }}
        >
          🔄 Retry Connection
        </button>
      </div>
    </div>
  );
}

// ── Auth Guard ────────────────────────────────────────────────────────────────
function AuthGuard({ children, requireSuperAdmin = false }: { children: React.ReactNode, requireSuperAdmin?: boolean }) {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const handleUnauthorized = () => {
      useAuthStore.getState().setUser(null);
      navigate('/login');
    };
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, [navigate]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireSuperAdmin && !user?.isSuperAdmin) return <Navigate to="/" replace />;

  return children;
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<{ dbType: string; dbError: string } | null>(null);
  const setUser = useAuthStore((state) => state.setUser);
  const setWorkspaces = useAuthStore((state) => state.setWorkspaces);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);

  useEffect(() => {
    const initApp = async () => {
      try {
        // 1. Check server health + DB status first
        const healthRes = await api.get('/health');
        const health = healthRes.data;

        if (health.status === 'error') {
          setDbError({ dbType: health.dbType || 'unknown', dbError: health.dbError || 'Unknown DB error' });
          setLoading(false);
          return;
        }

        if (health.status === 'starting') {
          // Server still starting — retry after a moment
          setTimeout(() => window.location.reload(), 2000);
          return;
        }

        // 2. DB is OK — load user session
        try {
          const { data: user } = await api.get('/auth/me');
          setUser(user);
          const { data: workspaces } = await api.get('/workspaces');
          setWorkspaces(workspaces);
          if (workspaces.length > 0) {
            const currentActive = useAuthStore.getState().activeWorkspace;
            if (!currentActive || !workspaces.find((w: any) => w._id === currentActive._id)) {
              setActiveWorkspace(workspaces[0]);
            }
          }
        } catch {
          // Not authenticated — fine, will redirect to login
        }
      } catch (err: any) {
        // Can't reach server at all — check if it's a DB 503
        if (err.response?.status === 503 && err.response?.data?.dbError) {
          setDbError({
            dbType: err.response.data.dbType || 'unknown',
            dbError: err.response.data.dbError,
          });
        }
        // Otherwise just continue — LoginPage will handle it
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, [setUser, setWorkspaces, setActiveWorkspace]);

  if (loading) {
    return (
      <div style={{
        display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '1rem', background: '#0f172a', color: '#94a3b8',
        fontFamily: '-apple-system, sans-serif',
      }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid #1e293b',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span>Loading...</span>
      </div>
    );
  }

  // Show DB error screen if DB is unavailable
  if (dbError) {
    return <DbErrorScreen dbType={dbError.dbType} dbError={dbError.dbError} />;
  }

  return (
    <>
      <ForcePasswordChangeModal />
      <ContextMenuProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/google/callback" element={<OAuthCallbackPage />} />
            <Route path="/share/:shortId" element={<SharedCollectionPage />} />
            
            <Route path="/" element={<AuthGuard><MainLayout /></AuthGuard>}>
              <Route index element={<AppScreen />} />
              <Route path="admin" element={<AuthGuard requireSuperAdmin><AdminPage /></AuthGuard>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ContextMenuProvider>
    </>
  );
}

export default App;
