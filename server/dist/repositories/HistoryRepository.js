"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryRepository = void 0;
const connect_1 = require("../db/connect");
const History_1 = require("../models/History");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function sqlToRecord(h) {
    return {
        _id: h.id, id: h.id, userId: h.userId, workspaceId: h.workspaceId, method: h.method, url: h.url, statusCode: h.statusCode, duration: h.duration,
        requestData: typeof h.requestData === 'string' ? JSON.parse(h.requestData) : h.requestData,
        responseData: typeof h.responseData === 'string' ? JSON.parse(h.responseData) : h.responseData,
        createdAt: h.createdAt,
    };
}
function mongoToRecord(h) {
    return { _id: h._id.toString(), id: h._id.toString(), userId: h.userId?.toString(), workspaceId: h.workspaceId?.toString(), method: h.method, url: h.url, statusCode: h.statusCode, duration: h.duration, requestData: h.requestData, responseData: h.responseData, createdAt: h.createdAt };
}
exports.HistoryRepository = {
    async findByUser(userId, workspaceId, limit = 200) {
        if ((0, connect_1.isMongo)())
            return (await History_1.History.find({ userId, workspaceId }).sort({ createdAt: -1 }).limit(limit).lean()).map(mongoToRecord);
        return (await sql_models_1.SqlHistory.findAll({ where: { userId, workspaceId }, order: [['createdAt', 'DESC']], limit })).map(sqlToRecord);
    },
    async create(data) {
        if ((0, connect_1.isMongo)())
            return mongoToRecord(await History_1.History.create(data));
        return sqlToRecord(await sql_models_1.SqlHistory.create({
            id: (0, uuid_1.v4)(), ...data,
            requestData: JSON.stringify(data.requestData || {}),
            responseData: JSON.stringify(data.responseData || {}),
        }));
    },
    async delete(id) {
        if ((0, connect_1.isMongo)()) {
            await History_1.History.findByIdAndDelete(id);
            return;
        }
        await sql_models_1.SqlHistory.destroy({ where: { id } });
    },
    async deleteByUser(userId) {
        if ((0, connect_1.isMongo)()) {
            await History_1.History.deleteMany({ userId });
            return;
        }
        await sql_models_1.SqlHistory.destroy({ where: { userId } });
    },
};
//# sourceMappingURL=HistoryRepository.js.map