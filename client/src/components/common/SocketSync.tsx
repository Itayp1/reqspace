import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';
import { useEnvironmentStore } from '../../store/environmentStore';

export function SocketSync() {
  const activeWorkspace = useAuthStore(state => state.activeWorkspace);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;

    const socketUrl = window.location.origin;
    // withCredentials is required so the auth cookie reaches the server — it
    // authenticates the socket and authorizes which workspace rooms it may join.
    const socket = io(socketUrl, { path: '/ws', withCredentials: true, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:workspace', activeWorkspace._id);
      // On reconnect after sleep, fetch full tree to be safe
      useCollectionStore.getState().fetchCollectionsData(activeWorkspace._id);
    });

    const handleUpdate = () => {
      // For simplicity, just fetch the whole tree when anything changes structurally.
      // This ensures we always have the correct folders, requests, orders, etc.
      useCollectionStore.getState().fetchCollectionsData(activeWorkspace._id);
    };

    socket.on('collection:created', (data) => useCollectionStore.getState().applyCollectionUpserted(data));
    socket.on('collection:updated', (data) => useCollectionStore.getState().applyCollectionUpserted(data));
    socket.on('collection:deleted', (id) => useCollectionStore.getState().applyCollectionDeleted(id));
    socket.on('folder:created', (data) => useCollectionStore.getState().applyFolderUpserted(data));
    socket.on('folder:updated', (data) => useCollectionStore.getState().applyFolderUpserted(data));
    socket.on('folder:deleted', (id) => useCollectionStore.getState().applyFolderDeleted(id));
    socket.on('request:created', (data) => useCollectionStore.getState().applyRequestUpserted(data));
    socket.on('request:deleted', (id) => useCollectionStore.getState().applyRequestDeleted(id));
    socket.on('workspace:reordered', (payload) => useCollectionStore.getState().applyWorkspaceReordered(payload));

    const handleEnvUpdate = () => {
      useEnvironmentStore.getState().fetchEnvironments(activeWorkspace._id);
    };
    socket.on('environment:created', handleEnvUpdate);
    socket.on('environment:deleted', handleEnvUpdate);

    socket.on('environment:updated', (updatedEnv: any) => {
      handleEnvUpdate();
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
           if (remoteTime > localTime) {
              // It's a newer version! Mark it conflicted.
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
        useCollectionStore.getState().fetchCollectionsData(activeWorkspace._id);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [activeWorkspace]);

  return null;
}
