import { EventCandidateSchema, ScannerIssueSchema } from '@event-every/scanner';
import { z } from 'zod';

const ScannerImageDataUrlSchema = z
  .string()
  .max(12_000_000)
  .regex(
    /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  )
  .refine((value) => value.slice(value.indexOf(',') + 1).length > 0);

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

export const ScanRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    text: z.string().max(100_000).refine((value) => value.trim().length > 0),
  }),
  z.strictObject({
    kind: z.literal('image'),
    dataUrl: ScannerImageDataUrlSchema,
  }),
]);

export const ScanResponseSchema = z.strictObject({
  source: E1SourceHandleSchema,
  candidates: z.array(EventCandidateSchema).max(50),
  issues: z.array(ScannerIssueSchema),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type ScanResponse = z.infer<typeof ScanResponseSchema>;
