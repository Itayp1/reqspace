/**
 * Name of the script-readable cookie the server sets next to the httpOnly
 * `token` cookie. It holds no identity or secret, only "a session was issued",
 * so the app can skip every authenticated API call when it is absent.
 * It is a hint: the httpOnly token still authorizes each request.
 */
export const SESSION_FLAG_COOKIE = 'logged_in';

export function hasSessionFlag(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((part) => part.trim().startsWith(`${SESSION_FLAG_COOKIE}=`));
}

/** Drops the flag after a 401 so a stale one cannot trigger more failing calls. */
export function clearSessionFlag(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_FLAG_COOKIE}=; Max-Age=0; path=/`;
}
