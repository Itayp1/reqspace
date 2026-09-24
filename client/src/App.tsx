import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import api from './api/axios';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import MainLayout from './components/layout/MainLayout';
import { SocketSync } from './components/common/SocketSync';
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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-slate-100">
      <div className="bg-slate-800 border border-red-500 rounded-2xl p-10 max-w-xl w-full shadow-2xl">
        <div className="text-4xl text-center mb-4">🚨</div>
        <h2 className="text-xl font-bold text-center mb-2 text-red-400">Database Connection Error</h2>
        <p className="text-center text-slate-400 mb-6 text-sm">
          The server could not connect to the database. The application is unavailable until this is fixed.
        </p>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-6 text-sm">
          <div className="flex gap-4 mb-2">
            <span className="text-slate-500 font-semibold min-w-20">DB TYPE</span>
            <code className="text-amber-400">{dbType || 'unknown'}</code>
          </div>
          <div className="flex gap-4">
            <span className="text-slate-500 font-semibold min-w-20">ERROR</span>
            <code className="text-red-400 break-all whitespace-pre-wrap">{dbError}</code>
          </div>
        </div>
        <button type="button" onClick={() => setShowFix(!showFix)} className="w-full py-2.5 bg-blue-500 text-white rounded-lg font-bold text-sm mb-3">
          {showFix ? '▲ Hide Fix Instructions' : '▼ How to fix this'}
        </button>
        {showFix && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 leading-relaxed">
            <p className="font-bold text-slate-200 mb-2">Common fixes:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li><strong>SQLite:</strong> Check that the file path is writable and the folder exists</li>
              <li><strong>MongoDB:</strong> Make sure MongoDB is running on the configured host/port</li>
              <li><strong>MySQL/PostgreSQL:</strong> Verify host, port, credentials, and that the DB exists</li>
              <li><strong>SQL Server:</strong> Verify server name, credentials and firewall rules</li>
            </ul>
          </div>
        )}
        <button type="button" onClick={() => window.location.reload()} className="w-full py-2.5 mt-2 bg-transparent text-slate-400 border border-slate-700 rounded-lg font-semibold text-sm">
          Retry Connection
        </button>
      </div>
    </div>
  );
}

// ── Auth Guard ────────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [forbidden, setForbidden] = useState<string | null>(null);

  useEffect(() => {
    const handleUnauthorized = () => {
      useAuthStore.getState().setUser(null);
      navigate('/login');
    };
    const handleForbidden = (event: Event) => {
      const message = (event as CustomEvent<string>).detail || 'You do not have permission to do that.';
      setForbidden(message);
    };
    window.addEventListener('unauthorized', handleUnauthorized);
    window.addEventListener('forbidden', handleForbidden);
    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
      window.removeEventListener('forbidden', handleForbidden);
    };
  }, [navigate]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <>
      {forbidden && (
        <div className="fixed top-4 right-4 z-50 max-w-sm rounded-lg border border-red-500/40 bg-slate-900 px-4 py-3 text-sm text-red-200 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <span>{forbidden}</span>
            <button type="button" className="text-slate-400 hover:text-white" onClick={() => setForbidden(null)} aria-label="Dismiss">×</button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}

function SuperAdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user?.isSuperAdmin) return <Navigate to="/" replace />;
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
          if (user.settings) useSettingsStore.getState().setSettings(user.settings);
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
      <div className="flex h-screen items-center justify-center flex-col gap-4 bg-slate-900 text-slate-400">
        <div className="w-10 h-10 border-[3px] border-slate-800 border-t-blue-500 rounded-full animate-spin" />
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
      <SocketSync />
      <ContextMenuProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/google/callback" element={<OAuthCallbackPage />} />
            <Route path="/share/:shortId" element={<SharedCollectionPage />} />
            
            <Route path="/" element={<AuthGuard><MainLayout /></AuthGuard>}>
              <Route index element={<AppScreen />} />
              <Route path="admin" element={<SuperAdminOnly><AdminPage /></SuperAdminOnly>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ContextMenuProvider>
    </>
  );
}

export default App;
