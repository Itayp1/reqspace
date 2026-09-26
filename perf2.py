import re

store_path = 'client/src/store/collectionStore.ts'
with open(store_path, 'r', encoding='utf-8') as f:
    store = f.read()

store = store.replace('folders: Folder[];', 'foldersByCollection: Record<string, Folder[] | "loading">;')
store = store.replace('requests: ApiRequest[];', 'requestsByFolder: Record<string, ApiRequest[] | "loading">;')
store = store.replace('setFolders: (folders: Folder[]) => void;', 'setFoldersByCollection: (folders: Record<string, Folder[] | "loading">) => void;')
store = store.replace('setRequests: (requests: ApiRequest[]) => void;', 'setRequestsByFolder: (requests: Record<string, ApiRequest[] | "loading">) => void;')

store = store.replace('fetchCollectionsData: (workspaceId: string) => Promise<void>;', '''
  loadWorkspace: (workspaceId: string) => Promise<void>;
  loadCollectionChildren: (collectionId: string) => Promise<void>;
  loadFolderChildren: (collectionId: string, folderId: string) => Promise<void>;
''')

store = store.replace('folders: [],\n  requests: [],', 'foldersByCollection: {},\n  requestsByFolder: {},')
store = store.replace('setFolders: (folders) => set({ folders }),\n  setRequests: (requests) => set({ requests }),', 
                      'setFoldersByCollection: (foldersByCollection) => set({ foldersByCollection }),\n  setRequestsByFolder: (requestsByFolder) => set({ requestsByFolder }),')

fetch_new = '''
  loadWorkspace: async (workspaceId: string) => {
    try {
      const { db } = await import('../db');
      const localCols = await db.collections.where('workspaceId').equals(workspaceId).toArray();
      set({ collections: localCols });
      const colRes = await api.get(`/workspaces/${workspaceId}/collections`);
      set({ collections: colRes.data });
      await db.collections.bulkPut(colRes.data.map((c: any) => ({ ...c, workspaceId })));
    } catch (e) {
      console.error(e);
    }
  },
  
  loadCollectionChildren: async (collectionId: string) => {
    const state = get();
    if (state.foldersByCollection[collectionId] === 'loading') return;
    set({ foldersByCollection: { ...state.foldersByCollection, [collectionId]: 'loading' }, requestsByFolder: { ...state.requestsByFolder, [collectionId]: 'loading' } });
    try {
      const { db } = await import('../db');
      const localFolders = await db.folders.where('collectionId').equals(collectionId).toArray();
      const localReqs = await db.requests.where('collectionId').equals(collectionId).toArray();
      set((s: any) => ({
        foldersByCollection: { ...s.foldersByCollection, [collectionId]: localFolders.filter((f: any) => !f.parentFolderId) },
        requestsByFolder: { ...s.requestsByFolder, [collectionId]: localReqs.filter((r: any) => !r.folderId) }
      }));
      const [fRes, rRes] = await Promise.all([
        api.get(`/collections/${collectionId}/folders`),
        api.get(`/collections/${collectionId}/requests?folderId=null`)
      ]);
      set((s: any) => ({
        foldersByCollection: { ...s.foldersByCollection, [collectionId]: fRes.data },
        requestsByFolder: { ...s.requestsByFolder, [collectionId]: rRes.data }
      }));
      await db.folders.bulkPut(fRes.data);
      await db.requests.bulkPut(rRes.data);
    } catch (e) {
      console.error(e);
      set((s: any) => ({
        foldersByCollection: { ...s.foldersByCollection, [collectionId]: [] },
        requestsByFolder: { ...s.requestsByFolder, [collectionId]: [] }
      }));
    }
  },
  
  loadFolderChildren: async (collectionId: string, folderId: string) => {
    const state = get();
    if (state.requestsByFolder[folderId] === 'loading') return;
    set({ requestsByFolder: { ...state.requestsByFolder, [folderId]: 'loading' } });
    try {
      const { db } = await import('../db');
      const localReqs = await db.requests.where('folderId').equals(folderId).toArray();
      set((s: any) => ({ requestsByFolder: { ...s.requestsByFolder, [folderId]: localReqs } }));
      const res = await api.get(`/collections/${collectionId}/requests?folderId=${folderId}`);
      set((s: any) => ({ requestsByFolder: { ...s.requestsByFolder, [folderId]: res.data } }));
      await db.requests.bulkPut(res.data);
    } catch (e) {
      console.error(e);
      set((s: any) => ({ requestsByFolder: { ...s.requestsByFolder, [folderId]: [] } }));
    }
  },
'''

store = re.sub(r'fetchCollectionsData: async \(workspaceId: string\) => \{.*?(?=\n  // ── Collection)', fetch_new, store, flags=re.DOTALL)

with open(store_path, 'w', encoding='utf-8') as f:
    f.write(store)
