import { isMongo } from '../db/connect';
import { Environment } from '../models/Environment';
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
function envMongo(e: any): IEnvironmentRecord {
  return { _id: e._id.toString(), id: e._id.toString(), workspaceId: e.workspaceId?.toString(), name: e.name, variables: e.variables || [], createdBy: e.createdBy?.toString(), createdAt: e.createdAt, updatedAt: e.updatedAt };
}
function globalSql(g: SqlGlobalEnvironment): IGlobalEnvRecord {
  return { _id: g.id, id: g.id, workspaceId: g.workspaceId, variables: typeof g.variables === 'string' ? JSON.parse(g.variables) : g.variables, updatedAt: g.updatedAt };
}
function globalMongo(g: any): IGlobalEnvRecord {
  return { _id: g._id.toString(), id: g._id.toString(), workspaceId: g.workspaceId?.toString(), variables: g.variables || [], updatedAt: g.updatedAt };
}

export const EnvironmentRepository = {
  async findById(id: string): Promise<IEnvironmentRecord | null> {
    if (isMongo()) { const e = await Environment.findById(id).lean(); return e ? envMongo(e) : null; }
    const e = await SqlEnvironment.findByPk(id); return e ? envSql(e) : null;
  },

  async findByWorkspace(workspaceId: string): Promise<IEnvironmentRecord[]> {
    if (isMongo()) return (await Environment.find({ workspaceId }).lean()).map(envMongo);
    return (await SqlEnvironment.findAll({ where: { workspaceId } })).map(envSql);
  },

  async create(data: { workspaceId: string; name: string; variables?: IEnvVariable[]; createdBy: string }): Promise<IEnvironmentRecord> {
    if (isMongo()) return envMongo(await Environment.create(data));
    return envSql(await SqlEnvironment.create({ id: uuidv4(), ...data, variables: JSON.stringify(data.variables || []) }));
  },

  async update(id: string, data: Partial<IEnvironmentRecord>): Promise<IEnvironmentRecord | null> {
    if (isMongo()) { const e = await Environment.findByIdAndUpdate(id, data, { new: true }).lean(); return e ? envMongo(e) : null; }
    const patch: any = { ...data };
    if (data.variables) patch.variables = JSON.stringify(data.variables);
    await SqlEnvironment.update(patch, { where: { id } }); return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await Environment.findByIdAndDelete(id); return; }
    await SqlEnvironment.destroy({ where: { id } });
  },

  async findGlobal(workspaceId: string): Promise<IGlobalEnvRecord | null> {
    if (isMongo()) { const g = await Environment.findOne({ workspaceId, isGlobal: true }).lean(); return g ? globalMongo(g) : null; }
    const g = await SqlGlobalEnvironment.findOne({ where: { workspaceId } }); return g ? globalSql(g) : null;
  },

  async upsertGlobal(workspaceId: string, variables: IEnvVariable[]): Promise<IGlobalEnvRecord> {
    if (isMongo()) {
      const g = await Environment.findOneAndUpdate({ workspaceId, isGlobal: true }, { variables }, { new: true, upsert: true }).lean();
      return globalMongo(g!);
    }
    // findOrCreate + update for cross-DB compat (upsert with new id fails on SQLite unique constraint)
    const [existing] = await SqlGlobalEnvironment.findOrCreate({
      where: { workspaceId },
      defaults: { id: uuidv4(), workspaceId, variables: JSON.stringify(variables), updatedAt: new Date() } as any,
    });
    await existing.update({ variables: JSON.stringify(variables), updatedAt: new Date() });
    return globalSql(existing);
  },
};
