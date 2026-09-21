"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvironmentRepository = void 0;
const connect_1 = require("../db/connect");
const Environment_1 = require("../models/Environment");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function envSql(e) {
    return { _id: e.id, id: e.id, workspaceId: e.workspaceId, name: e.name, variables: typeof e.variables === 'string' ? JSON.parse(e.variables) : e.variables, createdBy: e.createdBy, createdAt: e.createdAt, updatedAt: e.updatedAt };
}
function envMongo(e) {
    return { _id: e._id.toString(), id: e._id.toString(), workspaceId: e.workspaceId?.toString(), name: e.name, variables: e.variables || [], createdBy: e.createdBy?.toString(), createdAt: e.createdAt, updatedAt: e.updatedAt };
}
function globalSql(g) {
    return { _id: g.id, id: g.id, workspaceId: g.workspaceId, variables: typeof g.variables === 'string' ? JSON.parse(g.variables) : g.variables, updatedAt: g.updatedAt };
}
function globalMongo(g) {
    return { _id: g._id.toString(), id: g._id.toString(), workspaceId: g.workspaceId?.toString(), variables: g.variables || [], updatedAt: g.updatedAt };
}
exports.EnvironmentRepository = {
    async findById(id) {
        if ((0, connect_1.isMongo)()) {
            const e = await Environment_1.Environment.findById(id).lean();
            return e ? envMongo(e) : null;
        }
        const e = await sql_models_1.SqlEnvironment.findByPk(id);
        return e ? envSql(e) : null;
    },
    async findByWorkspace(workspaceId) {
        if ((0, connect_1.isMongo)())
            return (await Environment_1.Environment.find({ workspaceId }).lean()).map(envMongo);
        return (await sql_models_1.SqlEnvironment.findAll({ where: { workspaceId } })).map(envSql);
    },
    async create(data) {
        if ((0, connect_1.isMongo)())
            return envMongo(await Environment_1.Environment.create(data));
        return envSql(await sql_models_1.SqlEnvironment.create({ id: (0, uuid_1.v4)(), ...data, variables: JSON.stringify(data.variables || []) }));
    },
    async update(id, data) {
        if ((0, connect_1.isMongo)()) {
            const e = await Environment_1.Environment.findByIdAndUpdate(id, data, { new: true }).lean();
            return e ? envMongo(e) : null;
        }
        const patch = { ...data };
        if (data.variables)
            patch.variables = JSON.stringify(data.variables);
        await sql_models_1.SqlEnvironment.update(patch, { where: { id } });
        return this.findById(id);
    },
    async delete(id) {
        if ((0, connect_1.isMongo)()) {
            await Environment_1.Environment.findByIdAndDelete(id);
            return;
        }
        await sql_models_1.SqlEnvironment.destroy({ where: { id } });
    },
    async findGlobal(workspaceId) {
        if ((0, connect_1.isMongo)()) {
            const g = await Environment_1.Environment.findOne({ workspaceId, isGlobal: true }).lean();
            return g ? globalMongo(g) : null;
        }
        const g = await sql_models_1.SqlGlobalEnvironment.findOne({ where: { workspaceId } });
        return g ? globalSql(g) : null;
    },
    async upsertGlobal(workspaceId, variables) {
        if ((0, connect_1.isMongo)()) {
            const g = await Environment_1.Environment.findOneAndUpdate({ workspaceId, isGlobal: true }, { variables }, { new: true, upsert: true }).lean();
            return globalMongo(g);
        }
        // findOrCreate + update for cross-DB compat (upsert with new id fails on SQLite unique constraint)
        const [existing] = await sql_models_1.SqlGlobalEnvironment.findOrCreate({
            where: { workspaceId },
            defaults: { id: (0, uuid_1.v4)(), workspaceId, variables: JSON.stringify(variables), updatedAt: new Date() },
        });
        await existing.update({ variables: JSON.stringify(variables), updatedAt: new Date() });
        return globalSql(existing);
    },
};
//# sourceMappingURL=EnvironmentRepository.js.map