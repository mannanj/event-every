import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { decideTriage, TRIAGE_MAX_BYTES, triageText } from '@/server/typesafe/triage';
import { typeSafeAvailable } from '@/server/typesafe/client';

/**
 * Pre-scan triage. Always answers 200: `available: false` means "run the
 * scan exactly as before", so a missing key, a slow call, or a bad answer can
 * never make a scan fail or wait.
 */

const TriageRequestSchema = z.object({
  text: z.string().min(1),
  source: z.enum(['paste', 'typed', 'url-page']),
}).strict();

const unavailable = () => NextResponse.json({ available: false });

export async function POST(request: NextRequest): Promise<Response> {
  if (!typeSafeAvailable()) return unavailable();
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid triage request.' }, { status: 400 });
  }
  const parsed = TriageRequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid triage request.' }, { status: 400 });
  if (new TextEncoder().encode(parsed.data.text).byteLength > TRIAGE_MAX_BYTES) return unavailable();

  const startedAt = Date.now();
  const verdict = await triageText(parsed.data.text, parsed.data.source, { signal: request.signal });
  const decision = decideTriage(verdict);
  console.log(JSON.stringify({
    event: 'triage', ms: Date.now() - startedAt, available: verdict !== null,
    shape: verdict?.shape.choice ?? null, paragraphs: verdict?.paragraphs.length ?? 0,
    decision: decision.kind, chunks: decision.kind === 'split' ? decision.chunks.length : 0,
  }));
  if (!verdict) return unavailable();
  return NextResponse.json({
    available: true,
    decision,
    shape: verdict.shape.choice,
    hasEvent: verdict.hasEvent,
    complete: verdict.complete,
  });
}
