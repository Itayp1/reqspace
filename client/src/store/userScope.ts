import type { StateStorage } from 'zustand/middleware';

// Browser storage is shared by everyone using this browser profile, so every
// per-user cache (open tabs, settings, cookie jar, IndexedDB) is keyed by the
// id of the logged-in user. The id is remembered in localStorage so the stores
// can hydrate synchronously on page load, before /auth/me answers.
const SCOPE_KEY = 'reqspace-active-user';

// Keys written before per-user scoping existed. They belong to an unknown
// user, so they are dropped instead of being handed to whoever logs in next.
const LEGACY_KEYS = ['auth-storage', 'request-storage', 'reqspace-global-settings', 'reqspace_cookies_v1'];

function readScope(): string | null {
  try {
    return localStorage.getItem(SCOPE_KEY);
  } catch {
    return null;
  }
}

let currentScope: string | null = readScope();
// While stores are being reset for a new user, their persist middleware must not
// write the emptied state over that user's saved data.
let writesSuspended = false;

try {
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  sessionStorage.removeItem('open-tabs-secrets');
} catch {
  // storage unavailable — nothing to clean
}

type Listener = (prev: string | null, next: string) => void;
const listeners: Listener[] = [];

// IndexedDB mirrors server data per workspace; drop it whenever the user
// changes so it is refilled from the server under the new account.
onUserScopeChange(() => {
  void import('../db').then(({ db }) => Promise.all(db.tables.map((t) => t.clear()))).catch(() => {});
});

export function getUserScope(): string | null {
  return currentScope;
}

export function scopedKey(base: string): string | null {
  return currentScope ? `${base}:${currentScope}` : null;
}

export function onUserScopeChange(fn: Listener) {
  listeners.push(fn);
}

// Called on every setUser. A null user (logout / expired session) keeps the
// scope: the data stays on disk under the old user's key, unreachable to anyone
// else, and returns when that same user signs in again.
export function switchUserScope(userId: string | null | undefined) {
  if (!userId || userId === currentScope) return;
  const prev = currentScope;
  currentScope = userId;
  try {
    localStorage.setItem(SCOPE_KEY, userId);
  } catch {
    // ignore
  }
  writesSuspended = true;
  try {
    for (const fn of listeners) {
      try {
        fn(prev, userId);
      } catch (e) {
        console.error('user scope listener failed', e);
      }
    }
  } finally {
    writesSuspended = false;
  }
}

// zustand `persist` storage whose key follows the current user. With no known
// user nothing is read or written, so anonymous state never lands on disk.
export const userScopedStorage: StateStorage = {
  getItem: (name) => {
    const key = scopedKey(name);
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    const key = scopedKey(name);
    if (!key || writesSuspended) return;
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('Failed to persist', name, e);
    }
  },
  removeItem: (name) => {
    const key = scopedKey(name);
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
