import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface KeyValueItem {
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
  type?: 'text' | 'file';
  file?: File;
}

export interface RequestBody {
  mode: 'none' | 'raw' | 'form-data' | 'urlencoded' | 'binary' | 'graphql';
  raw?: string;
  rawLanguage?: 'json' | 'text' | 'xml' | 'html' | 'javascript';
  formData?: KeyValueItem[];
  urlencoded?: KeyValueItem[];
  graphql?: { query: string; variables: string };
}

export interface RequestAuth {
  type: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2' | 'ntlm' | 'inherit';
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apikey?: { key: string; value: string; in: 'header' | 'query' };
  oauth2?: { token: string; clientId?: string; clientSecret?: string; authUrl?: string; accessTokenUrl?: string; scope?: string };
  ntlm?: { username?: string; password?: string; domain?: string; workstation?: string };
}

export interface ActiveRequest {
  _id?: string;
  tabId?: string; // unique tab identifier
  tabType?: 'request' | 'environment' | 'connection';
  environmentId?: string; // If tabType is 'environment', holds the ID or 'global'
  collectionId?: string;
  folderId?: string | null;
  name: string;
  method: string;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: RequestAuth;
  body: RequestBody;
  preRequestScript?: string;
  testScript?: string;
  comments?: any[];
  isConflicted?: boolean;
  updatedAt?: number;
  isDirty?: boolean;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  isBase64?: boolean;
  responseTime: number;
  size: number;
  testResults?: Array<{ name: string; passed: boolean; error?: string }>;
  visualizerData?: { template: string; data?: any };
}

interface RequestStore {
  tabs: ActiveRequest[];
  activeTabId: string | null;
  activeRequest: ActiveRequest | null;
  activeResponse: ResponseData | null;
  // Responses keyed by tabId, not persisted (can be large/sensitive) — lets a
  // request finish and be visible even if the user switched away from its
  // tab before it completed. `activeResponse` mirrors the active tab's entry
  // here for existing readers (ResponseViewer etc).
  responsesByTab: Record<string, ResponseData | null>;
  isLoading: boolean;

  setActiveRequest: (req: ActiveRequest | null) => void;
  updateActiveRequest: (updates: Partial<ActiveRequest>) => void;
  updateTab: (tabId: string, updates: Partial<ActiveRequest>) => void;
  setActiveResponse: (res: ResponseData | null) => void;
  setResponseForTab: (tabId: string, res: ResponseData | null) => void;
  setIsLoading: (loading: boolean) => void;
  markSaved: () => void;
  
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  newTab: () => void;
  openEnvironmentTab: (envId: string, name: string) => void;
  closeEnvironmentTab: (envId: string) => void;
  closeAllToRight: (tabId: string) => void;
  closeAllToLeft: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  reorderTabs: (draggedId: string, targetId: string, pos: 'before'|'after') => void;
  newConnectionTab: () => void;
  undo: () => void;
  redo: () => void;
}

const historyMap: Record<string, { undo: ActiveRequest[], redo: ActiveRequest[], lastPush: number }> = {};

// SEC-4: never let credentials sit in localStorage. Auth secrets (bearer
// token, basic password, apikey value, oauth2 secrets) and
// sensitive header values are stripped before every persist — only the auth
// TYPE survives, so the tab reopens on the right auth tab with fields empty.
const SENSITIVE_HEADER_KEYS = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token)$/i;

function stripSecrets(tab: ActiveRequest): ActiveRequest {
  return {
    ...tab,
    auth: tab.auth ? { type: tab.auth.type } : tab.auth,
    headers: (tab.headers ?? []).map(h =>
      SENSITIVE_HEADER_KEYS.test(h.key) ? { ...h, value: '' } : h
    ),
  };
}


// Secrets of tabs that are currently open live in sessionStorage, not
// localStorage: they survive a refresh, but vanish when the browser tab/window
// is closed, and entries for tabs that are no longer open are pruned on every
// write — so nothing outlives the open tabs.
const OPEN_TABS_SECRETS_KEY = 'open-tabs-secrets';

interface TabSecrets { auth?: RequestAuth; headers?: { key: string; value: string }[] }

function readOpenTabsSecrets(): Record<string, TabSecrets> {
  try {
    return JSON.parse(sessionStorage.getItem(OPEN_TABS_SECRETS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeOpenTabsSecrets(tabs: ActiveRequest[]) {
  try {
    const out: Record<string, TabSecrets> = {};
    for (const t of tabs) {
      if (!t.tabId) continue;
      const hasAuth = t.auth && t.auth.type !== 'none' && t.auth.type !== 'inherit';
      const sensitive = (t.headers ?? []).some(h => SENSITIVE_HEADER_KEYS.test(h.key) && h.value);
      if (!hasAuth && !sensitive) continue;
      out[t.tabId] = {
        auth: t.auth,
        headers: (t.headers ?? []).map(h => ({ key: h.key, value: SENSITIVE_HEADER_KEYS.test(h.key) ? h.value : '' })),
      };
    }
    if (Object.keys(out).length === 0) sessionStorage.removeItem(OPEN_TABS_SECRETS_KEY);
    else sessionStorage.setItem(OPEN_TABS_SECRETS_KEY, JSON.stringify(out));
  } catch {
    // sessionStorage unavailable (private mode / quota) — secrets just won't survive a refresh
  }
}

function restoreSecrets(tab: ActiveRequest, saved?: TabSecrets): ActiveRequest {
  if (!saved) return tab;
  return {
    ...tab,
    auth: saved.auth ?? tab.auth,
    headers: (tab.headers ?? []).map((h, i) => {
      const s = saved.headers?.[i];
      return s && s.key === h.key && !h.value && SENSITIVE_HEADER_KEYS.test(h.key) ? { ...h, value: s.value } : h;
    }),
  };
}

export const useRequestStore = create<RequestStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      activeRequest: null,
      activeResponse: null,
      responsesByTab: {},
      isLoading: false,

            reorderTabs: (draggedId, targetId, pos) => set((state) => {
        const tabs = [...state.tabs];
        const draggedIdx = tabs.findIndex(t => t.tabId === draggedId);
        if (draggedIdx === -1) return state;
        const [draggedTab] = tabs.splice(draggedIdx, 1);
        
        const targetIdx = tabs.findIndex(t => t.tabId === targetId);
        if (targetIdx === -1) {
          tabs.push(draggedTab);
          return { tabs };
        }
        
        const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
        tabs.splice(insertIdx, 0, draggedTab);
        return { tabs };
      }),

      undo: () => set((state) => {
        if (!state.activeTabId || !state.activeRequest) return state;
        const hist = historyMap[state.activeTabId];
        if (!hist || hist.undo.length === 0) return state;

        const prev = hist.undo.pop()!;
        hist.redo.push(state.activeRequest);
        
        const nextTabs = state.tabs.map(t => t.tabId === state.activeTabId ? prev : t);
        return { activeRequest: prev, tabs: nextTabs };
      }),

      redo: () => set((state) => {
        if (!state.activeTabId || !state.activeRequest) return state;
        const hist = historyMap[state.activeTabId];
        if (!hist || hist.redo.length === 0) return state;

        const next = hist.redo.pop()!;
        hist.undo.push(state.activeRequest);
        
        const nextTabs = state.tabs.map(t => t.tabId === state.activeTabId ? next : t);
        return { activeRequest: next, tabs: nextTabs };
      }),

      setActiveRequest: (activeRequest) => {
        if (!activeRequest) {
          set({ activeRequest: null, activeResponse: null });
          return;
        }

        const tabId = activeRequest.tabId || activeRequest._id || Math.random().toString(36).substring(2, 9);
        const reqWithTabId = { ...activeRequest, tabId, isDirty: false };

        if (!historyMap[tabId]) {
          historyMap[tabId] = { undo: [], redo: [], lastPush: Date.now() };
        }

        const { tabs } = get();
        const existingIndex = tabs.findIndex(t => (t._id && t._id === reqWithTabId._id) || t.tabId === tabId);

        let nextTabs: ActiveRequest[];
        if (existingIndex >= 0) {
          nextTabs = tabs.map((t, idx) => idx === existingIndex ? { ...reqWithTabId, isDirty: !!t.isDirty } : t);
          reqWithTabId.isDirty = !!nextTabs[existingIndex].isDirty;
        } else {
          nextTabs = [...tabs, reqWithTabId];
        }

        set({
          tabs: nextTabs,
          activeTabId: tabId,
          activeRequest: reqWithTabId,
          activeResponse: get().responsesByTab[tabId] || null,
        });
      },

      updateTab: (tabId, updates) => set((state) => {
        const tabs = state.tabs.map(t => t.tabId === tabId ? { ...t, ...updates } : t);
        return { tabs };
      }),
      updateActiveRequest: (updates) => set((state) => {
        if (!state.activeRequest || !state.activeTabId) return state;
        
        const hist = historyMap[state.activeTabId];
        if (hist) {
          const now = Date.now();
          if (now - hist.lastPush > 500) {
            hist.undo.push({ ...state.activeRequest });
            hist.redo = []; // clear redo
            if (hist.undo.length > 50) hist.undo.shift(); // Max 50 history steps
          }
          hist.lastPush = now;
        }

        // Sync metadata (conflict flag, server timestamp) is not a user edit —
        // a socket echo of our own save used to re-mark the tab dirty.
        const isMetaOnly = Object.keys(updates).every(k => k === 'isConflicted' || k === 'updatedAt' || k === 'isDirty');
        const isDirtyValue = updates.isDirty !== undefined ? updates.isDirty : (isMetaOnly ? !!state.activeRequest.isDirty : true);
        const updated = { ...state.activeRequest, ...updates, isDirty: isDirtyValue };

        const nextTabs = state.tabs.map(t => t.tabId === state.activeTabId ? { ...t, ...updates, isDirty: isDirtyValue } : t);

        return { activeRequest: updated, tabs: nextTabs };
      }),

      setActiveResponse: (activeResponse) => set({ activeResponse }),

      // Stores the response under its own tab regardless of what's currently
      // selected — a request kicked off from tab A must still land correctly
      // if the user has switched to tab B by the time it resolves — and only
      // mirrors it into `activeResponse` when that tab is still the active one.
      setResponseForTab: (tabId, res) => set((state) => ({
        responsesByTab: { ...state.responsesByTab, [tabId]: res },
        activeResponse: state.activeTabId === tabId ? res : state.activeResponse,
      })),

      setIsLoading: (isLoading) => set({ isLoading }),

      markSaved: () => set((state) => {
        const nextTabs = state.tabs.map(t => t.tabId === state.activeTabId ? { ...t, isDirty: false } : t);
        return {
          tabs: nextTabs,
          activeRequest: state.activeRequest ? { ...state.activeRequest, isDirty: false } : null,
        };
      }),

      closeTab: (tabId) => {
        const { tabs, activeTabId, responsesByTab } = get();
        const nextTabs = tabs.filter(t => t.tabId !== tabId);
        const nextResponses = { ...responsesByTab };
        delete nextResponses[tabId];

        if (activeTabId === tabId) {
          const closingIndex = tabs.findIndex(t => t.tabId === tabId);
          const nextActive = nextTabs[Math.min(closingIndex, nextTabs.length - 1)] || null;
          set({
            tabs: nextTabs,
            activeTabId: nextActive?.tabId || null,
            activeRequest: nextActive,
            activeResponse: (nextActive?.tabId && nextResponses[nextActive.tabId]) || null,
            responsesByTab: nextResponses,
          });
        } else {
          set({ tabs: nextTabs, responsesByTab: nextResponses });
        }
      },

      selectTab: (tabId) => {
        const { tabs, responsesByTab } = get();
        const target = tabs.find(t => t.tabId === tabId);
        if (target) {
          set({
            activeTabId: tabId,
            activeRequest: target,
            activeResponse: responsesByTab[tabId] || null,
          });
        }
      },

      newTab: () => {
        const newReq: ActiveRequest = {
          tabId: Math.random().toString(36).substring(2, 9),
          tabType: 'request',
          name: 'New Request',
          method: 'GET',
          url: '',
          params: [],
          headers: [],
          auth: { type: 'none' },
          body: { mode: 'none' },
          isDirty: false,
        };
        get().setActiveRequest(newReq);
      },

      newConnectionTab: () => {
        const newReq: ActiveRequest = {
          tabId: Math.random().toString(36).substring(2, 9),
          tabType: 'connection',
          name: 'New Connection',
          method: 'WS', // Protocol placeholder
          url: '',
          params: [],
          headers: [],
          auth: { type: 'none' },
          body: { mode: 'none' },
          isDirty: false,
        };
        get().setActiveRequest(newReq);
      },

      closeEnvironmentTab: (envId) => {
        const { tabs } = get();
        const tab = tabs.find(t => t.tabType === 'environment' && t.environmentId === envId);
        if (tab) get().closeTab(tab.tabId!);
      },

      openEnvironmentTab: (envId, name) => {
        const { tabs } = get();
        const existingTab = tabs.find(t => t.tabType === 'environment' && t.environmentId === envId);
        if (existingTab) {
          get().selectTab(existingTab.tabId!);
          return;
        }

        const newReq: ActiveRequest = {
          tabId: Math.random().toString(36).substring(2, 9),
          tabType: 'environment',
          environmentId: envId,
          name: name,
          method: '',
          url: '',
          params: [],
          headers: [],
          auth: { type: 'none' },
          body: { mode: 'none' },
          isDirty: false,
        };
        get().setActiveRequest(newReq);
      },

      closeAllToRight: (tabId) => {
        const { tabs, activeTabId } = get();
        const index = tabs.findIndex(t => t.tabId === tabId);
        if (index === -1) return;
        const nextTabs = tabs.slice(0, index + 1);
        const nextActive = nextTabs.find(t => t.tabId === activeTabId) ? activeTabId : nextTabs[nextTabs.length - 1]?.tabId || null;
        set({ tabs: nextTabs, activeTabId: nextActive, activeRequest: nextTabs.find(t => t.tabId === nextActive) || null });
      },

      closeAllToLeft: (tabId) => {
        const { tabs, activeTabId } = get();
        const index = tabs.findIndex(t => t.tabId === tabId);
        if (index === -1) return;
        const nextTabs = tabs.slice(index);
        const nextActive = nextTabs.find(t => t.tabId === activeTabId) ? activeTabId : nextTabs[0]?.tabId || null;
        set({ tabs: nextTabs, activeTabId: nextActive, activeRequest: nextTabs.find(t => t.tabId === nextActive) || null });
      },

      closeOtherTabs: (tabId) => {
        const { tabs } = get();
        const nextTabs = tabs.filter(t => t.tabId === tabId);
        set({ tabs: nextTabs, activeTabId: tabId, activeRequest: nextTabs[0] || null });
      },
    }),
    {
      name: 'request-storage',
      version: 1,
      // Wipes secrets already sitting in existing users' browsers from before
      // this fix, not just new writes going forward.
      migrate: (persisted: any) => ({
        ...persisted,
        tabs: (persisted?.tabs ?? []).map(stripSecrets),
      }),
      partialize: (state) => ({ tabs: state.tabs.map(stripSecrets), activeTabId: state.activeTabId }),
      onRehydrateStorage: () => (state) => {
        if (state && state.tabs) {
          const saved = readOpenTabsSecrets();
          state.tabs = state.tabs.map(t => restoreSecrets(t, t.tabId ? saved[t.tabId] : undefined));
          writeOpenTabsSecrets(state.tabs);
        }
        if (state && state.activeTabId && state.tabs) {
          state.activeRequest = state.tabs.find(t => t.tabId === state.activeTabId) || null;
        }
      }
    }
  )
);

let lastSecretTabs: ActiveRequest[] | null = null;
useRequestStore.subscribe((state) => {
  if (state.tabs === lastSecretTabs) return;
  lastSecretTabs = state.tabs;
  writeOpenTabsSecrets(state.tabs);
});
