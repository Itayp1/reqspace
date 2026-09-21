import mongoose, { Document } from 'mongoose';
export interface ISystemConfig extends Document<string> {
    _id: string;
    auth: {
        mode: 'login' | 'header' | 'both';
        headerName: string;
        allowSelfRegistration: boolean;
        allowedEmailDomains: string[];
        jwtTtlDays: number;
        jwtRefreshHoursBeforeExpiry: number;
        googleOAuth?: {
            enabled: boolean;
            clientId: string;
            clientSecret: string;
        };
    };
    history: {
        maxRequestBodyKB: number;
        maxTotalPerUserMB: number;
        cleanupPolicy: 'fifo';
    };
    proxy: {
        enabled: boolean;
        url: string;
        username?: string;
        password?: string;
    };
}
export declare const SystemConfig: mongoose.Model<ISystemConfig, {}, {}, {}, mongoose.Document<unknown, {}, ISystemConfig, {}, {}> & ISystemConfig & Required<{
    _id: string;
}> & {
    __v: number;
}, any>;
export declare function ensureSystemConfig(): Promise<void>;
//# sourceMappingURL=SystemConfig.d.ts.map