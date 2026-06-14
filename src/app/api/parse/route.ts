import { NextRequest, NextResponse } from 'next/server';
import { parseEventsBatch } from '@/services/parser';
import { DAILY_LIMIT } from '@/lib/ratelimit';
import { evaluateLimits, chargeIpRate } from '@/lib/limits';
import {
  CommunityLimitError,
  communityLimitResponse,
  getLlmKey,
  getLlmMode,
} from '@/lib/llm';

export async function POST(request: NextRequest) {
  try {
    // One authority gates both axes: the global USD budget (402) and the per-IP
    // daily limit (429). Budget is checked first, so a spent pool reports the
    // community limit even if the user is also under their per-IP cap.
    const limits = await evaluateLimits(request);
    if (!limits.allowed) {
      if (limits.reason === 'community-budget') {
        return communityLimitResponse(new CommunityLimitError(limits.resetAt));
      }
      const resetMs = Date.parse(limits.resetAt);
      const hoursUntilReset = Math.max(0, Math.ceil((resetMs - Date.now()) / (1000 * 60 * 60)));
      return NextResponse.json(
        {
          error: `Daily limit of ${DAILY_LIMIT} events reached`,
          remaining: 0,
          reset: limits.resetAt,
          hoursUntilReset
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': DAILY_LIMIT.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetMs.toString()
          }
        }
      );
    }

    const mode = getLlmMode(request);

    const body = await request.json();
    const { text, imageBase64, imageMimeType, batch = false, clientContext } = body;

    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: 'Either text or image data is required' },
        { status: 400 }
      );
    }

    if (imageBase64 && !imageMimeType) {
      return NextResponse.json(
        { error: 'Image MIME type is required when providing image data' },
        { status: 400 }
      );
    }

    if (batch) {
      await chargeIpRate(request);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let chunkIndex = 0;
            for await (const eventChunk of parseEventsBatch(
              {
                text,
                imageBase64,
                imageMimeType,
                clientContext,
              },
              { key: getLlmKey(mode), mode }
            )) {
              const chunk = {
                events: eventChunk,
                chunkIndex,
                isComplete: false,
              };

              const data = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(data));
              chunkIndex++;
            }

            const finalChunk = {
              events: [],
              chunkIndex,
              isComplete: true,
            };
            const data = `data: ${JSON.stringify(finalChunk)}\n\n`;
            controller.enqueue(encoder.encode(data));
            controller.close();
          } catch (error) {
            const errorMessage =
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred while parsing events';

            // The community key can hit its upstream credit limit mid-stream;
            // tag the SSE error so the client can flip to the limit screen.
            const payload =
              error instanceof CommunityLimitError
                ? { error: error.message, code: error.code, resetAt: error.resetAt }
                : { error: errorMessage };

            const errorData = `data: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(encoder.encode(errorData));
            controller.close();
          }
        },
      });

      const updated = await evaluateLimits(request);

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-RateLimit-Limit': DAILY_LIMIT.toString(),
          'X-RateLimit-Remaining': updated.ipRate.remaining.toString(),
          'X-RateLimit-Reset': Date.parse(updated.ipRate.resetAt).toString()
        },
      });
    }

    return NextResponse.json(
      { error: 'Non-batch parsing is not supported. Use batch=true.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Parse API error:', error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while parsing the event';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
