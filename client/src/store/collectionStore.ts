import { create } from 'zustand';
import api from '../api/axios';

export interface CollectionItem {
  _id: string;
  name: string;
  order: number;
}

export interface Collection extends CollectionItem {
  variables: any[];
  workspaceId?: string;
  preRequestScript?: string;
  testScript?: string;
  auth?: any; // Inherit Auth Support
}

export interface Folder extends CollectionItem {
  collectionId: string;
  parentFolderId: string | null;
  preRequestScript?: string;
  testScript?: string;
  auth?: any; // Inherit Auth Support
}

export interface ApiRequest extends CollectionItem {
  collectionId: string;
  folderId: string | null;
  method: string;
  url?: string;
  updatedAt?: any;
}

interface CollectionStore {
  collections: Collection[];
  folders: Folder[];
  requests: ApiRequest[];
  openCollectionIds: Set<string>;

  // Basic setters
  setCollections: (collections: Collection[]) => void;
  setFolders: (folders: Folder[]) => void;
  setRequests: (requests: ApiRequest[]) => void;

  // SOCK-1: apply a single changed entity from a socket event directly,
  // instead of refetching the whole tree.
  applyCollectionUpserted: (collection: Collection) => void;
  applyCollectionDeleted: (id: string) => void;
  applyFolderUpserted: (folder: Folder) => void;
  applyFolderDeleted: (id: string) => void;
  applyRequestUpserted: (request: ApiRequest) => void;
  applyRequestDeleted: (id: string) => void;

  // Open/close tree nodes
  toggleCollectionOpen: (id: string) => void;
  openCollection: (id: string) => void;

  // Fetch
  fetchCollectionsData: (workspaceId: string) => Promise<void>;

  // Collection CRUD
  createCollection: (workspaceId: string, name: string) => Promise<Collection>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  duplicateCollection: (id: string, workspaceId: string) => Promise<void>;

  // Folder CRUD
  createFolder: (collectionId: string, name: string, parentFolderId?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  duplicateFolder: (id: string, collectionId: string, parentFolderId?: string | null) => Promise<void>;

  // Request CRUD
  createRequest: (collectionId: string, name: string, folderId?: string) => Promise<ApiRequest>;
  renameRequest: (id: string, name: string) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
  duplicateRequest: (id: string) => Promise<void>;
  moveRequest: (id: string, newCollectionId: string, newFolderId: string | null) => Promise<void>;
  moveFolder: (folderId: string, newCollectionId: string, newParentFolderId: string | null) => Promise<void>;
  reorderItems: (type: 'collection' | 'folder' | 'request', items: { id: string; order: number }[]) => Promise<void>;
}

export const useCollectionStore = create<CollectionStore>((set, get) => ({
  collections: [],
  folders: [],
  requests: [],
  openCollectionIds: new Set<string>(),

  setCollections: (collections) => set({ collections }),
  setFolders: (folders) => set({ folders }),
  setRequests: (requests) => set({ requests }),

  applyCollectionUpserted: (collection) => set((state) => {
    const exists = state.collections.some(c => c._id === collection._id);
    return {
      collections: exists
        ? state.collections.map(c => c._id === collection._id ? collection : c)
        : [...state.collections, collection],
    };
  }),
  applyCollectionDeleted: (id) => set((state) => ({
    // routes/collections.ts's DELETE /collections/:id cascades fully
    // (deleteByCollection on both folders and requests), so this matches
    // the server's real end state exactly.
    collections: state.collections.filter(c => c._id !== id),
    folders: state.folders.filter(f => f.collectionId !== id),
    requests: state.requests.filter(r => r.collectionId !== id),
  })),
  applyFolderUpserted: (folder) => set((state) => {
    const exists = state.folders.some(f => f._id === folder._id);
    return {
      folders: exists
        ? state.folders.map(f => f._id === folder._id ? folder : f)
        : [...state.folders, folder],
    };
  }),
  applyFolderDeleted: (id) => set((state) => ({
    // routes/collections.ts's DELETE /folders/:id only cascades one level
    // (deleteByParent + deleteByFolder — direct children only, not deeper
    // descendants; a separate bug, FIX-13). Matching that exactly here
    // keeps client state consistent with what a refetch of the same
    // server state would actually show, not what it theoretically should.
    folders: state.folders.filter(f => f._id !== id && f.parentFolderId !== id),
    requests: state.requests.filter(r => r.folderId !== id),
  })),
  applyRequestUpserted: (request) => set((state) => {
    const exists = state.requests.some(r => r._id === request._id);
    return {
      requests: exists
        ? state.requests.map(r => r._id === request._id ? request : r)
        : [...state.requests, request],
    };
  }),
  applyRequestDeleted: (id) => set((state) => ({
    requests: state.requests.filter(r => r._id !== id),
  })),

  toggleCollectionOpen: (id: string) => set((state) => {
    const next = new Set(state.openCollectionIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return { openCollectionIds: next };
  }),

  openCollection: (id: string) => set((state) => {
    if (state.openCollectionIds.has(id)) return {};
    return { openCollectionIds: new Set(state.openCollectionIds).add(id) };
  }),

  fetchCollectionsData: async (workspaceId: string) => {
    try {
      const { db } = await import('../db');
      
      // 1. Optimistic local load
      const localCols = await db.collections.where('workspaceId').equals(workspaceId).toArray();
      set({ collections: localCols });
      
      const colIds = localCols.map(c => c._id);
      if (colIds.length > 0) {
        const [localFolders, localReqs] = await Promise.all([
          db.folders.where('collectionId').anyOf(colIds).toArray(),
          db.requests.where('collectionId').anyOf(colIds).toArray()
        ]);
        set({ folders: localFolders, requests: localReqs });
      }

      // 2. Fetch from server
      const colRes = await api.get(`/workspaces/${workspaceId}/collections`);
      const serverCols = colRes.data;
      set({ collections: serverCols });
      
      // Update local db
      await db.collections.bulkPut(serverCols.map((c: any) => ({ ...c, workspaceId })));

      let allFolders: Folder[] = [];
      let allRequests: ApiRequest[] = [];

      await Promise.all(serverCols.map(async (col: Collection) => {
        const [fRes, rRes] = await Promise.all([
          api.get(`/collections/${col._id}/folders`),
          api.get(`/collections/${col._id}/requests`)
        ]);
        allFolders = allFolders.concat(fRes.data);
        allRequests = allRequests.concat(rRes.data);
      }));

      set({ folders: allFolders, requests: allRequests });
      
      // Update local db
      await db.folders.bulkPut(allFolders);
      await db.requests.bulkPut(allRequests);
      
    } catch (e) {
      console.error(e);
    }
  },

  // ── Collection ──────────────────────────────────────────────────────────────

  createCollection: async (workspaceId, name) => {
    const res = await api.post(`/workspaces/${workspaceId}/collections`, { name });
    const { db } = await import('../db');
    await db.collections.put({ ...res.data, workspaceId });
    // Idempotent: the create's own 'collection:created' socket echo can
    // arrive before this HTTP response resolves and already add it.
    get().applyCollectionUpserted(res.data);
    return res.data;
  },

  renameCollection: async (id, name) => {
    set((state) => ({
      collections: state.collections.map(c => c._id === id ? { ...c, name } : c)
    }));
    import('../db').then(({ db }) => db.collections.update(id, { name }));
    api.put(`/collections/${id}`, { name }).catch(console.error);
  },

  deleteCollection: async (id) => {
    set((state) => ({
      collections: state.collections.filter(c => c._id !== id),
      folders: state.folders.filter(f => f.collectionId !== id),
      requests: state.requests.filter(r => r.collectionId !== id),
    }));
    import('../db').then(async ({ db }) => {
      await db.collections.delete(id);
      await db.folders.where('collectionId').equals(id).delete();
      await db.requests.where('collectionId').equals(id).delete();
    });
    api.delete(`/collections/${id}`).catch(console.error);
  },

  duplicateCollection: async (id, workspaceId) => {
    const { collections, folders, requests } = get();
    const source = collections.find(c => c._id === id);
    if (!source) return;

    // Create new collection
    const newColRes = await api.post(`/workspaces/${workspaceId}/collections`, {
      name: `Copy of ${source.name}`
    });
    const newCol: Collection = newColRes.data;

    // Duplicate top-level requests (no folder)
    const topRequests = requests.filter(r => r.collectionId === id && !r.folderId);
    for (const req of topRequests) {
      const res = await api.post(`/collections/${newCol._id}/requests`, {
        name: req.name, method: req.method, url: req.url || '',
      });
      get().applyRequestUpserted(res.data);
    }

    // Duplicate top-level folders (simplified — one level)
    const topFolders = folders.filter(f => f.collectionId === id && !f.parentFolderId);
    for (const folder of topFolders) {
      const fRes = await api.post(`/collections/${newCol._id}/folders`, { name: folder.name });
      const newFolder: Folder = fRes.data;
      get().applyFolderUpserted(newFolder);

      const folderRequests = requests.filter(r => r.folderId === folder._id);
      for (const req of folderRequests) {
        const rRes = await api.post(`/collections/${newCol._id}/requests`, {
          name: req.name, method: req.method, url: req.url || '', folderId: newFolder._id,
        });
        get().applyRequestUpserted(rRes.data);
      }
    }

    get().applyCollectionUpserted(newCol);
  },

  // ── Folder ──────────────────────────────────────────────────────────────────

  createFolder: async (collectionId, name, parentFolderId) => {
    const res = await api.post(`/collections/${collectionId}/folders`, { name, parentFolderId });
    const { db } = await import('../db');
    await db.folders.put(res.data);
    get().applyFolderUpserted(res.data);
    get().openCollection(collectionId);
  },

  renameFolder: async (id, name) => {
    set((state) => ({
      folders: state.folders.map(f => f._id === id ? { ...f, name } : f)
    }));
    import('../db').then(({ db }) => db.folders.update(id, { name }));
    api.put(`/folders/${id}`, { name }).catch(console.error);
  },

  deleteFolder: async (id) => {
    set((state) => ({
      folders: state.folders.filter(f => f._id !== id && f.parentFolderId !== id),
      requests: state.requests.filter(r => r.folderId !== id),
    }));
    import('../db').then(async ({ db }) => {
      await db.folders.delete(id);
      await db.folders.where('parentFolderId').equals(id).delete();
      await db.requests.where('folderId').equals(id).delete();
    });
    api.delete(`/folders/${id}`).catch(console.error);
  },

  duplicateFolder: async (id, collectionId, parentFolderId = null) => {
    const { folders, requests } = get();
    const source = folders.find(f => f._id === id);
    if (!source) return;
    const fRes = await api.post(`/collections/${collectionId}/folders`, {
      name: `Copy of ${source.name}`, parentFolderId
    });
    const newFolder: Folder = fRes.data;
    get().applyFolderUpserted(newFolder);

    const folderRequests = requests.filter(r => r.folderId === id);
    for (const req of folderRequests) {
      const rRes = await api.post(`/collections/${collectionId}/requests`, {
        name: req.name, method: req.method, url: req.url || '', folderId: newFolder._id,
      });
      get().applyRequestUpserted(rRes.data);
    }
  },

  // ── Request ─────────────────────────────────────────────────────────────────

  createRequest: async (collectionId, name, folderId) => {
    const res = await api.post(`/collections/${collectionId}/requests`, {
      name, folderId: folderId || null, method: 'GET', url: ''
    });
    const { db } = await import('../db');
    await db.requests.put(res.data);
    get().applyRequestUpserted(res.data);
    get().openCollection(collectionId);
    return res.data;
  },

  renameRequest: async (id, name) => {
    set((state) => ({
      requests: state.requests.map(r => r._id === id ? { ...r, name } : r)
    }));
    import('../db').then(({ db }) => db.requests.update(id, { name }));
    api.put(`/requests/${id}`, { name }).catch(console.error);
  },

  deleteRequest: async (id) => {
    set((state) => ({
      requests: state.requests.filter(r => r._id !== id)
    }));
    import('../db').then(({ db }) => db.requests.delete(id));
    api.delete(`/requests/${id}`).catch(console.error);
  },

  duplicateRequest: async (id) => {
    const { requests } = get();
    const source = requests.find(r => r._id === id);
    if (!source) return;
    const res = await api.post(`/collections/${source.collectionId}/requests`, {
      name: `${source.name} (Copy)`,
      method: source.method,
      url: source.url || '',
      folderId: source.folderId,
    });
    get().applyRequestUpserted(res.data);
  },

  moveRequest: async (id, newCollectionId, newFolderId) => {
    const { db } = await import('../db');
    await db.requests.update(id, { collectionId: newCollectionId, folderId: newFolderId });
    set((state) => ({
      requests: state.requests.map(r => r._id === id ? { ...r, collectionId: newCollectionId, folderId: newFolderId } : r)
    }));
    await api.put(`/requests/${id}`, { collectionId: newCollectionId, folderId: newFolderId });
  },

  moveFolder: async (id, newCollectionId, newParentFolderId) => {
    const { db } = await import('../db');
    await db.folders.update(id, { collectionId: newCollectionId, parentFolderId: newParentFolderId });
    set((state) => ({
      folders: state.folders.map(f => f._id === id ? { ...f, collectionId: newCollectionId, parentFolderId: newParentFolderId } : f)
    }));
    await api.put(`/folders/${id}`, { collectionId: newCollectionId, parentFolderId: newParentFolderId });
  },

  reorderItems: async (type, items) => {
    const { db } = await import('../db');
    
    // Update local store
    if (type === 'collection') {
      set(state => ({
        collections: state.collections.map(c => {
          const item = items.find(i => i.id === c._id);
          return item ? { ...c, order: item.order } : c;
        }).sort((a, b) => (a.order || 0) - (b.order || 0))
      }));
      for (const item of items) await db.collections.update(item.id, { order: item.order });
    } else if (type === 'folder') {
      set(state => ({
        folders: state.folders.map(f => {
          const item = items.find(i => i.id === f._id);
          return item ? { ...f, order: item.order } : f;
        }).sort((a, b) => (a.order || 0) - (b.order || 0))
      }));
      for (const item of items) await db.folders.update(item.id, { order: item.order });
    } else if (type === 'request') {
      set(state => ({
        requests: state.requests.map(r => {
          const item = items.find(i => i.id === r._id);
          return item ? { ...r, order: item.order } : r;
        }).sort((a, b) => (a.order || 0) - (b.order || 0))
      }));
      for (const item of items) await db.requests.update(item.id, { order: item.order });
    }

    // Sync with backend
    await api.put('/collections/reorder', { type, items });
  },
}));
