import { create } from 'zustand';

export interface EnvironmentVariable {
  key: string;
  initialValue: string;
  currentValue: string;
  isSecret: boolean;
  enabled: boolean;
}

export interface Environment {
  _id: string;
  name: string;
  isGlobal: boolean;
  variables: EnvironmentVariable[];
}

interface EnvironmentStore {
  environments: Environment[];
  activeEnvironmentId: string | null;
  globalEnvironment: Environment | null;
  setEnvironments: (envs: Environment[]) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setGlobalEnvironment: (env: Environment | null) => void;
  fetchEnvironments: (workspaceId: string) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentStore>((set) => ({
  environments: [],
  activeEnvironmentId: null,
  globalEnvironment: null,
  setEnvironments: (environments) => set({ environments }),
  setActiveEnvironmentId: (activeEnvironmentId) => set({ activeEnvironmentId }),
  setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),
  fetchEnvironments: async (workspaceId: string) => {
    try {
      const api = (await import('../api/axios')).default;
      const res = await api.get(`/workspaces/${workspaceId}/environments`);
      const globals = res.data.filter((e: any) => e.isGlobal);
      const locals = res.data.filter((e: any) => !e.isGlobal);
      set({ globalEnvironment: globals.length > 0 ? globals[0] : null, environments: locals });
    } catch(err) {}
  },
}));
