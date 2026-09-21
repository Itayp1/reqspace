"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemConfigRepository = void 0;
const connect_1 = require("../db/connect");
const SystemConfig_1 = require("../models/SystemConfig");
const sql_models_1 = require("../db/sql-models");
function sqlToRecord(c) {
    return {
        _id: c.id,
        id: c.id,
        auth: JSON.parse(c.auth),
        history: JSON.parse(c.history),
        proxy: JSON.parse(c.proxy),
    };
}
function mongoToRecord(c) {
    return {
        _id: c._id.toString(),
        id: c._id.toString(),
        auth: c.auth,
        history: c.history,
        proxy: c.proxy,
    };
}
const DEFAULT_CONFIG = {
    auth: {
        mode: 'login',
        headerName: 'X-Auth-User',
        allowSelfRegistration: true,
        allowedEmailDomains: [],
        jwtTtlDays: 7,
        jwtRefreshHoursBeforeExpiry: 24,
        googleOAuth: {
            enabled: false,
            clientId: '',
            clientSecret: '',
        }
    },
    history: {
        maxRequestBodyKB: 5120,
        maxTotalPerUserMB: 100,
        cleanupPolicy: 'fifo',
    },
    proxy: {
        enabled: false,
        url: '',
        username: '',
        password: '',
    }
};
exports.SystemConfigRepository = {
    async getConfig() {
        if ((0, connect_1.isMongo)()) {
            const c = await SystemConfig_1.SystemConfig.findOne().lean();
            return c ? mongoToRecord(c) : null;
        }
        const c = await sql_models_1.SqlSystemConfig.findOne();
        return c ? sqlToRecord(c) : null;
    },
    async ensure() {
        const existing = await this.getConfig();
        if (existing)
            return existing;
        if ((0, connect_1.isMongo)()) {
            const c = await SystemConfig_1.SystemConfig.create({
                _id: 'global',
                ...DEFAULT_CONFIG
            });
            return mongoToRecord(c);
        }
        const c = await sql_models_1.SqlSystemConfig.create({
            id: 'global',
            auth: JSON.stringify(DEFAULT_CONFIG.auth),
            history: JSON.stringify(DEFAULT_CONFIG.history),
            proxy: JSON.stringify(DEFAULT_CONFIG.proxy),
        });
        return sqlToRecord(c);
    },
    async updateConfig(data) {
        if ((0, connect_1.isMongo)()) {
            const c = await SystemConfig_1.SystemConfig.findOneAndUpdate({}, data, { new: true, upsert: true }).lean();
            return c ? mongoToRecord(c) : null;
        }
        const existing = await sql_models_1.SqlSystemConfig.findOne();
        if (!existing)
            return null;
        if (data.auth)
            existing.auth = JSON.stringify(data.auth);
        if (data.history)
            existing.history = JSON.stringify(data.history);
        if (data.proxy)
            existing.proxy = JSON.stringify(data.proxy);
        await existing.save();
        return this.getConfig();
    },
};
//# sourceMappingURL=SystemConfigRepository.js.map