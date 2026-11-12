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

import { diffRequestMods } from './scripts';
describe('diffRequestMods', () => {
  const orig = { url: 'http://h/x', method: 'GET', headers: { A: '1' }, body: 'b' };
  it('returns nothing when unchanged', () => {
    expect(diffRequestMods(orig, { ...orig, headers: { ...orig.headers } })).toEqual({});
  });
  it('returns only changed url/headers/body', () => {
    expect(diffRequestMods(orig, { url: 'http://h/x?s=1', method: 'GET', headers: { A: '1', B: '2' }, body: 'c' }))
      .toEqual({ url: 'http://h/x?s=1', headers: { B: '2' }, body: 'c' });
  });
});
