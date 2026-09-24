import { isMongo } from '../db/connect';
import { Environment } from '../models/Environment';
import { SqlEnvironment, SqlGlobalEnvironment } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

export interface IEnvVariable { key: string; value: string; type?: string; enabled: boolean; }

export interface IEnvironmentRecord {
  _id: string; id: string;
  workspaceId: string;
  name: string;
  isGlobal: boolean;
  order: number;
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
  return {
    _id: e.id, id: e.id, workspaceId: e.workspaceId, name: e.name,
    isGlobal: !!e.isGlobal, order: e.order ?? 0,
    variables: typeof e.variables === 'string' ? JSON.parse(e.variables) : e.variables,
    createdBy: e.createdBy, createdAt: e.createdAt, updatedAt: e.updatedAt,
  };
}
function envMongo(e: any): IEnvironmentRecord {
  return {
    _id: e._id.toString(), id: e._id.toString(), workspaceId: e.workspaceId?.toString(),
    name: e.name, isGlobal: !!e.isGlobal, order: e.order ?? 0, variables: e.variables || [],
    createdBy: e.createdBy?.toString(), createdAt: e.createdAt, updatedAt: e.updatedAt,
  };
}
function globalAsEnv(g: IGlobalEnvRecord): IEnvironmentRecord {
  return {
    _id: g.id, id: g.id, workspaceId: g.workspaceId, name: 'Globals', isGlobal: true, order: -1,
    variables: g.variables, createdBy: '', createdAt: g.updatedAt, updatedAt: g.updatedAt,
  };
}
function globalSql(g: SqlGlobalEnvironment): IGlobalEnvRecord {
  return { _id: g.id, id: g.id, workspaceId: g.workspaceId, variables: typeof g.variables === 'string' ? JSON.parse(g.variables) : g.variables, updatedAt: g.updatedAt };
}
function globalMongo(g: any): IGlobalEnvRecord {
  return { _id: g._id.toString(), id: g._id.toString(), workspaceId: g.workspaceId?.toString(), variables: g.variables || [], updatedAt: g.updatedAt };
}

function sortEnvs(rows: IEnvironmentRecord[]): IEnvironmentRecord[] {
  return rows.sort((a, b) => {
    if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export const EnvironmentRepository = {
  async findById(id: string): Promise<IEnvironmentRecord | null> {
    if (isMongo()) { const e = await Environment.findById(id).lean(); return e ? envMongo(e) : null; }
    const e = await SqlEnvironment.findByPk(id);
    if (e) return envSql(e);
    const g = await SqlGlobalEnvironment.findByPk(id);
    return g ? globalAsEnv(globalSql(g)) : null;
  },

  async findByWorkspace(workspaceId: string): Promise<IEnvironmentRecord[]> {
    if (isMongo()) {
      const rows = (await Environment.find({ workspaceId }).lean()).map(envMongo);
      return sortEnvs(rows);
    }
    const locals = (await SqlEnvironment.findAll({ where: { workspaceId } })).map(envSql);
    if (!locals.some(e => e.isGlobal)) {
      const g = await SqlGlobalEnvironment.findOne({ where: { workspaceId } });
      if (g) locals.push(globalAsEnv(globalSql(g)));
    }
    return sortEnvs(locals);
  },

  async create(data: { workspaceId: string; name: string; variables?: IEnvVariable[]; createdBy: string; isGlobal?: boolean; order?: number }): Promise<IEnvironmentRecord> {
    if (isMongo()) return envMongo(await Environment.create(data));
    return envSql(await SqlEnvironment.create({
      id: uuidv4(),
      workspaceId: data.workspaceId,
      name: data.name,
      isGlobal: !!data.isGlobal,
      order: data.order ?? 0,
      variables: JSON.stringify(data.variables || []),
      createdBy: data.createdBy,
    }));
  },

  async update(id: string, data: Partial<Pick<IEnvironmentRecord, 'name' | 'variables' | 'order' | 'isGlobal'>>): Promise<IEnvironmentRecord | null> {
    if (isMongo()) {
      const e = await Environment.findByIdAndUpdate(id, data, { new: true }).lean();
      return e ? envMongo(e) : null;
    }
    const globalRow = await SqlGlobalEnvironment.findByPk(id);
    if (globalRow) {
      if (data.variables) await globalRow.update({ variables: JSON.stringify(data.variables), updatedAt: new Date() });
      return globalAsEnv(globalSql(globalRow));
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.order !== undefined) patch.order = data.order;
    if (data.isGlobal !== undefined) patch.isGlobal = data.isGlobal;
    if (data.variables) patch.variables = JSON.stringify(data.variables);
    await SqlEnvironment.update(patch, { where: { id } });
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await Environment.findByIdAndDelete(id); return; }
    const removed = await SqlEnvironment.destroy({ where: { id } });
    if (!removed) await SqlGlobalEnvironment.destroy({ where: { id } });
  },

  async findGlobal(workspaceId: string): Promise<IGlobalEnvRecord | null> {
    if (isMongo()) { const g = await Environment.findOne({ workspaceId, isGlobal: true }).lean(); return g ? globalMongo(g) : null; }
    const named = await SqlEnvironment.findOne({ where: { workspaceId, isGlobal: true } });
    if (named) return { _id: named.id, id: named.id, workspaceId: named.workspaceId, variables: typeof named.variables === 'string' ? JSON.parse(named.variables) : named.variables, updatedAt: named.updatedAt };
    const g = await SqlGlobalEnvironment.findOne({ where: { workspaceId } });
    return g ? globalSql(g) : null;
  },

  async upsertGlobal(workspaceId: string, variables: IEnvVariable[]): Promise<IGlobalEnvRecord> {
    if (isMongo()) {
      const g = await Environment.findOneAndUpdate(
        { workspaceId, isGlobal: true },
        { variables, name: 'Globals', isGlobal: true },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      return globalMongo(g!);
    }
    const [existing] = await SqlGlobalEnvironment.findOrCreate({
      where: { workspaceId },
      defaults: { id: uuidv4(), workspaceId, variables: JSON.stringify(variables), updatedAt: new Date() },
    });
    await existing.update({ variables: JSON.stringify(variables), updatedAt: new Date() });
    return globalSql(existing);
  },
};
