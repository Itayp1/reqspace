"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestRepository = void 0;
const connect_1 = require("../db/connect");
const Request_1 = require("../models/Request");
const sql_models_1 = require("../db/sql-models");
const uuid_1 = require("uuid");
function sqlToRecord(r) {
    return {
        _id: r.id, id: r.id,
        collectionId: r.collectionId,
        folderId: r.folderId,
        name: r.name, method: r.method, url: r.url,
        params: typeof r.params === 'string' ? JSON.parse(r.params) : (r.params || []),
        headers: typeof r.headers === 'string' ? JSON.parse(r.headers) : (r.headers || []),
        auth: typeof r.auth === 'string' ? JSON.parse(r.auth) : (r.auth || { type: 'none' }),
        body: typeof r.body === 'string' ? JSON.parse(r.body) : (r.body || { mode: 'none' }),
        preRequestScript: r.preRequestScript,
        testScript: r.testScript,
        description: r.description,
        order: r.order,
        comments: typeof r.comments === 'string' ? JSON.parse(r.comments) : (r.comments || []),
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    };
}
function mongoToRecord(r) {
    return {
        _id: r._id.toString(), id: r._id.toString(),
        collectionId: r.collectionId?.toString(),
        folderId: r.folderId?.toString() ?? null,
        name: r.name, method: r.method, url: r.url,
        params: r.params || [], headers: r.headers || [],
        auth: r.auth || { type: 'none' },
        body: r.body || { mode: 'none' },
        preRequestScript: r.preRequestScript || '',
        testScript: r.testScript || '',
        description: r.description || '',
        order: r.order,
        comments: r.comments || [],
        createdBy: r.createdBy?.toString(),
        createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
}
exports.RequestRepository = {
    async findById(id) {
        if ((0, connect_1.isMongo)()) {
            const r = await Request_1.Request.findById(id).lean();
            return r ? mongoToRecord(r) : null;
        }
        const r = await sql_models_1.SqlRequest.findByPk(id);
        return r ? sqlToRecord(r) : null;
    },
    async findByCollection(collectionId) {
        if ((0, connect_1.isMongo)())
            return (await Request_1.Request.find({ collectionId }).sort({ order: 1 }).lean()).map(mongoToRecord);
        return (await sql_models_1.SqlRequest.findAll({ where: { collectionId }, order: [['order', 'ASC']] })).map(sqlToRecord);
    },
    async findByFolder(folderId) {
        if ((0, connect_1.isMongo)())
            return (await Request_1.Request.find({ folderId }).sort({ order: 1 }).lean()).map(mongoToRecord);
        return (await sql_models_1.SqlRequest.findAll({ where: { folderId }, order: [['order', 'ASC']] })).map(sqlToRecord);
    },
    async create(data) {
        if ((0, connect_1.isMongo)())
            return mongoToRecord(await Request_1.Request.create(data));
        return sqlToRecord(await sql_models_1.SqlRequest.create({
            id: (0, uuid_1.v4)(), ...data,
            folderId: data.folderId ?? null,
            params: JSON.stringify(data.params || []),
            headers: JSON.stringify(data.headers || []),
            auth: JSON.stringify(data.auth || { type: 'none' }),
            body: JSON.stringify(data.body || { mode: 'none' }),
            comments: JSON.stringify(data.comments || []),
            preRequestScript: data.preRequestScript || '',
            testScript: data.testScript || '',
            description: data.description || '',
            order: data.order ?? 0,
        }));
    },
    async update(id, data) {
        if ((0, connect_1.isMongo)()) {
            const r = await Request_1.Request.findByIdAndUpdate(id, data, { new: true }).lean();
            return r ? mongoToRecord(r) : null;
        }
        const patch = { ...data };
        if (data.params !== undefined)
            patch.params = JSON.stringify(data.params);
        if (data.headers !== undefined)
            patch.headers = JSON.stringify(data.headers);
        if (data.auth !== undefined)
            patch.auth = JSON.stringify(data.auth);
        if (data.body !== undefined)
            patch.body = JSON.stringify(data.body);
        if (data.comments !== undefined)
            patch.comments = JSON.stringify(data.comments);
        await sql_models_1.SqlRequest.update(patch, { where: { id } });
        return this.findById(id);
    },
    async delete(id) {
        if ((0, connect_1.isMongo)()) {
            await Request_1.Request.findByIdAndDelete(id);
            return;
        }
        await sql_models_1.SqlRequest.destroy({ where: { id } });
    },
    async deleteByCollection(collectionId) {
        if ((0, connect_1.isMongo)()) {
            await Request_1.Request.deleteMany({ collectionId });
            return;
        }
        await sql_models_1.SqlRequest.destroy({ where: { collectionId } });
    },
    async searchInWorkspace(query, collectionIds) {
        if ((0, connect_1.isMongo)()) {
            const q = new RegExp(query, 'i');
            return (await Request_1.Request.find({ collectionId: { $in: collectionIds }, $or: [{ name: q }, { url: q }] }).lean()).map(mongoToRecord);
        }
        const { Op } = await Promise.resolve().then(() => __importStar(require('sequelize')));
        return (await sql_models_1.SqlRequest.findAll({
            where: {
                collectionId: { [Op.in]: collectionIds },
                [Op.or]: [{ name: { [Op.like]: `%${query}%` } }, { url: { [Op.like]: `%${query}%` } }],
            }
        })).map(sqlToRecord);
    },
};
//# sourceMappingURL=RequestRepository.js.map