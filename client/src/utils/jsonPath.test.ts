import { describe, it, expect } from 'vitest';
import { queryJsonPath, isMultiPath } from './jsonPath';

const doc = { data: [{ id: 1, name: 'a' }, { id: 2, name: 'b', kids: [{ id: 3 }] }], a: { b: [10, 20] }, 'k.x y': 5, n: null, e: [] };

describe('queryJsonPath', () => {
  it('handles plain paths and indexes', () => {
    expect(queryJsonPath(doc, '$.data[0].name')).toEqual(['a']);
    expect(queryJsonPath(doc, 'data[-1].id')).toEqual([2]);
  });
  it('handles recursive descent', () => {
    expect(queryJsonPath(doc, '$..id')).toEqual([1, 2, 3]);
  });
  it('handles wildcards', () => {
    expect(queryJsonPath(doc, '$.a.b[*]')).toEqual([10, 20]);
  });
  it('handles quoted keys, null and empty arrays', () => {
    expect(queryJsonPath(doc, "$['k.x y']")).toEqual([5]);
    expect(queryJsonPath(doc, '$.n')).toEqual([null]);
    expect(queryJsonPath(doc, '$.e[*]')).toEqual([]);
    expect(queryJsonPath(doc, '$.zzz')).toEqual([]);
  });
  it('throws on malformed input', () => {
    expect(() => queryJsonPath(doc, '$.a[')).toThrow();
    expect(isMultiPath('$..id')).toBe(true);
    expect(isMultiPath('$.a.b')).toBe(false);
  });
});
