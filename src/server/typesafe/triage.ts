import { askTypeSafe, noulOf, type TypeSafeAnswer, type TypeSafeQuestion } from './client';

/**
 * Pre-scan triage of text input: one fast call that decides WHEN and HOW MANY
 * provider scans run. It never produces or changes an event field. With no
 * verdict the caller runs today's single scan.
 */

export const TRIAGE_MAX_BYTES = 16_384;
export const TRIAGE_TIMEOUT_MS = 1_200;
const MAX_PARAGRAPHS = 40;
const MAX_CHUNKS = 6;

export type TriageSource = 'paste' | 'typed' | 'url-page';

export const SHAPES = [
  'one_event',
  'several_events_shared_date',
  'several_independent_events',
  'recurring_schedule',
  'listing_of_many',
  'no_event',
] as const;
export type TriageShape = (typeof SHAPES)[number];

/** Ordered Score levels; the index maps to minutes. "All day" is index 6 and never applied. */
export const DURATION_LEVELS = ['30 minutes', '1 hour', '90 minutes', '2 hours', '3 hours', 'half a day', 'all day'] as const;
export const DURATION_MINUTES = [30, 60, 90, 120, 180, 240, null] as const;
const DURATION_MIN_CONFIDENCE = 0.6;

export interface TriageVerdict {
  hasEvent: number;
  /** Typical length for a one-event input, or null when unsure, all-day, or not asked. */
  durationMinutes: number | null;
  complete: number | null;
  shape: { choice: TriageShape; probabilities: Record<TriageShape, number>; confidence: number };
  /** Probability that paragraph k (k >= 1) starts a different event from k-1. */
  boundaries: number[];
  paragraphs: string[];
  ms: number;
}

export type TriageDecision =
  | { kind: 'skip'; reason: 'no_event' }
  | { kind: 'split'; chunks: string[] }
  | { kind: 'single' };

export function splitParagraphs(text: string): string[] {
  const out: string[] = [];
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // A bullet or numbered line is its own paragraph; other lines join the
      // paragraph above so a wrapped sentence is not cut into two events.
      if (/^(?:[-*•]|\d{1,2}[.)])\s+/.test(trimmed) || out.length === 0 || out[out.length - 1] === '') out.push(trimmed);
      else out[out.length - 1] = `${out[out.length - 1]}\n${trimmed}`;
    }
    out.push('');
  }
  return out.filter(Boolean).slice(0, MAX_PARAGRAPHS);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function triageQuestions(source: TriageSource, paragraphCount: number): Record<string, TypeSafeQuestion> {
  const questions: Record<string, TypeSafeQuestion> = {
    has_event: {
      type: 'noul',
      instructions: 'Does `paragraphs` describe at least one concrete happening a person would put on a calendar, with a date, weekday, or time, even a relative one like "tomorrow"? A price list, recipe, bare URL, or chatter with no when is false.',
    },
    shape: {
      type: 'choice',
      instructions: 'What is the shape of the events in `paragraphs`?',
      criteria: {
        one_event: 'A single occasion, possibly with several details or a time range',
        several_events_shared_date: 'Several sessions or items under one date header, such as an agenda for one day',
        several_independent_events: 'Two or more separate occasions, each with its own date or day',
        recurring_schedule: 'One occasion repeating on a rule, such as every Monday',
        listing_of_many: 'A catalogue or page listing many unrelated events, such as a venue calendar',
        no_event: 'Nothing here belongs on a calendar',
      },
    },
  };
  questions.duration = {
    type: 'score',
    instructions: 'How long does the main event in `paragraphs` last? If an end time or duration is stated, pick the matching level. Otherwise judge from the kind of occasion: a dentist visit or coffee is short, a dinner or a show is a couple of hours, a workshop or conference day is half a day or more.',
    criteria: [...DURATION_LEVELS],
  };
  if (source !== 'url-page') {
    questions.complete = {
      type: 'noul',
      instructions: 'Is this input finished enough to scan now: it names an occasion and a when, and does not end mid-sentence or mid-word?',
    };
  }
  if (paragraphCount >= 3) {
    for (let k = 1; k < paragraphCount; k += 1) {
      questions[`boundary_${k}`] = {
        type: 'noul',
        instructions: `Does paragraph ${k} of \`paragraphs\` begin a different event from the one paragraph ${k - 1} belongs to? A date header that applies to the lines under it is not a new event.`,
      };
    }
  }
  return questions;
}

function durationOf(answer: TypeSafeAnswer | undefined): number | null {
  if (answer?.type !== 'score' || answer.confidence < DURATION_MIN_CONFIDENCE) return null;
  let best: string | null = null;
  for (const [level, p] of Object.entries(answer.probabilities)) if (best === null || p > (answer.probabilities[best] ?? 0)) best = level;
  const index = best === null ? -1 : Number(best);
  return DURATION_MINUTES[index] ?? null;
}

function shapeOf(answer: TypeSafeAnswer | undefined): TriageVerdict['shape'] | null {
  if (answer?.type !== 'choice' || !SHAPES.includes(answer.choice as TriageShape)) return null;
  const probabilities = Object.fromEntries(SHAPES.map((s) => [s, Number(answer.probabilities[s] ?? 0)])) as Record<TriageShape, number>;
  return { choice: answer.choice as TriageShape, probabilities, confidence: answer.confidence };
}

export async function triageText(
  text: string,
  source: TriageSource,
  options: { now?: Date; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<TriageVerdict | null> {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return null;
  const now = options.now ?? new Date();
  const state = {
    referenceDate: now.toISOString().slice(0, 10),
    referenceWeekday: WEEKDAYS[now.getUTCDay()],
    source,
    paragraphs: paragraphs.map((p, k) => ({ k, text: p })),
  };
  const result = await askTypeSafe(state, triageQuestions(source, paragraphs.length), {
    timeoutMs: options.timeoutMs ?? TRIAGE_TIMEOUT_MS,
    signal: options.signal,
  });
  if (!result) return null;
  const hasEvent = noulOf(result.answers.has_event);
  const shape = shapeOf(result.answers.shape);
  if (hasEvent === null || !shape) return null;
  const boundaries: number[] = [];
  for (let k = 1; k < paragraphs.length; k += 1) boundaries.push(noulOf(result.answers[`boundary_${k}`]) ?? 0);
  return {
    hasEvent,
    durationMinutes: shape.choice === 'one_event' ? durationOf(result.answers.duration) : null,
    complete: noulOf(result.answers.complete),
    shape, boundaries, paragraphs, ms: result.ms,
  };
}

/** Thresholds from scripts/typesafe/data/NEXT-USE-CASE.md; tune on real traffic. */
export function decideTriage(verdict: TriageVerdict | null): TriageDecision {
  if (!verdict) return { kind: 'single' };
  const p = verdict.shape.probabilities;
  if (verdict.hasEvent <= 0.1 && p.no_event >= 0.8) return { kind: 'skip', reason: 'no_event' };
  if (p.several_independent_events >= 0.7 && verdict.paragraphs.length >= 3) {
    const chunks: string[] = [];
    let current: string[] = [verdict.paragraphs[0]];
    for (let k = 1; k < verdict.paragraphs.length; k += 1) {
      if ((verdict.boundaries[k - 1] ?? 0) >= 0.8 && chunks.length < MAX_CHUNKS - 1) {
        chunks.push(current.join('\n\n'));
        current = [];
      }
      current.push(verdict.paragraphs[k]);
    }
    chunks.push(current.join('\n\n'));
    if (chunks.length >= 2) return { kind: 'split', chunks };
  }
  return { kind: 'single' };
}
