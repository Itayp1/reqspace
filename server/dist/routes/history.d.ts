import mongoose from 'mongoose';
declare const router: import("express-serve-static-core").Router;
export default router;
export declare function saveHistoryEntry(userId: mongoose.Types.ObjectId, workspaceId: mongoose.Types.ObjectId, data: {
    requestSnapshot: Record<string, unknown>;
    responseBody: string;
    responseStatus: number;
    responseStatusText: string;
    responseHeaders: Record<string, string>;
    responseTime: number;
    responseSize: number;
    testResults: Array<{
        name: string;
        passed: boolean;
        error?: string;
    }>;
}): Promise<void>;
//# sourceMappingURL=history.d.ts.map