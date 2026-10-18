import api from '../api/axios';

export const SESSION_COOKIE_BLOCKED_MESSAGE =
  'You signed in, but the browser did not keep the session cookie, so the app cannot load your data. ' +
  'If this site is served over plain HTTP, the server must run with COOKIE_SECURE=false (or the site must use HTTPS).';

/** After a successful sign-in the session cookie must come back on the next request; false means the browser dropped it. */
export async function sessionCookieStored(): Promise<boolean> {
  try {
    await api.get('/auth/me');
    return true;
  } catch (err: any) {
    return err?.response?.status !== 401;
  }
}
