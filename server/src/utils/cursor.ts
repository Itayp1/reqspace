import { Op } from 'sequelize';

export const PAGE_LIMIT_MAX = 100;

export function parseLimit(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(PAGE_LIMIT_MAX, Math.floor(n));
}

export function encodeCursor(order: number, id: string): string {
  return Buffer.from(`${order}\n${id}`).toString('base64url');
}

export function decodeCursor(cursor?: string): { order: number; id: string } | null {
  if (!cursor) return null;
  try {
    const text = Buffer.from(cursor, 'base64url').toString('utf8');
    const split = text.indexOf('\n');
    if (split < 0) return null;
    const order = Number(text.slice(0, split));
    const id = text.slice(split + 1);
    if (!Number.isFinite(order) || !id) return null;
    return { order, id };
  } catch {
    return null;
  }
}

export function pageResult<T extends { order: number; _id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.order, last._id) : null,
  };
}

export function mongoAfter(cursor: { order: number; id: string } | null) {
  if (!cursor) return {};
  return {
    $or: [
      { order: { $gt: cursor.order } },
      { order: cursor.order, _id: { $gt: cursor.id } },
    ],
  };
}

export function sqlAfter(cursor: { order: number; id: string } | null): any {
  if (!cursor) return {};
  return {
    [Op.or]: [
      { order: { [Op.gt]: cursor.order } },
      { [Op.and]: [{ order: cursor.order }, { id: { [Op.gt]: cursor.id } }] },
    ],
  };
}
