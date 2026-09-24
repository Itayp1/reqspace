import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import { useCollectionStore, type ApiRequest, type Collection, type Folder } from '../../store/collectionStore';
import { useRequestStore } from '../../store/requestStore';
import { useEnvironmentStore, type Environment } from '../../store/environmentStore';
import { applyOrder, descendantFolderIds, upsert } from './socketDeltas';

/** Explicit socket origin. Set VITE_SOCKET_URL when the API base is versioned (`/api/v1`). */
const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function applyCollection(doc: Collection) {
  useCollectionStore.setState(state => ({ collections: upsert(state.collections, doc) }));
}

function removeCollection(id: string) {
  useCollectionStore.setState(state => ({
    collections: state.collections.filter(c => c._id !== id),
    folders: state.folders.filter(f => f.collectionId !== id),
    requests: state.requests.filter(r => r.collectionId !== id),
  }));
}

function applyFolder(doc: Folder) {
  useCollectionStore.setState(state => ({ folders: upsert(state.folders, doc) }));
}

function removeFolder(id: string) {
  useCollectionStore.setState(state => {
    const ids = descendantFolderIds(state.folders, id);
    return {
      folders: state.folders.filter(f => !ids.has(f._id)),
      requests: state.requests.filter(r => !r.folderId || !ids.has(r.folderId)),
    };
  });
}

function applyRequest(doc: ApiRequest) {
  useCollectionStore.setState(state => ({ requests: upsert(state.requests, doc) }));
}

function removeRequest(id: string) {
  useCollectionStore.setState(state => ({ requests: state.requests.filter(r => r._id !== id) }));
}

function applyOrderTo(type: string, items: Array<{ id: string; order: number }>) {
  useCollectionStore.setState(state => {
    if (type === 'collection') return { collections: applyOrder(state.collections, items) };
    if (type === 'folder') return { folders: applyOrder(state.folders, items) };
    if (type === 'request') return { requests: applyOrder(state.requests, items) };
    return {};
  });
}

function applyEnvironment(doc: Environment) {
  const store = useEnvironmentStore.getState();
  if (doc.isGlobal) {
    store.setGlobalEnvironment(doc);
    return;
  }
  const exists = store.environments.some(env => env._id === doc._id);
  store.setEnvironments(exists
    ? store.environments.map(env => env._id === doc._id ? { ...env, ...doc } : env)
    : [...store.environments, doc]);
}

function removeEnvironment(id: string) {
  const store = useEnvironmentStore.getState();
  if (store.globalEnvironment?._id === id) store.setGlobalEnvironment(null);
  store.setEnvironments(store.environments.filter(env => env._id !== id));
}

function applyEnvironmentOrder(items: Array<{ id: string; order: number }>) {
  const rank = new Map(items.map(item => [item.id, item.order]));
  const store = useEnvironmentStore.getState();
  store.setEnvironments([...store.environments].sort((a, b) => (rank.get(a._id) ?? 0) - (rank.get(b._id) ?? 0)));
}

function markConflict(id: string, updatedAt?: string) {
  if (!updatedAt) return;
  const requestStore = useRequestStore.getState();
  const tab = requestStore.tabs.find(t => t.tabId === id);
  if (!tab?.updatedAt) return;
  if (new Date(updatedAt).getTime() <= new Date(tab.updatedAt).getTime()) return;
  requestStore.updateTab(id, { isConflicted: true });
  if (requestStore.activeRequest?._id === id) {
    requestStore.updateActiveRequest({ isConflicted: true });
  }
}

export function SocketSync() {
  const activeWorkspace = useAuthStore(state => state.activeWorkspace);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;

    const socket = io(socketUrl, { path: '/ws', withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join:workspace', activeWorkspace._id);
      // One full load after connect covers anything missed while offline.
      useCollectionStore.getState().fetchCollectionsData(activeWorkspace._id);
      useEnvironmentStore.getState().fetchEnvironments(activeWorkspace._id);
    });

    socket.on('collection:created', (doc: Collection) => applyCollection(doc));
    socket.on('collection:updated', (doc: Collection) => applyCollection(doc));
    socket.on('collection:deleted', (id: string) => removeCollection(id));
    socket.on('folder:created', (doc: Folder) => applyFolder(doc));
    socket.on('folder:updated', (doc: Folder) => applyFolder(doc));
    socket.on('folder:deleted', (id: string) => removeFolder(id));
    socket.on('request:created', (doc: ApiRequest) => applyRequest(doc));
    socket.on('request:deleted', (id: string) => removeRequest(id));
    socket.on('workspace:reordered', (payload: { type?: string; items?: Array<{ id: string; order: number }> }) => {
      if (payload?.type && payload.items) applyOrderTo(payload.type, payload.items);
    });

    socket.on('request:updated', (doc: ApiRequest) => {
      applyRequest(doc);
      markConflict(doc._id, doc.updatedAt);
    });

    socket.on('environment:created', (doc: Environment) => applyEnvironment(doc));
    socket.on('environment:deleted', (id: string) => removeEnvironment(id));
    socket.on('environment:updated', (payload: Environment | { items?: Array<{ id: string; order: number }> }) => {
      if (payload && 'items' in payload && payload.items) {
        applyEnvironmentOrder(payload.items);
        return;
      }
      const doc = payload as Environment;
      if (!doc?._id) return;
      applyEnvironment(doc);
      markConflict(doc._id, (doc as Environment & { updatedAt?: string }).updatedAt);
    });

    return () => {
      socket.disconnect();
    };
  }, [activeWorkspace]);

  return null;
}
