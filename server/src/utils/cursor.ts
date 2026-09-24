/** Cursor is `${order}:${id}` so a page can resume without an offset scan of the whole table. */
export function sliceCursor<T extends { _id: string; order?: number }>(
  rows: T[],
  limit: number,
  cursor?: string,
): { items: T[]; nextCursor: string | null } {
  const size = Math.min(500, Math.max(1, limit || 50));
  let start = 0;
  if (cursor) {
    const idx = rows.findIndex((r) => `${r.order ?? 0}:${r._id}` === cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const items = rows.slice(start, start + size);
  const last = items[items.length - 1];
  const nextCursor = start + size < rows.length && last ? `${last.order ?? 0}:${last._id}` : null;
  return { items, nextCursor };
}
