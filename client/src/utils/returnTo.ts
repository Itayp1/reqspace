// Where to send the user after signing in: only invite links need it (they open while signed out).
const KEY = 'returnTo';
export const rememberReturnTo = (path: string) => { if (/^\/invite\/[\w-]+$/.test(path)) sessionStorage.setItem(KEY, path); };
export function takeReturnTo(): string {
  const path = sessionStorage.getItem(KEY) || '/';
  sessionStorage.removeItem(KEY);
  return path;
}
