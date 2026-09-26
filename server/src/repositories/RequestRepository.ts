import { SqlRequest } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';
import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';

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

  async findByFolder(folderId: string): Promise<IRequestRecord[]> {
    return (await SqlRequest.findAll({ where: { folderId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  /** PERF-6: summaryOnly=true returns minimal fields to reduce wire payload */
  async findByCollections(collectionIds: string[], opts?: { summaryOnly?: boolean }): Promise<IRequestRecord[]> {
    if (!collectionIds.length) return [];
    const { Op } = await import('sequelize');
    const attrs = opts?.summaryOnly
      ? ['id', 'collectionId', 'folderId', 'name', 'method', 'url', 'order', 'updatedAt']
      : undefined;
    const rows = await SqlRequest.findAll({
      where: { collectionId: { [Op.in]: collectionIds } },
      order: [['order', 'ASC']],
      attributes: attrs as any,
    });
    return rows.map(r => opts?.summaryOnly ? ({
      _id: r.id, id: r.id,
      collectionId: r.collectionId,
      folderId: r.folderId,
      name: r.name,
      method: r.method || 'GET',
      url: (r as any).url || '',
      order: r.order,
      updatedAt: r.updatedAt,
      // Stub out fields not fetched
      params: [], headers: [], auth: { type: 'none' }, body: { mode: 'none' },
      preRequestScript: '', testScript: '', description: '', comments: [],
      createdBy: '', createdAt: new Date(),
    }) as IRequestRecord : sqlToRecord(r));
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
