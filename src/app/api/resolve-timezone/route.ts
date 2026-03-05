import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const TZ_RESOLVE_MODEL = process.env.OPENROUTER_TZ_MODEL || 'deepseek/deepseek-chat-v3-0324';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
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

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'event-every',
      },
      body: JSON.stringify({
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
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'LLM API error' },
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
    return NextResponse.json({
      timezone: result.timezone,
      confidence: result.confidence ?? 0.5,
    });
  } catch (error) {
    console.error('Timezone resolve error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
