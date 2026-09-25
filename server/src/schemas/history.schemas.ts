import { z } from 'zod';

export const saveHistorySchema = z.object({
  collectionId: z.string(),
  folderId: z.string().nullable().optional(),
  name: z.string().optional()
}).strict();
