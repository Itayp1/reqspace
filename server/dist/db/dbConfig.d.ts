export type DbType = 'mongodb' | 'mysql' | 'postgres' | 'mssql' | 'sqlite';
export interface DbConfig {
    type: DbType;
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    storagePath?: string;
}
export declare function writeConfigFile(config: DbConfig): void;
export declare function getDbConfig(): DbConfig;
//# sourceMappingURL=dbConfig.d.ts.map