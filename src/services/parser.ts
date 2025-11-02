import Anthropic from '@anthropic-ai/sdk';
import { ParsedEvent } from '@/types/event';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EVENT_PARSING_PROMPT = `You are an event extraction assistant. Extract event details from the provided text or image and return them in JSON format.

Extract the following fields:
- title: The event name or summary
- startDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
- endDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
- location: Physical or virtual location
- description: Additional details about the event

Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "startDate": "string",
  "endDate": "string",
  "location": "string",
  "description": "string",
  "confidence": number (0-1)
}

If any field cannot be determined, omit it from the response. The confidence score should reflect how certain you are about the extracted information.`;

interface ParseEventInput {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export async function parseEvent(input: ParseEventInput): Promise<ParsedEvent> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const content: Anthropic.MessageParam['content'] = [];

    if (input.text) {
      content.push({
        type: 'text',
        text: `${EVENT_PARSING_PROMPT}\n\nExtract event details from this text:\n${input.text}`,
      });
    }

    if (input.imageBase64 && input.imageMimeType) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.imageMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: input.imageBase64,
        },
      });

      if (!input.text) {
        content.unshift({
          type: 'text',
          text: EVENT_PARSING_PROMPT,
        });
      }
    }

    if (content.length === 0) {
      throw new Error('No input provided for parsing');
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content,
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

    const parsed = JSON.parse(jsonMatch[0]) as ParsedEvent;

    if (!parsed.title && !parsed.startDate) {
      throw new Error('No event information could be extracted');
    }

    return {
      ...parsed,
      confidence: parsed.confidence ?? 0.5,
    };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error: ${error.message}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse event data from API response');
    }

    throw error;
  }
}
