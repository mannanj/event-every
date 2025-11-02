import { NextRequest, NextResponse } from 'next/server';
import { parseEvent, parseEventsBatch } from '@/services/parser';

export async function POST(request: NextRequest) {
  try {
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

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const parsedEvent = await parseEvent({
      text,
      imageBase64,
      imageMimeType,
    });

    return NextResponse.json(parsedEvent);
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
