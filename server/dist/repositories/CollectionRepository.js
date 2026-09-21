"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectionRepository = void 0;
const connect_1 = require("../db/connect");
const Collection_1 = require("../models/Collection");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function sqlToRecord(c) {
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
function mongoToRecord(c) {
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
exports.CollectionRepository = {
    async findById(id) {
        if ((0, connect_1.isMongo)()) {
            const c = await Collection_1.Collection.findById(id).lean();
            return c ? mongoToRecord(c) : null;
        }
        const c = await sql_models_1.SqlCollection.findByPk(id);
        return c ? sqlToRecord(c) : null;
    },
    async findByWorkspace(workspaceId) {
        if ((0, connect_1.isMongo)()) {
            return (await Collection_1.Collection.find({ workspaceId }).sort({ order: 1 }).lean()).map(mongoToRecord);
        }
        return (await sql_models_1.SqlCollection.findAll({ where: { workspaceId }, order: [['order', 'ASC']] })).map(sqlToRecord);
    },
    async create(data) {
        if ((0, connect_1.isMongo)()) {
            return mongoToRecord(await Collection_1.Collection.create(data));
        }
        return sqlToRecord(await sql_models_1.SqlCollection.create({ id: (0, uuid_1.v4)(), ...data, description: data.description || '', variables: '[]', preRequestScript: '', testScript: '', order: 0 }));
    },
    async update(id, data) {
        if ((0, connect_1.isMongo)()) {
            const c = await Collection_1.Collection.findByIdAndUpdate(id, data, { new: true }).lean();
            return c ? mongoToRecord(c) : null;
        }
        const patch = { ...data };
        if (data.variables)
            patch.variables = JSON.stringify(data.variables);
        await sql_models_1.SqlCollection.update(patch, { where: { id } });
        return this.findById(id);
    },
    async delete(id) {
        if ((0, connect_1.isMongo)()) {
            await Collection_1.Collection.findByIdAndDelete(id);
            return;
        }
        await sql_models_1.SqlCollection.destroy({ where: { id } });
    },
    async deleteByWorkspace(workspaceId) {
        if ((0, connect_1.isMongo)()) {
            await Collection_1.Collection.deleteMany({ workspaceId });
            return;
        }
        await sql_models_1.SqlCollection.destroy({ where: { workspaceId } });
    },
};
//# sourceMappingURL=CollectionRepository.js.map