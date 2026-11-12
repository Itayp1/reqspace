import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const COLLECTION_ID = 'col-1';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  setActiveRequest: vi.fn(),
  markSaved: vi.fn(),
  openCollection: vi.fn(),
  loadCollectionChildren: vi.fn(),
  loadFolderChildren: vi.fn(),
  createCollection: vi.fn(),
  createFolder: vi.fn(),
  applyRequestUpserted: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('../../api/axios', () => ({
  default: {
    post: mocks.post,
  },
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    activeWorkspace: { _id: 'ws-1', name: 'Workspace' },
  }),
}));

vi.mock('../../store/toastStore', () => ({
  useToastStore: {
    getState: () => ({ addToast: mocks.addToast }),
  },
}));

vi.mock('../../store/collectionStore', () => ({
  useCollectionStore: () => ({
    collections: [
      {
        _id: COLLECTION_ID,
        name: 'Collection One',
        order: 0,
        variables: [] as unknown[],
      },
    ],
    foldersByCollection: {},
    openCollection: mocks.openCollection,
    loadCollectionChildren: mocks.loadCollectionChildren,
    loadFolderChildren: mocks.loadFolderChildren,
    createCollection: mocks.createCollection,
    createFolder: mocks.createFolder,
    applyRequestUpserted: mocks.applyRequestUpserted,
  }),
}));

vi.mock('../../store/requestStore', () => ({
  useRequestStore: () => ({
    activeRequest: {
      tabId: 'tab-1',
      name: 'Saved',
      method: 'GET',
      url: 'https://example.com',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { mode: 'none' },
    },
    setActiveRequest: mocks.setActiveRequest,
    markSaved: mocks.markSaved,
  }),
}));

import { SaveRequestModal } from './SaveRequestModal';

describe('SaveRequestModal expand', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    mocks.post.mockReset();
    mocks.openCollection.mockReset();
  });

  it('calls openCollection with the collection id after a successful save', async () => {
    mocks.post.mockResolvedValue({
      data: {
        _id: 'req-1',
        collectionId: 'col-1',
        name: 'Saved',
        method: 'GET',
        url: 'https://example.com',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<SaveRequestModal onClose={() => {}} />);
    });

    const submit = container.querySelector('[data-testid="save-req-submit-btn"]') as HTMLButtonElement | null;
    expect(submit).toBeTruthy();
    expect(submit!.disabled).toBe(false);

    await act(async () => {
      submit!.click();
    });

    expect(mocks.post).toHaveBeenCalledWith(
      `/collections/${COLLECTION_ID}/requests`,
      expect.objectContaining({ name: 'Saved' }),
    );
    expect(mocks.openCollection).toHaveBeenCalledWith(COLLECTION_ID);
  });
});
