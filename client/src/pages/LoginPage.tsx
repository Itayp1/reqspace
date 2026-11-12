import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { apiErrorMessage } from '../utils/apiError';
import { useAuthStore } from '../store/authStore';
import OAuthButtons from '../components/common/OAuthButtons';
import SecretsSetup from '../components/common/SecretsSetup';
import { sessionCookieStored, SESSION_COOKIE_BLOCKED_MESSAGE } from '../utils/sessionCookie';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
    // noValidate on the form: browser bubbles use the browser language (QA-54)
    if (!email.trim() || !password || (config?.needsSetup && !name.trim())) {
      setError(config?.needsSetup ? 'Enter a name, an email and a password.' : 'Enter your username or email and your password.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = config?.needsSetup
        ? await api.post('/auth/setup', { name, email, password })
        : await api.post('/auth/login', { email, password });
      if (!(await sessionCookieStored())) {
        setError(SESSION_COOKIE_BLOCKED_MESSAGE);
        setSubmitting(false);
        return;
      }
      setUser(res.data.user);
      navigate('/');
      window.location.reload(); // To fetch workspaces
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Login failed'));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} noValidate className="bg-background p-8 rounded-lg shadow-md w-96 border border-border">
        <SecretsSetup />
        <div className="flex flex-col items-center mb-6">
          <img src="/reqspace-logo.jpg" alt="Reqspace Logo" className="h-16 w-16 rounded-xl object-cover border border-border shadow-sm mb-3" />
          <h1 className="text-2xl font-bold text-center text-balance">{config?.needsSetup ? 'Create the admin account' : 'Login to Reqspace'}</h1>
        </div>
        
        {error && <div data-testid="login-error" role="alert" className="bg-delete/10 dark:bg-red-950 text-delete p-2 rounded mb-4 text-sm">{error}</div>}

        {config?.needsSetup && (
          <div className="mb-4">
            <label htmlFor="login-name" className="block text-sm font-medium mb-1">Name</label>
            <input
              id="login-name"
              name="name"
              autoComplete="name"
              data-testid="setup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border border-border rounded bg-background text-text focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
              required
            />
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="login-email" className="block text-sm font-medium mb-1">{config?.needsSetup ? 'Email' : 'Username or Email'}</label>
          <input
            id="login-email"
            name="username"
            autoComplete="username"
            spellCheck={false}
            autoFocus
            data-testid="login-email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border border-border rounded bg-background text-text focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="mb-6">
          <label htmlFor="login-password" className="block text-sm font-medium mb-1">Password</label>
          <input
            id="login-password"
            name="password"
            autoComplete={config?.needsSetup ? 'new-password' : 'current-password'}
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-border rounded bg-background text-text focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            required
          />
        </div>

        <button data-testid="login-submit" type="submit" disabled={submitting} className="w-full bg-primary-strong text-white p-2 rounded hover:bg-primary-strong-hover transition mb-4 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">
          {submitting ? (config?.needsSetup ? 'Creating…' : 'Signing in…') : config?.needsSetup ? 'Create admin' : 'Sign In'}
        </button>

        <OAuthButtons config={config} onError={setError} />

        {!config?.needsSetup && config?.allowSelfRegistration !== false && (
          <div className="mt-4 text-center text-sm text-text-muted">
            Don't have an account? <Link to="/register" className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded">Register</Link>
          </div>
        )}
      </form>
    </div>
  );
}
