import { describe, it, expect, vi } from 'vitest';
import { resolveDynamicVars, resolveAllVariables } from './variables';

vi.mock('../store/environmentStore', () => ({
  useEnvironmentStore: {
    getState: vi.fn(() => ({
      environments: [],
      activeEnvironmentId: null,
      globalEnvironment: { variables: [{ key: 'globalKey', currentValue: 'globalVal', enabled: true }] },
      localVariables: [{ key: 'localKey', currentValue: 'localVal', enabled: true }]
    }))
  }
}));

vi.mock('../store/collectionStore', () => ({
  useCollectionStore: {
    getState: vi.fn(() => ({
      collections: [{ _id: 'col1', variables: [{ key: 'colKey', value: 'colVal', enabled: true }] }]
    }))
  }
}));

describe('variables', () => {
  it('resolves dynamic vars', () => {
    const text = 'hello {{$timestamp}}';
    const result = resolveDynamicVars(text);
    expect(result).not.toContain('{{$timestamp}}');
    expect(parseInt(result.split(' ')[1])).toBeGreaterThan(1000000);
  });

  it('resolves all variables', () => {
    const text = 'hello {{globalKey}} {{localKey}} {{colKey}}';
    const result = resolveAllVariables(text, 'col1');
    expect(result).toBe('hello globalVal localVal colVal');
  });
});
