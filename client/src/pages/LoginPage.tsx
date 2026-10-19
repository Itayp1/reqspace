import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';
import OAuthButtons from '../components/common/OAuthButtons';
import { sessionCookieStored, SESSION_COOKIE_BLOCKED_MESSAGE } from '../utils/sessionCookie';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    api.get('/auth/config').then(res => setConfig(res.data)).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // ignore double-clicks while a login is in flight (A1.10)
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (!(await sessionCookieStored())) {
        setError(SESSION_COOKIE_BLOCKED_MESSAGE);
        setSubmitting(false);
        return;
      }
      setUser(res.data.user);
      navigate('/');
      window.location.reload(); // To fetch workspaces
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} className="bg-background p-8 rounded-lg shadow-md w-96 border border-border">
        <div className="flex flex-col items-center mb-6">
          <img src="/reqspace-logo.jpg" alt="Reqspace Logo" className="h-16 w-16 rounded-xl object-cover border border-border shadow-sm mb-3" />
          <h1 className="text-2xl font-bold text-center">Login to Reqspace</h1>
        </div>
        
        {error && <div data-testid="login-error" className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm">{error}</div>}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Username or Email</label>
          <input
            data-testid="login-email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border border-border rounded focus:outline-none focus:border-primary"
            placeholder="admin or test@example.com"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-border rounded focus:outline-none focus:border-primary"
            required
          />
        </div>

        <button data-testid="login-submit" type="submit" disabled={submitting} className="w-full bg-primary text-white p-2 rounded hover:bg-orange-600 transition mb-4 disabled:opacity-60">
          Sign In
        </button>

        <OAuthButtons config={config} onError={setError} />

        {config?.allowSelfRegistration !== false && (
          <div className="mt-4 text-center text-sm text-text-muted">
            Don't have an account? <Link to="/register" className="text-primary hover:underline">Register</Link>
          </div>
        )}
      </form>
    </div>
  );
}
