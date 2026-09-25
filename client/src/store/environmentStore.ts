import { create } from 'zustand';

export interface EnvironmentVariable {
  key: string;
  initialValue?: string;
  currentValue?: string;
  value?: string;
  isSecret?: boolean;
  enabled: boolean;
  type?: 'default' | 'secret';
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
  localVariables: EnvironmentVariable[];
  setEnvironments: (envs: Environment[]) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setGlobalEnvironment: (env: Environment | null) => void;
  setLocalVariables: (vars: EnvironmentVariable[]) => void;
  fetchEnvironments: (workspaceId: string) => Promise<void>;
  fetchLocalVariables: (workspaceId: string) => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentStore>((set) => ({
  environments: [],
  activeEnvironmentId: null,
  globalEnvironment: null,
  localVariables: [],
  setEnvironments: (environments) => set({ environments }),
  setActiveEnvironmentId: (activeEnvironmentId) => set({ activeEnvironmentId }),
  setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),
  setLocalVariables: (localVariables) => set({ localVariables }),
  fetchEnvironments: async (workspaceId: string) => {
    try {
      const api = (await import('../api/axios')).default;
      const res = await api.get(`/workspaces/${workspaceId}/environments`);
      const globals = res.data.filter((e: any) => e.isGlobal);
      const locals = res.data.filter((e: any) => !e.isGlobal);
      set({ globalEnvironment: globals.length > 0 ? globals[0] : null, environments: locals });
    } catch(err) {}
  },
  fetchLocalVariables: async (workspaceId: string) => {
    try {
      const api = (await import('../api/axios')).default;
      const res = await api.get(`/local-variables/${workspaceId}`);
      if (res.data && res.data.variables) {
        set({ localVariables: res.data.variables });
      } else {
        set({ localVariables: [] });
      }
    } catch(err) {}
  },
}));
