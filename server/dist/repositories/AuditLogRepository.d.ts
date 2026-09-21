export interface IAuditLogRecord {
    _id: string;
    id: string;
    userId: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    ip?: string | null;
    details?: Record<string, unknown> | null;
    createdAt: Date;
}
export declare const AuditLogRepository: {
    log(data: Omit<IAuditLogRecord, "_id" | "id" | "createdAt">): Promise<void>;
    findByUser(userId: string, limit?: number): Promise<IAuditLogRecord[]>;
    list(filter?: Record<string, any>, limit?: number, skip?: number): Promise<IAuditLogRecord[]>;
    count(filter?: Record<string, any>): Promise<number>;
};
export declare function logAudit(userId: string, action: string, opts?: {
    targetType?: string;
    targetId?: string;
    ip?: string;
    details?: Record<string, unknown>;
}): Promise<void>;
//# sourceMappingURL=AuditLogRepository.d.ts.map