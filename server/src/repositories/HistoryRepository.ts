import { isMongo } from '../db/connect';
import { History } from '../models/History';
import { SqlHistory } from '../db/sql-models';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

export interface IHistoryRequestSnapshot {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  params?: Array<{ key: string; value: string }>;
}

export interface IHistoryResponseSnapshot {
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
  responseTime: number;
  size: number;
}

export interface IHistoryTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface IHistoryRecord {
  _id: string;
  userId: string;
  workspaceId: string;
  requestSnapshot: IHistoryRequestSnapshot;
  responseSnapshot: IHistoryResponseSnapshot;
  testResults: IHistoryTestResult[];
  executedAt: Date;
}

export interface IHistoryListFilter {
  userId: string;
  workspaceId: string;
  method?: string;
  status?: number;
}

function headersToPlainObject(headers: unknown): Record<string, string> {
  if (headers instanceof Map) return Object.fromEntries(headers);
  return (headers as Record<string, string>) || {};
}

function mongoToRecord(h: any): IHistoryRecord {
  return {
    _id: h._id.toString(),
    userId: h.userId?.toString(),
    workspaceId: h.workspaceId?.toString(),
    requestSnapshot: { ...h.requestSnapshot, headers: headersToPlainObject(h.requestSnapshot?.headers) },
    responseSnapshot: { ...h.responseSnapshot, headers: headersToPlainObject(h.responseSnapshot?.headers) },
    testResults: h.testResults || [],
    executedAt: h.executedAt,
  };
}

function sqlToRecord(h: SqlHistory): IHistoryRecord {
  return {
    _id: h.id,
    userId: h.userId,
    workspaceId: h.workspaceId,
    requestSnapshot: JSON.parse(h.requestSnapshot || '{}'),
    responseSnapshot: JSON.parse(h.responseSnapshot || '{}'),
    testResults: JSON.parse(h.testResults || '[]'),
    executedAt: h.executedAt,
  };
}

export const HistoryRepository = {
  async list(filter: IHistoryListFilter, page: number, limit: number): Promise<{ items: IHistoryRecord[]; total: number }> {
    if (isMongo()) {
      const query: Record<string, unknown> = { userId: filter.userId, workspaceId: filter.workspaceId };
      if (filter.method) query['requestSnapshot.method'] = filter.method;
      if (filter.status !== undefined) query['responseSnapshot.status'] = filter.status;
      const [items, total] = await Promise.all([
        History.find(query).sort({ executedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        History.countDocuments(query),
      ]);
      return { items: items.map(mongoToRecord), total };
    }
    const where: Record<string, unknown> = { userId: filter.userId, workspaceId: filter.workspaceId };
    if (filter.method) where.method = filter.method;
    if (filter.status !== undefined) where.status = filter.status;
    const { rows, count } = await SqlHistory.findAndCountAll({
      where, order: [['executedAt', 'DESC']], offset: (page - 1) * limit, limit,
    });
    return { items: rows.map(sqlToRecord), total: count };
  },

  async findById(id: string, userId: string): Promise<IHistoryRecord | null> {
    if (isMongo()) {
      const h = await History.findOne({ _id: id, userId }).lean();
      return h ? mongoToRecord(h) : null;
    }
    const h = await SqlHistory.findOne({ where: { id, userId } });
    return h ? sqlToRecord(h) : null;
  },

  async create(data: {
    userId: string;
    workspaceId: string;
    requestSnapshot: IHistoryRequestSnapshot;
    responseSnapshot: IHistoryResponseSnapshot;
    testResults: IHistoryTestResult[];
    executedAt: Date;
  }): Promise<IHistoryRecord> {
    if (isMongo()) {
      const h = await History.create(data as any);
      return mongoToRecord(h);
    }
    const h = await SqlHistory.create({
      id: uuidv4(),
      userId: data.userId,
      workspaceId: data.workspaceId,
      method: data.requestSnapshot?.method,
      status: data.responseSnapshot?.status,
      requestSnapshot: JSON.stringify(data.requestSnapshot ?? {}),
      responseSnapshot: JSON.stringify(data.responseSnapshot ?? {}),
      testResults: JSON.stringify(data.testResults ?? []),
      executedAt: data.executedAt,
    });
    return sqlToRecord(h);
  },

  async deleteOne(id: string, userId: string): Promise<IHistoryRecord | null> {
    const existing = await this.findById(id, userId);
    if (!existing) return null;
    if (isMongo()) {
      await History.deleteOne({ _id: id, userId });
    } else {
      await SqlHistory.destroy({ where: { id, userId } });
    }
    return existing;
  },

  /** Deletes everything for a user (optionally scoped to one workspace) and
   * returns the deleted records so the caller can reconcile byte accounting. */
  async deleteMany(userId: string, workspaceId?: string): Promise<IHistoryRecord[]> {
    if (isMongo()) {
      const query: Record<string, unknown> = { userId };
      if (workspaceId) query.workspaceId = workspaceId;
      const removed = (await History.find(query).lean()).map(mongoToRecord);
      await History.deleteMany(query);
      return removed;
    }
    const where: Record<string, unknown> = { userId };
    if (workspaceId) where.workspaceId = workspaceId;
    const rows = await SqlHistory.findAll({ where });
    const removed = rows.map(sqlToRecord);
    await SqlHistory.destroy({ where });
    return removed;
  },

  /** Oldest entry for a user, across all workspaces — used by the GC loop in
   * saveHistoryEntry to evict when the user is over their byte quota. */
  async findOldestByUser(userId: string): Promise<IHistoryRecord | null> {
    if (isMongo()) {
      const h = await History.findOne({ userId }).sort({ executedAt: 1 }).lean();
      return h ? mongoToRecord(h) : null;
    }
    const h = await SqlHistory.findOne({ where: { userId }, order: [['executedAt', 'ASC']] });
    return h ? sqlToRecord(h) : null;
  },
};

// Re-export so callers that only need "is this filter usable" don't have to
// import sequelize's Op directly.
export { Op };
