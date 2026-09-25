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
  type: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2' | 'inherit';
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apikey?: { key: string; value: string; in: 'header' | 'query' };
  oauth2?: { token: string; clientId?: string; clientSecret?: string; authUrl?: string; accessTokenUrl?: string; scope?: string };
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
  settings?: {
    timeout?: number;
    verifySsl?: boolean;
    followRedirects?: boolean;
  };
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
  isLoading: boolean;

  setActiveRequest: (req: ActiveRequest | null) => void;
  updateActiveRequest: (updates: Partial<ActiveRequest>) => void;
  updateTab: (tabId: string, updates: Partial<ActiveRequest>) => void;
  setActiveResponse: (res: ResponseData | null) => void;
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

export const useRequestStore = create<RequestStore>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      activeRequest: null,
      activeResponse: null,
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
          activeResponse: null,
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

        const updated = { ...state.activeRequest, ...updates, isDirty: true };

        // Only rebuild the tabs array when something the tab bar actually
        // renders changes (name/method, or the dirty flag first flipping on).
        // Otherwise every keystroke in the URL/body/headers/scripts editors
        // would produce a new `tabs` array reference and re-render the whole
        // tab bar (and anything else subscribed to `tabs`) for no visible change.
        const activeTab = state.tabs.find(t => t.tabId === state.activeTabId);
        const tabBarRelevant = !activeTab?.isDirty || 'name' in updates || 'method' in updates;
        const nextTabs = tabBarRelevant
          ? state.tabs.map(t => t.tabId === state.activeTabId ? { ...t, ...updates, isDirty: true } : t)
          : state.tabs;

        return { activeRequest: updated, tabs: nextTabs };
      }),

      setActiveResponse: (activeResponse) => set({ activeResponse }),

      setIsLoading: (isLoading) => set({ isLoading }),

      markSaved: () => set((state) => {
        const nextTabs = state.tabs.map(t => t.tabId === state.activeTabId ? { ...t, isDirty: false } : t);
        return {
          tabs: nextTabs,
          activeRequest: state.activeRequest ? { ...state.activeRequest, isDirty: false } : null,
        };
      }),

      closeTab: (tabId) => {
        const { tabs, activeTabId } = get();
        const nextTabs = tabs.filter(t => t.tabId !== tabId);

        if (activeTabId === tabId) {
          const closingIndex = tabs.findIndex(t => t.tabId === tabId);
          const nextActive = nextTabs[Math.min(closingIndex, nextTabs.length - 1)] || null;
          set({
            tabs: nextTabs,
            activeTabId: nextActive?.tabId || null,
            activeRequest: nextActive,
            activeResponse: null,
          });
        } else {
          set({ tabs: nextTabs });
        }
      },

      selectTab: (tabId) => {
        const { tabs } = get();
        const target = tabs.find(t => t.tabId === tabId);
        if (target) {
          set({
            activeTabId: tabId,
            activeRequest: target,
            activeResponse: null,
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
        if (state && state.activeTabId && state.tabs) {
          state.activeRequest = state.tabs.find(t => t.tabId === state.activeTabId) || null;
        }
      }
    }
  )
);
