import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../api/axios', () => ({
  default: {
    post: mocks.post,
    delete: mocks.delete,
  },
}));

vi.mock('../../store/toastStore', () => ({
  useToastStore: { getState: () => ({ addToast: vi.fn() }) },
}));

import { ShareLinkModal } from './ShareLinkModal';

describe('ShareLinkModal revoke', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    document.body.innerHTML = '';
    mocks.post.mockReset();
    mocks.delete.mockReset();
  });

  it('deletes the generated share link when Revoke is clicked', async () => {
    mocks.post.mockResolvedValue({
      data: { url: '/share/abc123', shortId: 'abc123' },
    });
    mocks.delete.mockResolvedValue({ data: {} });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ShareLinkModal collectionId="col-1" collectionName="Shared" onClose={() => {}} />,
      );
    });

    const generate = document.body.querySelector('[data-testid="share-link-generate-btn"]') as HTMLButtonElement;
    await act(async () => {
      generate.click();
    });

    const revoke = document.body.querySelector('[data-testid="share-link-revoke-btn"]') as HTMLButtonElement;
    expect(revoke).toBeTruthy();

    await act(async () => {
      revoke.click();
    });

    expect(mocks.delete).toHaveBeenCalledWith('/share/abc123');
    expect(document.body.querySelector('[data-testid="share-link-revoke-btn"]')).toBeNull();
  });
});
