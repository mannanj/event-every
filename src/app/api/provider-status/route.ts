import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeRequestUuid } from '@/platform/provider/request-binding';
import {
  DurableScanReplaySchema,
  DurableSummaryReplaySchema,
  DurableTimezoneReplaySchema,
} from '@/platform/provider/replay';
import { fixedProviderHttp, getPlatformRuntime } from '@/platform/runtime';

const StatusRequestSchema = z.object({ requestId: z.string() }).strict();
const ReplaySchema = z.union([DurableScanReplaySchema, DurableSummaryReplaySchema, DurableTimezoneReplaySchema]);
const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return json({ error: 'Invalid provider status request.' }, 400);
  }
  const parsed = StatusRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Invalid provider status request.' }, 400);
  let requestId: string;
  try { requestId = normalizeRequestUuid(parsed.data.requestId); } catch {
    return json({ error: 'Invalid provider status request.' }, 400);
  }

  const result = await getPlatformRuntime().providerRequestStatus(requestId);
  if (result.status === 'completed') {
    const replay = ReplaySchema.safeParse(result.replay);
    if (!replay.success) {
      const unavailable = fixedProviderHttp({ status: 'unavailable' });
      return json(unavailable.body, unavailable.status);
    }
    return json({ status: 'completed', replay: replay.data });
  }
  const mapped = fixedProviderHttp(result);
  return json(mapped.body, mapped.status);
}
