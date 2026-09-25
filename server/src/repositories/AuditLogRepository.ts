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

export const AuditLogRepository = {
  async log(data: Omit<IAuditLogRecord, '_id' | 'id' | 'createdAt'>): Promise<void> {
    await SqlAuditLog.create({
      id: uuidv4(),
      ...data,
      details: data.details ? JSON.stringify(data.details) : null,
    });
  },

  async findByUser(userId: string, limit = 100): Promise<IAuditLogRecord[]> {
    return (await SqlAuditLog.findAll({ where: { userId }, order: [['createdAt', 'DESC']], limit })).map(sqlToRecord);
  },

  async list(filter: Record<string, any> = {}, limit = 100, skip = 0): Promise<IAuditLogRecord[]> {
    return (await SqlAuditLog.findAll({ where: filter, order: [['createdAt', 'DESC']], limit, offset: skip })).map(sqlToRecord);
  },

  async count(filter: Record<string, any> = {}): Promise<number> {
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
