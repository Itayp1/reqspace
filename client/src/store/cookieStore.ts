import { create } from 'zustand';

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
}

const STORAGE_KEY = 'postman_cookies_v1';

const loadSavedCookies = (): CookieItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [
      { id: '1', domain: 'localhost', name: 'session', value: 'sess_default_123', path: '/', httpOnly: false, secure: false }
    ];
  } catch {
    return [];
  }
};

const saveCookies = (cookies: CookieItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cookies));
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

  getCookiesHeaderForUrl: (url) => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const matching = get().cookies.filter(c => hostname === c.domain || hostname.endsWith('.' + c.domain));
      return matching.map(c => `${c.name}=${c.value}`).join('; ');
    } catch {
      return '';
    }
  },
}));
