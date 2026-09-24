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

    const socketUrl = (import.meta as any).env?.VITE_SOCKET_URL || window.location.origin;
    // withCredentials is required so the auth cookie reaches the server — it
    // authenticates the socket and authorizes which workspace rooms it may join.
    const socket = io(socketUrl, { path: '/ws', withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:workspace', activeWorkspace._id);
      // On reconnect after sleep, fetch full tree to be safe
      useCollectionStore.getState().fetchCollectionsData(activeWorkspace._id);
    });

    const store = () => useCollectionStore.getState();
    const apply = (event: string, payload: any) => {
      const s = store();
      if (event === 'collection:created') s.setCollections([...s.collections.filter((c) => c._id !== payload._id), payload]);
      if (event === 'collection:updated') s.setCollections(s.collections.map((c) => c._id === payload._id ? { ...c, ...payload } : c));
      if (event === 'collection:deleted') s.setCollections(s.collections.filter((c) => c._id !== payload && c._id !== payload?._id));
      if (event === 'folder:created') s.setFolders([...s.folders.filter((f) => f._id !== payload._id), payload]);
      if (event === 'folder:updated') s.setFolders(s.folders.map((f) => f._id === payload._id ? { ...f, ...payload } : f));
      if (event === 'folder:deleted') s.setFolders(s.folders.filter((f) => f._id !== payload && f._id !== payload?._id));
      if (event === 'request:created') s.setRequests([...s.requests.filter((r) => r._id !== payload._id), payload]);
      if (event === 'request:updated') s.setRequests(s.requests.map((r) => r._id === payload._id ? { ...r, ...payload } : r));
      if (event === 'request:deleted') s.setRequests(s.requests.filter((r) => r._id !== payload && r._id !== payload?._id));
      if (event === 'workspace:reordered') s.fetchCollectionsData(activeWorkspace._id);
    };

    socket.on('collection:created', (p) => apply('collection:created', p));
    socket.on('collection:updated', (p) => apply('collection:updated', p));
    socket.on('collection:deleted', (p) => apply('collection:deleted', p));
    socket.on('folder:created', (p) => apply('folder:created', p));
    socket.on('folder:updated', (p) => apply('folder:updated', p));
    socket.on('folder:deleted', (p) => apply('folder:deleted', p));
    socket.on('request:created', (p) => apply('request:created', p));
    socket.on('request:deleted', (p) => apply('request:deleted', p));
    socket.on('workspace:reordered', () => apply('workspace:reordered', null));

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
      apply('request:updated', updatedRequest);

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
