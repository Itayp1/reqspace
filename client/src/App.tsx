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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-8 text-slate-100">
      <div className="w-full max-w-xl rounded-2xl border border-red-500 bg-slate-800 p-10 shadow-2xl">
        <div className="mb-4 text-center text-4xl">🚨</div>
        <h2 className="mb-2 text-center text-xl font-bold text-red-400">Database Connection Error</h2>
        <p className="mb-6 text-center text-sm text-slate-400">
          The server could not connect to the database. The application is unavailable until this is fixed.
        </p>
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm">
          <div className="mb-2 flex gap-4">
            <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">DB TYPE</span>
            <code className="text-amber-300">{dbType || 'unknown'}</code>
          </div>
          <div className="flex gap-4">
            <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">ERROR</span>
            <code className="whitespace-pre-wrap break-all text-red-400">{dbError}</code>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowFix(!showFix)}
          className="mb-3 w-full cursor-pointer rounded-lg bg-blue-500 px-3 py-2.5 text-sm font-bold text-white"
        >
          {showFix ? '▲ Hide Fix Instructions' : '▼ How to fix this'}
        </button>
        {showFix && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 text-xs leading-relaxed text-slate-300">
            <p className="mb-2 font-bold text-slate-200">Common fixes:</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li><strong>SQLite:</strong> Check that the file path is writable and the folder exists</li>
              <li><strong>MongoDB:</strong> Make sure MongoDB is running on the configured host/port</li>
              <li><strong>MySQL/PostgreSQL:</strong> Verify host, port, credentials, and that the DB exists</li>
              <li><strong>SQL Server:</strong> Verify server name, credentials and firewall rules</li>
            </ul>
            <p className="mt-3 text-slate-500">
              Super admins can update the DB config at <code className="text-blue-400">/admin</code>
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 w-full cursor-pointer rounded-lg border border-slate-700 bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-400"
        >
          Retry Connection
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
    const handleForbidden = (event: Event) => {
      const message = (event as CustomEvent).detail || 'Forbidden';
      window.alert(message);
    };
    window.addEventListener('unauthorized', handleUnauthorized);
    window.addEventListener('forbidden', handleForbidden);
    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
      window.removeEventListener('forbidden', handleForbidden);
    };
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
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900 text-slate-400">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-800 border-t-blue-500" />
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
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ContextMenuProvider>
    </>
  );
}

export default App;
