import { SqlFolder } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

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

export const FolderRepository = {
  async findById(id: string): Promise<IFolderRecord | null> {
    const f = await SqlFolder.findByPk(id); return f ? sqlToRecord(f) : null;
  },

  async findByCollection(collectionId: string): Promise<IFolderRecord[]> {
    return (await SqlFolder.findAll({ where: { collectionId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  async create(data: { collectionId: string; name: string; parentFolderId?: string | null; description?: string; preRequestScript?: string; testScript?: string; order?: number }): Promise<IFolderRecord> {
    return sqlToRecord(await SqlFolder.create({ id: uuidv4(), collectionId: data.collectionId, name: data.name, parentFolderId: data.parentFolderId ?? null, description: data.description || '', preRequestScript: data.preRequestScript || '', testScript: data.testScript || '', order: data.order ?? 0 }));
  },

  async countInCollection(collectionId: string, parentFolderId: string | null): Promise<number> {
    return SqlFolder.count({ where: { collectionId, parentFolderId: parentFolderId ?? null } });
  },

  async deleteByParent(parentFolderId: string): Promise<void> {
    await SqlFolder.destroy({ where: { parentFolderId } });
  },

  async update(id: string, data: Partial<IFolderRecord>): Promise<IFolderRecord | null> {
    await SqlFolder.update(data as any, { where: { id } }); return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    await SqlFolder.destroy({ where: { id } });
  },

  async deleteByCollection(collectionId: string): Promise<void> {
    await SqlFolder.destroy({ where: { collectionId } });
  },
};
