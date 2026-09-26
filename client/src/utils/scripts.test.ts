import { describe, it, expect, vi } from 'vitest';
import { runPreRequestScript, runTestScript } from './scripts';

vi.mock('../sandbox/worker?worker', () => {
  return {
    default: class SandboxWorker {
      onmessage: any;
      postMessage(_msg: any) {
        if (this.onmessage) {
          this.onmessage({ data: { type: 'result', testResults: [{ name: 'test', passed: true }] } } as any);
        }
      }
      terminate() {}
    }
  };
});

// Mock stores imported by serializeVariables
vi.mock('../store/environmentStore', () => ({
  useEnvironmentStore: {
    getState: vi.fn(() => ({
      environments: [],
      activeEnvironmentId: null,
      globalEnvironment: null,
      localVariables: []
    }))
  }
}));

vi.mock('../store/collectionStore', () => ({
  useCollectionStore: {
    getState: vi.fn(() => ({
      collections: []
    }))
  }
}));

describe('scripts', () => {
  it('returns undefined for empty script', async () => {
    expect(await runPreRequestScript('')).toBeUndefined();
  });

  it('executes pre-request script', async () => {
    const result = await runPreRequestScript('console.log(1)');
    expect(result).toBeDefined();
    expect(result?.testResults).toHaveLength(1);
  });

  it('executes test script', async () => {
    const result = await runTestScript('console.log(2)', { status: 200, headers: {}, body: 'OK' });
    expect(result).toBeDefined();
    expect(result?.testResults).toHaveLength(1);
  });
});
