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

// Cookie values are credentials. They stay in memory for the tab and are not
// written to localStorage (CR#21). Drop the old persisted jar, which also
// shipped a dummy `sess_default_123` cookie.
try { localStorage.removeItem('reqspace_cookies_v1'); } catch { /* private mode */ }

export const useCookieStore = create<CookieStore>((set, get) => ({
  cookies: [],
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
      set({ cookies: updated, selectedDomain: d });
    } else {
      set({ selectedDomain: d });
    }
  },

  deleteDomain: (domain) => {
    const updated = get().cookies.filter(c => c.domain !== domain);
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
    set({ cookies: updated });
  },

  updateCookie: (id, updates) => {
    const updated = get().cookies.map(c => c.id === id ? { ...c, ...updates } : c);
    set({ cookies: updated });
  },

  deleteCookie: (id) => {
    const updated = get().cookies.filter(c => c.id !== id);
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
