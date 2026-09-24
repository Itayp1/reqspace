import { isMongo } from '../db/connect';
import { Collection } from '../models/Collection';
import { SqlCollection } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

export interface ICollectionRecord {
  _id: string;
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  variables: any[];
  preRequestScript: string;
  testScript: string;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function sqlToRecord(c: SqlCollection): ICollectionRecord {
  return {
    _id: c.id, id: c.id,
    workspaceId: c.workspaceId,
    name: c.name,
    description: c.description,
    variables: typeof c.variables === 'string' ? JSON.parse(c.variables) : c.variables,
    preRequestScript: c.preRequestScript,
    testScript: c.testScript,
    order: c.order,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function mongoToRecord(c: any): ICollectionRecord {
  return {
    _id: c._id.toString(), id: c._id.toString(),
    workspaceId: c.workspaceId?.toString(),
    name: c.name,
    description: c.description,
    variables: c.variables || [],
    preRequestScript: c.preRequestScript || '',
    testScript: c.testScript || '',
    order: c.order,
    createdBy: c.createdBy?.toString(),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const CollectionRepository = {
  async findById(id: string): Promise<ICollectionRecord | null> {
    if (isMongo()) {
      const c = await Collection.findById(id).lean();
      return c ? mongoToRecord(c) : null;
    }
    const c = await SqlCollection.findByPk(id);
    return c ? sqlToRecord(c) : null;
  },

  async findByWorkspace(workspaceId: string): Promise<ICollectionRecord[]> {
    if (isMongo()) {
      return (await Collection.find({ workspaceId }).sort({ order: 1 }).lean()).map(mongoToRecord);
    }
    return (await SqlCollection.findAll({ where: { workspaceId }, order: [['order', 'ASC']] })).map(sqlToRecord);
  },

  async create(data: {
    workspaceId: string;
    name: string;
    description?: string;
    createdBy: string;
    variables?: any[];
    preRequestScript?: string;
    testScript?: string;
    order?: number;
  }): Promise<ICollectionRecord> {
    if (isMongo()) {
      return mongoToRecord(await Collection.create(data));
    }
    return sqlToRecord(await SqlCollection.create({
      id: uuidv4(),
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description || '',
      variables: JSON.stringify(data.variables || []),
      preRequestScript: data.preRequestScript || '',
      testScript: data.testScript || '',
      order: data.order ?? 0,
      createdBy: data.createdBy,
    }));
  },

  async countByWorkspace(workspaceId: string): Promise<number> {
    if (isMongo()) return Collection.countDocuments({ workspaceId });
    return SqlCollection.count({ where: { workspaceId } });
  },

  async update(id: string, data: Partial<ICollectionRecord>): Promise<ICollectionRecord | null> {
    if (isMongo()) {
      const c = await Collection.findByIdAndUpdate(id, data, { new: true }).lean();
      return c ? mongoToRecord(c) : null;
    }
    const patch: any = { ...data };
    if (data.variables) patch.variables = JSON.stringify(data.variables);
    await SqlCollection.update(patch, { where: { id } });
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await Collection.findByIdAndDelete(id); return; }
    await SqlCollection.destroy({ where: { id } });
  },

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    if (isMongo()) { await Collection.deleteMany({ workspaceId }); return; }
    await SqlCollection.destroy({ where: { workspaceId } });
  },
};
