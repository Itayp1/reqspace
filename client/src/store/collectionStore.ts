import { useMemo } from 'react';
import { create } from 'zustand';
import api from '../api/axios';
import { useToastStore } from './toastStore';

// The server broadcasts create/duplicate events to every socket in the
// workspace, including the one that made the REST call — so the client that
// just created an item can also receive its own creation as a socket echo
// a moment later. Append-only reducers must dedupe by id or a lucky race
// renders the same item twice.
function appendUnique<T extends { _id: string }>(arr: T[] | undefined, item: T): T[] {
  const base = Array.isArray(arr) ? arr : [];
  return base.some(x => x._id === item._id) ? base : [...base, item];
}

// Appending to a bucket that was never fetched would create a partial list
// that the lazy loader then treats as complete, hiding the rest.
function appendIfLoaded<T extends { _id: string }>(arr: T[] | 'loading' | undefined, item: T): T[] | 'loading' | undefined {
  return Array.isArray(arr) ? appendUnique(arr, item) : arr;
}

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
  foldersByCollection: Record<string, Folder[] | 'loading'>;
  requestsByFolder: Record<string, ApiRequest[] | 'loading'>;
  openCollectionIds: Set<string>;

  // Basic setters
  setCollections: (collections: Collection[]) => void;
  setFoldersByCollection: (folders: Record<string, Folder[] | 'loading'>) => void;
  setRequestsByFolder: (requests: Record<string, ApiRequest[] | 'loading'>) => void;

  // Open/close tree nodes
  toggleCollectionOpen: (id: string) => void;
  openCollection: (id: string) => void;

  // Fetch
  loadWorkspace: (workspaceId: string) => Promise<void>;
  loadCollectionChildren: (collectionId: string) => Promise<void>;
  refreshCollectionChildren: (collectionId: string) => Promise<void>;
  loadFolderChildren: (collectionId: string, folderId: string) => Promise<void>;

  // Collection CRUD
  createCollection: (workspaceId: string, name: string) => Promise<Collection>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  duplicateCollection: (id: string, workspaceId: string) => Promise<void>;

  // Folder CRUD
  createFolder: (collectionId: string, name: string, parentFolderId?: string) => Promise<Folder>;
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

  // Socket reducers
  applyCollectionUpserted: (collection: Collection) => void;
  applyCollectionDeleted: (id: string) => void;
  applyFolderUpserted: (folder: Folder) => void;
  applyFolderDeleted: (id: string) => void;
  applyRequestUpserted: (request: ApiRequest) => void;
  applyRequestDeleted: (id: string) => void;
  applyWorkspaceReordered: (payload: { collections?: Collection[], folders?: Folder[], requests?: ApiRequest[] }) => void;
}

// Several loads can be in flight at once: login selects a default workspace,
// then the test (or the user) switches to another before the first response
// arrives. A late response must not replace the collection list of the
// workspace that is current now.
let workspaceLoadSeq = 0;
let loadedWorkspaceId: string | null = null;

const byOrder = (a: CollectionItem, b: CollectionItem) => (a.order || 0) - (b.order || 0);

// Every collection and folder gets a bucket, empty or not: an absent bucket
// means "not fetched", and loadCollectionChildren/loadFolderChildren would
// hit the network for it.
function buildTree(collections: Collection[], folders: Folder[], requests: ApiRequest[]) {
  const foldersByCollection: Record<string, Folder[]> = {};
  const requestsByFolder: Record<string, ApiRequest[]> = {};
  for (const c of collections) { foldersByCollection[c._id] = []; requestsByFolder[c._id] = []; }
  for (const f of folders) { foldersByCollection[f._id] = []; requestsByFolder[f._id] = []; }
  for (const f of folders) (foldersByCollection[f.parentFolderId || f.collectionId] ??= []).push(f);
  for (const r of requests) (requestsByFolder[r.folderId || r.collectionId] ??= []).push(r);
  for (const arr of Object.values(foldersByCollection)) arr.sort(byOrder);
  for (const arr of Object.values(requestsByFolder)) arr.sort(byOrder);
  return { foldersByCollection, requestsByFolder };
}

const REQUEST_COPY_FIELDS = ['method', 'url', 'params', 'headers', 'auth', 'body', 'preRequestScript', 'testScript', 'description'] as const;

function requestCopyPayload(source: any, name: string, folderId: string | null) {
  const payload: any = { name, folderId, method: source.method || 'GET', url: source.url || '' };
  for (const k of REQUEST_COPY_FIELDS) {
    if (k !== 'method' && k !== 'url' && source[k] !== undefined && source[k] !== null) payload[k] = source[k];
  }
  return payload;
}

// The create endpoints reject unknown keys and explicit nulls.
function definedOnly<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

function findFolder(id: string): Folder | undefined {
  for (const arr of Object.values(useCollectionStore.getState().foldersByCollection)) {
    if (Array.isArray(arr)) { const f = (arr as Folder[]).find(x => x._id === id); if (f) return f; }
  }
  return undefined;
}

async function copyRequestInto(source: ApiRequest, collectionId: string, folderId: string | null, name: string) {
  const res = await api.post(`/collections/${collectionId}/requests`, requestCopyPayload(source, name, folderId));
  useCollectionStore.setState((state) => {
    const parentId = res.data.folderId || res.data.collectionId;
    return { requestsByFolder: { ...state.requestsByFolder, [parentId]: appendUnique(state.requestsByFolder[parentId] as ApiRequest[], res.data) } };
  });
}

async function copyFolderTree(sourceId: string, collectionId: string, parentFolderId: string | null, name: string): Promise<void> {
  const source: any = findFolder(sourceId);
  if (!source) return;
  await useCollectionStore.getState().loadFolderChildren(source.collectionId, sourceId);

  const fRes = await api.post(`/collections/${collectionId}/folders`, definedOnly({
    name, parentFolderId,
    description: source.description,
    preRequestScript: source.preRequestScript,
    testScript: source.testScript,
  }));
  let newFolder: Folder = fRes.data;
  if (source.auth) newFolder = (await api.put(`/folders/${newFolder._id}`, { auth: source.auth })).data;

  useCollectionStore.setState((state) => {
    const parentKey = newFolder.parentFolderId || newFolder.collectionId;
    return {
      foldersByCollection: {
        ...state.foldersByCollection,
        [parentKey]: appendUnique(state.foldersByCollection[parentKey] as Folder[], newFolder),
        [newFolder._id]: state.foldersByCollection[newFolder._id] ?? [],
      },
      requestsByFolder: { ...state.requestsByFolder, [newFolder._id]: state.requestsByFolder[newFolder._id] ?? [] },
    };
  });

  const { foldersByCollection, requestsByFolder } = useCollectionStore.getState();
  const requests = Array.isArray(requestsByFolder[sourceId]) ? requestsByFolder[sourceId] as ApiRequest[] : [];
  for (const req of requests) await copyRequestInto(req, collectionId, newFolder._id, req.name);
  const children = Array.isArray(foldersByCollection[sourceId]) ? foldersByCollection[sourceId] as Folder[] : [];
  for (const child of children) await copyFolderTree(child._id, collectionId, newFolder._id, child.name);
}

// Open tabs keep their own copy of collectionId/folderId; after a move they must follow,
// otherwise the next save sends the stale folderId and the server rejects it (400).
async function syncOpenTabsLocation() {
  const { useRequestStore } = await import('./requestStore');
  const loc = new Map<string, { collectionId: string; folderId: string | null }>();
  for (const arr of Object.values(useCollectionStore.getState().requestsByFolder)) {
    if (!Array.isArray(arr)) continue;
    for (const r of arr as ApiRequest[]) loc.set(r._id, { collectionId: r.collectionId, folderId: r.folderId ?? null });
  }
  const fix = <T extends { _id?: string; collectionId?: string; folderId?: string | null }>(t: T): T => {
    const l = t._id ? loc.get(t._id) : undefined;
    return l && (t.collectionId !== l.collectionId || (t.folderId ?? null) !== l.folderId) ? { ...t, ...l } : t;
  };
  useRequestStore.setState((s) => ({
    tabs: s.tabs.map(fix),
    activeRequest: s.activeRequest ? fix(s.activeRequest) : s.activeRequest,
  }));
}

export const useCollectionStore = create<CollectionStore>((set, get) => ({
  collections: [],
  foldersByCollection: {},
  requestsByFolder: {},
  openCollectionIds: new Set<string>(),

  setCollections: (collections) => set({ collections }),
  setFoldersByCollection: (foldersByCollection) => set({ foldersByCollection }),
  setRequestsByFolder: (requestsByFolder) => set({ requestsByFolder }),

  // Socket reducers implementation
  applyCollectionUpserted: (c) => set((state) => {
    const existing = state.collections.find(col => col._id === c._id);
    return existing 
      ? { collections: state.collections.map(col => col._id === c._id ? { ...col, ...c } : col) }
      : { collections: [...state.collections, c] };
  }),
  applyCollectionDeleted: (id) => set((state) => {
    const nextF = { ...state.foldersByCollection };
    delete nextF[id];
    const nextR = { ...state.requestsByFolder };
    delete nextR[id];
    return {
      collections: state.collections.filter(c => c._id !== id),
      foldersByCollection: nextF,
      requestsByFolder: nextR,
    };
  }),
  applyFolderUpserted: (f) => set((state) => {
    const parentId = f.parentFolderId || f.collectionId;
    const arr = state.foldersByCollection[parentId];
    if (!Array.isArray(arr)) return {};
    const existing = arr.find(fol => fol._id === f._id);
    const nextArr = existing ? arr.map(fol => fol._id === f._id ? { ...fol, ...f } : fol) : [...arr, f].sort((a, b) => (a.order || 0) - (b.order || 0));
    return {
      foldersByCollection: { ...state.foldersByCollection, [parentId]: nextArr, [f._id]: state.foldersByCollection[f._id] ?? [] },
      requestsByFolder: { ...state.requestsByFolder, [f._id]: state.requestsByFolder[f._id] ?? [] },
    };
  }),
  applyFolderDeleted: (id) => set((state) => {
    const nextF = { ...state.foldersByCollection };
    for (const key of Object.keys(nextF)) {
      if (Array.isArray(nextF[key])) {
        nextF[key] = nextF[key].filter(f => f._id !== id);
      }
    }
    const nextR = { ...state.requestsByFolder };
    delete nextR[id];
    return { foldersByCollection: nextF, requestsByFolder: nextR };
  }),
  applyRequestUpserted: (r) => set((state) => {
    const parentId = r.folderId || r.collectionId;
    const arr = state.requestsByFolder[parentId];
    if (!Array.isArray(arr)) return {};
    const existing = arr.find(req => req._id === r._id);
    const nextArr = existing ? arr.map(req => req._id === r._id ? { ...req, ...r } : req) : [...arr, r].sort((a, b) => (a.order || 0) - (b.order || 0));
    return { requestsByFolder: { ...state.requestsByFolder, [parentId]: nextArr } };
  }),
  applyRequestDeleted: (id) => set((state) => {
    const nextR = { ...state.requestsByFolder };
    for (const key of Object.keys(nextR)) {
      if (Array.isArray(nextR[key])) {
        nextR[key] = nextR[key].filter(r => r._id !== id);
      }
    }
    return { requestsByFolder: nextR };
  }),
  applyWorkspaceReordered: (payload) => set((state) => {
    if (!payload) return {};
    let newState = { ...state, foldersByCollection: { ...state.foldersByCollection }, requestsByFolder: { ...state.requestsByFolder } };
    if (payload.collections) {
      const updates = new Map(payload.collections.map(c => [c._id, c]));
      newState.collections = newState.collections.map(c => updates.has(c._id) ? { ...c, ...updates.get(c._id)! } : c).sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    if (payload.folders) {
      const updates = new Map(payload.folders.map(f => [f._id, f]));
      for (const key of Object.keys(newState.foldersByCollection)) {
        if (Array.isArray(newState.foldersByCollection[key])) {
           newState.foldersByCollection[key] = newState.foldersByCollection[key].map((f: any) => updates.has(f._id) ? { ...f, ...updates.get(f._id)! } : f).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        }
      }
    }
    if (payload.requests) {
      const updates = new Map(payload.requests.map(r => [r._id, r]));
      for (const key of Object.keys(newState.requestsByFolder)) {
        if (Array.isArray(newState.requestsByFolder[key])) {
           newState.requestsByFolder[key] = newState.requestsByFolder[key].map((r: any) => updates.has(r._id) ? { ...r, ...updates.get(r._id)! } : r).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        }
      }
    }
    return newState;
  }),

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

  loadWorkspace: async (workspaceId: string) => {
    const seq = ++workspaceLoadSeq;
    try {
      const { db } = await import('../db');

      const localCols = await db.collections.where('workspaceId').equals(workspaceId).toArray();
      const localIds = localCols.map(c => c._id);
      const [localFolders, localReqs] = localIds.length
        ? await Promise.all([
            db.folders.where('collectionId').anyOf(localIds).toArray(),
            db.requests.where('collectionId').anyOf(localIds).toArray(),
          ])
        : [[], []];
      if (seq !== workspaceLoadSeq) return;
      const switching = loadedWorkspaceId !== workspaceId;
      loadedWorkspaceId = workspaceId;
      // Paint the cached tree while the network call is in flight. A switch
      // must not keep the previous workspace's tree; a reload of the same
      // workspace already holds data at least as fresh as the cache. An empty
      // cache leaves the buckets absent so the lazy loaders can still fetch.
      if (switching) {
        const cached = localFolders.length || localReqs.length
          ? buildTree(localCols, localFolders, localReqs)
          : { foldersByCollection: {}, requestsByFolder: {} };
        set({ collections: localCols, ...cached, openCollectionIds: new Set() });
      } else {
        set({ collections: localCols });
      }

      const res = await api.get(`/workspaces/${workspaceId}/tree`, { params: { full: 1 } });
      if (seq !== workspaceLoadSeq) return;
      const collections: Collection[] = Array.isArray(res.data?.collections) ? res.data.collections : [];
      const folders: Folder[] = Array.isArray(res.data?.folders) ? res.data.folders : [];
      const requests: ApiRequest[] = Array.isArray(res.data?.requests) ? res.data.requests : [];
      set({ collections, ...buildTree(collections, folders, requests) });
      await syncOpenTabsLocation();

      // Replace rather than merge, so items deleted elsewhere don't linger in
      // the cache and reappear on the next cold start.
      const ids = collections.map(c => c._id);
      await db.transaction('rw', db.collections, db.folders, db.requests, async () => {
        await db.collections.where('workspaceId').equals(workspaceId).delete();
        if (localIds.length) {
          await db.folders.where('collectionId').anyOf(localIds).delete();
          await db.requests.where('collectionId').anyOf(localIds).delete();
        }
        if (ids.length) {
          await db.folders.where('collectionId').anyOf(ids).delete();
          await db.requests.where('collectionId').anyOf(ids).delete();
        }
        await db.collections.bulkPut(collections.map((c: any) => ({ ...c, workspaceId })));
        await db.folders.bulkPut(folders);
        await db.requests.bulkPut(requests);
      });
    } catch (e) {
      if (seq !== workspaceLoadSeq) return;
      console.error(e);
    }
  },

  loadCollectionChildren: async (collectionId: string) => {
    const state = get();
    if (state.foldersByCollection[collectionId] || state.requestsByFolder[collectionId]) return;
    
    set((s) => ({
      foldersByCollection: { ...s.foldersByCollection, [collectionId]: 'loading' },
      requestsByFolder: { ...s.requestsByFolder, [collectionId]: 'loading' }
    }));

    try {
      const { db } = await import('../db');
      const localFolders = await db.folders.where('collectionId').equals(collectionId).toArray();
      const rootFolders = localFolders.filter(f => !f.parentFolderId);
      const localReqs = await db.requests.where('collectionId').equals(collectionId).filter(r => !r.folderId).toArray();
      
      if (rootFolders.length > 0 || localReqs.length > 0) {
        set((s) => ({
          foldersByCollection: { ...s.foldersByCollection, [collectionId]: rootFolders },
          requestsByFolder: { ...s.requestsByFolder, [collectionId]: localReqs }
        }));
      }

      const [fRes, rRes] = await Promise.all([
        api.get(`/collections/${collectionId}/folders`),
        api.get(`/collections/${collectionId}/requests?folderId=null`)
      ]);
      
      const newFolders = fRes.data;
      const rootFoldersNet = newFolders.filter((f: any) => !f.parentFolderId);
      
      set((s) => {
        // Also populate subfolders if they came down in the response
        const nextF = { ...s.foldersByCollection, [collectionId]: rootFoldersNet };
        const grouped = new Map<string, any[]>();
        for (const f of newFolders) {
          if (f.parentFolderId) {
             if (!grouped.has(f.parentFolderId)) grouped.set(f.parentFolderId, []);
             grouped.get(f.parentFolderId)!.push(f);
          }
        }
        for (const [pId, arr] of grouped.entries()) {
           nextF[pId] = arr;
        }
        return {
          foldersByCollection: nextF,
          requestsByFolder: { ...s.requestsByFolder, [collectionId]: rRes.data }
        };
      });

      await db.folders.bulkPut(fRes.data);
      await db.requests.bulkPut(rRes.data);
    } catch (e) {
      console.error(e);
      // Never leave the 'loading' placeholder behind, or the node spins forever.
      set((s) => {
        const nextF = { ...s.foldersByCollection };
        const nextR = { ...s.requestsByFolder };
        if (nextF[collectionId] === 'loading') delete nextF[collectionId];
        if (nextR[collectionId] === 'loading') delete nextR[collectionId];
        return { foldersByCollection: nextF, requestsByFolder: nextR };
      });
      useToastStore.getState().addToast('error', 'Failed to load collection contents');
    }
  },

  // loadCollectionChildren no-ops once a collection's children are cached, so
  // an already-open collection never sees a background change (e.g. a fork
  // auto-sync updating a folder the user isn't actively looking at) — evict
  // the cache first so the subsequent load actually hits the network.
  refreshCollectionChildren: async (collectionId: string) => {
    set((s) => {
      const foldersByCollection = { ...s.foldersByCollection };
      const requestsByFolder = { ...s.requestsByFolder };
      delete foldersByCollection[collectionId];
      delete requestsByFolder[collectionId];
      return { foldersByCollection, requestsByFolder };
    });
    await get().loadCollectionChildren(collectionId);
  },

  loadFolderChildren: async (collectionId: string, folderId: string) => {
    const state = get();
    if (state.requestsByFolder[folderId]) return;

    set((s) => ({
      requestsByFolder: { ...s.requestsByFolder, [folderId]: 'loading' }
    }));

    try {
      const { db } = await import('../db');
      const localReqs = await db.requests.where('folderId').equals(folderId).toArray();
      if (localReqs.length > 0) {
        set((s) => ({
          requestsByFolder: { ...s.requestsByFolder, [folderId]: localReqs }
        }));
      }

      const rRes = await api.get(`/collections/${collectionId}/requests?folderId=${folderId}`);
      set((s) => ({
        requestsByFolder: { ...s.requestsByFolder, [folderId]: rRes.data }
      }));
      await db.requests.bulkPut(rRes.data);
    } catch (e) {
      console.error(e);
      set((s) => {
        const nextR = { ...s.requestsByFolder };
        if (nextR[folderId] === 'loading') delete nextR[folderId];
        return { requestsByFolder: nextR };
      });
      useToastStore.getState().addToast('error', 'Failed to load folder contents');
    }
  },

  // ── Collection ──────────────────────────────────────────────────────────────

  createCollection: async (workspaceId, name) => {
    const res = await api.post(`/workspaces/${workspaceId}/collections`, { name });
    const { db } = await import('../db');
    await db.collections.put({ ...res.data, workspaceId });
    set((state) => ({ collections: appendUnique(state.collections, res.data), foldersByCollection: { ...state.foldersByCollection, [res.data._id]: [] }, requestsByFolder: { ...state.requestsByFolder, [res.data._id]: [] } }));
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
    set((state) => {
      const nextF = { ...state.foldersByCollection };
      delete nextF[id];
      const nextR = { ...state.requestsByFolder };
      delete nextR[id];
      return {
        collections: state.collections.filter(c => c._id !== id),
        foldersByCollection: nextF,
        requestsByFolder: nextR,
      };
    });
    import('../db').then(async ({ db }) => {
      await db.collections.delete(id);
      await db.folders.where('collectionId').equals(id).delete();
      await db.requests.where('collectionId').equals(id).delete();
    });
    api.delete(`/collections/${id}`).catch(console.error);
  },

  duplicateCollection: async (id, workspaceId) => {
    const source: any = get().collections.find(c => c._id === id);
    if (!source) return;
    await get().loadCollectionChildren(id);

    const newColRes = await api.post(`/workspaces/${workspaceId}/collections`, definedOnly({
      name: `Copy of ${source.name}`,
      description: source.description,
      variables: source.variables,
      preRequestScript: source.preRequestScript,
      testScript: source.testScript,
    }));
    let newCol: Collection = newColRes.data;
    // The create endpoint doesn't accept auth, so it goes in a follow-up update.
    if (source.auth) newCol = (await api.put(`/collections/${newCol._id}`, { auth: source.auth })).data;

    // A copy into another workspace must not show up in the one on screen.
    const intoCurrent = workspaceId === loadedWorkspaceId;
    if (intoCurrent) {
      set((state) => ({
        collections: appendUnique(state.collections, newCol),
        foldersByCollection: { ...state.foldersByCollection, [newCol._id]: state.foldersByCollection[newCol._id] ?? [] },
        requestsByFolder: { ...state.requestsByFolder, [newCol._id]: state.requestsByFolder[newCol._id] ?? [] },
      }));
    }

    const { foldersByCollection, requestsByFolder } = get();
    const rootRequests = Array.isArray(requestsByFolder[id]) ? requestsByFolder[id] as ApiRequest[] : [];
    for (const req of rootRequests) await copyRequestInto(req, newCol._id, null, req.name);
    const rootFolders = Array.isArray(foldersByCollection[id]) ? foldersByCollection[id] as Folder[] : [];
    for (const folder of rootFolders) await copyFolderTree(folder._id, newCol._id, null, folder.name);
  },

  // ── Folder ──────────────────────────────────────────────────────────────────

  createFolder: async (collectionId, name, parentFolderId) => {
    const res = await api.post(`/collections/${collectionId}/folders`, { name, parentFolderId });
    const { db } = await import('../db');
    await db.folders.put(res.data);
    set((state) => {
      const parentId = res.data.parentFolderId || res.data.collectionId;
      // A new folder starts with empty buckets � an absent bucket means "not
      // fetched" and would make the first drop/expand hit the network.
      return {
        foldersByCollection: {
          ...state.foldersByCollection,
          [parentId]: appendIfLoaded(state.foldersByCollection[parentId], res.data) as Folder[],
          [res.data._id]: state.foldersByCollection[res.data._id] ?? [],
        },
        requestsByFolder: { ...state.requestsByFolder, [res.data._id]: state.requestsByFolder[res.data._id] ?? [] },
      };
    });
    get().openCollection(collectionId);
    return res.data;
  },

  renameFolder: async (id, name) => {
    set((state) => ({
      foldersByCollection: Object.fromEntries(
        Object.entries(state.foldersByCollection).map(([k, v]) => [k, Array.isArray(v) ? v.map((f: any) => f._id === id ? { ...f, name } : f) : v])
      )
    }));
    import('../db').then(({ db }) => db.folders.update(id, { name }));
    api.put(`/folders/${id}`, { name }).catch(console.error);
  },

  deleteFolder: async (id) => {
    set((state) => {
      const nextF = { ...state.foldersByCollection };
      for (const key of Object.keys(nextF)) {
        if (Array.isArray(nextF[key])) {
          nextF[key] = (nextF[key] as Folder[]).filter(f => f._id !== id && f.parentFolderId !== id);
        }
      }
      const nextR = { ...state.requestsByFolder };
      delete nextR[id];
      return { foldersByCollection: nextF, requestsByFolder: nextR };
    });
    import('../db').then(async ({ db }) => {
      await db.folders.delete(id);
      await db.folders.where('parentFolderId').equals(id).delete();
      await db.requests.where('folderId').equals(id).delete();
    });
    api.delete(`/folders/${id}`).catch(console.error);
  },

  duplicateFolder: async (id, collectionId, parentFolderId = null) => {
    const source = findFolder(id);
    if (!source) return;
    await copyFolderTree(id, collectionId, parentFolderId, `Copy of ${source.name}`);
  },

  // ── Request ─────────────────────────────────────────────────────────────────

  createRequest: async (collectionId, name, folderId) => {
    const res = await api.post(`/collections/${collectionId}/requests`, {
      name, folderId: folderId || null, method: 'GET', url: ''
    });
    const { db } = await import('../db');
    await db.requests.put(res.data);
    set((state) => {
      const parentId = res.data.folderId || res.data.collectionId;
      return { requestsByFolder: { ...state.requestsByFolder, [parentId]: appendIfLoaded(state.requestsByFolder[parentId], res.data) as ApiRequest[] } };
    });
    get().openCollection(collectionId);
    return res.data;
  },

  renameRequest: async (id, name) => {
    set((state) => ({
      requestsByFolder: Object.fromEntries(
        Object.entries(state.requestsByFolder).map(([k, v]) => [k, Array.isArray(v) ? v.map((req: any) => req._id === id ? { ...req, name } : req) : v])
      )
    }));
    import('../db').then(({ db }) => db.requests.update(id, { name }));
    api.put(`/requests/${id}`, { name }).catch(console.error);
  },

  deleteRequest: async (id) => {
    set((state) => {
      const nextR = { ...state.requestsByFolder };
      for (const key of Object.keys(nextR)) {
        if (Array.isArray(nextR[key])) {
          nextR[key] = (nextR[key] as ApiRequest[]).filter(r => r._id !== id);
        }
      }
      return { requestsByFolder: nextR };
    });
    import('../db').then(({ db }) => db.requests.delete(id));
    api.delete(`/requests/${id}`).catch(console.error);
  },

  duplicateRequest: async (id) => {
    const { requestsByFolder } = get();
    let source: ApiRequest | undefined;
    for (const arr of Object.values(requestsByFolder)) {
      if (Array.isArray(arr)) { source = (arr as ApiRequest[]).find(r => r._id === id); if (source) break; }
    }
    if (!source) return;
    await copyRequestInto(source, source.collectionId, source.folderId ?? null, `${source.name} (Copy)`);
  },

  moveRequest: async (id, newCollectionId, newFolderId) => {
    const { db } = await import('../db');
    await db.requests.update(id, { collectionId: newCollectionId, folderId: newFolderId });
    set((state) => {
      const nextR = { ...state.requestsByFolder };
      let req: ApiRequest | undefined;
      for (const key of Object.keys(nextR)) {
        if (Array.isArray(nextR[key])) {
          const idx = (nextR[key] as ApiRequest[]).findIndex(r => r._id === id);
          if (idx !== -1) {
            req = (nextR[key] as ApiRequest[])[idx];
            nextR[key] = (nextR[key] as ApiRequest[]).filter(r => r._id !== id);
            break;
          }
        }
      }
      if (req) {
        req = { ...req, collectionId: newCollectionId, folderId: newFolderId };
        const pId = newFolderId || newCollectionId;
        if (Array.isArray(nextR[pId])) nextR[pId] = [...(nextR[pId] as ApiRequest[]), req];
        else nextR[pId] = [req];
      }
      return { requestsByFolder: nextR };
    });
    await syncOpenTabsLocation();
    await api.put(`/requests/${id}`, { collectionId: newCollectionId, folderId: newFolderId });
  },

  moveFolder: async (id, newCollectionId, newParentFolderId) => {
    const { db } = await import('../db');
    await db.folders.update(id, { collectionId: newCollectionId, parentFolderId: newParentFolderId });
    set((state) => {
      const nextF = { ...state.foldersByCollection };
      let fol: Folder | undefined;
      for (const key of Object.keys(nextF)) {
        if (Array.isArray(nextF[key])) {
          const idx = (nextF[key] as Folder[]).findIndex(f => f._id === id);
          if (idx !== -1) {
            fol = (nextF[key] as Folder[])[idx];
            nextF[key] = (nextF[key] as Folder[]).filter(f => f._id !== id);
            break;
          }
        }
      }
      if (fol) {
        fol = { ...fol, collectionId: newCollectionId, parentFolderId: newParentFolderId };
        const pId = newParentFolderId || newCollectionId;
        if (Array.isArray(nextF[pId])) nextF[pId] = [...(nextF[pId] as Folder[]), fol];
        else nextF[pId] = [fol];
      }
      if (fol) {
        const subtree = new Set<string>([id]);
        const queue = [id];
        while (queue.length) {
          const cur = queue.shift()!;
          for (const arr of Object.values(nextF)) {
            if (!Array.isArray(arr)) continue;
            for (const f of arr as Folder[]) if (f.parentFolderId === cur && !subtree.has(f._id)) { subtree.add(f._id); queue.push(f._id); }
          }
        }
        for (const key of Object.keys(nextF)) {
          if (Array.isArray(nextF[key])) nextF[key] = (nextF[key] as Folder[]).map(f => subtree.has(f._id) ? { ...f, collectionId: newCollectionId } : f);
        }
        const nextR = { ...state.requestsByFolder };
        for (const key of Object.keys(nextR)) {
          if (subtree.has(key) && Array.isArray(nextR[key])) nextR[key] = (nextR[key] as ApiRequest[]).map(r => ({ ...r, collectionId: newCollectionId }));
        }
        return { foldersByCollection: nextF, requestsByFolder: nextR };
      }
      return { foldersByCollection: nextF };
    });
    await syncOpenTabsLocation();
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
      set(state => {
        const nextF = { ...state.foldersByCollection };
        for (const key of Object.keys(nextF)) {
          if (Array.isArray(nextF[key])) {
            nextF[key] = (nextF[key] as Folder[]).map((f: Folder) => {
              const item = items.find(i => i.id === f._id);
              return item ? { ...f, order: item.order } : f;
            }).sort((a, b) => (a.order || 0) - (b.order || 0));
          }
        }
        return { foldersByCollection: nextF };
      });
      for (const item of items) await db.folders.update(item.id, { order: item.order });
    } else if (type === 'request') {
      set(state => {
        const nextR = { ...state.requestsByFolder };
        for (const key of Object.keys(nextR)) {
          if (Array.isArray(nextR[key])) {
            nextR[key] = (nextR[key] as ApiRequest[]).map((r: ApiRequest) => {
              const item = items.find(i => i.id === r._id);
              return item ? { ...r, order: item.order } : r;
            }).sort((a, b) => (a.order || 0) - (b.order || 0));
          }
        }
        return { requestsByFolder: nextR };
      });
      for (const item of items) await db.requests.update(item.id, { order: item.order });
    }

    // Sync with backend
    await api.put('/collections/reorder', { type, items });
  },
}));


function flattenLoaded<T extends { _id: string }>(byKey: Record<string, T[] | 'loading'>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of Object.values(byKey)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!seen.has(item._id)) { seen.add(item._id); out.push(item); }
    }
  }
  return out;
}

/**
 * Flat folder/request lists for features that scan the whole tree (search,
 * docs, move picker). The tree is lazy-loaded (PERF-2), so this only covers
 * collections/folders the user has already expanded — nodes that haven't been
 * loaded yet are not included.
 */
export function useLoadedTree(): { folders: Folder[]; requests: ApiRequest[] } {
  const foldersByCollection = useCollectionStore(s => s.foldersByCollection);
  const requestsByFolder = useCollectionStore(s => s.requestsByFolder);
  return useMemo(() => ({
    folders: flattenLoaded(foldersByCollection),
    requests: flattenLoaded(requestsByFolder),
  }), [foldersByCollection, requestsByFolder]);
}
