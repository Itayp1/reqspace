import { decodeCursor, encodeCursor, pageResult, parseLimit } from '../utils/cursor';

describe('cursor pagination', () => {
  test('round-trips order and id', () => {
    const cursor = encodeCursor(3, 'abc-123');
    expect(decodeCursor(cursor)).toEqual({ order: 3, id: 'abc-123' });
    expect(decodeCursor('not-a-cursor')).toBeNull();
  });

  test('pageResult keeps one extra row as the next cursor', () => {
    const rows = [
      { order: 0, _id: 'a' },
      { order: 1, _id: 'b' },
      { order: 2, _id: 'c' },
    ];
    const page = pageResult(rows, 2);
    expect(page.items.map(row => row._id)).toEqual(['a', 'b']);
    expect(decodeCursor(page.nextCursor!)).toEqual({ order: 1, id: 'b' });
    expect(parseLimit('500')).toBe(100);
    expect(parseLimit('0')).toBeNull();
  });
});
