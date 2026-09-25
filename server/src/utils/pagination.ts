import { Op } from 'sequelize';

export function decodeCursor(cursor: string | undefined): { key1: string | number | Date, key2: string } | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

export function encodeCursor(key1: string | number | Date, key2: string): string {
  if (key1 instanceof Date) {
    key1 = key1.toISOString();
  }
  const json = JSON.stringify({ key1, key2 });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function getCursorWhere(cursor: { key1: any, key2: string } | null, orderField: string, isDesc: boolean = false): any {
  if (!cursor) return {};
  const { key1, key2 } = cursor;
  const opGt = isDesc ? Op.lt : Op.gt;
  return {
    [Op.or]: [
      { [orderField]: { [opGt]: key1 } },
      { [orderField]: key1, id: { [Op.gt]: key2 } }
    ]
  };
}
