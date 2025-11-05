import { NextRequest, NextResponse } from 'next/server';
import { parseEvent, parseEventsBatch } from '@/services/parser';
import { checkRateLimit, incrementRateLimit, DAILY_LIMIT } from '@/lib/ratelimit';

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

    const body = await request.json();
    const { text, imageBase64, imageMimeType, batch = false } = body;

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
            for await (const eventChunk of parseEventsBatch({
              text,
              imageBase64,
              imageMimeType,
            })) {
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

            const errorData = `data: ${JSON.stringify({ error: errorMessage })}\n\n`;
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

    const parsedEvent = await parseEvent({
      text,
      imageBase64,
      imageMimeType,
    });

    const updatedRateLimit = await incrementRateLimit(clientIP);

    return NextResponse.json(parsedEvent, {
      headers: {
        'X-RateLimit-Limit': DAILY_LIMIT.toString(),
        'X-RateLimit-Remaining': updatedRateLimit.remaining.toString(),
        'X-RateLimit-Reset': updatedRateLimit.reset.toString()
      }
    });
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
