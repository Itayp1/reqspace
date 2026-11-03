import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const COLLECTION_ID = 'col-parent';
const FOLDER_ID = 'fold-1';

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
}));

vi.mock('../../api/axios', () => ({
  default: { post: mocks.post },
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ activeWorkspace: { _id: 'ws-1', name: 'Workspace' } }),
}));

vi.mock('../../store/toastStore', () => ({
  useToastStore: { getState: () => ({ addToast: vi.fn() }) },
}));

vi.mock('../../store/collectionStore', () => ({
  useCollectionStore: () => ({
    collections: [{ _id: COLLECTION_ID, name: 'Parent', order: 0, variables: [] }],
    foldersByCollection: {
      [COLLECTION_ID]: [{ _id: FOLDER_ID, name: 'Inner Folder', collectionId: COLLECTION_ID }],
    },
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
      name: 'Folder Request',
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

describe('SaveRequestModal folder save', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) act(() => { root.unmount(); });
    container?.remove();
    mocks.post.mockReset();
    mocks.setActiveRequest.mockReset();
  });

  it('saves into a folder using foldersByCollection and keeps updatedAt', async () => {
    mocks.post.mockResolvedValue({
      data: {
        _id: 'req-9',
        collectionId: COLLECTION_ID,
        folderId: FOLDER_ID,
        name: 'Folder Request',
        method: 'GET',
        updatedAt: '2026-02-02T00:00:00.000Z',
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<SaveRequestModal onClose={() => {}} />);
    });

    const folderRow = Array.from(container.querySelectorAll('div')).find(el => el.textContent === 'Inner Folder');
    expect(folderRow).toBeTruthy();
    await act(async () => {
      folderRow!.click();
    });

    const submit = container.querySelector('[data-testid="save-req-submit-btn"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    await act(async () => {
      submit.click();
    });

    expect(mocks.post).toHaveBeenCalledWith(
      `/collections/${COLLECTION_ID}/requests`,
      expect.objectContaining({ folderId: FOLDER_ID, name: 'Folder Request' }),
    );
    expect(mocks.setActiveRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 'tab-1',
        updatedAt: '2026-02-02T00:00:00.000Z',
        folderId: FOLDER_ID,
      }),
    );
    expect(mocks.openCollection).toHaveBeenCalledWith(COLLECTION_ID);
  });
});
