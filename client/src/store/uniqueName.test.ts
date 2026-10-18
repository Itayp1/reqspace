import { describe, it, expect } from 'vitest';
import { uniqueName } from './collectionStore';

describe('uniqueName', () => {
  it('keeps a free name', () => expect(uniqueName('A (Copy)', ['A'])).toBe('A (Copy)'));
  it('numbers repeated copies', () => {
    expect(uniqueName('A (Copy)', ['A', 'A (Copy)'])).toBe('A (Copy 2)');
    expect(uniqueName('A (Copy)', ['A (Copy)', 'A (Copy 2)'])).toBe('A (Copy 3)');
  });
  it('numbers plain names', () => expect(uniqueName('Copy of X', ['Copy of X'])).toBe('Copy of X 2'));
});
