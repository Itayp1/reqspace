import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId;
  action: string;
  targetType?: string;
  targetId?: mongoose.Types.ObjectId;
  ip?: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: Schema.Types.ObjectId },
    ip: { type: String },
    details: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }, // TTL: 90 days
  },
  { timestamps: false }
);

AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 0 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export async function logAudit(
  userId: mongoose.Types.ObjectId,
  action: string,
  opts?: {
    targetType?: string;
    targetId?: mongoose.Types.ObjectId;
    ip?: string;
    details?: Record<string, unknown>;
  }
) {
  await AuditLog.create({ userId, action, ...opts });
}
