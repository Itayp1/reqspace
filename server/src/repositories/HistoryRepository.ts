import { isMongo } from '../db/connect';
import { History } from '../models/History';
import { SqlHistory } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';
import { WhereOptions } from 'sequelize';

export interface IHistorySnapshotRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string> | Array<{ key: string; value: string; enabled?: boolean }>;
  body?: string;
  params?: Array<{ key: string; value: string }>;
  auth?: Record<string, unknown>;
}

export interface IHistorySnapshotResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  bodyTruncated?: boolean;
  responseTime?: number;
  size?: number;
}

export interface IHistoryRecord {
  _id: string; id: string;
  userId: string;
  workspaceId: string;
  method: string;
  url: string;
  statusCode: number | null;
  duration: number | null;
  requestData: any;
  responseData: any;
  requestSnapshot: IHistorySnapshotRequest;
  responseSnapshot: IHistorySnapshotResponse;
  testResults: Array<{ name: string; passed: boolean; error?: string }>;
  executedAt: Date;
  createdAt: Date;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function sqlToRecord(h: SqlHistory): IHistoryRecord {
  const requestData = parseJson<any>(h.requestData, {});
  const responseData = parseJson<any>(h.responseData, {});
  const requestSnapshot: IHistorySnapshotRequest = requestData.requestSnapshot || requestData || {};
  const responseSnapshot: IHistorySnapshotResponse = responseData.responseSnapshot || responseData || {};
  if (!requestSnapshot.method && h.method) requestSnapshot.method = h.method;
  if (!requestSnapshot.url && h.url) requestSnapshot.url = h.url;
  if (responseSnapshot.status == null && h.statusCode != null) responseSnapshot.status = h.statusCode;
  if (responseSnapshot.responseTime == null && h.duration != null) responseSnapshot.responseTime = h.duration;
  return {
    _id: h.id, id: h.id, userId: h.userId, workspaceId: h.workspaceId,
    method: h.method || requestSnapshot.method || '',
    url: h.url || requestSnapshot.url || '',
    statusCode: h.statusCode ?? responseSnapshot.status ?? null,
    duration: h.duration ?? responseSnapshot.responseTime ?? null,
    requestData, responseData, requestSnapshot, responseSnapshot,
    testResults: responseData.testResults || [],
    executedAt: h.createdAt, createdAt: h.createdAt,
  };
}

function mongoToRecord(h: any): IHistoryRecord {
  const requestSnapshot: IHistorySnapshotRequest = h.requestSnapshot || h.requestData || {};
  const responseSnapshot: IHistorySnapshotResponse = h.responseSnapshot || h.responseData || {};
  return {
    _id: h._id.toString(), id: h._id.toString(),
    userId: h.userId?.toString(), workspaceId: h.workspaceId?.toString(),
    method: h.method || requestSnapshot.method || '',
    url: h.url || requestSnapshot.url || '',
    statusCode: h.statusCode ?? responseSnapshot.status ?? null,
    duration: h.duration ?? responseSnapshot.responseTime ?? null,
    requestData: h.requestData || requestSnapshot,
    responseData: h.responseData || responseSnapshot,
    requestSnapshot, responseSnapshot,
    testResults: h.testResults || h.responseData?.testResults || [],
    executedAt: h.executedAt || h.createdAt,
    createdAt: h.createdAt || h.executedAt,
  };
}

export const HistoryRepository = {
  async findByUser(userId: string, workspaceId: string, limit = 200): Promise<IHistoryRecord[]> {
    if (isMongo()) return (await History.find({ userId, workspaceId }).sort({ executedAt: -1, createdAt: -1 }).limit(limit).lean()).map(mongoToRecord);
    return (await SqlHistory.findAll({ where: { userId, workspaceId }, order: [['createdAt', 'DESC']], limit })).map(sqlToRecord);
  },

  async create(data: {
    userId: string; workspaceId: string; method: string; url: string;
    statusCode: number | null; duration: number | null; requestData: any; responseData: any;
  }): Promise<IHistoryRecord> {
    if (isMongo()) {
      return mongoToRecord(await History.create({
        userId: data.userId,
        workspaceId: data.workspaceId,
        requestSnapshot: { method: data.method, url: data.url, ...(data.requestData || {}) },
        responseSnapshot: {
          status: data.statusCode ?? undefined,
          responseTime: data.duration ?? undefined,
          body: data.responseData?.body ?? '',
          ...(data.responseData || {}),
        },
        testResults: data.responseData?.testResults || [],
        executedAt: new Date(),
      }));
    }
    return sqlToRecord(await SqlHistory.create({
      id: uuidv4(), ...data,
      requestData: JSON.stringify(data.requestData || {}),
      responseData: JSON.stringify(data.responseData || {}),
    }));
  },

  async createFromSnapshots(data: {
    userId: string;
    workspaceId: string;
    requestSnapshot: IHistorySnapshotRequest;
    responseSnapshot: IHistorySnapshotResponse;
    testResults?: IHistoryRecord['testResults'];
    executedAt?: Date;
  }): Promise<IHistoryRecord> {
    const executedAt = data.executedAt || new Date();
    if (isMongo()) {
      return mongoToRecord(await History.create({
        userId: data.userId,
        workspaceId: data.workspaceId,
        requestSnapshot: data.requestSnapshot,
        responseSnapshot: data.responseSnapshot,
        testResults: data.testResults || [],
        executedAt,
      }));
    }
    return sqlToRecord(await SqlHistory.create({
      id: uuidv4(),
      userId: data.userId,
      workspaceId: data.workspaceId,
      method: data.requestSnapshot.method || '',
      url: data.requestSnapshot.url || '',
      statusCode: data.responseSnapshot.status ?? null,
      duration: data.responseSnapshot.responseTime ?? null,
      requestData: JSON.stringify({ requestSnapshot: data.requestSnapshot }),
      responseData: JSON.stringify({ responseSnapshot: data.responseSnapshot, testResults: data.testResults || [] }),
      createdAt: executedAt,
    }));
  },

  async query(opts: {
    userId: string;
    workspaceId?: string;
    method?: string;
    status?: number;
    limit: number;
    skip: number;
  }): Promise<{ items: IHistoryRecord[]; total: number }> {
    if (isMongo()) {
      const filter: Record<string, unknown> = { userId: opts.userId };
      if (opts.workspaceId) filter.workspaceId = opts.workspaceId;
      if (opts.method) filter['requestSnapshot.method'] = opts.method.toUpperCase();
      if (opts.status != null) filter['responseSnapshot.status'] = opts.status;
      const [rows, total] = await Promise.all([
        History.find(filter).sort({ executedAt: -1 }).skip(opts.skip).limit(opts.limit).lean(),
        History.countDocuments(filter),
      ]);
      return { items: rows.map(mongoToRecord), total };
    }
    const where: WhereOptions = { userId: opts.userId };
    if (opts.workspaceId) where.workspaceId = opts.workspaceId;
    if (opts.method) where.method = opts.method.toUpperCase();
    if (opts.status != null) where.statusCode = opts.status;
    const total = await SqlHistory.count({ where });
    const rows = await SqlHistory.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: opts.limit,
      offset: opts.skip,
    });
    return { items: rows.map(sqlToRecord), total };
  },

  async findOwned(id: string, userId: string): Promise<IHistoryRecord | null> {
    if (isMongo()) {
      const h = await History.findOne({ _id: id, userId }).lean();
      return h ? mongoToRecord(h) : null;
    }
    const h = await SqlHistory.findOne({ where: { id, userId } });
    return h ? sqlToRecord(h) : null;
  },

  async findOldest(userId: string): Promise<IHistoryRecord | null> {
    if (isMongo()) {
      const h = await History.findOne({ userId }).sort({ executedAt: 1 }).lean();
      return h ? mongoToRecord(h) : null;
    }
    const h = await SqlHistory.findOne({ where: { userId }, order: [['createdAt', 'ASC']] });
    return h ? sqlToRecord(h) : null;
  },

  async listForUser(userId: string, workspaceId?: string): Promise<IHistoryRecord[]> {
    if (isMongo()) {
      const filter: Record<string, unknown> = { userId };
      if (workspaceId) filter.workspaceId = workspaceId;
      return (await History.find(filter).lean()).map(mongoToRecord);
    }
    const where: WhereOptions = { userId };
    if (workspaceId) where.workspaceId = workspaceId;
    return (await SqlHistory.findAll({ where })).map(sqlToRecord);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await History.findByIdAndDelete(id); return; }
    await SqlHistory.destroy({ where: { id } });
  },

  async deleteOwned(id: string, userId: string): Promise<IHistoryRecord | null> {
    const item = await this.findOwned(id, userId);
    if (!item) return null;
    await this.delete(id);
    return item;
  },

  async deleteByUser(userId: string, workspaceId?: string): Promise<void> {
    if (isMongo()) {
      const filter: Record<string, unknown> = { userId };
      if (workspaceId) filter.workspaceId = workspaceId;
      await History.deleteMany(filter);
      return;
    }
    const where: WhereOptions = { userId };
    if (workspaceId) where.workspaceId = workspaceId;
    await SqlHistory.destroy({ where });
  },
};
