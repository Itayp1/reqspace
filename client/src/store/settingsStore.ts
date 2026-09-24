import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

export interface GlobalSettings {
  followRedirects: boolean;
  verifySsl: boolean;
  sendNoCacheHeader: boolean;
  encodeUrl: boolean;
  timeout: number; // ms, 0 = no timeout
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyAuthEnabled: boolean;
  proxyUsername?: string;
  proxyPassword?: string;
  saveHistory: boolean;
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

export const getLocalProxyConfig = () => {
  const settings = useSettingsStore.getState().settings;
  if (!settings.proxyEnabled || !settings.proxyUrl) return undefined;
  return {
    url: settings.proxyUrl,
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
        proxyAuthEnabled: false,
        proxyUsername: '',
        proxyPassword: '',
        saveHistory: true,
        shortcuts: {
          search: 'ctrl+k',
          save: 'ctrl+s',
          send: 'ctrl+enter'
        },
      },
      setSettings: (settings) => set({ settings }),
      updateSettings: (newSettings) => set((state) => {
        const next = { ...state.settings, ...newSettings };
        api.put('/auth/settings', next).catch(console.error);
        return { settings: next };
      }),
    }),
    {
      name: 'reqspace-global-settings',
      partialize: (state) => ({
        settings: { ...state.settings, proxyPassword: '' },
      }),
    }
  )
);
