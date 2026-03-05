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

  return `\n\nCurrent context for relative date resolution:
- Current date/time: ${context.currentDateTime}
- Locale: ${context.locale}

Use this ONLY to interpret relative dates like "tomorrow", "next week", etc. Convert relative dates to absolute ISO 8601.`;
}

const CONFIDENCE_THRESHOLD = 0.4;

const BATCH_EVENT_PARSING_PROMPT = `You are an event extraction assistant. Extract ALL event details EXACTLY as written — do NOT convert or interpret timezones.

IMPORTANT:
- Detect and extract MULTIPLE events if present (maximum 50 events)
- Each event should be a separate object in an array
- If only one event is found, return an array with one event
- Return events in chronological order

Extract the following fields for EACH event:
- title: The event name or summary
- startDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss) WITHOUT timezone suffix — write the time exactly as it appears
- endDate: ISO 8601 format (YYYY-MM-DDTHH:mm:ss) WITHOUT timezone suffix — write the time exactly as it appears
- location: Physical or virtual location
- description: Additional details — preserve factual content (speakers, organizer, registration info, agenda items). Don't just summarize; include useful details someone would want in their calendar.
- url: Source URL if present (look for "Original Event:", event links, or any URLs in the text)
- timezone: The timezone EXACTLY as written in the source (e.g. "UTC", "EST", "Pacific Time", "PST", "Eastern"). If no timezone is mentioned, set to null.
- allDay: BOOLEAN - Set to true if this is an all-day event, false if it has specific times

CRITICAL RULES:
1. Do NOT convert times between timezones. If the source says "3:00 PM UTC", return startDate "...T15:00:00" and timezone "UTC".
2. Return the timezone string exactly as it appears in the source material, not as an IANA identifier.

SINGLE vs. MULTIPLE EVENT RULES:
- A poster/flyer with an agenda, multiple speakers, or sessions = 1 event (the conference/meetup itself)
- A schedule or timetable with distinct events on different dates/times = multiple events
- "Meeting with John and Sarah" = 1 event with multiple attendees, NOT separate events
- When ambiguous, prefer FEWER events. Combine rather than split.

ALL-DAY EVENT DETECTION:
- If the user's instruction contains "single day", "all day", "full day", "whole day", "all-day", set allDay to TRUE
- If NO specific times are mentioned anywhere in the source, set allDay to TRUE
- When allDay is true: use YYYY-MM-DD format for startDate and endDate (no time component)

END DATE HEURISTICS (when no end time is given):
- Meetings/calls: default to +1 hour from start
- Conferences/all-day events: end of that day
- Otherwise: omit endDate rather than guess

CONFIDENCE SCORING:
- 0.9–1.0: All fields (title, date, time) are explicitly stated
- 0.7–0.89: Minor inference needed (e.g., year assumed, end time estimated)
- 0.5–0.69: Significant inference (e.g., date parsed from vague context)
- Below 0.5: Probably not a real event — speculative extraction

The totalCount should be the number of events detected. The top-level confidence should reflect overall certainty. Omit any fields that cannot be determined.

FEW-SHOT EXAMPLES:

Input: "Dinner at Luigi's, Friday March 13 at 7pm"
Output: 1 event — title: "Dinner at Luigi's", startDate: "2026-03-13T19:00:00", endDate: "2026-03-13T20:00:00", confidence: 0.9

Input: "Company offsite March 20, Napa Valley"
Output: 1 event — title: "Company offsite", startDate: "2026-03-20", allDay: true, location: "Napa Valley", confidence: 0.85

Input: [Conference poster with keynote by Dr. Smith, panel at 2pm, networking at 5pm, all on March 25]
Output: 1 event — title: "Conference Name", startDate: "2026-03-25T09:00:00", description includes speakers and schedule, confidence: 0.8

Input: "Monday 9am standup, Tuesday 2pm design review, Wednesday 11am retro"
Output: 3 events — one per distinct meeting, confidence: 0.85 each

Input: "The weather is nice today"
Output: 0 events — empty array, confidence: 0.0`;

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

const MAX_BATCH_EVENTS = 50;
const CHUNK_SIZE = 3;

export async function* parseEventsBatch(
  input: ParseEventInput
): AsyncGenerator<ParsedEvent[], void, unknown> {
  try {
    const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
    const hasImage = !!(input.imageBase64 && input.imageMimeType);
    const hasText = !!input.text;

    if (hasImage && hasText) {
      content.push({
        type: 'text',
        text: `${BATCH_EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}\n\n--- USER CONTEXT ---\n${input.text}\n\n--- SOURCE IMAGE ---`,
      });
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.imageMimeType};base64,${input.imageBase64}`,
        },
      });
    } else if (hasImage) {
      content.push({
        type: 'text',
        text: `${BATCH_EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}\n\n--- SOURCE IMAGE ---`,
      });
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.imageMimeType};base64,${input.imageBase64}`,
        },
      });
    } else if (hasText) {
      content.push({
        type: 'text',
        text: `${BATCH_EVENT_PARSING_PROMPT}${formatClientContext(input.clientContext)}\n\n--- SOURCE TEXT ---\n${input.text}`,
      });
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
                    timezone: { type: ['string', 'null'], description: 'Timezone exactly as written in source, or null if not mentioned' },
                    allDay: { type: 'boolean', description: 'True if all-day event, false if timed' },
                    confidence: { type: 'number', description: 'Confidence score (0-1)', minimum: 0, maximum: 1 },
                  },
                  required: ['title', 'startDate', 'confidence'],
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
      throw new Error('No events could be extracted from the provided input. The content may not contain calendar event information.');
    }

    if (parsed.events.length > MAX_BATCH_EVENTS) {
      throw new Error(
        `Batch limit exceeded: found ${parsed.events.length} events, maximum is ${MAX_BATCH_EVENTS}`
      );
    }

    const normalizedEvents = parsed.events
      .map((event) => ({
        ...event,
        confidence: event.confidence ?? 0.5,
      }))
      .filter((event) => {
        if (event.confidence < CONFIDENCE_THRESHOLD) {
          console.warn(`[parser] Dropping low-confidence event (${event.confidence}): "${event.title}"`);
          return false;
        }
        return true;
      });

    if (normalizedEvents.length === 0) {
      throw new Error('No events could be extracted from the provided input. The content may not contain calendar event information.');
    }

    for (let i = 0; i < normalizedEvents.length; i += CHUNK_SIZE) {
      const chunk = normalizedEvents.slice(i, i + CHUNK_SIZE);
      yield chunk;
    }
  } catch (error) {
    throw error;
  }
}
