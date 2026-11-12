import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const COLLECTION_ID = 'col-only-1';

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
  collections: [
    {
      _id: 'col-only-1',
      name: 'Only Collection',
      order: 0,
      variables: [] as unknown[],
    },
  ],
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
    collections: mocks.collections,
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
      name: 'Saved from History',
      method: 'POST',
      url: 'https://example.com/search',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { mode: 'raw', raw: '' },
    },
    setActiveRequest: mocks.setActiveRequest,
    markSaved: mocks.markSaved,
  }),
}));

import { SaveRequestModal } from './SaveRequestModal';

describe('SaveRequestModal autoselect', () => {
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
  });

  it('enables submit for the only collection without clicking it and posts the request', async () => {
    mocks.post.mockResolvedValue({
      data: {
        _id: 'req-1',
        collectionId: COLLECTION_ID,
        folderId: null,
        name: 'Saved from History',
        method: 'POST',
        updatedAt: 1,
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
      expect.objectContaining({ name: 'Saved from History' }),
    );
  });
});
