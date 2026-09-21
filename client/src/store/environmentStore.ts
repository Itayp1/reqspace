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
}

export const useEnvironmentStore = create<EnvironmentStore>((set) => ({
  environments: [],
  activeEnvironmentId: null,
  globalEnvironment: null,
  setEnvironments: (environments) => set({ environments }),
  setActiveEnvironmentId: (activeEnvironmentId) => set({ activeEnvironmentId }),
  setGlobalEnvironment: (globalEnvironment) => set({ globalEnvironment }),
}));
