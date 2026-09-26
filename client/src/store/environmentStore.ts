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
  userProfileVariables: EnvironmentVariable[];
  setEnvironments: (envs: Environment[]) => void;
  setActiveEnvironmentId: (id: string | null) => void;
  setGlobalEnvironment: (env: Environment | null) => void;
  setLocalVariables: (vars: EnvironmentVariable[]) => void;
  setUserProfileVariables: (vars: EnvironmentVariable[]) => void;
  fetchUserProfileVariables: () => Promise<void>;
  fetchEnvironments: (workspaceId: string) => Promise<void>;
  fetchLocalVariables: (workspaceId: string) => Promise<void>;
  
  // Socket reducers
  applyEnvironmentUpserted: (env: Environment) => void;
  applyEnvironmentDeleted: (id: string) => void;
}

export const useEnvironmentStore = create<EnvironmentStore>((set) => ({
  environments: [],
  activeEnvironmentId: null,
  globalEnvironment: null,
  localVariables: [],
  userProfileVariables: [],
  setEnvironments: (environments) => set({ environments }),
  setActiveEnvironmentId: (activeEnvironmentId) => set({ activeEnvironmentId }),
  setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),
  setLocalVariables: (localVariables) => set({ localVariables }),
  setUserProfileVariables: (userProfileVariables) => set({ userProfileVariables }),
  
  applyEnvironmentUpserted: (env) => set((state) => {
    if (env.isGlobal) {
      return { globalEnvironment: env };
    }
    const existing = state.environments.find(e => e._id === env._id);
    return existing
      ? { environments: state.environments.map(e => e._id === env._id ? { ...e, ...env } : e) }
      : { environments: [...state.environments, env] };
  }),
  
  applyEnvironmentDeleted: (id) => set((state) => ({
    environments: state.environments.filter(e => e._id !== id),
    globalEnvironment: state.globalEnvironment?._id === id ? null : state.globalEnvironment
  })),

  fetchEnvironments: async (workspaceId: string) => {
    try {
      const api = (await import('../api/axios')).default;
      const res = await api.get(`/workspaces/${workspaceId}/environments`);
      const globals = res.data.filter((e: any) => e.isGlobal);
      const locals = res.data.filter((e: any) => !e.isGlobal);
      set({ globalEnvironment: globals.length > 0 ? globals[0] : null, environments: locals });
    } catch(err) {}
  },
  fetchUserProfileVariables: async () => {
    try {
      const api = (await import('../api/axios')).default;
      const res = await api.get('/user-profile-variables');
      if (res.data && res.data.variables) {
        set({ userProfileVariables: res.data.variables });
      } else {
        set({ userProfileVariables: [] });
      }
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
