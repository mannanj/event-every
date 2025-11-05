import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const URL_DETECTION_PROMPT = `You are a URL detection assistant. Analyze the provided text and extract ALL URLs.

IMPORTANT:
- Extract all URLs from the text (http://, https://, www., etc.)
- Return the URLs as an array
- Return the remaining text with URLs removed
- Preserve the structure and formatting of non-URL content

Return ONLY valid JSON matching this schema:
{
  "urls": ["string"],
  "remainingText": "string",
  "hasUrls": boolean
}

If no URLs are found, return an empty array for urls and set hasUrls to false.`;

interface URLDetectionResult {
  urls: string[];
  remainingText: string;
  hasUrls: boolean;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `${URL_DETECTION_PROMPT}\n\nExtract URLs from this text:\n${text}`,
        },
      ],
    });

    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from API response');
    }

    const result = JSON.parse(jsonMatch[0]) as URLDetectionResult;

    return NextResponse.json(result);
  } catch (error) {
    console.error('URL detection API error:', error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while detecting URLs';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
