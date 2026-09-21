export interface ISystemConfigRecord {
    _id: string;
    id: string;
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
export declare const SystemConfigRepository: {
    getConfig(): Promise<ISystemConfigRecord | null>;
    ensure(): Promise<ISystemConfigRecord>;
    updateConfig(data: any): Promise<ISystemConfigRecord | null>;
};
//# sourceMappingURL=SystemConfigRepository.d.ts.map