import mongoose, { Document } from 'mongoose';
export interface IAuditLog extends Document {
    userId: mongoose.Types.ObjectId;
    action: string;
    targetType?: string;
    targetId?: mongoose.Types.ObjectId;
    ip?: string;
    details?: Record<string, unknown>;
    createdAt: Date;
}
export declare const AuditLog: mongoose.Model<IAuditLog, {}, {}, {}, mongoose.Document<unknown, {}, IAuditLog, {}, {}> & IAuditLog & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export declare function logAudit(userId: mongoose.Types.ObjectId, action: string, opts?: {
    targetType?: string;
    targetId?: mongoose.Types.ObjectId;
    ip?: string;
    details?: Record<string, unknown>;
}): Promise<void>;
//# sourceMappingURL=AuditLog.d.ts.map