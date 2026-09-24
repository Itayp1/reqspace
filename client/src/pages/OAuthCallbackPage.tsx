import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore(state => state.setUser);
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('No authorization code provided.');
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname; // Should be /auth/google/callback

    api.post('/auth/google', { code, redirectUri, state: searchParams.get('state') })
      .then(res => {
        setUser(res.data.user);
        navigate('/');
      })
      .catch(err => {
        console.error(err);
        setError(err.response?.data?.message || 'Authentication failed');
      });
  }, [searchParams, navigate, setUser]);

  if (error) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-surface gap-4">
        <div className="text-red-500 font-bold text-xl">OAuth Error</div>
        <div className="text-text">{error}</div>
        <button onClick={() => navigate('/login')} className="px-4 py-2 bg-primary text-white rounded mt-4 hover:bg-orange-600 transition">Back to Login</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4 text-text-muted">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        <span>Authenticating with Google...</span>
      </div>
    </div>
  );
}
