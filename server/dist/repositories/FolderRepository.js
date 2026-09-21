"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FolderRepository = void 0;
const connect_1 = require("../db/connect");
const Folder_1 = require("../models/Folder");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function sqlToRecord(f) {
    return { _id: f.id, id: f.id, collectionId: f.collectionId, parentFolderId: f.parentFolderId, name: f.name, description: f.description, preRequestScript: f.preRequestScript, testScript: f.testScript, order: f.order, createdAt: f.createdAt, updatedAt: f.updatedAt };
}
function mongoToRecord(f) {
    return { _id: f._id.toString(), id: f._id.toString(), collectionId: f.collectionId?.toString(), parentFolderId: f.parentFolderId?.toString() ?? null, name: f.name, description: f.description || '', preRequestScript: f.preRequestScript || '', testScript: f.testScript || '', order: f.order, createdAt: f.createdAt, updatedAt: f.updatedAt };
}
exports.FolderRepository = {
    async findById(id) {
        if ((0, connect_1.isMongo)()) {
            const f = await Folder_1.Folder.findById(id).lean();
            return f ? mongoToRecord(f) : null;
        }
        const f = await sql_models_1.SqlFolder.findByPk(id);
        return f ? sqlToRecord(f) : null;
    },
    async findByCollection(collectionId) {
        if ((0, connect_1.isMongo)())
            return (await Folder_1.Folder.find({ collectionId }).sort({ order: 1 }).lean()).map(mongoToRecord);
        return (await sql_models_1.SqlFolder.findAll({ where: { collectionId }, order: [['order', 'ASC']] })).map(sqlToRecord);
    },
    async create(data) {
        if ((0, connect_1.isMongo)())
            return mongoToRecord(await Folder_1.Folder.create(data));
        return sqlToRecord(await sql_models_1.SqlFolder.create({ id: (0, uuid_1.v4)(), ...data, parentFolderId: data.parentFolderId ?? null, description: data.description || '', preRequestScript: '', testScript: '', order: 0 }));
    },
    async update(id, data) {
        if ((0, connect_1.isMongo)()) {
            const f = await Folder_1.Folder.findByIdAndUpdate(id, data, { new: true }).lean();
            return f ? mongoToRecord(f) : null;
        }
        await sql_models_1.SqlFolder.update(data, { where: { id } });
        return this.findById(id);
    },
    async delete(id) {
        if ((0, connect_1.isMongo)()) {
            await Folder_1.Folder.findByIdAndDelete(id);
            return;
        }
        await sql_models_1.SqlFolder.destroy({ where: { id } });
    },
    async deleteByCollection(collectionId) {
        if ((0, connect_1.isMongo)()) {
            await Folder_1.Folder.deleteMany({ collectionId });
            return;
        }
        await sql_models_1.SqlFolder.destroy({ where: { collectionId } });
    },
};
//# sourceMappingURL=FolderRepository.js.map