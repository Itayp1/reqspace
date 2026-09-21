import mongoose, { Document, Schema } from 'mongoose';

export interface ITestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface IHistory extends Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  requestSnapshot: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    params?: Array<{ key: string; value: string }>;
    auth?: Record<string, unknown>;
  };
  responseSnapshot: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    bodyTruncated: boolean;
    responseTime: number;
    size: number;
  };
  testResults: ITestResult[];
  executedAt: Date;
}

const HistorySchema = new Schema<IHistory>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestSnapshot: {
      method: String,
      url: String,
      headers: { type: Map, of: String },
      body: String,
      params: [{ key: String, value: String }],
      auth: { type: Schema.Types.Mixed },
    },
    responseSnapshot: {
      status: Number,
      statusText: String,
      headers: { type: Map, of: String },
      body: { type: String, default: '' },
      bodyTruncated: { type: Boolean, default: false },
      responseTime: Number,
      size: Number,
    },
    testResults: [
      {
        name: String,
        passed: Boolean,
        error: String,
        _id: false,
      },
    ],
    executedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

HistorySchema.index({ userId: 1, executedAt: -1 });
HistorySchema.index({ workspaceId: 1 });

export const History = mongoose.model<IHistory>('History', HistorySchema);
