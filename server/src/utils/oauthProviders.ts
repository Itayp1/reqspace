// OAuth2 / OIDC sign-in providers (Google, GitHub, Microsoft Entra ID).
// Each provider turns an authorization `code` into a verified identity; the
// route layer owns state checking, redirect allowlisting and session creation.

export type OAuthProviderId = 'google' | 'github' | 'microsoft' | 'custom';
export const OAUTH_PROVIDERS: OAuthProviderId[] = ['google', 'github', 'microsoft', 'custom'];

export interface OAuthProviderConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  /** Microsoft only: tenant GUID/domain, or common | organizations | consumers. */
  tenantId?: string;
  /** Custom only: any standard OAuth2 / OIDC authorization-code provider (Keycloak, Okta, Authentik, ...). */
  name?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  scope?: string;
}

export interface OAuthIdentity {
  email: string;
  name?: string;
  avatar?: string;
}

export function isOAuthProvider(id: string): id is OAuthProviderId {
  return (OAUTH_PROVIDERS as string[]).includes(id);
}

/** Config key under `system_config.auth` for a provider. */
export function configKey(id: OAuthProviderId): 'googleOAuth' | 'githubOAuth' | 'microsoftOAuth' | 'customOAuth' {
  return `${id}OAuth` as 'googleOAuth' | 'githubOAuth' | 'microsoftOAuth' | 'customOAuth';
}

/** Tenant is interpolated into a URL path, so it must be a plain identifier. */
export function safeTenant(tenant: string | undefined): string {
  const t = (tenant || '').trim();
  return /^[A-Za-z0-9.-]+$/.test(t) ? t : 'common';
}

async function postForm(url: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  return res.json();
}

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'reqSpace', ...headers } });
  return res.json();
}

/**
 * Exchange the authorization code and return the user's identity, or throw an
 * Error whose message is safe to log (never echoed to the client). Only emails
 * the provider reports as verified are returned, because the caller links
 * sign-ins to existing accounts by email.
 */
export async function fetchIdentity(
  id: OAuthProviderId,
  cfg: OAuthProviderConfig,
  code: string,
  redirectUri: string,
): Promise<OAuthIdentity> {
  if (id === 'google') {
    const token = await postForm('https://oauth2.googleapis.com/token', {
      code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    if (token.error || !token.access_token) throw new Error('token exchange failed');
    const u = await getJson('https://www.googleapis.com/oauth2/v2/userinfo', { Authorization: `Bearer ${token.access_token}` });
    if (!u.email) throw new Error('no email');
    if (u.verified_email === false) throw new Error('email not verified');
    return { email: u.email, name: u.name, avatar: u.picture };
  }

  if (id === 'github') {
    const token = await postForm('https://github.com/login/oauth/access_token', {
      code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri,
    });
    if (token.error || !token.access_token) throw new Error('token exchange failed');
    const auth = { Authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2022-11-28' };
    const [profile, emails] = await Promise.all([
      getJson('https://api.github.com/user', auth),
      getJson('https://api.github.com/user/emails', auth),
    ]);
    // The public profile email is user-editable and unverified; use the
    // primary verified address from the emails API instead.
    const list: any[] = Array.isArray(emails) ? emails : [];
    const primary = list.find((e) => e.primary && e.verified) || list.find((e) => e.verified);
    if (!primary?.email) throw new Error('no verified email');
    return { email: primary.email, name: profile.name || profile.login, avatar: profile.avatar_url };
  }

  if (id === 'custom') {
    // The three URLs are admin-configured, so they are trusted like any other admin setting.
    if (!cfg.tokenUrl || !cfg.userinfoUrl) throw new Error('custom provider is missing tokenUrl/userinfoUrl');
    const token = await postForm(cfg.tokenUrl, {
      code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    if (token.error || !token.access_token) throw new Error('token exchange failed');
    const u = await getJson(cfg.userinfoUrl, { Authorization: `Bearer ${token.access_token}` });
    if (!u.email) throw new Error('no email');
    if (u.email_verified === false) throw new Error('email not verified');
    return { email: u.email, name: u.name || u.preferred_username, avatar: u.picture };
  }

  // Microsoft identity platform (Entra ID, work/school and personal accounts).
  const tenant = safeTenant(cfg.tenantId);
  const token = await postForm(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    code, client_id: cfg.clientId, client_secret: cfg.clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code', scope: 'openid email profile',
  });
  if (token.error || !token.id_token) throw new Error('token exchange failed');
  // The id_token came straight from the token endpoint over TLS, so its claims
  // can be read without re-verifying the signature (OIDC Core 3.1.3.7).
  const claims = JSON.parse(Buffer.from(String(token.id_token).split('.')[1] || '', 'base64url').toString('utf8'));
  if (claims.aud !== cfg.clientId) throw new Error('id_token audience mismatch');
  const email = claims.email || (String(claims.preferred_username || '').includes('@') ? claims.preferred_username : '');
  if (!email) throw new Error('no email');
  return { email, name: claims.name };
}
