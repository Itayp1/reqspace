import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiGet, toArray, bulkPut } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toArray: vi.fn(),
  bulkPut: vi.fn(),
}));

vi.mock('../api/axios', () => ({ default: { get: apiGet } }));

const table = (rows: () => unknown) => ({
  where: () => ({
    equals: (id: string) => ({ toArray: () => rows(), delete: async () => 0, _id: id }),
    anyOf: () => ({ toArray: async () => [], delete: async () => 0 }),
  }),
  bulkPut,
});

vi.mock('../db', () => ({
  db: {
    collections: {
      where: () => ({
        equals: (workspaceId: string) => ({ toArray: () => toArray(workspaceId), delete: async () => 0 }),
      }),
      bulkPut,
    },
    folders: table(() => []),
    requests: table(() => []),
    transaction: async (_m: string, ..._a: unknown[]) => { const fn = _a[_a.length - 1] as () => Promise<void>; await fn(); },
  },
}));

import { useCollectionStore } from './collectionStore';

const tree = (collections: unknown[]) => ({ data: { collections, folders: [], requests: [] } });

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('loadWorkspace', () => {
  beforeEach(() => {
    apiGet.mockReset();
    toArray.mockReset();
    bulkPut.mockReset();
    bulkPut.mockResolvedValue(undefined);
    toArray.mockResolvedValue([]);
    useCollectionStore.setState({
      collections: [],
      foldersByCollection: {},
      requestsByFolder: {},
      openCollectionIds: new Set(),
    });
  });

  it('applies server tree when the IndexedDB read never resolves', async () => {
    toArray.mockReturnValue(new Promise(() => {}));
    apiGet.mockResolvedValue(tree([{ _id: 'c1', name: 'Test Collection', order: 0 }]));

    await useCollectionStore.getState().loadWorkspace('ws-1');

    expect(apiGet).toHaveBeenCalledWith('/workspaces/ws-1/tree', { params: { full: 1 } });
    expect(useCollectionStore.getState().collections).toEqual([
      { _id: 'c1', name: 'Test Collection', order: 0 },
    ]);
  });

  it('does not let an older loadWorkspace overwrite a newer workspace', async () => {
    let resolveOldHttp: (value: unknown) => void = () => {};
    const oldHttp = new Promise((resolve) => { resolveOldHttp = resolve; });
    apiGet.mockImplementation((url: string) => {
      if (url === '/workspaces/ws-old/tree') return oldHttp;
      if (url === '/workspaces/ws-new/tree') return Promise.resolve(tree([{ _id: 'new-col', name: 'New', order: 0 }]));
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    const oldLoad = useCollectionStore.getState().loadWorkspace('ws-old');
    await useCollectionStore.getState().loadWorkspace('ws-new');
    expect(useCollectionStore.getState().collections.map((c) => c._id)).toEqual(['new-col']);

    resolveOldHttp(tree([{ _id: 'old-server', name: 'Old', order: 0 }]));
    await oldLoad;
    await flush();

    expect(useCollectionStore.getState().collections.map((c) => c._id)).toEqual(['new-col']);
  });

  it('keeps open folders when reloading the same workspace', async () => {
    apiGet.mockResolvedValue({
      data: {
        collections: [{ _id: 'c1', name: 'Test Collection', order: 0 }],
        folders: [{ _id: 'f1', name: 'Folder', order: 0, collectionId: 'c1', parentFolderId: null }],
        requests: [],
      },
    });

    await useCollectionStore.getState().loadWorkspace('ws-same');
    useCollectionStore.setState({ openCollectionIds: new Set(['c1']) });
    await useCollectionStore.getState().loadWorkspace('ws-same');

    const state = useCollectionStore.getState();
    expect(state.collections.map((c) => c._id)).toEqual(['c1']);
    expect((state.foldersByCollection.c1 as any[]).map((f: any) => f._id)).toEqual(['f1']);
    expect([...state.openCollectionIds]).toEqual(['c1']);
  });
});
