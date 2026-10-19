import { create } from 'zustand';
import { onUserScopeChange, scopedKey } from './userScope';

export interface CookieItem {
  id: string;
  domain: string;
  name: string;
  value: string;
  path: string;
  expires?: string;
  httpOnly: boolean;
  secure: boolean;
}

interface CookieStore {
  cookies: CookieItem[];
  selectedDomain: string | null;
  setSelectedDomain: (domain: string | null) => void;
  addDomain: (domain: string) => void;
  deleteDomain: (domain: string) => void;
  addCookie: (cookie: Omit<CookieItem, 'id'>) => void;
  updateCookie: (id: string, updates: Partial<CookieItem>) => void;
  deleteCookie: (id: string) => void;
  getCookiesForDomain: (domain: string) => CookieItem[];
  getCookiesHeaderForUrl: (url: string) => string;
  deleteAllCookies: () => void;
  storeSetCookies: (url: string, setCookie: string | string[] | undefined) => void;
}

/** RFC 6265 path-match: the cookie path must be a prefix on a segment boundary. */
export function cookiePathMatches(cookiePath: string | undefined, requestPath: string): boolean {
  const cp = cookiePath || '/';
  if (cp === '/') return true;
  const rp = requestPath || '/';
  if (rp === cp) return true;
  if (!rp.startsWith(cp)) return false;
  return cp.endsWith('/') || rp.charAt(cp.length) === '/';
}

export function isCookieExpired(expires: string | undefined, now = Date.now()): boolean {
  if (!expires) return false;
  const t = new Date(expires).getTime();
  return !Number.isNaN(t) && t <= now;
}

const STORAGE_KEY = 'reqspace_cookies_v1';

const loadSavedCookies = (): CookieItem[] => {
  try {
    const key = scopedKey(STORAGE_KEY);
    const raw = key ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveCookies = (cookies: CookieItem[]) => {
  try {
    const key = scopedKey(STORAGE_KEY);
    if (key) localStorage.setItem(key, JSON.stringify(cookies));
  } catch (e) {
    console.error('Failed to save cookies:', e);
  }
};

export const useCookieStore = create<CookieStore>((set, get) => ({
  cookies: loadSavedCookies(),
  selectedDomain: 'localhost',

  setSelectedDomain: (domain) => set({ selectedDomain: domain }),

  addDomain: (domain) => {
    const d = domain.trim().toLowerCase();
    if (!d) return;
    const { cookies } = get();
    if (!cookies.some(c => c.domain === d)) {
      const newCookie: CookieItem = {
        id: Date.now().toString(),
        domain: d,
        name: 'cookie_name',
        value: 'cookie_value',
        path: '/',
        httpOnly: false,
        secure: false,
      };
      const updated = [...cookies, newCookie];
      saveCookies(updated);
      set({ cookies: updated, selectedDomain: d });
    } else {
      set({ selectedDomain: d });
    }
  },

  deleteDomain: (domain) => {
    const updated = get().cookies.filter(c => c.domain !== domain);
    saveCookies(updated);
    const remainingDomains = Array.from(new Set(updated.map(c => c.domain)));
    set({
      cookies: updated,
      selectedDomain: remainingDomains[0] || null,
    });
  },

  addCookie: (cookieData) => {
    const newCookie: CookieItem = {
      ...cookieData,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
    };
    const updated = [...get().cookies, newCookie];
    saveCookies(updated);
    set({ cookies: updated });
  },

  updateCookie: (id, updates) => {
    const updated = get().cookies.map(c => c.id === id ? { ...c, ...updates } : c);
    saveCookies(updated);
    set({ cookies: updated });
  },

  deleteCookie: (id) => {
    const updated = get().cookies.filter(c => c.id !== id);
    saveCookies(updated);
    set({ cookies: updated });
  },

  getCookiesForDomain: (domain) => {
    const target = domain.toLowerCase();
    return get().cookies.filter(c => target.endsWith(c.domain) || c.domain.endsWith(target));
  },

  deleteAllCookies: () => {
    saveCookies([]);
    set({ cookies: [], selectedDomain: null });
  },

  // Ingest Set-Cookie response headers into the jar (only visible when the
  // transport exposes them: extension/desktop, never a plain browser fetch).
  storeSetCookies: (url, setCookie) => {
    if (!setCookie) return;
    let host: string;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return; }
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    let cookies = get().cookies;
    for (const raw of list) {
      const parts = raw.split(';').map(p => p.trim());
      const eq = parts[0].indexOf('=');
      if (eq <= 0) continue;
      const name = parts[0].slice(0, eq);
      const value = parts[0].slice(eq + 1);
      let domain = host, path = '/', expires: string | undefined, httpOnly = false, secure = false, remove = false;
      for (const attr of parts.slice(1)) {
        const [k, ...v] = attr.split('=');
        const key = k.toLowerCase();
        const val = v.join('=');
        if (key === 'domain' && val) domain = val.replace(/^\./, '').toLowerCase();
        else if (key === 'path' && val) path = val;
        else if (key === 'expires') { if (expires === undefined) expires = new Date(val).toISOString(); }
        else if (key === 'max-age') {
          const secs = parseInt(val, 10);
          if (!Number.isNaN(secs)) { if (secs <= 0) remove = true; else expires = new Date(Date.now() + secs * 1000).toISOString(); }
        }
        else if (key === 'httponly') httpOnly = true;
        else if (key === 'secure') secure = true;
      }
      if (isCookieExpired(expires)) remove = true;
      cookies = cookies.filter(c => !(c.name === name && c.domain === domain && c.path === path));
      if (!remove) {
        cookies = [...cookies, { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), domain, name, value, path, expires, httpOnly, secure }];
      }
    }
    saveCookies(cookies);
    set({ cookies });
  },

  getCookiesHeaderForUrl: (url) => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const matching = get().cookies.filter(c =>
        (hostname === c.domain || hostname.endsWith('.' + c.domain))
        && cookiePathMatches(c.path, parsed.pathname)
        && !(c.secure && parsed.protocol !== 'https:')
        && !isCookieExpired(c.expires));
      return matching.map(c => `${c.name}=${c.value}`).join('; ');
    } catch {
      return '';
    }
  },
}));

onUserScopeChange(() => {
  useCookieStore.setState({ cookies: loadSavedCookies(), selectedDomain: 'localhost' });
});
