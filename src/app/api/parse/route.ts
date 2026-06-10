import { NextRequest, NextResponse } from 'next/server';
import { parseEventsBatch } from '@/services/parser';
import { checkRateLimit, incrementRateLimit, DAILY_LIMIT } from '@/lib/ratelimit';
import {
  CommunityLimitError,
  communityLimitResponse,
  ensureCommunityBudget,
  getLlmKey,
  getLlmMode,
} from '@/lib/llm';

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);

    const rateLimitResult = await checkRateLimit(clientIP);

    if (!rateLimitResult.success) {
      const resetDate = new Date(rateLimitResult.reset);
      const hoursUntilReset = Math.ceil((rateLimitResult.reset - Date.now()) / (1000 * 60 * 60));

      return NextResponse.json(
        {
          error: `Daily limit of ${DAILY_LIMIT} events reached`,
          remaining: 0,
          reset: resetDate.toISOString(),
          hoursUntilReset
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': DAILY_LIMIT.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.reset.toString()
          }
        }
      );
    }

    const mode = getLlmMode(request);
    try {
      await ensureCommunityBudget(mode);
    } catch (error) {
      if (error instanceof CommunityLimitError) return communityLimitResponse(error);
      throw error;
    }

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
      await incrementRateLimit(clientIP);

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

      const updatedRateLimit = await checkRateLimit(clientIP);

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-RateLimit-Limit': DAILY_LIMIT.toString(),
          'X-RateLimit-Remaining': updatedRateLimit.remaining.toString(),
          'X-RateLimit-Reset': updatedRateLimit.reset.toString()
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
