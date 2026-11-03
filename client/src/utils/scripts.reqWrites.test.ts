import { describe, it, expect, vi } from 'vitest';

vi.mock('../sandbox/worker?worker', () => {
  return {
    default: class SandboxWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage() {
        this.onmessage?.({
          data: {
            type: 'result',
            variableWrites: [
              { scope: 'header', action: 'set', key: 'X-Collection-Script', value: 'from-script' },
              { scope: 'local', action: 'set', key: 'colVar', value: 'alpha' },
            ],
            testResults: [],
            consoleLines: [],
          },
        });
      }
      terminate() {}
    },
  };
});

vi.mock('../store/consoleStore', () => ({
  useConsoleStore: { getState: () => ({ addLog: vi.fn() }) },
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

describe('pre-request req writes', () => {
  it('lowercases header writes and sets local variables for the send', async () => {
    const localVariables = new Map<string, string>();
    const result = await runPreRequestScript('req.headers.set("X-Collection-Script", "from-script")', undefined, undefined, localVariables);

    expect(result?.headerWrites).toEqual({ 'x-collection-script': 'from-script' });
    expect(localVariables.get('colVar')).toBe('alpha');
  });
});
