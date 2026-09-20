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

const probability = z.number().min(0).max(1);

/**
 * A second opinion on one candidate, from TypeSafe reading the text the scanner
 * itself reported. It only ever ADDS: every member is nullable, the whole field
 * is optional, and its absence is the app exactly as it behaves without it.
 */
export const CandidateVerificationSchema = z.strictObject({
  candidateId: z.string().min(1),
  fields: z.strictObject({
    date: probability.nullable(),
    time: probability.nullable(),
    location: probability.nullable(),
  }),
  /** Probability the event starts at a clock time; asked only when the scanner was unsure. */
  timed: probability.nullable(),
  title: z.strictObject({ choice: z.string().min(1), confidence: probability }).nullable(),
  /** Typical length, for a timed event whose source stated no end. */
  durationMinutes: z.number().int().positive().nullable(),
});

export type CandidateVerification = z.infer<typeof CandidateVerificationSchema>;

export const ScanResponseSchema = z.strictObject({
  source: E1SourceHandleSchema,
  candidates: z.array(EventCandidateSchema).max(50),
  issues: z.array(ScannerIssueSchema),
  verification: z.array(CandidateVerificationSchema).max(50).optional(),
});

export type ScanResponse = z.infer<typeof ScanResponseSchema>;
