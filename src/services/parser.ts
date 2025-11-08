import Anthropic from '@anthropic-ai/sdk';
import { ParsedEvent, BatchParsedEvents } from '@/types/event';

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
- url: Source URL if present (look for "Original Event:", event links, or any URLs in the text)

Return ONLY valid JSON matching this schema:
{
  "title": "string",
  "startDate": "string",
  "endDate": "string",
  "location": "string",
  "description": "string",
  "url": "string",
  "confidence": number (0-1)
}

If any field cannot be determined, omit it from the response. The confidence score should reflect how certain you are about the extracted information.`;

const BATCH_EVENT_PARSING_PROMPT = `You are an event extraction assistant. Extract ALL event details from the provided text or image and return them in JSON format.

IMPORTANT:
- Detect and extract MULTIPLE events if present (maximum 50 events)
- Each event should be a separate object in an array
- If only one event is found, return an array with one event
- Return events in chronological order

Extract the following fields for EACH event:
- title: The event name or summary
- startDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
- endDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
- location: Physical or virtual location
- description: Additional details about the event
- url: Source URL if present (look for "Original Event:", event links, or any URLs in the text)

Return ONLY valid JSON matching this schema:
{
  "events": [
    {
      "title": "string",
      "startDate": "string",
      "endDate": "string",
      "location": "string",
      "description": "string",
      "url": "string",
      "confidence": number (0-1)
    }
  ],
  "totalCount": number,
  "confidence": number (0-1)
}

The totalCount should be the number of events detected. The top-level confidence should reflect overall certainty about all extracted events. If any field cannot be determined for an event, omit it from that event object.`;

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
      model: 'claude-sonnet-4-5-20250929',
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

const MAX_BATCH_EVENTS = 50;
const CHUNK_SIZE = 3;

export async function* parseEventsBatch(
  input: ParseEventInput
): AsyncGenerator<ParsedEvent[], void, unknown> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const content: Anthropic.MessageParam['content'] = [];

    if (input.text) {
      content.push({
        type: 'text',
        text: `${BATCH_EVENT_PARSING_PROMPT}\n\nExtract event details from this text:\n${input.text}`,
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
          text: BATCH_EVENT_PARSING_PROMPT,
        });
      }
    }

    if (content.length === 0) {
      throw new Error('No input provided for parsing');
    }

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    });

    let accumulatedText = '';

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        accumulatedText += chunk.delta.text;
      }
    }

    const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from API response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as BatchParsedEvents;

    if (!parsed.events || parsed.events.length === 0) {
      throw new Error('No events could be extracted');
    }

    if (parsed.events.length > MAX_BATCH_EVENTS) {
      throw new Error(
        `Batch limit exceeded: found ${parsed.events.length} events, maximum is ${MAX_BATCH_EVENTS}`
      );
    }

    const normalizedEvents = parsed.events.map((event) => ({
      ...event,
      confidence: event.confidence ?? 0.5,
    }));

    for (let i = 0; i < normalizedEvents.length; i += CHUNK_SIZE) {
      const chunk = normalizedEvents.slice(i, i + CHUNK_SIZE);
      yield chunk;
    }
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
