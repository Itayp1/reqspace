import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [config, setConfig] = useState<any>(null);
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    api.get('/auth/config').then(res => setConfig(res.data)).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/auth/Register to Reqspace', { name, email, password });
      setUser(res.data.user);
      navigate('/');
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  const handleGoogleLogin = () => {
    if (!config?.googleOAuth?.clientId) return;
    const redirectUri = window.location.origin + '/auth/google/callback';
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.googleOAuth.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent`;
    window.location.href = googleAuthUrl;
  };

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} className="bg-background p-8 rounded-lg shadow-md w-96 border border-border">
        <h1 className="text-2xl font-bold mb-6 text-center">Register to Reqspace</h1>
        
        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm">{error}</div>}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border border-border rounded focus:outline-none focus:border-primary"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border border-border rounded focus:outline-none focus:border-primary"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-border rounded focus:outline-none focus:border-primary"
            required
          />
        </div>

        <button type="submit" className="w-full bg-primary text-white p-2 rounded hover:bg-orange-600 transition mb-4">
          Create Account
        </button>

        {config?.googleOAuth?.enabled && (
          <button 
            type="button" 
            onClick={handleGoogleLogin}
            className="w-full bg-white border border-border text-black p-2 rounded hover:bg-gray-50 transition flex items-center justify-center gap-2"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
            Continue with Google
          </button>
        )}

        <div className="mt-4 text-center text-sm text-text-muted">
          Already have an account? <Link to="/login" className="text-primary hover:underline">Log in</Link>
        </div>
      </form>
    </div>
  );
}
