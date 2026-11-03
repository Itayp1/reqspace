import { useAuthStore } from '../store/authStore';
import { clearSessionFlag } from './sessionFlag';

export interface SessionLocation {
  pathname: string;
  assign: (url: string) => void;
}

/**
 * Production reads `window.location`. Tests replace `get` because jsdom's
 * `Location.assign` is non-configurable and does not navigate.
 */
export const sessionLocation = {
  get(): SessionLocation {
    return window.location;
  },
};

export function isAuthPath(pathname: string): boolean {
  return pathname.startsWith('/login')
    || pathname.startsWith('/register')
    || pathname.startsWith('/auth/')
    // Share links are public: their anonymous /auth/me 401 must not bounce recipients to login.
    || pathname.startsWith('/share/');
}

/**
 * Drop the signed-in user and leave for /login.
 * The path is captured before the store update so a render caused by clearing
 * the user cannot make an in-app 401 look like it already happened on /login.
 * Login, register, and OAuth callback pages are left in place so a 401 there
 * does not reload them in a loop.
 */
export function handleUnauthorizedSession(): void {
  const { pathname, assign } = sessionLocation.get();
  clearSessionFlag();
  try {
    useAuthStore.getState().setUser(null);
  } finally {
    if (!isAuthPath(pathname)) assign('/login');
  }
}

export function installUnauthorizedSessionListener(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('unauthorized', handleUnauthorizedSession);
}
