import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { switchUserScope, onUserScopeChange, userScopedStorage } from './userScope';

interface User {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  avatar?: string;
  mustChangePassword?: boolean;
  clientCertificates?: any[];
}

export interface Workspace {
  _id: string;
  name: string;
  myRole: string;
  isPublic?: boolean;
  isPersonal?: boolean;
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
      setUser: (user) => {
        switchUserScope(user?.id);
        set({ user, isAuthenticated: !!user });
      },
      setWorkspaces: (workspaces) => set({ workspaces }),
      setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => userScopedStorage),
      partialize: (state) => ({ activeWorkspace: state.activeWorkspace }),
    }
  )
);

onUserScopeChange((prev) => {
  if (prev) useAuthStore.setState({ activeWorkspace: null, workspaces: [] });
  void useAuthStore.persist.rehydrate();
});
