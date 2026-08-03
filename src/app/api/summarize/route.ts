import { NextRequest, NextResponse } from 'next/server';
import {
  bindLegacyProviderRequest,
  legacyCommunityLimitResponse,
  legacyIpLimitResponse,
} from '@/platform/legacy';
import { getProviderPort } from '@/platform/runtime';

const OPENROUTER_SUMMARY_MODEL = process.env.OPENROUTER_SUMMARY_MODEL || 'mistralai/ministral-8b-2512';
const STRICT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUMMARY_PROMPT = `You write ultra-short labels for saved calendar inputs.
Reply with ONLY a 2-3 word label in Title Case, words separated by single spaces.
No punctuation, no quotes, no preamble, no explanation.
Example reply: Team Lunch`;

function cleanLabel(raw: string): string {
  let value = (raw || '').split('\n')[0].trim();
  value = value.replace(/^["'`*]+|["'`*]+$/g, '').replace(/[.,;:!?]+$/g, '').trim();
  if (!/\s/.test(value) && /[a-z][A-Z]/.test(value)) {
    value = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }
  return value.split(/\s+/).filter(Boolean).slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function POST(request: NextRequest) {
  const providerPort = getProviderPort();
  if ('status' in providerPort) {
    return NextResponse.json({ error: 'State is not ready.', code: 'c1_state_not_ready' }, { status: 503 });
  }

  const requestId = request.headers.get('x-event-every-request-id');
  if (!requestId || !STRICT_UUID.test(requestId)) {
    return NextResponse.json({ error: 'Invalid request id.' }, { status: 400 });
  }

  const legacy = bindLegacyProviderRequest(request);
  try {
    if (!legacy.auth().key) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY environment variable is not set' }, { status: 500 });
    }

    const limits = await legacy.evaluateLimits();
    if (!limits.allowed) {
      return limits.reason === 'community-budget'
        ? legacyCommunityLimitResponse(limits.resetAt)
        : legacyIpLimitResponse(limits.resetAt);
    }

    let body: { text?: unknown; eventTitles?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }
    const text = typeof body.text === 'string' ? body.text : '';
    const eventTitles = Array.isArray(body.eventTitles)
      ? body.eventTitles.filter((title: unknown): title is string => typeof title === 'string' && title.trim().length > 0)
      : [];
    if (!text.trim() && eventTitles.length === 0) {
      return NextResponse.json({ error: 'text or eventTitles required' }, { status: 400 });
    }

    const context = [
      text.trim() ? `Input text: ${text.trim().slice(0, 600)}` : 'Input text: (none, image only)',
      eventTitles.length ? `Event titles: ${eventTitles.slice(0, 8).join('; ')}` : '',
    ].filter(Boolean).join('\n');

    const dispatch = providerPort.dispatch({
      route: 'summarize',
      requestId,
      identity: { kind: 'unknown', keyVersion: '', hmac: '' },
      signal: request.signal,
      charge: legacy.charge,
      provider: () => legacy.chat({
        model: OPENROUTER_SUMMARY_MODEL,
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: context },
        ],
        max_tokens: 16,
        temperature: 0.2,
      }),
    });

    if (dispatch.status === 'aborted-before-dispatch') {
      return NextResponse.json({ error: 'Failed to summarize input' }, { status: 408 });
    }
    const provider = await dispatch.provider;
    if (provider.status !== 'success') {
      const failure = legacy.failure();
      return failure?.kind === 'community-limit'
        ? legacyCommunityLimitResponse(failure.resetAt)
        : NextResponse.json({ error: 'Failed to summarize input' }, { status: 500 });
    }

    return NextResponse.json({ summary: cleanLabel(provider.value.choices?.[0]?.message?.content || '') });
  } catch {
    return NextResponse.json({ error: 'Failed to summarize input' }, { status: 500 });
  }
}
