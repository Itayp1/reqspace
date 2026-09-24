import { isMongo } from '../db/connect';
import { Request } from '../models/Request';
import { SqlRequest } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

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

function mongoToRecord(r: any): IRequestRecord {
  return {
    _id: r._id.toString(), id: r._id.toString(),
    collectionId: r.collectionId?.toString(),
    folderId: r.folderId?.toString() ?? null,
    name: r.name, method: r.method, url: r.url,
    params: r.params || [], headers: r.headers || [],
    auth: r.auth || { type: 'none' },
    body: r.body || { mode: 'none' },
    preRequestScript: r.preRequestScript || '',
    testScript: r.testScript || '',
    description: r.description || '',
    order: r.order,
    comments: r.comments || [],
    createdBy: r.createdBy?.toString(),
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export const RequestRepository = {
  async findById(id: string): Promise<IRequestRecord | null> {
    if (isMongo()) { const r = await Request.findById(id).lean(); return r ? mongoToRecord(r) : null; }
    const r = await SqlRequest.findByPk(id); return r ? sqlToRecord(r) : null;
  },

  async findByCollection(collectionId: string): Promise<IRequestRecord[]> {
    if (isMongo()) return (await Request.find({ collectionId }).sort({ order: 1 }).lean()).map(mongoToRecord);
    return (await SqlRequest.findAll({ where: { collectionId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  async findByFolder(folderId: string): Promise<IRequestRecord[]> {
    if (isMongo()) return (await Request.find({ folderId }).sort({ order: 1 }).lean()).map(mongoToRecord);
    return (await SqlRequest.findAll({ where: { folderId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  async create(data: Partial<IRequestRecord> & { name: string; collectionId: string; createdBy: string }): Promise<IRequestRecord> {
    if (isMongo()) return mongoToRecord(await Request.create(data));
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
    if (isMongo()) { const r = await Request.findByIdAndUpdate(id, data, { new: true }).lean(); return r ? mongoToRecord(r) : null; }
    const patch: any = { ...data };
    if (data.params !== undefined) patch.params = JSON.stringify(data.params);
    if (data.headers !== undefined) patch.headers = JSON.stringify(data.headers);
    if (data.auth !== undefined) patch.auth = JSON.stringify(data.auth);
    if (data.body !== undefined) patch.body = JSON.stringify(data.body);
    if (data.comments !== undefined) patch.comments = JSON.stringify(data.comments);
    await SqlRequest.update(patch, { where: { id } }); return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await Request.findByIdAndDelete(id); return; }
    await SqlRequest.destroy({ where: { id } });
  },

  async deleteByCollection(collectionId: string): Promise<void> {
    if (isMongo()) { await Request.deleteMany({ collectionId }); return; }
    await SqlRequest.destroy({ where: { collectionId } });
  },

  async deleteByFolder(folderId: string): Promise<void> {
    if (isMongo()) { await Request.deleteMany({ folderId }); return; }
    await SqlRequest.destroy({ where: { folderId } });
  },

  async countInCollection(collectionId: string, folderId: string | null): Promise<number> {
    if (isMongo()) return Request.countDocuments({ collectionId, folderId: folderId ?? null });
    return SqlRequest.count({ where: { collectionId, folderId: folderId ?? null } });
  },

  async searchInWorkspace(query: string, collectionIds: string[]): Promise<IRequestRecord[]> {
    if (isMongo()) {
      const q = new RegExp(query, 'i');
      return (await Request.find({ collectionId: { $in: collectionIds }, $or: [{ name: q }, { url: q }] }).lean()).map(mongoToRecord);
    }
    const { Op } = await import('sequelize');
    return (await SqlRequest.findAll({
      where: {
        collectionId: { [Op.in]: collectionIds },
        [Op.or]: [{ name: { [Op.like]: `%${query}%` } }, { url: { [Op.like]: `%${query}%` } }],
      }
    })).map(sqlToRecord);
  },
};
