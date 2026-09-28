import { z } from 'zod';

export const saveHistorySchema = z.object({
  collectionId: z.string(),
  folderId: z.string().nullable().optional(),
  name: z.string().optional()
}).strict();

export const createHistoryEntrySchema = z.object({
  requestSnapshot: z.any(),
  responseBody: z.string(),
  responseStatus: z.number(),
  responseStatusText: z.string(),
  responseHeaders: z.record(z.string()),
  responseTime: z.number(),
  responseSize: z.number(),
  testResults: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    error: z.string().optional()
  })).optional()
});
