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
import { ToastContainer } from './components/common/ToastContainer';

// ── DB Error Banner ───────────────────────────────────────────────────────────
function DbErrorScreen({ dbType, dbError }: { dbType: string; dbError: string }) {
  const [showFix, setShowFix] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 font-sans text-slate-100">
      <div className="bg-slate-800 border border-red-500 rounded-2xl p-10 max-w-xl w-full shadow-[0_25px_50px_rgba(0,0,0,0.5)]">
        <div className="text-4xl text-center mb-4">🚨</div>
        <h2 className="text-2xl font-bold text-center mb-2 text-red-400">
          Database Connection Error
        </h2>
        <p className="text-center text-slate-400 mb-6 text-sm">
          The server could not connect to the database. The application is unavailable until this is fixed.
        </p>

        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-6">
          <div className="flex gap-4 mb-2">
            <span className="text-slate-500 text-xs font-semibold min-w-[80px]">DB TYPE</span>
            <code className="text-amber-400 text-sm">{dbType || 'unknown'}</code>
          </div>
          <div className="flex gap-4">
            <span className="text-slate-500 text-xs font-semibold min-w-[80px]">ERROR</span>
            <code className="text-red-400 text-xs break-all whitespace-pre-wrap">{dbError}</code>
          </div>
        </div>

        <button
          onClick={() => setShowFix(!showFix)}
          className="w-full p-2.5 bg-blue-500 text-white border-none rounded-lg font-bold text-sm cursor-pointer mb-3"
        >
          {showFix ? '▲ Hide Fix Instructions' : '▼ How to fix this'}
        </button>

        {showFix && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 leading-relaxed">
            <p className="font-bold text-slate-200 mb-2">Common fixes:</p>
            <ul className="pl-5 flex flex-col gap-1.5 list-disc">
              <li><strong>SQLite:</strong> Check that the file path is writable and the folder exists</li>
              <li><strong>MySQL/PostgreSQL:</strong> Verify host, port, credentials, and that the DB exists</li>
              <li><strong>SQL Server:</strong> Verify server name, credentials and firewall rules</li>
            </ul>
            <p className="mt-3 text-slate-500">
              Super admins can update the DB config at{' '}
              <code className="text-blue-400">/admin → 🗄️ Database</code>
            </p>
          </div>
        )}

        <button
          onClick={() => window.location.reload()}
          className="w-full p-2.5 bg-transparent text-slate-400 border border-slate-700 rounded-lg font-semibold text-sm cursor-pointer mt-2"
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
        // A 503 from the '/api' gate means the server is up but its database is
        // not. The body is deliberately generic in production, so don't require
        // it to carry a message — without this fallback the screen never shows.
        if (err.response?.status === 503) {
          setDbError({
            dbType: err.response.data?.dbType || 'unknown',
            dbError: err.response.data?.dbError
              || 'The server cannot reach its database — check the server logs.',
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
      <div className="flex h-screen items-center justify-center flex-col gap-4 bg-slate-900 text-slate-400 font-sans">
        <div className="w-10 h-10 border-3 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
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
      <ToastContainer />
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
              <Route path="admin" element={<AuthGuard requireSuperAdmin><AdminPage /></AuthGuard>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ContextMenuProvider>
    </>
  );
}

export default App;
