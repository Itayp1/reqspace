import { isMongo } from '../db/connect';
import { Environment } from '../models/Environment';
import { SqlEnvironment, SqlGlobalEnvironment } from '../db/sql-models';
import { v4 as uuidv4 } from 'uuid';

/** Accepts both the route shape (initial/current) and the legacy test shape (`value`). */
export interface IEnvVariable {
  key: string;
  value?: string;
  type?: string;
  enabled: boolean;
  initialValue?: string;
  currentValue?: string;
  isSecret?: boolean;
}

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
  name: string;
  variables: IEnvVariable[];
  updatedAt: Date;
}

function parseVars(raw: unknown): IEnvVariable[] {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return (raw as IEnvVariable[]) || [];
}

function envSql(e: SqlEnvironment): IEnvironmentRecord {
  return {
    _id: e.id, id: e.id, workspaceId: e.workspaceId, name: e.name, isGlobal: false,
    order: e.order ?? 0, variables: parseVars(e.variables), createdBy: e.createdBy,
    createdAt: e.createdAt, updatedAt: e.updatedAt,
  };
}
function envMongo(e: any): IEnvironmentRecord {
  return {
    _id: e._id.toString(), id: e._id.toString(), workspaceId: e.workspaceId?.toString(),
    name: e.name, isGlobal: !!e.isGlobal, order: e.order ?? 0, variables: e.variables || [],
    createdBy: e.createdBy?.toString(), createdAt: e.createdAt, updatedAt: e.updatedAt,
  };
}
function globalSql(g: SqlGlobalEnvironment): IGlobalEnvRecord {
  return {
    _id: g.id, id: g.id, workspaceId: g.workspaceId, name: g.name || 'Globals',
    variables: parseVars(g.variables), updatedAt: g.updatedAt,
  };
}
function globalMongo(g: any): IGlobalEnvRecord {
  return {
    _id: g._id.toString(), id: g._id.toString(), workspaceId: g.workspaceId?.toString(),
    name: g.name || 'Globals', variables: g.variables || [], updatedAt: g.updatedAt,
  };
}

function asEnv(g: IGlobalEnvRecord): IEnvironmentRecord {
  return {
    _id: g._id, id: g.id, workspaceId: g.workspaceId, name: g.name, isGlobal: true,
    order: -1, variables: g.variables, createdBy: '', createdAt: g.updatedAt, updatedAt: g.updatedAt,
  };
}

export const EnvironmentRepository = {
  async findById(id: string): Promise<IEnvironmentRecord | null> {
    if (isMongo()) {
      const e = await Environment.findById(id).lean();
      return e ? envMongo(e) : null;
    }
    const e = await SqlEnvironment.findByPk(id);
    if (e) return envSql(e);
    const g = await SqlGlobalEnvironment.findByPk(id);
    return g ? asEnv(globalSql(g)) : null;
  },

  async findByWorkspace(workspaceId: string): Promise<IEnvironmentRecord[]> {
    if (isMongo()) {
      return (await Environment.find({ workspaceId, isGlobal: { $ne: true } }).sort({ order: 1, createdAt: 1 }).lean()).map(envMongo);
    }
    return (await SqlEnvironment.findAll({ where: { workspaceId }, order: [['order', 'ASC'], ['createdAt', 'ASC']] })).map(envSql);
  },

  /** Globals first, then environments by order — the shape the environments route returns. */
  async listForWorkspace(workspaceId: string): Promise<IEnvironmentRecord[]> {
    const [global, locals] = await Promise.all([
      this.findGlobal(workspaceId),
      this.findByWorkspace(workspaceId),
    ]);
    return global ? [asEnv(global), ...locals] : locals;
  },

  async create(data: { workspaceId: string; name: string; variables?: IEnvVariable[]; createdBy: string; order?: number; isGlobal?: boolean }): Promise<IEnvironmentRecord> {
    if (data.isGlobal) {
      const g = await this.upsertGlobal(data.workspaceId, data.variables || [], data.name);
      return asEnv(g);
    }
    if (isMongo()) {
      return envMongo(await Environment.create({ ...data, isGlobal: false, order: data.order ?? 0 }));
    }
    return envSql(await SqlEnvironment.create({
      id: uuidv4(),
      workspaceId: data.workspaceId,
      name: data.name,
      variables: JSON.stringify(data.variables || []),
      order: data.order ?? 0,
      createdBy: data.createdBy,
    }));
  },

  async update(id: string, data: Partial<IEnvironmentRecord>): Promise<IEnvironmentRecord | null> {
    if (isMongo()) {
      const patch: any = { ...data };
      delete patch._id; delete patch.id;
      const e = await Environment.findByIdAndUpdate(id, patch, { new: true }).lean();
      return e ? envMongo(e) : null;
    }
    const existing = await this.findById(id);
    if (!existing) return null;
    if (existing.isGlobal) {
      const g = await this.upsertGlobal(existing.workspaceId, data.variables ?? existing.variables, data.name ?? existing.name);
      return asEnv(g);
    }
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.order !== undefined) patch.order = data.order;
    if (data.variables !== undefined) patch.variables = JSON.stringify(data.variables);
    await SqlEnvironment.update(patch, { where: { id } });
    return this.findById(id);
  },

  async updateOrder(id: string, order: number): Promise<void> {
    await this.update(id, { order });
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) { await Environment.findByIdAndDelete(id); return; }
    await SqlEnvironment.destroy({ where: { id } });
    await SqlGlobalEnvironment.destroy({ where: { id } });
  },

  async findGlobal(workspaceId: string): Promise<IGlobalEnvRecord | null> {
    if (isMongo()) {
      const g = await Environment.findOne({ workspaceId, isGlobal: true }).lean();
      return g ? globalMongo(g) : null;
    }
    const g = await SqlGlobalEnvironment.findOne({ where: { workspaceId } });
    return g ? globalSql(g) : null;
  },

  async upsertGlobal(workspaceId: string, variables: IEnvVariable[], name = 'Globals'): Promise<IGlobalEnvRecord> {
    if (isMongo()) {
      const g = await Environment.findOneAndUpdate(
        { workspaceId, isGlobal: true },
        { variables, name, isGlobal: true },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      return globalMongo(g!);
    }
    const [existing] = await SqlGlobalEnvironment.findOrCreate({
      where: { workspaceId },
      defaults: { id: uuidv4(), workspaceId, name, variables: JSON.stringify(variables), updatedAt: new Date() } as any,
    });
    await existing.update({ name, variables: JSON.stringify(variables), updatedAt: new Date() });
    return globalSql(existing);
  },
};
