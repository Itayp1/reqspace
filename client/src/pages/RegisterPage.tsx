import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { apiErrorMessage } from '../utils/apiError';
import { useAuthStore } from '../store/authStore';
import OAuthButtons from '../components/common/OAuthButtons';

export default function RegisterPage() {
  const [name, setName] = useState('');
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
    if (submitting) return;
    // noValidate on the form: browser bubbles use the browser language (QA-54)
    if (!name.trim() || !email.trim() || !password) {
      setError('Enter a name, an email and a password.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/register', { name, email, password });
      setUser(res.data.user);
      navigate('/');
      window.location.reload();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Registration failed'));
      setSubmitting(false);
    }
  };

  if (config && config.allowSelfRegistration === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="bg-background p-8 rounded-lg shadow-md w-96 border border-border text-center">
          <div className="flex flex-col items-center mb-6">
            <img src="/reqspace-logo.jpg" alt="Reqspace Logo" className="h-16 w-16 rounded-xl object-cover border border-border shadow-sm mb-3" />
            <h1 className="text-2xl font-bold text-center text-balance">Registration Disabled</h1>
          </div>
          <p className="text-text-muted mb-6">New user registration is currently disabled by the administrator. Please contact them to create an account.</p>
          <Link to="/login" className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded">Back to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} noValidate className="bg-background p-8 rounded-lg shadow-md w-96 border border-border">
        <div className="flex flex-col items-center mb-6">
          <img src="/reqspace-logo.jpg" alt="Reqspace Logo" className="h-16 w-16 rounded-xl object-cover border border-border shadow-sm mb-3" />
          <h1 className="text-2xl font-bold text-center text-balance">Register to Reqspace</h1>
        </div>
        
        {error && <div data-testid="register-error" role="alert" className="bg-delete/10 dark:bg-red-950 text-delete p-2 rounded mb-4 text-sm">{error}</div>}

        <div className="mb-4">
          <label htmlFor="register-name" className="block text-sm font-medium mb-1">Name</label>
          <input
            id="register-name"
            name="name"
            autoComplete="name"
            autoFocus
            data-testid="register-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border border-border rounded bg-background text-text focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="register-email" className="block text-sm font-medium mb-1">Email</label>
          <input
            id="register-email"
            name="email"
            autoComplete="email"
            spellCheck={false}
            data-testid="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border border-border rounded bg-background text-text focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="register-password" className="block text-sm font-medium">Password</label>
            <span id="register-password-hint" className="text-xs text-text-muted">At least 8 characters.</span>
          </div>
          <input
            id="register-password"
            name="password"
            autoComplete="new-password"
            aria-describedby="register-password-hint"
            data-testid="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-border rounded bg-background text-text focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            required
          />
        </div>

        <button data-testid="register-submit" type="submit" disabled={submitting} className="w-full bg-primary-strong text-white p-2 rounded hover:bg-primary-strong-hover transition mb-4 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">
          {submitting ? 'Creating account…' : 'Create Account'}
        </button>

        <OAuthButtons config={config} onError={setError} />

        <div className="mt-4 text-center text-sm text-text-muted">
          Already have an account? <Link to="/login" className="text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded">Log in</Link>
        </div>
      </form>
    </div>
  );
}
