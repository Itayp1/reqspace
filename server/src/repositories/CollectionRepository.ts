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
  roles: any[];
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
    roles: typeof c.roles === 'string' ? JSON.parse(c.roles) : (c.roles || []),
    order: c.order,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export const CollectionRepository = {
  async findById(id: string): Promise<ICollectionRecord | null> {
    const c = await SqlCollection.findByPk(id);
    return c ? sqlToRecord(c) : null;
  },

  async findByWorkspace(workspaceId: string, opts?: { limit?: number }): Promise<ICollectionRecord[]> {
    const findOpts: any = { where: { workspaceId }, order: [['order', 'ASC']] };
    if (opts?.limit) findOpts.limit = opts.limit;
    return (await SqlCollection.findAll(findOpts)).map(sqlToRecord);
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
    return sqlToRecord(await SqlCollection.create({
      id: uuidv4(),
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description || '',
      variables: JSON.stringify(data.variables || []),
      preRequestScript: data.preRequestScript || '',
      testScript: data.testScript || '',
      roles: '[]',
      order: data.order ?? 0,
      createdBy: data.createdBy,
    }));
  },

  async countByWorkspace(workspaceId: string): Promise<number> {
    return SqlCollection.count({ where: { workspaceId } });
  },

  async update(id: string, data: Partial<ICollectionRecord>): Promise<ICollectionRecord | null> {
    const patch: any = { ...data };
    if (data.variables) patch.variables = JSON.stringify(data.variables);
    await SqlCollection.update(patch, { where: { id } });
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    await SqlCollection.destroy({ where: { id } });
  },

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    await SqlCollection.destroy({ where: { workspaceId } });
  },
};
