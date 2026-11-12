import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEnvironmentStore } from '../../store/environmentStore';

const mocks = vi.hoisted(() => ({
  updateActiveRequest: vi.fn(),
  markSaved: vi.fn(),
  activeRequest: {
    tabId: 'tab-env',
    environmentId: 'env-1',
    name: 'Dev',
    isDirty: false,
  },
}));

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({
    workspaces: [{ _id: 'ws-1', name: 'Workspace' }],
    activeWorkspace: { _id: 'ws-1', name: 'Workspace' },
  }),
}));

vi.mock('../../store/requestStore', () => ({
  useRequestStore: () => ({
    activeRequest: mocks.activeRequest,
    updateActiveRequest: mocks.updateActiveRequest,
    markSaved: mocks.markSaved,
  }),
}));

import { EnvironmentTabEditor } from './EnvironmentTabEditor';

const variable = (key: string) => ({
  key,
  initialValue: 'init',
  currentValue: 'current',
  isSecret: false,
  enabled: true,
});

describe('EnvironmentTabEditor refresh', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.activeRequest.environmentId = 'env-1';
    mocks.activeRequest.name = 'Dev';
    useEnvironmentStore.setState({
      environments: [
        {
          _id: 'env-1',
          name: 'Dev',
          isGlobal: false,
          variables: [variable('OLD_KEY')],
        },
      ],
      globalEnvironment: {
        _id: 'global-env',
        name: 'Globals',
        isGlobal: true,
        variables: [variable('GLOBAL_OLD')],
      },
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    mocks.updateActiveRequest.mockReset();
    mocks.markSaved.mockReset();
    useEnvironmentStore.setState({
      environments: [],
      globalEnvironment: null,
    });
  });

  async function renderEditor() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<EnvironmentTabEditor />);
    });
  }

  function keyInput() {
    return container.querySelector('[data-testid="env-var-key-0"]') as HTMLInputElement | null;
  }

  it('refreshes the open environment table when the store replaces variables for the same id', async () => {
    await renderEditor();

    const input = keyInput();
    expect(input).toBeTruthy();
    expect(input!.value).toBe('OLD_KEY');

    await act(async () => {
      useEnvironmentStore.getState().setEnvironments([
        {
          _id: 'env-1',
          name: 'Dev',
          isGlobal: false,
          variables: [variable('NEW_KEY')],
        },
      ]);
    });

    const refreshed = keyInput();
    expect(refreshed).toBe(input);
    expect(refreshed!.value).toBe('NEW_KEY');
  });

  it('refreshes the open global environment when the store replaces its variables', async () => {
    mocks.activeRequest.environmentId = 'global';
    mocks.activeRequest.name = 'Globals';

    await renderEditor();

    const input = keyInput();
    expect(input).toBeTruthy();
    expect(input!.value).toBe('GLOBAL_OLD');

    await act(async () => {
      useEnvironmentStore.getState().setGlobalEnvironment({
        _id: 'global-env',
        name: 'Globals',
        isGlobal: true,
        variables: [variable('GLOBAL_NEW')],
      });
    });

    const refreshed = keyInput();
    expect(refreshed).toBe(input);
    expect(refreshed!.value).toBe('GLOBAL_NEW');
  });
});
