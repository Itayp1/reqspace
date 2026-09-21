"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogRepository = void 0;
exports.logAudit = logAudit;
const connect_1 = require("../db/connect");
const AuditLog_1 = require("../models/AuditLog");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function sqlToRecord(a) {
    return {
        _id: a.id,
        id: a.id,
        userId: a.userId,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        ip: a.ip,
        details: a.details ? JSON.parse(a.details) : null,
        createdAt: a.createdAt,
    };
}
function mongoToRecord(a) {
    return {
        _id: a._id.toString(),
        id: a._id.toString(),
        userId: a.userId?.toString(),
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId?.toString(),
        ip: a.ip,
        details: a.details,
        createdAt: a.createdAt,
    };
}
exports.AuditLogRepository = {
    async log(data) {
        if ((0, connect_1.isMongo)()) {
            await AuditLog_1.AuditLog.create(data);
            return;
        }
        await sql_models_1.SqlAuditLog.create({
            id: (0, uuid_1.v4)(),
            ...data,
            details: data.details ? JSON.stringify(data.details) : null,
        });
    },
    async findByUser(userId, limit = 100) {
        if ((0, connect_1.isMongo)()) {
            return (await AuditLog_1.AuditLog.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean()).map(mongoToRecord);
        }
        return (await sql_models_1.SqlAuditLog.findAll({ where: { userId }, order: [['createdAt', 'DESC']], limit })).map(sqlToRecord);
    },
    async list(filter = {}, limit = 100, skip = 0) {
        if ((0, connect_1.isMongo)()) {
            return (await AuditLog_1.AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean()).map(mongoToRecord);
        }
        return (await sql_models_1.SqlAuditLog.findAll({ where: filter, order: [['createdAt', 'DESC']], limit, offset: skip })).map(sqlToRecord);
    },
    async count(filter = {}) {
        if ((0, connect_1.isMongo)()) {
            return AuditLog_1.AuditLog.countDocuments(filter);
        }
        return sql_models_1.SqlAuditLog.count({ where: filter });
    },
};
async function logAudit(userId, action, opts) {
    try {
        await exports.AuditLogRepository.log({
            userId: userId.toString(),
            action,
            targetType: opts?.targetType,
            targetId: opts?.targetId?.toString(),
            ip: opts?.ip,
            details: opts?.details,
        });
    }
    catch (err) {
        console.error('AuditLog Error:', err);
    }
}
//# sourceMappingURL=AuditLogRepository.js.map