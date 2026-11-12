// Browser side of the OAuth authorization-code flow: build the provider's
// authorize URL and send the whole window there. The provider redirects back to
// /auth/<provider>/callback, where OAuthCallbackPage completes the sign-in.

export type OAuthProvider = 'google' | 'github' | 'microsoft' | 'custom';

export const OAUTH_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  custom: 'SSO',
};

export const OAUTH_PROVIDERS = Object.keys(OAUTH_LABELS) as OAuthProvider[];

export function oauthRedirectUri(provider: OAuthProvider): string {
  return `${window.location.origin}/auth/${provider}/callback`;
}

export interface OAuthPublicConfig { clientId: string; tenantId?: string; name?: string; authorizeUrl?: string; scope?: string }

function authorizeUrl(provider: OAuthProvider, cfg: OAuthPublicConfig, state: string): string {
  const redirect = encodeURIComponent(oauthRedirectUri(provider));
  const id = encodeURIComponent(cfg.clientId);
  switch (provider) {
    case 'google':
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${id}&redirect_uri=${redirect}&response_type=code&scope=email%20profile&access_type=offline&prompt=consent&state=${state}`;
    case 'github':
      return `https://github.com/login/oauth/authorize?client_id=${id}&redirect_uri=${redirect}&scope=${encodeURIComponent('read:user user:email')}&state=${state}`;
    case 'custom': {
      const base = cfg.authorizeUrl || '';
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}client_id=${id}&redirect_uri=${redirect}&response_type=code&scope=${encodeURIComponent(cfg.scope || 'openid email profile')}&state=${state}`;
    }
    case 'microsoft': {
      const tenant = encodeURIComponent(cfg.tenantId || 'common');
      return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?client_id=${id}&redirect_uri=${redirect}&response_type=code&response_mode=query&scope=${encodeURIComponent('openid email profile')}&state=${state}`;
    }
  }
}

/** Fetches a CSRF state (also set as an httpOnly cookie) and redirects to the provider. */
export async function startOAuth(provider: OAuthProvider, cfg: OAuthPublicConfig): Promise<void> {
  const res = await fetch('/api/auth/state');
  if (!res.ok) throw new Error('Failed to fetch state');
  const { state } = await res.json();
  window.location.href = authorizeUrl(provider, cfg, state);
}
