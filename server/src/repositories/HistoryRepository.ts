import { isMongo } from '../db/connect';
import { History } from '../models/History';
import { SqlHistory } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';

export interface IHistorySnapshotRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  params?: Array<{ key: string; value: string }>;
  auth?: Record<string, unknown>;
}

export interface IHistorySnapshotResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
  responseTime: number;
  size: number;
}

export interface IHistoryRecord {
  _id: string; id: string;
  userId: string;
  workspaceId: string;
  requestSnapshot: IHistorySnapshotRequest;
  responseSnapshot: IHistorySnapshotResponse;
  testResults: Array<{ name: string; passed: boolean; error?: string }>;
  executedAt: Date;
  /** Derived columns kept so older callers can read method/url/status. */
  method: string;
  url: string;
  statusCode: number | null;
  duration: number | null;
}

function emptyResponse(): IHistorySnapshotResponse {
  return { status: 0, statusText: '', headers: {}, body: '', bodyTruncated: false, responseTime: 0, size: 0 };
}

function headersToObject(headers: unknown): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Map) return Object.fromEntries(headers.entries());
  if (typeof headers === 'object') return headers as Record<string, string>;
  return {};
}

function sqlToRecord(h: SqlHistory): IHistoryRecord {
  const requestData = typeof h.requestData === 'string' ? safeParse(h.requestData) : (h.requestData || {});
  const responseData = typeof h.responseData === 'string' ? safeParse(h.responseData) : (h.responseData || {});
  const requestSnapshot: IHistorySnapshotRequest = requestData.requestSnapshot || {
    method: h.method || requestData.method || 'GET',
    url: h.url || requestData.url || '',
    headers: requestData.headers || {},
    body: requestData.body,
    params: requestData.params,
    auth: requestData.auth,
  };
  const responseSnapshot: IHistorySnapshotResponse = responseData.responseSnapshot || {
    ...emptyResponse(),
    status: h.statusCode ?? responseData.statusCode ?? 0,
    body: responseData.body || '',
    headers: responseData.headers || {},
    responseTime: h.duration ?? 0,
  };
  return {
    _id: h.id, id: h.id, userId: h.userId, workspaceId: h.workspaceId,
    requestSnapshot, responseSnapshot,
    testResults: responseData.testResults || [],
    executedAt: h.createdAt,
    method: requestSnapshot.method,
    url: requestSnapshot.url,
    statusCode: responseSnapshot.status,
    duration: responseSnapshot.responseTime,
  };
}

function mongoToRecord(h: any): IHistoryRecord {
  const snap = h.requestSnapshot || {};
  const res = h.responseSnapshot || {};
  const requestSnapshot: IHistorySnapshotRequest = {
    method: snap.method || h.method || 'GET',
    url: snap.url || h.url || '',
    headers: headersToObject(snap.headers),
    body: snap.body,
    params: snap.params,
    auth: snap.auth,
  };
  const responseSnapshot: IHistorySnapshotResponse = {
    status: res.status ?? h.statusCode ?? 0,
    statusText: res.statusText || '',
    headers: headersToObject(res.headers),
    body: res.body || '',
    bodyTruncated: !!res.bodyTruncated,
    responseTime: res.responseTime ?? h.duration ?? 0,
    size: res.size ?? 0,
  };
  return {
    _id: h._id.toString(), id: h._id.toString(),
    userId: h.userId?.toString(), workspaceId: h.workspaceId?.toString(),
    requestSnapshot, responseSnapshot,
    testResults: h.testResults || [],
    executedAt: h.executedAt || h.createdAt,
    method: requestSnapshot.method,
    url: requestSnapshot.url,
    statusCode: responseSnapshot.status,
    duration: responseSnapshot.responseTime,
  };
}

function safeParse(raw: string): any {
  try { return JSON.parse(raw); } catch { return {}; }
}

/** Accept either the snapshot record or the legacy flat columns used by older tests. */
function normalizeCreate(data: any): Omit<IHistoryRecord, '_id' | 'id'> {
  if (data.requestSnapshot) {
    return {
      userId: String(data.userId),
      workspaceId: String(data.workspaceId),
      requestSnapshot: data.requestSnapshot,
      responseSnapshot: data.responseSnapshot || emptyResponse(),
      testResults: data.testResults || [],
      executedAt: data.executedAt || new Date(),
      method: data.requestSnapshot.method,
      url: data.requestSnapshot.url,
      statusCode: data.responseSnapshot?.status ?? null,
      duration: data.responseSnapshot?.responseTime ?? null,
    };
  }
  const requestSnapshot: IHistorySnapshotRequest = {
    method: data.method || data.requestData?.method || 'GET',
    url: data.url || data.requestData?.url || '',
    headers: data.requestData?.headers || {},
    body: data.requestData?.body,
  };
  const responseSnapshot: IHistorySnapshotResponse = {
    ...emptyResponse(),
    status: data.statusCode ?? data.responseData?.statusCode ?? 0,
    body: data.responseData?.body || '',
    headers: data.responseData?.headers || {},
    responseTime: data.duration ?? 0,
  };
  return {
    userId: String(data.userId),
    workspaceId: String(data.workspaceId),
    requestSnapshot,
    responseSnapshot,
    testResults: [],
    executedAt: new Date(),
    method: requestSnapshot.method,
    url: requestSnapshot.url,
    statusCode: responseSnapshot.status,
    duration: responseSnapshot.responseTime,
  };
}

export const HistoryRepository = {
  async findByUser(userId: string, workspaceId: string, limit = 200): Promise<IHistoryRecord[]> {
    const page = await this.findPage({ userId, workspaceId, page: 1, limit });
    return page.items;
  },

  async findPage(opts: {
    userId: string; workspaceId: string;
    method?: string; status?: number;
    page: number; limit: number;
  }): Promise<{ items: IHistoryRecord[]; total: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const skip = (page - 1) * limit;
    if (isMongo()) {
      const query: Record<string, unknown> = { userId: opts.userId, workspaceId: opts.workspaceId };
      if (opts.method) query['requestSnapshot.method'] = opts.method.toUpperCase();
      if (opts.status !== undefined) query['responseSnapshot.status'] = opts.status;
      const [rows, total] = await Promise.all([
        History.find(query).sort({ executedAt: -1 }).skip(skip).limit(limit).lean(),
        History.countDocuments(query),
      ]);
      return { items: rows.map(mongoToRecord), total };
    }
    const where: any = { userId: opts.userId, workspaceId: opts.workspaceId };
    if (opts.method) where.method = opts.method.toUpperCase();
    if (opts.status !== undefined) where.statusCode = opts.status;
    const { rows, count } = await SqlHistory.findAndCountAll({
      where, order: [['createdAt', 'DESC']], limit, offset: skip,
    });
    return { items: rows.map(sqlToRecord), total: count };
  },

  async findOneForUser(id: string, userId: string): Promise<IHistoryRecord | null> {
    if (isMongo()) {
      const h = await History.findOne({ _id: id, userId }).lean();
      return h ? mongoToRecord(h) : null;
    }
    const h = await SqlHistory.findOne({ where: { id, userId } });
    return h ? sqlToRecord(h) : null;
  },

  async deleteOneForUser(id: string, userId: string): Promise<IHistoryRecord | null> {
    const existing = await this.findOneForUser(id, userId);
    if (!existing) return null;
    await this.delete(id);
    return existing;
  },

  async deleteByUserWorkspace(userId: string, workspaceId: string): Promise<IHistoryRecord[]> {
    if (isMongo()) {
      const rows = await History.find({ userId, workspaceId }).lean();
      await History.deleteMany({ userId, workspaceId });
      return rows.map(mongoToRecord);
    }
    const rows = await SqlHistory.findAll({ where: { userId, workspaceId } });
    const records = rows.map(sqlToRecord);
    await SqlHistory.destroy({ where: { userId, workspaceId } });
    return records;
  },

  async findOldest(userId: string): Promise<IHistoryRecord | null> {
    if (isMongo()) {
      const h = await History.findOne({ userId }).sort({ executedAt: 1 }).lean();
      return h ? mongoToRecord(h) : null;
    }
    const h = await SqlHistory.findOne({ where: { userId }, order: [['createdAt', 'ASC']] });
    return h ? sqlToRecord(h) : null;
  },

  async create(data: any): Promise<IHistoryRecord> {
    const row = normalizeCreate(data);
    if (isMongo()) {
      const created = await History.create({
        userId: row.userId,
        workspaceId: row.workspaceId,
        requestSnapshot: row.requestSnapshot,
        responseSnapshot: row.responseSnapshot,
        testResults: row.testResults,
        executedAt: row.executedAt,
      });
      return mongoToRecord(created);
    }
    const created = await SqlHistory.create({
      id: uuidv4(),
      userId: row.userId,
      workspaceId: row.workspaceId,
      method: row.requestSnapshot.method,
      url: row.requestSnapshot.url,
      statusCode: row.responseSnapshot.status,
      duration: row.responseSnapshot.responseTime,
      requestData: JSON.stringify({ requestSnapshot: row.requestSnapshot }),
      responseData: JSON.stringify({ responseSnapshot: row.responseSnapshot, testResults: row.testResults }),
    });
    return sqlToRecord(created);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await History.findByIdAndDelete(id); return; }
    await SqlHistory.destroy({ where: { id } });
  },

  async deleteByUser(userId: string): Promise<void> {
    if (isMongo()) { await History.deleteMany({ userId }); return; }
    await SqlHistory.destroy({ where: { userId } });
  },
};

void Op;
