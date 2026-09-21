"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMongo = isMongo;
exports.connectDb = connectDb;
const mongoose_1 = __importDefault(require("mongoose"));
const sequelize_1 = require("./sequelize");
const sql_models_1 = require("./sql-models");
let _dbType = 'mongodb';
function isMongo() {
    return _dbType === 'mongodb';
}
async function connectDb(config) {
    _dbType = config.type;
    if (config.type === 'mongodb') {
        const uri = config.connectionString;
        await mongoose_1.default.connect(uri, { tlsInsecure: true });
        console.log('✅ MongoDB connected:', uri.replace(/\/\/.*@/, '//***@'));
        return;
    }
    // SQL path
    const sq = (0, sequelize_1.initSequelize)(config);
    (0, sql_models_1.initSqlModels)();
    await sq.authenticate();
    console.log(`✅ ${config.type.toUpperCase()} connected`);
    // Create tables that don't exist yet (non-destructive)
    await sq.sync({ alter: true });
    console.log('✅ SQL tables synced');
}
//# sourceMappingURL=connect.js.map