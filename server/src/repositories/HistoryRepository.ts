import { SqlHistory } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

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
  createdAt: Date;
}

function sqlToRecord(h: SqlHistory): IHistoryRecord {
  return {
    _id: h.id, id: h.id, userId: h.userId, workspaceId: h.workspaceId, method: h.method, url: h.url, statusCode: h.statusCode, duration: h.duration,
    requestData: typeof h.requestData === 'string' ? JSON.parse(h.requestData) : h.requestData,
    responseData: typeof h.responseData === 'string' ? JSON.parse(h.responseData) : h.responseData,
    createdAt: h.createdAt,
  };
}

export const HistoryRepository = {
  async findByUser(userId: string, workspaceId: string, limit = 200): Promise<IHistoryRecord[]> {
    return (await SqlHistory.findAll({ where: { userId, workspaceId }, order: [['createdAt', 'DESC']], limit })).map(sqlToRecord);
  },

  async create(data: Omit<IHistoryRecord, '_id' | 'id' | 'createdAt'>): Promise<IHistoryRecord> {
    return sqlToRecord(await SqlHistory.create({
      id: uuidv4(), ...data,
      requestData: JSON.stringify(data.requestData || {}),
      responseData: JSON.stringify(data.responseData || {}),
    }));
  },

  async delete(id: string): Promise<void> {
    await SqlHistory.destroy({ where: { id } });
  },

  async deleteByUser(userId: string): Promise<void> {
    await SqlHistory.destroy({ where: { userId } });
  },
};
