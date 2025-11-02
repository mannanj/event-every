import { NextRequest, NextResponse } from 'next/server';
import { parseEvent } from '@/services/parser';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, imageBase64, imageMimeType } = body;

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
