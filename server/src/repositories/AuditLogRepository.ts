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

export interface IAuditLogQuery {
  actionContains?: string;
  userId?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

function isStructured(filter: Record<string, any>): filter is IAuditLogQuery {
  return 'actionContains' in filter || 'createdFrom' in filter || 'createdTo' in filter
    || (filter.userId !== undefined && !filter.$regex && !filter.action);
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

  async list(filter: IAuditLogQuery | Record<string, any> = {}, limit = 100, skip = 0): Promise<IAuditLogRecord[]> {
    if (isMongo()) {
      return (await AuditLog.find(mongoFilter(filter)).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()).map(mongoToRecord);
    }
    return (await SqlAuditLog.findAll({ where: sqlFilter(filter), order: [['createdAt', 'DESC']], limit, offset: skip })).map(sqlToRecord);
  },

  async count(filter: IAuditLogQuery | Record<string, any> = {}): Promise<number> {
    if (isMongo()) {
      return AuditLog.countDocuments(mongoFilter(filter));
    }
    return SqlAuditLog.count({ where: sqlFilter(filter) });
  },
};

function mongoFilter(filter: IAuditLogQuery | Record<string, any>): Record<string, unknown> {
  if (!isStructured(filter)) return filter;
  const q: Record<string, unknown> = {};
  if (filter.userId) q.userId = filter.userId;
  if (filter.actionContains) q.action = { $regex: filter.actionContains, $options: 'i' };
  if (filter.createdFrom || filter.createdTo) {
    const range: Record<string, Date> = {};
    if (filter.createdFrom) range.$gte = filter.createdFrom;
    if (filter.createdTo) range.$lte = filter.createdTo;
    q.createdAt = range;
  }
  return q;
}

function sqlFilter(filter: IAuditLogQuery | Record<string, any>): Record<string, unknown> {
  const { Op } = require('sequelize');
  if (!isStructured(filter)) {
    const where: Record<string, unknown> = {};
    if (filter.userId) where.userId = String(filter.userId);
    if (typeof filter.action === 'string') where.action = filter.action;
    return where;
  }
  const where: Record<string, unknown> = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.actionContains) where.action = { [Op.like]: `%${filter.actionContains}%` };
  if (filter.createdFrom || filter.createdTo) {
    where.createdAt = {
      ...(filter.createdFrom ? { [Op.gte]: filter.createdFrom } : {}),
      ...(filter.createdTo ? { [Op.lte]: filter.createdTo } : {}),
    };
  }
  return where;
}

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
