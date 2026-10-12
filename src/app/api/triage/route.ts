import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { triageForScan } from '@/server/typesafe/triage';
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
  const outcome = await triageForScan(parsed.data.text, parsed.data.source, request.signal);
  return outcome ? NextResponse.json(outcome) : unavailable();
}
