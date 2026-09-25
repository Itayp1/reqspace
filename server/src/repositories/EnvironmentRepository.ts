import { SqlEnvironment, SqlGlobalEnvironment } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

export interface IEnvVariable { key: string; value: string; type?: string; enabled: boolean; }

export interface IEnvironmentRecord {
  _id: string; id: string;
  workspaceId: string;
  name: string;
  variables: IEnvVariable[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGlobalEnvRecord {
  _id: string; id: string;
  workspaceId: string;
  variables: IEnvVariable[];
  updatedAt: Date;
}

function envSql(e: SqlEnvironment): IEnvironmentRecord {
  return { _id: e.id, id: e.id, workspaceId: e.workspaceId, name: e.name, variables: typeof e.variables === 'string' ? JSON.parse(e.variables) : e.variables, createdBy: e.createdBy, createdAt: e.createdAt, updatedAt: e.updatedAt };
}
function globalSql(g: SqlGlobalEnvironment): IGlobalEnvRecord {
  return { _id: g.id, id: g.id, workspaceId: g.workspaceId, variables: typeof g.variables === 'string' ? JSON.parse(g.variables) : g.variables, updatedAt: g.updatedAt };
}

export const EnvironmentRepository = {
  async findById(id: string): Promise<IEnvironmentRecord | null> {
    const e = await SqlEnvironment.findByPk(id); return e ? envSql(e) : null;
  },

  async findByWorkspace(workspaceId: string): Promise<IEnvironmentRecord[]> {
    return (await SqlEnvironment.findAll({ where: { workspaceId } })).map(envSql);
  },

  async create(data: { workspaceId: string; name: string; variables?: IEnvVariable[]; createdBy: string }): Promise<IEnvironmentRecord> {
    return envSql(await SqlEnvironment.create({ id: uuidv4(), ...data, variables: JSON.stringify(data.variables || []) }));
  },

  async update(id: string, data: Partial<IEnvironmentRecord>): Promise<IEnvironmentRecord | null> {
    const patch: any = { ...data };
    if (data.variables) patch.variables = JSON.stringify(data.variables);
    await SqlEnvironment.update(patch, { where: { id } }); return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    await SqlEnvironment.destroy({ where: { id } });
  },

  async findGlobal(workspaceId: string): Promise<IGlobalEnvRecord | null> {
    const g = await SqlGlobalEnvironment.findOne({ where: { workspaceId } }); return g ? globalSql(g) : null;
  },

  async upsertGlobal(workspaceId: string, variables: IEnvVariable[]): Promise<IGlobalEnvRecord> {
    // findOrCreate + update for cross-DB compat (upsert with new id fails on SQLite unique constraint)
    const [existing] = await SqlGlobalEnvironment.findOrCreate({
      where: { workspaceId },
      defaults: { id: uuidv4(), workspaceId, variables: JSON.stringify(variables), updatedAt: new Date() } as any,
    });
    await existing.update({ variables: JSON.stringify(variables), updatedAt: new Date() });
    return globalSql(existing);
  },
};
