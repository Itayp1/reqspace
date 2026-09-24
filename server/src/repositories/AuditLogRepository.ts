import { Op } from 'sequelize';
import { isMongo } from '../db/connect';
import { AuditLog } from '../models/AuditLog';
import { SqlAuditLog } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

export interface IAuditLogRecord {
  _id: string;
  id: string;
  userId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: Date;
}

function sqlToRecord(a: SqlAuditLog): IAuditLogRecord {
  return {
    _id: a.id,
    id: a.id,
    userId: a.userId,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    ip: a.ip,
    details: a.details ? JSON.parse(a.details) : null,
    createdAt: a.createdAt,
  };
}

function mongoToRecord(a: any): IAuditLogRecord {
  return {
    _id: a._id.toString(),
    id: a._id.toString(),
    userId: a.userId?.toString(),
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId?.toString(),
    ip: a.ip,
    details: a.details,
    createdAt: a.createdAt,
  };
}

export const AuditLogRepository = {
  async log(data: Omit<IAuditLogRecord, '_id' | 'id' | 'createdAt'>): Promise<void> {
    if (isMongo()) {
      await AuditLog.create(data);
      return;
    }
    await SqlAuditLog.create({
      id: uuidv4(),
      ...data,
      details: data.details ? JSON.stringify(data.details) : null,
    });
  },

  async findByUser(userId: string, limit = 100): Promise<IAuditLogRecord[]> {
    if (isMongo()) {
      return (await AuditLog.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean()).map(mongoToRecord);
    }
    return (await SqlAuditLog.findAll({ where: { userId }, order: [['createdAt', 'DESC']], limit })).map(sqlToRecord);
  },

  async list(filter: Record<string, any> = {}, limit = 100, skip = 0): Promise<IAuditLogRecord[]> {
    if (isMongo()) {
      return (await AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()).map(mongoToRecord);
    }
    return (await SqlAuditLog.findAll({ where: filter, order: [['createdAt', 'DESC']], limit, offset: skip })).map(sqlToRecord);
  },

  async query(opts: { action?: string; userId?: string; from?: string; to?: string; limit: number; skip: number }): Promise<{ logs: IAuditLogRecord[]; total: number }> {
    if (isMongo()) {
      const filter: Record<string, unknown> = {};
      if (opts.action) filter.action = opts.action;
      if (opts.userId) filter.userId = opts.userId;
      if (opts.from || opts.to) {
        const createdAt: Record<string, Date> = {};
        if (opts.from) createdAt.$gte = new Date(opts.from);
        if (opts.to) createdAt.$lte = new Date(opts.to);
        filter.createdAt = createdAt;
      }
      const [rows, total] = await Promise.all([
        AuditLog.find(filter).sort({ createdAt: -1 }).skip(opts.skip).limit(opts.limit).lean(),
        AuditLog.countDocuments(filter),
      ]);
      return { logs: rows.map(mongoToRecord), total };
    }
    const where: Record<string, unknown> = {};
    if (opts.action) where.action = opts.action;
    if (opts.userId) where.userId = opts.userId;
    if (opts.from || opts.to) {
      const createdAt: Record<symbol, Date> = {};
      if (opts.from) createdAt[Op.gte] = new Date(opts.from);
      if (opts.to) createdAt[Op.lte] = new Date(opts.to);
      where.createdAt = createdAt;
    }
    const total = await SqlAuditLog.count({ where: where as any });
    const rows = await SqlAuditLog.findAll({
      where: where as any,
      order: [['createdAt', 'DESC']],
      limit: opts.limit,
      offset: opts.skip,
    });
    return { logs: rows.map(sqlToRecord), total };
  },

  async count(filter: Record<string, any> = {}): Promise<number> {
    if (isMongo()) {
      return AuditLog.countDocuments(filter);
    }
    return SqlAuditLog.count({ where: filter });
  },
};

export async function logAudit(
  userId: string,
  action: string,
  opts?: {
    targetType?: string;
    targetId?: string;
    ip?: string;
    details?: Record<string, unknown>;
  }
) {
  try {
    await AuditLogRepository.log({
      userId: userId.toString(),
      action,
      targetType: opts?.targetType,
      targetId: opts?.targetId?.toString(),
      ip: opts?.ip,
      details: opts?.details,
    });
  } catch (err) {
    console.error('AuditLog Error:', err);
  }
}
