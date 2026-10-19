import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';
import { useEnvironmentStore } from '../../store/environmentStore';
import { useToastStore } from '../../store/toastStore';
import api from '../../api/axios';

export function SocketSync() {
  const activeWorkspace = useAuthStore(state => state.activeWorkspace);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;

    const socketUrl = window.location.origin;
    // withCredentials is required so the auth cookie reaches the server ג€” it
    // authenticates the socket and authorizes which workspace rooms it may join.
    const socket = io(socketUrl, { path: '/ws', withCredentials: true, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:workspace', activeWorkspace._id);
      // On reconnect after sleep, fetch full tree to be safe
      useCollectionStore.getState().loadWorkspace(activeWorkspace._id);
    });


    socket.on('collection:created', (data) => useCollectionStore.getState().applyCollectionUpserted(data));
    socket.on('collection:updated', (data) => useCollectionStore.getState().applyCollectionUpserted(data));
    socket.on('collection:deleted', (id) => useCollectionStore.getState().applyCollectionDeleted(id));
    socket.on('collection:fork-synced', (data: any) => {
      if (activeWorkspace) useCollectionStore.getState().loadWorkspace(activeWorkspace._id);
      // loadWorkspace only refreshes the top-level collection list — an
      // already-open fork's cached folder/request children wouldn't otherwise
      // pick up a background sync until the user collapses and reopens it.
      if (data?.collectionId) useCollectionStore.getState().refreshCollectionChildren(data.collectionId);
    });
    socket.on('folder:created', (data) => useCollectionStore.getState().applyFolderUpserted(data));
    socket.on('folder:updated', (data) => useCollectionStore.getState().applyFolderUpserted(data));
    socket.on('folder:deleted', (id) => useCollectionStore.getState().applyFolderDeleted(id));
    socket.on('request:created', (data) => useCollectionStore.getState().applyRequestUpserted(data));
    socket.on('request:deleted', (id) => useCollectionStore.getState().applyRequestDeleted(id));
    // The active workspace stopped existing / stopped being ours: refresh the
    // list, move to another workspace and tell the user why.
    const leaveWorkspace = async (workspaceId: string, message: string) => {
      const auth = useAuthStore.getState();
      if (workspaceId !== auth.activeWorkspace?._id) {
        auth.setWorkspaces(auth.workspaces.filter((w) => w._id !== workspaceId));
        return;
      }
      useToastStore.getState().addToast('info', message);
      let list = auth.workspaces.filter((w) => w._id !== workspaceId);
      try { list = (await api.get('/workspaces')).data.filter((w: any) => w._id !== workspaceId); } catch { /* keep local list */ }
      auth.setWorkspaces(list);
      auth.setActiveWorkspace(list.find((w) => w.isPersonal) || list[0] || null);
    };
    socket.on('workspace:deleted', (p: { workspaceId: string; name?: string }) =>
      leaveWorkspace(p.workspaceId, `Workspace "${p.name ?? ''}" was deleted by its owner`));
    socket.on('workspace:access_revoked', (p: { workspaceId: string }) =>
      leaveWorkspace(p.workspaceId, 'You no longer have access to this workspace'));
    socket.on('workspace:role_changed', (p: { workspaceId: string; role: string }) => {
      const auth = useAuthStore.getState();
      const patch = (w: any) => (w._id === p.workspaceId ? { ...w, myRole: p.role } : w);
      auth.setWorkspaces(auth.workspaces.map(patch));
      if (auth.activeWorkspace?._id === p.workspaceId) {
        auth.setActiveWorkspace(patch(auth.activeWorkspace));
        useToastStore.getState().addToast('info', `Your role in this workspace is now ${p.role}`);
      }
    });
    socket.on('workspace:updated', (p: { _id: string; name: string; description?: string; isPublic?: boolean }) => {
      const auth = useAuthStore.getState();
      const patch = (w: any) => (w._id === p._id ? { ...w, name: p.name, description: p.description, isPublic: p.isPublic } : w);
      auth.setWorkspaces(auth.workspaces.map(patch));
      if (auth.activeWorkspace?._id === p._id) auth.setActiveWorkspace(patch(auth.activeWorkspace));
    });
    socket.on('workspace:reordered', (payload) => useCollectionStore.getState().applyWorkspaceReordered(payload));

    socket.on('environment:created', (env) => useEnvironmentStore.getState().applyEnvironmentUpserted(env));
    socket.on('environment:deleted', (id) => useEnvironmentStore.getState().applyEnvironmentDeleted(id));

    socket.on('environment:updated', (updatedEnv: any) => {
      useEnvironmentStore.getState().applyEnvironmentUpserted(updatedEnv);
      const requestStore = useRequestStore.getState();
      const tabExists = requestStore.tabs.some(t => t.tabId === updatedEnv._id);
      if (tabExists) {
         const tab = requestStore.tabs.find(t => t.tabId === updatedEnv._id);
         if (tab && updatedEnv.updatedAt && tab.updatedAt) {
           const remoteTime = new Date(updatedEnv.updatedAt).getTime();
           const localTime = new Date(tab.updatedAt).getTime();
           if (remoteTime > localTime) {
              requestStore.updateTab(updatedEnv._id, { isConflicted: true });
              if (requestStore.activeRequest && requestStore.activeRequest._id === updatedEnv._id) {
                 requestStore.updateActiveRequest({ isConflicted: true });
              }
           }
         }
      }
    });

    
    // For request update, we handle live conflict checking
    socket.on('request:updated', (updatedRequest: any) => {
      // First update the collection store to reflect the new name/method in the sidebar
      useCollectionStore.getState().applyRequestUpserted(updatedRequest);

      // Check if it affects open tabs
      const requestStore = useRequestStore.getState();
      
      const tabExists = requestStore.tabs.some(t => t.tabId === updatedRequest._id);
      if (tabExists) {
         const tab = requestStore.tabs.find(t => t.tabId === updatedRequest._id);
         if (tab && updatedRequest.updatedAt && tab.updatedAt) {
           const remoteTime = new Date(updatedRequest.updatedAt).getTime();
           const localTime = new Date(tab.updatedAt).getTime();
           if (remoteTime > localTime && !tab.isDirty) {
              // No local edits: take the remote version silently (no conflict, no dialog).
              const fresh = {
                name: updatedRequest.name,
                method: updatedRequest.method,
                url: updatedRequest.url,
                params: updatedRequest.params ?? [],
                headers: updatedRequest.headers ?? [],
                auth: updatedRequest.auth,
                body: updatedRequest.body,
                settings: updatedRequest.settings ?? {},
                preRequestScript: updatedRequest.preRequestScript ?? '',
                testScript: updatedRequest.testScript ?? '',
                description: updatedRequest.description,
                updatedAt: updatedRequest.updatedAt,
                isConflicted: false,
                isDirty: false,
              };
              requestStore.updateTab(updatedRequest._id, fresh);
              if (requestStore.activeRequest && requestStore.activeRequest._id === updatedRequest._id) {
                 requestStore.updateActiveRequest(fresh);
              }
           } else if (remoteTime > localTime) {
              // Local edits exist and the server has a newer version: a real conflict.
              // We need to update the tab's state
              requestStore.updateTab(updatedRequest._id, { isConflicted: true });
              
              // If it's the active request, update it too
              if (requestStore.activeRequest && requestStore.activeRequest._id === updatedRequest._id) {
                 requestStore.updateActiveRequest({ isConflicted: true });
              }
           }
         }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeWorkspace]);

  // Window focus listener (if away for hours)
  useEffect(() => {
    const onFocus = () => {
      if (activeWorkspace) {
        useCollectionStore.getState().loadWorkspace(activeWorkspace._id);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeWorkspace]);

  return null;
}
