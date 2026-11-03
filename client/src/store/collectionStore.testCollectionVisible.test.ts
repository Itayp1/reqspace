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

const workspaceId = 'ws-test-collection';
const testCollection = { _id: 'col-1', name: 'Test Collection', order: 0 };

describe('loadWorkspace collection visibility', () => {
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

  it('shows Test Collection when IndexedDB returns an empty list for the workspace', async () => {
    apiGet.mockResolvedValue(tree([testCollection]));

    await useCollectionStore.getState().loadWorkspace(workspaceId);

    expect(apiGet).toHaveBeenCalledWith(`/workspaces/${workspaceId}/tree`, { params: { full: 1 } });
    expect(useCollectionStore.getState().collections).toEqual([testCollection]);
  });
});
