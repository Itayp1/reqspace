import { describe, it, expect, vi } from 'vitest';

const { addLog } = vi.hoisted(() => ({ addLog: vi.fn() }));

vi.mock('../sandbox/worker?worker', () => {
  return {
    default: class SandboxWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage() {
        this.onmessage?.({ data: { type: 'error', error: 'boom' } });
      }
      terminate() {}
    },
  };
});

vi.mock('../store/consoleStore', () => ({
  useConsoleStore: { getState: () => ({ addLog }) },
}));

vi.mock('../store/environmentStore', () => ({
  useEnvironmentStore: {
    getState: () => ({
      environments: [],
      activeEnvironmentId: null,
      globalEnvironment: null,
      localVariables: [],
    }),
  },
}));

vi.mock('../store/collectionStore', () => ({
  useCollectionStore: { getState: () => ({ collections: [] }) },
}));

vi.mock('../transport', () => ({
  sendRequest: vi.fn(),
}));

import { runPreRequestScript } from './scripts';

describe('pre-request script errors', () => {
  it('surfaces a sandbox error as a failed test row and a console entry', async () => {
    addLog.mockClear();
    const result = await runPreRequestScript('this throws');
    expect(result?.testResults).toEqual([
      { name: 'Script Execution', passed: false, error: 'boom' },
    ]);
    expect(addLog).toHaveBeenCalledWith({ type: 'error', message: 'boom' });
  });
});
