import Anthropic from '@anthropic-ai/sdk';
import { ParsedEvent, BatchParsedEvents, ClientContext } from '@/types/event';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function formatClientContext(context?: ClientContext): string {
  if (!context) return '';

  const offsetHours = Math.floor(Math.abs(context.timezoneOffset) / 60);
  const offsetMinutes = Math.abs(context.timezoneOffset) % 60;
  const offsetSign = context.timezoneOffset >= 0 ? '+' : '-';
  const offsetString = `UTC${offsetSign}${offsetHours}${offsetMinutes > 0 ? `:${offsetMinutes.toString().padStart(2, '0')}` : ''}`;

  const formattedContext = `\n\nCurrent context:
- Date/Time: ${context.currentDateTime}
- Timezone: ${context.timezone} (${offsetString})
- Locale: ${context.locale}

Use this context to interpret relative dates like "tomorrow", "next week", "yesterday", "3 days from now", etc. Convert all relative dates to absolute ISO 8601 dates in the user's timezone.`;

  console.log('[DEBUG] Client Context:', JSON.stringify(context, null, 2));
  console.log('[DEBUG] Formatted Context:', formattedContext);

  return formattedContext;
}

const EVENT_PARSING_PROMPT = `You are an event extraction assistant. Extract event details from the provided text or image.

Extract the following fields:
- title: The event name or summary
- startDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss) for timed events, or YYYY-MM-DD for all-day events
- endDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss) for timed events, or YYYY-MM-DD for all-day events
- location: Physical or virtual location
- description: Additional details about the event
- url: Source URL if present (look for "Original Event:", event links, or any URLs in the text)
- timezone: IANA timezone identifier (e.g., "America/New_York") or abbreviation (e.g., "EST", "PST", "UTC+5")
- allDay: true if this is an all-day event (no specific times), false if it has specific start/end times

If the user explicitly requests to import events as "all-day" or "single-day" events, set allDay to true for all events even if times are present in the source.

The confidence score should reflect how certain you are about the extracted information. Omit any fields that cannot be determined.`;

const BATCH_EVENT_PARSING_PROMPT = `You are an event extraction assistant. Extract ALL event details from the provided text or image.

IMPORTANT:
- Detect and extract MULTIPLE events if present (maximum 50 events)
- Each event should be a separate object in an array
- If only one event is found, return an array with one event
- Return events in chronological order

Extract the following fields for EACH event:
- title: The event name or summary
- startDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss) for timed events, or YYYY-MM-DD for all-day events
- endDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss) for timed events, or YYYY-MM-DD for all-day events
- location: Physical or virtual location
- description: Additional details about the event
- url: Source URL if present (look for "Original Event:", event links, or any URLs in the text)
- timezone: IANA timezone identifier (e.g., "America/New_York") or abbreviation (e.g., "EST", "PST", "UTC+5")
- allDay: true if this is an all-day event (no specific times), false if it has specific start/end times

If the user explicitly requests to import events as "all-day" or "single-day" events, set allDay to true for all events even if times are present in the source.

The totalCount should be the number of events detected. The top-level confidence should reflect overall certainty about all extracted events. Omit any fields that cannot be determined for an event.`;

interface ParseEventInput {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  clientContext?: ClientContext;
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
        text: `${EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}\n\nExtract event details from this text:\n${input.text}`,
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
          text: `${EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}`,
        });
      }
    }

    if (content.length === 0) {
      throw new Error('No input provided for parsing');
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      tools: [
        {
          name: 'extract_event',
          description: 'Extract a single calendar event from text or image',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Event name or summary' },
              startDate: { type: 'string', description: 'ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD)' },
              location: { type: 'string', description: 'Physical or virtual location' },
              description: { type: 'string', description: 'Additional details' },
              url: { type: 'string', description: 'Source URL if present' },
              timezone: { type: 'string', description: 'IANA timezone identifier or abbreviation' },
              allDay: { type: 'boolean', description: 'True if all-day event, false if timed' },
              confidence: { type: 'number', description: 'Confidence score (0-1)', minimum: 0, maximum: 1 },
            },
            required: ['confidence'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_event' },
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUse) {
      throw new Error('No tool use found in API response');
    }

    const parsed = toolUse.input as ParsedEvent;

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
        text: `${BATCH_EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}\n\nExtract event details from this text:\n${input.text}`,
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
          text: `${BATCH_EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}`,
        });
      }
    }

    if (content.length === 0) {
      throw new Error('No input provided for parsing');
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      tools: [
        {
          name: 'extract_events',
          description: 'Extract multiple calendar events from text or image',
          input_schema: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                description: 'Array of extracted events',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Event name or summary' },
                    startDate: { type: 'string', description: 'ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD)' },
                    endDate: { type: 'string', description: 'ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD)' },
                    location: { type: 'string', description: 'Physical or virtual location' },
                    description: { type: 'string', description: 'Additional details' },
                    url: { type: 'string', description: 'Source URL if present' },
                    timezone: { type: 'string', description: 'IANA timezone identifier or abbreviation' },
                    allDay: { type: 'boolean', description: 'True if all-day event, false if timed' },
                    confidence: { type: 'number', description: 'Confidence score (0-1)', minimum: 0, maximum: 1 },
                  },
                  required: ['confidence'],
                },
              },
              totalCount: { type: 'number', description: 'Total number of events' },
              confidence: { type: 'number', description: 'Overall confidence (0-1)', minimum: 0, maximum: 1 },
            },
            required: ['events', 'totalCount', 'confidence'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_events' },
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUse) {
      throw new Error('No tool use found in API response');
    }

    const parsed = toolUse.input as BatchParsedEvents;

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

    throw error;
  }
}
