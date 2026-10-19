import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';
import { OAUTH_LABELS, type OAuthProvider } from '../utils/oauth';
import { sessionCookieStored, SESSION_COOKIE_BLOCKED_MESSAGE } from '../utils/sessionCookie';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { provider } = useParams<{ provider: string }>();
  const label = OAUTH_LABELS[provider as OAuthProvider];
  const navigate = useNavigate();
  const setUser = useAuthStore(state => state.setUser);
  const [error, setError] = useState('');
  // An authorization code is single-use: React StrictMode runs effects twice in dev, and a second
  // exchange would be rejected by the provider (or race the first one into creating the user twice).
  const exchanged = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!label) {
      setError('Unknown sign-in provider.');
      return;
    }
    // The provider reports user-denied / failed consent as ?error=…
    if (searchParams.get('error')) {
      setError(searchParams.get('error_description') || searchParams.get('error') || 'Authentication failed');
      return;
    }
    if (!code || !state) {
      setError('Missing authorization code or state.');
      return;
    }

    if (exchanged.current) return;
    exchanged.current = true;

    const redirectUri = window.location.origin + window.location.pathname; // /auth/<provider>/callback

    api.post(`/auth/${provider}`, { code, redirectUri, state })
      .then(async res => {
        if (!(await sessionCookieStored())) {
          setError(SESSION_COOKIE_BLOCKED_MESSAGE);
          return;
        }
        setUser(res.data.user);
        navigate('/');
      })
      .catch(err => {
        console.error(err);
        setError(err.response?.data?.message || 'Authentication failed');
      });
  }, [searchParams, navigate, setUser, provider, label]);

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
        <span>Authenticating with {label}...</span>
      </div>
    </div>
  );
}
