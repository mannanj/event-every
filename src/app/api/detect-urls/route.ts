import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { issueResolverCapability } from '@/platform/resolver/capability';
import { detectUrlsDeterministically } from '@/services/urlDetector';

const inputSchema = z.object({ text: z.string().min(1) }).strict();
const MAX_TEXT_BYTES = 128 * 1024;

export async function POST(request: NextRequest) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new TextEncoder().encode(parsed.data.text).byteLength > MAX_TEXT_BYTES) {
    return NextResponse.json({ error: 'Invalid text.', code: 'invalid_body' }, { status: 400 });
  }

  const input = parsed.data;
const result = detectUrlsDeterministically(input.text);
  const capability = await issueResolverCapability({
    identity: trustedIdentity(request.headers.get('x-event-every-identity')),
    urls: result.urls,
    nowMs: Date.now(),
    key: process.env.RESOLVER_CAPABILITY_HMAC ?? '',
  });
  if (capability.status === 'day-rollover') {
    return NextResponse.json({ code: 'resolver_day_rollover' }, { status: 409 });
  }
  return NextResponse.json({
    ...result,
    urls: capability.urls,
    resolverCapability: capability.capability,
  });
}

function trustedIdentity(value: string | null): string {
  if (value === 'unknown') return value;
  return value?.match(/^known:[A-Za-z0-9._-]{1,64}:[0-9a-f]{64}$/)?.[0] ?? 'unknown';
}
