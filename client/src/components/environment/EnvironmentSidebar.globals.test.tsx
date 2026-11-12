import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ContextMenuProvider } from '../common/ContextMenuProvider';

vi.mock('../../store/environmentStore', () => ({
  useEnvironmentStore: () => ({
    environments: [],
    setEnvironments: vi.fn(),
  }),
}));

vi.mock('../../store/requestStore', () => ({
  useRequestStore: () => ({
    openEnvironmentTab: vi.fn(),
    closeEnvironmentTab: vi.fn(),
  }),
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    activeWorkspace: { _id: 'ws-1', name: 'Workspace' },
  }),
}));

import EnvironmentSidebar from './EnvironmentSidebar';

describe('EnvironmentSidebar globals', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
  });

  it('renders the Globals row with data-testid env-globals-btn', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <ContextMenuProvider>
          <EnvironmentSidebar />
        </ContextMenuProvider>,
      );
    });

    const globals = document.querySelector('[data-testid="env-globals-btn"]');
    expect(globals).toBeTruthy();
    expect(globals!.textContent).toContain('Globals');
  });
});
