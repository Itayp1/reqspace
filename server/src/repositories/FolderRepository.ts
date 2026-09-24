import { isMongo } from '../db/connect';
import { Folder } from '../models/Folder';
import { SqlFolder } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';
import { decodeCursor, mongoAfter, pageResult, sqlAfter } from '../utils/cursor';

export interface IFolderRecord {
  _id: string; id: string;
  collectionId: string;
  parentFolderId: string | null;
  name: string;
  description: string;
  preRequestScript: string;
  testScript: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

function sqlToRecord(f: SqlFolder): IFolderRecord {
  return { _id: f.id, id: f.id, collectionId: f.collectionId, parentFolderId: f.parentFolderId, name: f.name, description: f.description, preRequestScript: f.preRequestScript, testScript: f.testScript, order: f.order, createdAt: f.createdAt, updatedAt: f.updatedAt };
}

function mongoToRecord(f: any): IFolderRecord {
  return { _id: f._id.toString(), id: f._id.toString(), collectionId: f.collectionId?.toString(), parentFolderId: f.parentFolderId?.toString() ?? null, name: f.name, description: f.description || '', preRequestScript: f.preRequestScript || '', testScript: f.testScript || '', order: f.order, createdAt: f.createdAt, updatedAt: f.updatedAt };
}

export const FolderRepository = {
  async findById(id: string): Promise<IFolderRecord | null> {
    if (isMongo()) { const f = await Folder.findById(id).lean(); return f ? mongoToRecord(f) : null; }
    const f = await SqlFolder.findByPk(id); return f ? sqlToRecord(f) : null;
  },

  async findByCollection(collectionId: string): Promise<IFolderRecord[]> {
    if (isMongo()) return (await Folder.find({ collectionId }).sort({ order: 1 }).lean()).map(mongoToRecord);
    return (await SqlFolder.findAll({ where: { collectionId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  async findByCollectionPage(collectionId: string, limit: number, cursorRaw?: string) {
    const cursor = decodeCursor(cursorRaw);
    if (isMongo()) {
      const rows = await Folder.find({ collectionId, ...mongoAfter(cursor) }).sort({ order: 1, _id: 1 }).limit(limit + 1).lean();
      return pageResult(rows.map(mongoToRecord), limit);
    }
    const rows = await SqlFolder.findAll({
      where: { collectionId, ...sqlAfter(cursor) },
      order: [['order', 'ASC'], ['id', 'ASC']],
      limit: limit + 1,
    });
    return pageResult(rows.map(sqlToRecord), limit);
  },

  async create(data: { collectionId: string; name: string; parentFolderId?: string | null; description?: string; preRequestScript?: string; testScript?: string; order?: number }): Promise<IFolderRecord> {
    if (isMongo()) return mongoToRecord(await Folder.create(data));
    return sqlToRecord(await SqlFolder.create({ id: uuidv4(), collectionId: data.collectionId, name: data.name, parentFolderId: data.parentFolderId ?? null, description: data.description || '', preRequestScript: data.preRequestScript || '', testScript: data.testScript || '', order: data.order ?? 0 }));
  },

  async countInCollection(collectionId: string, parentFolderId: string | null): Promise<number> {
    if (isMongo()) return Folder.countDocuments({ collectionId, parentFolderId: parentFolderId ?? null });
    return SqlFolder.count({ where: { collectionId, parentFolderId: parentFolderId ?? null } });
  },

  async deleteByParent(parentFolderId: string): Promise<void> {
    if (isMongo()) { await Folder.deleteMany({ parentFolderId }); return; }
    await SqlFolder.destroy({ where: { parentFolderId } });
  },

  async update(id: string, data: Partial<IFolderRecord>): Promise<IFolderRecord | null> {
    if (isMongo()) { const f = await Folder.findByIdAndUpdate(id, data, { new: true }).lean(); return f ? mongoToRecord(f) : null; }
    await SqlFolder.update(data as any, { where: { id } }); return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await Folder.findByIdAndDelete(id); return; }
    await SqlFolder.destroy({ where: { id } });
  },

  async deleteByCollection(collectionId: string): Promise<void> {
    if (isMongo()) { await Folder.deleteMany({ collectionId }); return; }
    await SqlFolder.destroy({ where: { collectionId } });
  },
};
