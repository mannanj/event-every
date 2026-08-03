import { NextRequest, NextResponse } from 'next/server';
import { sanitizeResolvedTimezone } from '@/utils/timezone';
import {
  bindLegacyProviderRequest,
  legacyCommunityLimitResponse,
  legacyIpLimitResponse,
} from '@/platform/legacy';
import { getProviderPort } from '@/platform/runtime';

const TZ_RESOLVE_MODEL = process.env.OPENROUTER_TZ_MODEL || 'deepseek/deepseek-chat-v3-0324';
const STRICT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    const limits = await legacy.evaluateLimits();
    if (!limits.allowed) {
      return limits.reason === 'community-budget'
        ? legacyCommunityLimitResponse(limits.resetAt)
        : legacyIpLimitResponse(limits.resetAt);
    }

    const { rawTimezone, rawStartDate, rawEndDate, eventTitle, eventLocation } = await request.json();
    if (!rawTimezone) return NextResponse.json({ error: 'rawTimezone is required' }, { status: 400 });

    const contextParts = [
      `Timezone text: "${rawTimezone}"`,
      rawStartDate && `Event start: ${rawStartDate}`,
      rawEndDate && `Event end: ${rawEndDate}`,
      eventTitle && `Event title: ${eventTitle}`,
      eventLocation && `Event location: ${eventLocation}`,
    ].filter(Boolean).join('\n');

    const dispatch = providerPort.dispatch({
      route: 'resolve-timezone',
      requestId,
      identity: { kind: 'unknown', keyVersion: '', hmac: '' },
      signal: request.signal,
      charge: legacy.charge,
      provider: () => legacy.chat({
        model: TZ_RESOLVE_MODEL,
        messages: [{
          role: 'user',
          content: `Given the following event context, determine the IANA timezone identifier.\n\n${contextParts}\n\nReturn the most likely IANA timezone (e.g. "America/New_York", "UTC", "Europe/London").`,
        }],
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
      }),
    });

    if (dispatch.status === 'aborted-before-dispatch') {
      return NextResponse.json({ error: 'LLM API error' }, { status: 408 });
    }
    const provider = await dispatch.provider;
    if (provider.status !== 'success') {
      const failure = legacy.failure();
      return failure?.kind === 'community-limit'
        ? legacyCommunityLimitResponse(failure.resetAt)
        : NextResponse.json({ error: 'LLM API error' }, { status: 502 });
    }

    const toolCalls = provider.value.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json({ error: 'No timezone resolution from LLM' }, { status: 502 });
    }
    const result = JSON.parse(toolCalls[0].function.arguments);
    return NextResponse.json(sanitizeResolvedTimezone(result.timezone, result.confidence));
  } catch {
    return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
  }
}
