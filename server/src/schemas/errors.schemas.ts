import { z } from 'zod';

export const reportErrorSchema = z.object({
  kind: z.enum(['window.error', 'unhandledrejection', 'react-boundary', 'api']),
  message: z.string().min(1).max(2000),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(10000).optional(),
  route: z.string().max(500).optional(),
  method: z.string().max(10).optional(),
  status: z.number().int().min(0).max(999).optional(),
});

export const listErrorsQuerySchema = z.object({
  source: z.enum(['client', 'server']).optional(),
  kind: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  // Only rows recorded at or after this instant (ISO 8601). The e2e suite uses it
  // to check that a test left no new faults behind.
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  sort: z.enum(['lastSeen', 'firstSeen', 'count']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
