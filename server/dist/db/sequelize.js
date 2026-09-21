"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSequelize = getSequelize;
exports.initSequelize = initSequelize;
const sequelize_1 = require("sequelize");
let _sequelize = null;
function getSequelize() {
    if (!_sequelize)
        throw new Error('Sequelize not initialized. Call initSequelize() first.');
    return _sequelize;
}
function initSequelize(config) {
    if (config.type === 'mongodb' || config.type === 'sqlite') {
        if (config.type === 'sqlite') {
            _sequelize = new sequelize_1.Sequelize({
                dialect: 'sqlite',
                storage: config.storagePath,
                logging: false,
            });
        }
        return _sequelize;
    }
    const dialectMap = {
        mysql: 'mysql',
        postgres: 'postgres',
        mssql: 'mssql',
    };
    const dialect = dialectMap[config.type];
    if (!dialect)
        throw new Error(`Unsupported DB type: ${config.type}`);
    if (config.connectionString) {
        _sequelize = new sequelize_1.Sequelize(config.connectionString, {
            dialect,
            logging: false,
            dialectOptions: config.type === 'mssql'
                ? { options: { encrypt: false, trustServerCertificate: true } }
                : {},
        });
    }
    else {
        _sequelize = new sequelize_1.Sequelize(config.database, config.username, config.password || undefined, {
            dialect,
            host: config.host,
            port: config.port,
            logging: false,
            dialectOptions: config.type === 'mssql'
                ? { options: { encrypt: false, trustServerCertificate: true } }
                : {},
        });
    }
    return _sequelize;
}
//# sourceMappingURL=sequelize.js.map