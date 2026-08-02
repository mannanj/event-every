import { EventCandidateSchema, ScannerIssueSchema } from '@event-every/scanner';
import { z } from 'zod';

export { ScanRequestSchema } from './scanRequest';
export type { ScanRequest } from './scanRequest';

export const E1SourceHandleSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    sourceId: z.string().min(1),
    kind: z.literal('text'),
    contentHandle: z.string().min(1),
  }),
  z.strictObject({
    sourceId: z.string().min(1),
    kind: z.literal('image'),
    contentHandle: z.string().min(1),
  }),
]);

export const ScanResponseSchema = z.strictObject({
  source: E1SourceHandleSchema,
  candidates: z.array(EventCandidateSchema).max(50),
  issues: z.array(ScannerIssueSchema),
});

export type ScanResponse = z.infer<typeof ScanResponseSchema>;
