import { NextRequest, NextResponse } from 'next/server';
import {
  CommunityLimitError,
  communityLimitResponse,
  getLlmKey,
  getLlmMode,
  openRouterChat,
} from '@/lib/llm';
import { evaluateLimits, chargeIpRate } from '@/lib/limits';
import { DAILY_LIMIT } from '@/lib/ratelimit';
import { sanitizeResolvedTimezone } from '@/utils/timezone';

const TZ_RESOLVE_MODEL = process.env.OPENROUTER_TZ_MODEL || 'deepseek/deepseek-chat-v3-0324';

export async function POST(request: NextRequest) {
  try {
    const mode = getLlmMode(request);
    const apiKey = getLlmKey(mode);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
      );
    }

    const limits = await evaluateLimits(request);
    if (!limits.allowed) {
      if (limits.reason === 'community-budget') {
        return communityLimitResponse(new CommunityLimitError(limits.resetAt));
      }
      return NextResponse.json(
        { error: 'Daily request limit reached', reset: limits.resetAt },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': DAILY_LIMIT.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Date.parse(limits.resetAt).toString(),
          },
        }
      );
    }

    const { rawTimezone, rawStartDate, rawEndDate, eventTitle, eventLocation } = await request.json();

    if (!rawTimezone) {
      return NextResponse.json(
        { error: 'rawTimezone is required' },
        { status: 400 }
      );
    }

    const contextParts = [
      `Timezone text: "${rawTimezone}"`,
      rawStartDate && `Event start: ${rawStartDate}`,
      rawEndDate && `Event end: ${rawEndDate}`,
      eventTitle && `Event title: ${eventTitle}`,
      eventLocation && `Event location: ${eventLocation}`,
    ].filter(Boolean).join('\n');

    let data;
    try {
      data = await openRouterChat(
        {
          model: TZ_RESOLVE_MODEL,
          messages: [
            {
              role: 'user',
              content: `Given the following event context, determine the IANA timezone identifier.\n\n${contextParts}\n\nReturn the most likely IANA timezone (e.g. "America/New_York", "UTC", "Europe/London").`,
            },
          ],
          tools: [
            {
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
            },
          ],
          tool_choice: { type: 'function', function: { name: 'resolve_timezone' } },
        },
        { key: apiKey, mode }
      );
    } catch (error) {
      if (error instanceof CommunityLimitError) return communityLimitResponse(error);
      // Preserve this route's contract: a non-limit upstream failure is a 502, not a 500.
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'LLM API error' },
        { status: 502 }
      );
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json(
        { error: 'No timezone resolution from LLM' },
        { status: 502 }
      );
    }

    const result = JSON.parse(toolCalls[0].function.arguments);

    // The model is asked for an IANA id but can return a label/abbreviation/offset. Sanitize at
    // this trust boundary: emit only a valid IANA zone, or confidence 0 (which the client treats
    // as "keep your current value") — never a raw string that would shift the event to UTC.
    const sanitized = sanitizeResolvedTimezone(result.timezone, result.confidence);

    // Charge the per-IP counter only on a successful resolution, so an upstream
    // failure or empty result (502 above) doesn't consume the user's daily quota.
    await chargeIpRate(request);

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error('Timezone resolve error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
