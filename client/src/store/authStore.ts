import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  avatar?: string;
  mustChangePassword?: boolean;
}

export interface Workspace {
  _id: string;
  name: string;
  myRole: string;
  isPublic?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  setUser: (user: User | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspace: (workspace: Workspace | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      activeWorkspace: null,
      workspaces: [],
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setWorkspaces: (workspaces) => set({ workspaces }),
      setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ activeWorkspace: state.activeWorkspace }),
    }
  )
);
