import mongoose, { Document } from 'mongoose';
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
        params?: Array<{
            key: string;
            value: string;
        }>;
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
export declare const History: mongoose.Model<IHistory, {}, {}, {}, mongoose.Document<unknown, {}, IHistory, {}, {}> & IHistory & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=History.d.ts.map