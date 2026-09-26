import { SqlRequest } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';
import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';

// PERF-6: the tree/list views only ever render name, method and position —
// carrying params/headers/auth/body/scripts/comments for every row in a
// 500-request collection is most of what makes that payload heavy.
export interface IRequestSummary {
  _id: string;
  collectionId: string;
  folderId: string | null;
  name: string;
  method: string;
  order: number;
}

export interface IRequestRecord {
  _id: string; id: string;
  collectionId: string;
  folderId: string | null;
  name: string;
  method: string;
  url: string;
  params: any[];
  headers: any[];
  auth: any;
  body: any;
  preRequestScript: string;
  testScript: string;
  description: string;
  order: number;
  comments: any[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function sqlToSummary(r: SqlRequest): IRequestSummary {
  return {
    _id: r.id,
    collectionId: r.collectionId,
    folderId: r.folderId,
    name: r.name,
    method: r.method,
    order: r.order,
  };
}

function sqlToRecord(r: SqlRequest): IRequestRecord {
  return {
    _id: r.id, id: r.id,
    collectionId: r.collectionId,
    folderId: r.folderId,
    name: r.name, method: r.method, url: r.url,
    params: typeof r.params === 'string' ? JSON.parse(r.params) : (r.params || []),
    headers: typeof r.headers === 'string' ? JSON.parse(r.headers) : (r.headers || []),
    auth: typeof r.auth === 'string' ? JSON.parse(r.auth) : (r.auth || { type: 'none' }),
    body: typeof r.body === 'string' ? JSON.parse(r.body) : (r.body || { mode: 'none' }),
    preRequestScript: r.preRequestScript,
    testScript: r.testScript,
    description: r.description,
    order: r.order,
    comments: typeof r.comments === 'string' ? JSON.parse(r.comments) : (r.comments || []),
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const RequestRepository = {
  async findById(id: string): Promise<IRequestRecord | null> {
    const r = await SqlRequest.findByPk(id); return r ? sqlToRecord(r) : null;
  },

  async findByCollection(collectionId: string): Promise<IRequestRecord[]> {
    return (await SqlRequest.findAll({ where: { collectionId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  async findSummaryByCollection(collectionId: string, options?: { rootOnly?: boolean }): Promise<IRequestSummary[]> {
    const where: Record<string, any> = { collectionId };
    if (options?.rootOnly) where.folderId = null;
    const rows = await SqlRequest.findAll({
      where,
      order: [['order', 'ASC']],
      attributes: ['id', 'collectionId', 'folderId', 'name', 'method', 'order'],
    });
    return rows.map(sqlToSummary);
  },

  async findSummaryByFolder(folderId: string): Promise<IRequestSummary[]> {
    const rows = await SqlRequest.findAll({
      where: { folderId },
      order: [['order', 'ASC']],
      attributes: ['id', 'collectionId', 'folderId', 'name', 'method', 'order'],
    });
    return rows.map(sqlToSummary);
  },

  async findByFolder(folderId: string): Promise<IRequestRecord[]> {
    return (await SqlRequest.findAll({ where: { folderId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  async create(data: Partial<IRequestRecord> & { name: string; collectionId: string; createdBy: string }): Promise<IRequestRecord> {
    return sqlToRecord(await SqlRequest.create({
      id: uuidv4(), ...data,
      folderId: data.folderId ?? null,
      params: JSON.stringify(data.params || []),
      headers: JSON.stringify(data.headers || []),
      auth: JSON.stringify(data.auth || { type: 'none' }),
      body: JSON.stringify(data.body || { mode: 'none' }),
      comments: JSON.stringify(data.comments || []),
      preRequestScript: data.preRequestScript || '',
      testScript: data.testScript || '',
      description: data.description || '',
      order: data.order ?? 0,
    }));
  },

  async update(id: string, data: Partial<IRequestRecord>): Promise<IRequestRecord | null> {
    const patch: any = { ...data };
    if (data.params !== undefined) patch.params = JSON.stringify(data.params);
    if (data.headers !== undefined) patch.headers = JSON.stringify(data.headers);
    if (data.auth !== undefined) patch.auth = JSON.stringify(data.auth);
    if (data.body !== undefined) patch.body = JSON.stringify(data.body);
    if (data.comments !== undefined) patch.comments = JSON.stringify(data.comments);
    await SqlRequest.update(patch, { where: { id } }); return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    await SqlRequest.destroy({ where: { id } });
  },

  async deleteByCollection(collectionId: string): Promise<void> {
    await SqlRequest.destroy({ where: { collectionId } });
  },

  async deleteByFolder(folderId: string): Promise<void> {
    await SqlRequest.destroy({ where: { folderId } });
  },

  async countInCollection(collectionId: string, folderId: string | null): Promise<number> {
    return SqlRequest.count({ where: { collectionId, folderId: folderId ?? null } });
  },

  async searchInWorkspace(query: string, collectionIds: string[]): Promise<IRequestRecord[]> {
    const { Op } = await import('sequelize');
    const term = escapeLike(String(query).slice(0, MAX_SEARCH_LENGTH));
    if (!term || !collectionIds.length) return [];
    return (await SqlRequest.findAll({
      where: {
        collectionId: { [Op.in]: collectionIds },
        [Op.or]: [{ name: { [Op.like]: `%${term}%` } }, { url: { [Op.like]: `%${term}%` } }],
      },
      limit: 200,
    })).map(sqlToRecord);
  },
};
