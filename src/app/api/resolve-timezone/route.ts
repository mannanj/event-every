import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeResolvedTimezone } from '@/utils/timezone';
import { createBindingCandidates, normalizeRequestUuid } from '@/platform/provider/request-binding';
import { DurableTimezoneReplaySchema, toDurableTimezoneReplay } from '@/platform/provider/replay';
import { fixedProviderHttp, getPlatformRuntime } from '@/platform/runtime';

const TimezoneRequestSchema = z.object({
  rawTimezone: z.string().trim().min(1),
  rawStartDate: z.string().optional(),
  rawEndDate: z.string().optional(),
  eventTitle: z.string().optional(),
  eventLocation: z.string().optional(),
}).strict();

function fixed(result: Parameters<typeof fixedProviderHttp>[0]): Response {
  const mapped = fixedProviderHttp(result);
  return NextResponse.json(mapped.body, { status: mapped.status });
}

export async function POST(request: NextRequest): Promise<Response> {
  let requestId: string;
  try { requestId = normalizeRequestUuid(request.headers.get('x-event-every-request-id') ?? ''); } catch {
    return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid timezone request.' }, { status: 400 });
  }
  const parsed = TimezoneRequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid timezone request.' }, { status: 400 });
  const normalized = {
    rawTimezone: parsed.data.rawTimezone,
    rawStartDate: parsed.data.rawStartDate ?? null,
    rawEndDate: parsed.data.rawEndDate ?? null,
    eventTitle: parsed.data.eventTitle ?? null,
    eventLocation: parsed.data.eventLocation ?? null,
  };

  try {
    const runtime = getPlatformRuntime();
    const bindingCandidates = await createBindingCandidates({
      route: 'resolve-timezone', variant: 'resolve-timezone', canonicalJson: JSON.stringify(normalized), ...runtime.shapeKeys(),
    });
    const context = [
      `Timezone text: "${normalized.rawTimezone}"`,
      normalized.rawStartDate && `Event start: ${normalized.rawStartDate}`,
      normalized.rawEndDate && `Event end: ${normalized.rawEndDate}`,
      normalized.eventTitle && `Event title: ${normalized.eventTitle}`,
      normalized.eventLocation && `Event location: ${normalized.eventLocation}`,
    ].filter(Boolean).join('\n');
    const result = await runtime.runProviderOperation({
      requestId,
      variant: 'resolve-timezone',
      bindingCandidates,
      signal: request.signal,
      execute: async (invoke) => {
        const transport = await invoke({
          messages: [{ role: 'user', content: `Given the following event context, determine the IANA timezone identifier.\n\n${context}\n\nReturn the most likely IANA timezone.` }],
          tools: [{
            type: 'function',
            function: {
              name: 'resolve_timezone',
              description: 'Return the resolved IANA timezone',
              parameters: {
                type: 'object',
                properties: {
                  timezone: { type: 'string', description: 'IANA timezone identifier' },
                  confidence: { type: 'number', description: 'Confidence 0-1', minimum: 0, maximum: 1 },
                },
                required: ['timezone', 'confidence'],
              },
            },
          }],
          tool_choice: { type: 'function', function: { name: 'resolve_timezone' } },
        });
        if (transport.status !== 'success') throw new Error('provider_failed');
        const calls = (transport.value as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: unknown } }> } }> }).choices?.[0]?.message?.tool_calls;
        const argumentsText = calls?.[0]?.function?.arguments;
        if (typeof argumentsText !== 'string') throw new Error('provider_invalid_response');
        const value = JSON.parse(argumentsText) as { timezone?: unknown; confidence?: unknown };
        return toDurableTimezoneReplay(sanitizeResolvedTimezone(value.timezone, value.confidence));
      },
    });
    if (result.status !== 'completed') return fixed(result);
    const replay = DurableTimezoneReplaySchema.safeParse(result.replay);
    if (!replay.success) return fixed({ status: 'unavailable' });
    return NextResponse.json(replay.data);
  } catch {
    return fixed({ status: 'unavailable' });
  }
}
