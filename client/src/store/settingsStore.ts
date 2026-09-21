import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
    }),
    { name: 'postman-global-settings' }
  )
);
