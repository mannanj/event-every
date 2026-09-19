import { z } from 'zod';
import type { ParsedEvent } from '@/types/event';

export interface ExtractionContext {
  readonly nowISO: string;
  readonly timeZone: string;
}

export type ShapeResult =
  | { readonly ok: true; readonly event: ParsedEvent }
  | { readonly ok: false; readonly reason: string };

// Pass 1 deliberately asks for prose, not JSON. "The Constraint Tax"
// (arXiv 2605.26128) measures a 43.5-point accuracy loss on calendar tool-calls
// when a sub-3B model is forced to satisfy a schema while it reasons. Reading
// and shaping are split so the model only does one of them at a time.
export const READ_PROMPT = [
  'Read this image and describe the event it advertises.',
  'Write plain sentences. Do not use JSON or bullet points.',
  'State the event name, the date, the start time, the end time, and the place,',
  'copying them exactly as they are written in the image.',
  'If the image does not state something, say that it is not stated.',
].join(' ');

const SHAPE_FIELDS = [
  '"title": the event name, a string',
  '"date": the calendar date as YYYY-MM-DD, or null',
  '"startTime": the start time as HH:MM on a 24 hour clock, or null',
  '"endTime": the end time as HH:MM on a 24 hour clock, or null',
  '"location": the place, a string or null',
  '"description": one short sentence, a string or null',
  '"allDay": true only if no start time is stated',
];

export function buildShapePrompt(description: string, context: ExtractionContext): string {
  return [
    `Today is ${context.nowISO.slice(0, 10)}.`,
    'Convert the notes below into a single JSON object.',
    'Output only the object. Do not use a code fence. Do not explain.',
    'Use exactly these keys:',
    ...SHAPE_FIELDS.map((field) => `- ${field}`),
    'If the notes do not state a value, use null. Never invent a date.',
    '',
    'Notes:',
    description.trim(),
  ].join('\n');
}

const RawShapeSchema = z.object({
  title: z.string(),
  date: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  allDay: z.boolean().nullable().optional(),
});

// Small models wrap JSON in prose or fences often enough that a bare
// JSON.parse throws away otherwise good scans. Scan for the first balanced
// object instead, tracking string state so a brace inside a title cannot
// truncate the match.
export function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function isRealDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function isPlausibleYear(date: string, nowISO: string): boolean {
  const year = Number(date.slice(0, 4));
  const currentYear = Number(nowISO.slice(0, 4));
  return year >= currentYear - 1 && year <= currentYear + 5;
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// The dangerous failure of a small model is well-formed JSON holding a wrong
// date, which zod parses happily. These checks reject the shapes we can prove
// are wrong rather than trusting field presence.
export function parseShapedOutput(raw: string, context: ExtractionContext): ShapeResult {
  const candidate = extractFirstJsonObject(raw);
  if (!candidate) return { ok: false, reason: 'No JSON object in the model output.' };

  let decoded: unknown;
  try {
    decoded = JSON.parse(candidate);
  } catch {
    return { ok: false, reason: 'Model output was not valid JSON.' };
  }

  const parsed = RawShapeSchema.safeParse(decoded);
  if (!parsed.success) return { ok: false, reason: 'Model output did not match the expected fields.' };

  const title = clean(parsed.data.title);
  if (!title) return { ok: false, reason: 'No event title was found.' };

  const date = clean(parsed.data.date);
  if (date && !isRealDate(date)) return { ok: false, reason: 'The extracted date is not a real date.' };
  if (date && !isPlausibleYear(date, context.nowISO)) {
    return { ok: false, reason: 'The extracted year is outside the plausible range.' };
  }

  const startTime = clean(parsed.data.startTime);
  const endTime = clean(parsed.data.endTime);
  if (startTime && !TIME_PATTERN.test(startTime)) {
    return { ok: false, reason: 'The extracted start time is not a valid time.' };
  }
  if (endTime && !TIME_PATTERN.test(endTime)) {
    return { ok: false, reason: 'The extracted end time is not a valid time.' };
  }

  // The model reports allDay:true while also giving a start time often enough
  // that the flag cannot be trusted. A concrete start time is the stronger
  // evidence, so allDay is derived rather than believed, and the contradiction
  // costs confidence.
  const allDay = !startTime;
  const contradictedAllDay = parsed.data.allDay === true && Boolean(startTime);

  const event: ParsedEvent = {
    title,
    location: clean(parsed.data.location),
    description: clean(parsed.data.description),
    timezone: context.timeZone,
    allDay,
    confidence: (date ? 0.6 : 0.3) - (contradictedAllDay ? 0.1 : 0),
  };

  if (!date) return { ok: true, event };

  const start = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
  const end = endTime ? `${date}T${endTime}:00` : undefined;
  if (end && end <= start) {
    return { ok: false, reason: 'The extracted end time is not after the start time.' };
  }

  return { ok: true, event: { ...event, startDate: start, endDate: end } };
}
