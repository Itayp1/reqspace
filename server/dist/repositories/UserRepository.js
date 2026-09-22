"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const connect_1 = require("../db/connect");
const User_1 = require("../models/User");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function sqlToRecord(u) {
    return {
        _id: u.id,
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        authType: u.authType,
        isSuperAdmin: u.isSuperAdmin,
        status: u.status,
        avatar: u.avatar,
        settings: typeof u.settings === 'string' ? JSON.parse(u.settings) : u.settings,
        clientCertificates: typeof u.clientCertificates === 'string' ? JSON.parse(u.clientCertificates) : (u.clientCertificates || []),
        historyUsedBytes: Number(u.historyUsedBytes),
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
    };
}
function mongoToRecord(u) {
    return {
        _id: u._id.toString(),
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        authType: u.authType,
        isSuperAdmin: u.isSuperAdmin,
        status: u.status,
        avatar: u.avatar,
        settings: u.settings,
        clientCertificates: u.clientCertificates || [],
        historyUsedBytes: u.historyUsedBytes,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
    };
}
exports.UserRepository = {
    async findById(id) {
        if ((0, connect_1.isMongo)()) {
            const u = await User_1.User.findById(id).lean();
            return u ? mongoToRecord(u) : null;
        }
        const u = await sql_models_1.SqlUser.findByPk(id);
        return u ? sqlToRecord(u) : null;
    },
    async findByEmail(email) {
        if ((0, connect_1.isMongo)()) {
            const u = await User_1.User.findOne({ email: email.toLowerCase() }).lean();
            return u ? mongoToRecord(u) : null;
        }
        const u = await sql_models_1.SqlUser.findOne({ where: { email: email.toLowerCase() } });
        return u ? sqlToRecord(u) : null;
    },
    async create(data) {
        if ((0, connect_1.isMongo)()) {
            const u = await User_1.User.create({
                ...data,
                email: data.email.toLowerCase(),
                settings: { followRedirects: true, verifySsl: true, sendNoCacheHeader: false, encodeUrl: true, timeout: 0, proxyEnabled: false, proxyUrl: 'http://127.0.0.1:8080', proxyAuthEnabled: false, proxyUsername: '', proxyPassword: '', saveHistory: true, shortcuts: { search: 'ctrl+k', save: 'ctrl+s', send: 'ctrl+enter' } },
                clientCertificates: [],
            });
            return mongoToRecord(u);
        }
        const u = await sql_models_1.SqlUser.create({
            id: (0, uuid_1.v4)(),
            ...data,
            email: data.email.toLowerCase(),
            settings: JSON.stringify({ followRedirects: true, verifySsl: true, sendNoCacheHeader: false, encodeUrl: true, timeout: 0, proxyEnabled: false, proxyUrl: 'http://127.0.0.1:8080', proxyAuthEnabled: false, proxyUsername: '', proxyPassword: '', saveHistory: true, shortcuts: { search: 'ctrl+k', save: 'ctrl+s', send: 'ctrl+enter' } }),
            clientCertificates: '[]',
        });
        return sqlToRecord(u);
    },
    async update(id, data) {
        if ((0, connect_1.isMongo)()) {
            const u = await User_1.User.findByIdAndUpdate(id, data, { new: true }).lean();
            return u ? mongoToRecord(u) : null;
        }
        await sql_models_1.SqlUser.update({
            ...data,
            settings: data.settings ? JSON.stringify(data.settings) : undefined,
            clientCertificates: data.clientCertificates ? JSON.stringify(data.clientCertificates) : undefined,
        }, { where: { id } });
        return this.findById(id);
    },
    async delete(id) {
        if ((0, connect_1.isMongo)()) {
            await User_1.User.findByIdAndDelete(id);
            return;
        }
        await sql_models_1.SqlUser.destroy({ where: { id } });
    },
    async list(filter = {}) {
        if ((0, connect_1.isMongo)()) {
            const users = await User_1.User.find(filter).lean();
            return users.map(mongoToRecord);
        }
        const users = await sql_models_1.SqlUser.findAll({ where: filter });
        return users.map(sqlToRecord);
    },
    async count() {
        if ((0, connect_1.isMongo)())
            return User_1.User.countDocuments();
        return sql_models_1.SqlUser.count();
    },
    async existsByEmail(email) {
        const u = await this.findByEmail(email);
        return !!u;
    },
    // Returns the raw Mongoose document (for routes that still need .save())
    async findRawMongoById(id) {
        if (!(0, connect_1.isMongo)())
            return null;
        return User_1.User.findById(id);
    },
    async findRawMongoByEmail(email) {
        if (!(0, connect_1.isMongo)())
            return null;
        return User_1.User.findOne({ email: email.toLowerCase() });
    },
};
//# sourceMappingURL=UserRepository.js.map