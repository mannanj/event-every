import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createBindingCandidates, normalizeRequestUuid } from '@/platform/provider/request-binding';
import { DurableSummaryReplaySchema, toDurableSummaryReplay } from '@/platform/provider/replay';
import { fixedProviderHttp, getPlatformRuntime } from '@/platform/runtime';

const SUMMARY_PROMPT = `You write ultra-short labels for saved calendar inputs.
Reply with ONLY a 2-3 word label in Title Case, words separated by single spaces.
No punctuation, no quotes, no preamble, no explanation.
Example reply: Team Lunch`;
const SummaryRequestSchema = z.object({
  text: z.string().optional().default(''),
  eventTitles: z.array(z.string()).optional().default([]),
}).strict();

function cleanLabel(raw: string): string {
  let value = (raw || '').split('\n')[0].trim();
  value = value.replace(/^["'`*]+|["'`*]+$/g, '').replace(/[.,;:!?]+$/g, '').trim();
  if (!/\s/.test(value) && /[a-z][A-Z]/.test(value)) value = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return value.split(/\s+/).filter(Boolean).slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

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
    return NextResponse.json({ error: 'Invalid summarize request.' }, { status: 400 });
  }
  const parsed = SummaryRequestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid summarize request.' }, { status: 400 });
  const normalized = {
    text: parsed.data.text.trim().slice(0, 600),
    eventTitles: parsed.data.eventTitles.map((value) => value.trim()).filter(Boolean).slice(0, 8),
  };
  if (!normalized.text && normalized.eventTitles.length === 0) {
    return NextResponse.json({ error: 'Invalid summarize request.' }, { status: 400 });
  }

  try {
    const runtime = getPlatformRuntime();
    const bindingCandidates = await createBindingCandidates({
      route: 'summarize', variant: 'summarize', canonicalJson: JSON.stringify(normalized), ...runtime.shapeKeys(),
    });
    const context = [
      normalized.text ? `Input text: ${normalized.text}` : 'Input text: (none, image only)',
      normalized.eventTitles.length ? `Event titles: ${normalized.eventTitles.join('; ')}` : '',
    ].filter(Boolean).join('\n');
    const result = await runtime.runProviderOperation({
      requestId,
      variant: 'summarize',
      bindingCandidates,
      signal: request.signal,
      execute: async (invoke) => {
        const transport = await invoke({
          messages: [
            { role: 'system', content: SUMMARY_PROMPT },
            { role: 'user', content: context },
          ],
        });
        if (transport.status !== 'success') throw new Error('provider_failed');
        const content = (transport.value as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
        return toDurableSummaryReplay(cleanLabel(typeof content === 'string' ? content : ''));
      },
    });
    if (result.status !== 'completed') return fixed(result);
    const replay = DurableSummaryReplaySchema.safeParse(result.replay);
    if (!replay.success) return fixed({ status: 'unavailable' });
    return NextResponse.json(replay.data);
  } catch {
    return fixed({ status: 'unavailable' });
  }
}
