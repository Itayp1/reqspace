import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { onUserScopeChange, userScopedStorage } from './userScope';
import api from '../api/axios';
import { useToastStore } from './toastStore';

export interface GlobalSettings {
  followRedirects: boolean;
  verifySsl: boolean;
  sendNoCacheHeader: boolean;
  encodeUrl: boolean;
  timeout: number; // ms, 0 = no timeout
  proxyEnabled: boolean;
  proxyUrl: string;
  noProxy?: string; // comma-separated hosts that bypass the proxy
  proxyAuthEnabled: boolean;
  proxyUsername?: string;
  proxyPassword?: string;
  saveHistory: boolean;
  sendCookies?: boolean; // auto-attach cookies from the Cookie Jar (default true)
  clientCertPath?: string;
  shortcuts: {
    search: string;
    save: string;
    send: string;
  };
}

interface SettingsStore {
  settings: GlobalSettings;
  updateSettings: (settings: Partial<GlobalSettings>) => void;
  setSettings: (settings: GlobalSettings) => void;
}

/** A proxy URL must be absolute http(s)://host[:port] (P3.2). */
export const isValidProxyUrl = (value: string): boolean => {
  try {
    const u = new URL(value.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
};

export const getLocalProxyConfig = () => {
  const settings = useSettingsStore.getState().settings;
  if (!settings.proxyEnabled || !settings.proxyUrl || !isValidProxyUrl(settings.proxyUrl)) return undefined;
  return {
    url: settings.proxyUrl.trim(),
    noProxy: settings.noProxy,
    authEnabled: settings.proxyAuthEnabled,
    username: settings.proxyUsername,
    password: settings.proxyPassword,
  };
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: {
        followRedirects: true,
        verifySsl: true,
        sendNoCacheHeader: false,
        encodeUrl: true,
        timeout: 0,
        proxyEnabled: false,
        proxyUrl: 'http://127.0.0.1:8080',
        noProxy: '',
        proxyAuthEnabled: false,
        proxyUsername: '',
        proxyPassword: '',
        saveHistory: true,
        sendCookies: true,
        shortcuts: {
          search: 'ctrl+k',
          save: 'ctrl+s',
          send: 'ctrl+enter'
        },
      },
      setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
      updateSettings: (newSettings) => set((state) => {
        const next = { ...state.settings, ...newSettings };
        // Timeout is a whole number of ms in 0..1h; the server enforces the same range (P2.2).
        if ('timeout' in newSettings) {
          const t = Math.trunc(Number(next.timeout));
          next.timeout = Number.isFinite(t) ? Math.min(Math.max(t, 0), 3600000) : 0;
        }
        const previous = state.settings;
        api.put('/auth/settings', next).catch((err) => {
          console.error(err);
          // Don't leave the UI looking saved when the server rejected / never got it (P2.4):
          // roll back just the keys this call changed and tell the user.
          const rollback: Record<string, unknown> = {};
          for (const k of Object.keys(newSettings)) rollback[k] = (previous as any)[k];
          useSettingsStore.setState((s) => ({ settings: { ...s.settings, ...rollback } }));
          useToastStore.getState().addToast('error', err?.response?.data?.message || 'Failed to save settings - the change was not saved');
        });
        return { settings: next };
      }),
    }),
    { 
      name: 'reqspace-global-settings',
      storage: createJSONStorage(() => userScopedStorage),
      // Older persisted states lack newer keys (e.g. saveHistory, timeout); a
      // shallow merge would replace the defaults object and leave them undefined.
      merge: (persisted: any, current) => ({
        ...current,
        settings: { ...current.settings, ...(persisted?.settings || {}) },
      }),
      partialize: (state) => {
        const { proxyPassword, ...safeSettings } = state.settings;
        return { settings: safeSettings } as any;
      }
    }
  )
);

onUserScopeChange((prev) => {
  if (prev) useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  void useSettingsStore.persist.rehydrate();
});
