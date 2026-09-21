"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceRepository = void 0;
const connect_1 = require("../db/connect");
const Workspace_1 = require("../models/Workspace");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function sqlToRecord(w) {
    const members = typeof w.members === 'string' ? JSON.parse(w.members) : w.members;
    return {
        _id: w.id,
        id: w.id,
        name: w.name,
        description: w.description,
        ownerId: w.ownerId,
        members,
        isPublic: w.isPublic,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
    };
}
function mongoToRecord(w) {
    return {
        _id: w._id.toString(),
        id: w._id.toString(),
        name: w.name,
        description: w.description,
        ownerId: w.ownerId?.toString(),
        members: (w.members || []).map((m) => ({
            userId: m.userId?.toString(),
            role: m.role,
            joinedAt: m.joinedAt,
            invitedBy: m.invitedBy?.toString(),
        })),
        isPublic: w.isPublic,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
    };
}
exports.WorkspaceRepository = {
    async findById(id) {
        if ((0, connect_1.isMongo)()) {
            const w = await Workspace_1.Workspace.findById(id).lean();
            return w ? mongoToRecord(w) : null;
        }
        const w = await sql_models_1.SqlWorkspace.findByPk(id);
        return w ? sqlToRecord(w) : null;
    },
    async findForUser(userId) {
        if ((0, connect_1.isMongo)()) {
            const ws = await Workspace_1.Workspace.find({
                $or: [{ ownerId: userId }, { 'members.userId': userId }],
            }).lean();
            return ws.map(mongoToRecord);
        }
        const all = await sql_models_1.SqlWorkspace.findAll();
        return all
            .map(sqlToRecord)
            .filter(w => w.ownerId === userId || w.members.some(m => m.userId === userId));
    },
    async findPublic() {
        if ((0, connect_1.isMongo)()) {
            const ws = await Workspace_1.Workspace.find({ isPublic: true }).lean();
            return ws.map(mongoToRecord);
        }
        const ws = await sql_models_1.SqlWorkspace.findAll({ where: { isPublic: true } });
        return ws.map(sqlToRecord);
    },
    async create(data) {
        if ((0, connect_1.isMongo)()) {
            const w = await Workspace_1.Workspace.create({
                ...data,
                members: [{ userId: data.ownerId, role: 'owner', joinedAt: new Date() }],
            });
            return mongoToRecord(w);
        }
        const id = (0, uuid_1.v4)();
        const members = [{ userId: data.ownerId, role: 'owner', joinedAt: new Date() }];
        const w = await sql_models_1.SqlWorkspace.create({
            id,
            name: data.name,
            description: data.description || '',
            ownerId: data.ownerId,
            members: JSON.stringify(members),
            isPublic: data.isPublic ?? false,
        });
        return sqlToRecord(w);
    },
    async update(id, data) {
        if ((0, connect_1.isMongo)()) {
            const w = await Workspace_1.Workspace.findByIdAndUpdate(id, data, { new: true }).lean();
            return w ? mongoToRecord(w) : null;
        }
        const patch = { ...data };
        if (data.members)
            patch.members = JSON.stringify(data.members);
        await sql_models_1.SqlWorkspace.update(patch, { where: { id } });
        return this.findById(id);
    },
    async delete(id) {
        if ((0, connect_1.isMongo)()) {
            await Workspace_1.Workspace.findByIdAndDelete(id);
            return;
        }
        await sql_models_1.SqlWorkspace.destroy({ where: { id } });
    },
    async list() {
        if ((0, connect_1.isMongo)()) {
            return (await Workspace_1.Workspace.find().lean()).map(mongoToRecord);
        }
        return (await sql_models_1.SqlWorkspace.findAll()).map(sqlToRecord);
    },
};
//# sourceMappingURL=WorkspaceRepository.js.map