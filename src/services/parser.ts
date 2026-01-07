import { ParsedEvent, BatchParsedEvents, ClientContext } from '@/types/event';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/pixtral-large-2411';

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenRouterToolCall = {
  function: {
    name: string;
    arguments: string;
  };
};

type OpenRouterResponse = {
  choices: Array<{
    message: {
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
};

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
- allDay: BOOLEAN - Set to true if this is an all-day event, false if it has specific times

CRITICAL - All-Day Event Detection:
If the user's instruction contains ANY of these phrases, you MUST set allDay to TRUE for all events:
- "single day" / "single-day"
- "all day" / "all-day"
- "full day" / "full-day"
- "whole day"
- "import as all-day"
- "import as single-day"

When allDay is true:
- Use YYYY-MM-DD format for startDate and endDate (no time component)
- Ignore any times present in the source material
- The event spans the entire day

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
- allDay: BOOLEAN - Set to true if this is an all-day event, false if it has specific times

CRITICAL - All-Day Event Detection:
If the user's instruction contains ANY of these phrases, you MUST set allDay to TRUE for ALL events:
- "single day" / "single-day" / "single day events"
- "all day" / "all-day" / "all day events"
- "full day" / "full-day"
- "whole day"
- "import as all-day"
- "import as single-day"

When allDay is true for an event:
- Use YYYY-MM-DD format for startDate and endDate (no time component)
- Ignore any times present in the source material
- The event spans the entire day

The totalCount should be the number of events detected. The top-level confidence should reflect overall certainty about all extracted events. Omit any fields that cannot be determined for an event.`;

interface ParseEventInput {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  clientContext?: ClientContext;
}

async function callOpenRouter(
  content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>,
  tools: ToolDefinition[],
  toolName: string
): Promise<OpenRouterToolCall> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'event-every',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      tools,
      tool_choice: {
        type: 'function',
        function: { name: toolName },
      },
    }),
  });

  const data = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    const errorMessage = data.error?.message || 'OpenRouter API error';
    throw new Error(errorMessage);
  }

  const toolCalls = data.choices?.[0]?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    throw new Error('No tool calls found in OpenRouter response');
  }

  return toolCalls[0];
}

export async function parseEvent(input: ParseEventInput): Promise<ParsedEvent> {
  try {
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

    if (input.text) {
      content.push({
        type: 'text',
        text: `${EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}\n\nExtract event details from this text:\n${input.text}`,
      });
    }

    if (input.imageBase64 && input.imageMimeType) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.imageMimeType};base64,${input.imageBase64}`,
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

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'extract_event',
          description: 'Extract a single calendar event from text or image',
          parameters: {
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
      },
    ];

    const toolCall = await callOpenRouter(content, tools, 'extract_event');
    const parsed = JSON.parse(toolCall.function.arguments) as ParsedEvent;

    if (!parsed.title && !parsed.startDate) {
      console.error('[DEBUG] Parsed result has no title or startDate:', JSON.stringify(parsed, null, 2));
      throw new Error('No event information could be extracted');
    }

    return {
      ...parsed,
      confidence: parsed.confidence ?? 0.5,
    };
  } catch (error) {
    throw error;
  }
}

const MAX_BATCH_EVENTS = 50;
const CHUNK_SIZE = 3;

export async function* parseEventsBatch(
  input: ParseEventInput
): AsyncGenerator<ParsedEvent[], void, unknown> {
  try {
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

    if (input.text) {
      content.push({
        type: 'text',
        text: `${BATCH_EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}\n\nExtract event details from this text:\n${input.text}`,
      });
    }

    if (input.imageBase64 && input.imageMimeType) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.imageMimeType};base64,${input.imageBase64}`,
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

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'extract_events',
          description: 'Extract multiple calendar events from text or image',
          parameters: {
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
      },
    ];

    const toolCall = await callOpenRouter(content, tools, 'extract_events');
    const parsed = JSON.parse(toolCall.function.arguments) as BatchParsedEvents;

    if (!parsed.events || parsed.events.length === 0) {
      console.error('[DEBUG] Parsed result has no events:', JSON.stringify(parsed, null, 2));
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
    throw error;
  }
}
