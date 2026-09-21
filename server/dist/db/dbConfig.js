"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeConfigFile = writeConfigFile;
exports.getDbConfig = getDbConfig;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const CONFIG_FILE = process.env.DB_CONFIG_FILE || path_1.default.join(process.cwd(), 'db-config.json');
function readConfigFile() {
    try {
        if (fs_1.default.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs_1.default.readFileSync(CONFIG_FILE, 'utf8'));
        }
    }
    catch { }
    return {};
}
function writeConfigFile(config) {
    fs_1.default.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}
function getDbConfig() {
    const fileConfig = readConfigFile();
    const type = (process.env.DB_TYPE || fileConfig.type || 'mongodb');
    if (type === 'sqlite') {
        return {
            type: 'sqlite',
            storagePath: process.env.DB_STORAGE_PATH || fileConfig.storagePath || path_1.default.join(process.cwd(), 'data.sqlite'),
        };
    }
    if (type === 'mongodb') {
        return {
            type: 'mongodb',
            connectionString: process.env.MONGODB_URI ||
                process.env.MONGO_URI ||
                fileConfig.connectionString ||
                'mongodb://localhost:27017/postman-web',
        };
    }
    // SQL types
    return {
        type,
        connectionString: process.env.DB_CONNECTION_STRING || fileConfig.connectionString,
        host: process.env.DB_HOST || fileConfig.host || 'localhost',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : (fileConfig.port ?? defaultPort(type)),
        database: process.env.DB_NAME || fileConfig.database || 'postman_clone',
        username: process.env.DB_USER || fileConfig.username || 'root',
        password: process.env.DB_PASSWORD || fileConfig.password || '',
    };
}
function defaultPort(type) {
    switch (type) {
        case 'mysql': return 3306;
        case 'postgres': return 5432;
        case 'mssql': return 1433;
        default: return 5432;
    }
}
//# sourceMappingURL=dbConfig.js.map