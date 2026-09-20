import type { EventCandidate, TemporalPoint } from '@event-every/scanner';
import type { CandidateVerification } from '@/types/scannerHttp';
import { askTypeSafe, noulOf, typeSafeAvailable, type TypeSafeAnswer, type TypeSafeQuestion } from './client';
import { durationFromScore } from './triage';
import {
  DURATION_QUESTION,
  TIMED_QUESTION,
  TITLE_NONE,
  calendarState,
  fieldQuestions,
  needsCalendar,
  needsTitlePick,
  titleCandidates,
  titleQuestion,
  type Extracted,
} from './judgments';

/**
 * Post-scan verification: one TypeSafe call per candidate, reading the text the
 * scanner itself reported rather than the source. For an image that is the
 * model's own evidence excerpts, so no OCR pass is added and nothing waits on
 * one. It never changes a scanner value; it returns a second opinion the
 * client may use, and returns nothing at all when TypeSafe cannot answer.
 */

export const VERIFY_TIMEOUT_MS = 1_500;
export const VERIFY_MAX_CANDIDATES = 8;
export const MAX_EXCERPT_CHARS = 2_000;
const MAX_TEXT_CHARS = 8_000;
const TITLE_MIN_CANDIDATES = 2;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * What the model read. A text scan has the request itself; an image scan has
 * only the excerpts the model quoted, which the job kept in memory because the
 * durable replay drops them.
 */
export const candidateSourceText = (
  candidateId: string,
  requestText: string | null,
  evidence: ReadonlyMap<string, string>,
): string => (requestText === null ? evidence.get(candidateId) ?? '' : requestText.slice(0, MAX_TEXT_CHARS)).trim();

/**
 * The start the scanner claimed, as the plain date and clock the questions
 * expect. A year the source omitted is filled with the reference year, which is
 * the assumption the review card makes too; the date question is told to settle
 * it from `calendar.yearOptions`.
 */
export function startOf(point: TemporalPoint | null, referenceYear: number): { startDate: string; startTime: string | null } | null {
  if (!point) return null;
  if (point.kind === 'date') return { startDate: `${point.year ?? referenceYear}-${pad(point.month)}-${pad(point.day)}`, startTime: null };
  if (point.kind === 'floating' || point.kind === 'zoned') {
    return {
      startDate: `${point.date.year}-${pad(point.date.month)}-${pad(point.date.day)}`,
      startTime: `${pad(point.time.hour)}:${pad(point.time.minute)}`,
    };
  }
  if (point.month === null || point.day === null) return null;
  return {
    startDate: `${point.year ?? referenceYear}-${pad(point.month)}-${pad(point.day)}`,
    startTime: point.hour === null ? null : `${pad(point.hour)}:${pad(point.minute ?? 0)}`,
  };
}

export interface CandidatePlan {
  questions: Record<string, TypeSafeQuestion>;
  state: Record<string, unknown>;
  titleOptions: string[];
}

/**
 * What is worth asking about one candidate. Returns null when the answer could
 * not be used: no text the model quoted, or nothing left to ask.
 */
export function planFor(candidate: EventCandidate, text: string, referenceDate: string): CandidatePlan | null {
  if (!text) return null;
  const temporal = candidate.temporal.value;
  const start = startOf(temporal?.start ?? null, Number(referenceDate.slice(0, 4)));
  const title = candidate.title.value;
  const extracted: Extracted = {
    title,
    startDate: start?.startDate ?? '',
    startTime: start?.startTime ?? null,
    location: candidate.location.value,
  };

  const questions: Record<string, TypeSafeQuestion> = {};
  if (start) {
    Object.assign(questions, fieldQuestions(extracted));
  } else if (extracted.location) {
    // With no date claimed there is nothing to check a date or a time against,
    // but the place the source named still stands on its own.
    questions.location_ok = fieldQuestions(extracted).location_ok;
  }

  const allDayUnknown = temporal?.allDay === 'unknown' || candidate.issues.some((issue) => issue.code === 'unknown_all_day');
  if (start && allDayUnknown) questions.timed = TIMED_QUESTION;

  // An end the source stated is the source's own; only a bare start is filled in.
  if (start?.startTime && temporal?.end == null && temporal?.duration == null && temporal?.allDay !== true) {
    questions.duration = DURATION_QUESTION;
  }

  let titleOptions: string[] = [];
  if (needsTitlePick(title)) {
    titleOptions = titleCandidates(text, title);
    if (titleOptions.length >= TITLE_MIN_CANDIDATES) questions.title = titleQuestion(titleOptions);
  }

  if (Object.keys(questions).length === 0) return null;
  return {
    questions,
    state: {
      text,
      referenceDate,
      ...(start && needsCalendar(text) ? { calendar: calendarState(referenceDate, start.startDate) } : {}),
      extracted: start ? extracted : { ...extracted, startDate: null },
    },
    titleOptions,
  };
}

function titleOf(answer: TypeSafeAnswer | undefined, options: readonly string[]): CandidateVerification['title'] {
  if (answer?.type !== 'choice' || answer.choice === TITLE_NONE || !options.includes(answer.choice)) return null;
  return { choice: answer.choice, confidence: answer.confidence };
}

async function verifyOne(
  candidate: EventCandidate,
  text: string,
  referenceDate: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<CandidateVerification | null> {
  const plan = planFor(candidate, text, referenceDate);
  if (!plan) return null;
  const result = await askTypeSafe(plan.state, plan.questions, options);
  if (!result) return null;
  const verification: CandidateVerification = {
    candidateId: candidate.candidateId,
    fields: {
      date: noulOf(result.answers.date_ok),
      time: noulOf(result.answers.time_ok),
      location: noulOf(result.answers.location_ok),
    },
    timed: noulOf(result.answers.timed),
    title: titleOf(result.answers.title, plan.titleOptions),
    durationMinutes: durationFromScore(result.answers.duration),
  };
  const empty = verification.fields.date === null && verification.fields.time === null
    && verification.fields.location === null && verification.timed === null
    && verification.title === null && verification.durationMinutes === null;
  return empty ? null : verification;
}

/**
 * Every candidate in parallel under one deadline. Returns an empty array for
 * every failure mode - no key, timeout, non-2xx, malformed answer - so the
 * caller can omit the field and leave the response exactly as the scanner made it.
 */
export async function verifyCandidates(
  candidates: readonly EventCandidate[],
  options: {
    requestText: string | null;
    evidence: ReadonlyMap<string, string>;
    nowMs: number;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<CandidateVerification[]> {
  if (!typeSafeAvailable() || candidates.length === 0) return [];
  const referenceDate = new Date(options.nowMs).toISOString().slice(0, 10);
  const timeoutMs = options.timeoutMs ?? VERIFY_TIMEOUT_MS;
  const settled = await Promise.all(
    candidates.slice(0, VERIFY_MAX_CANDIDATES).map((candidate) => verifyOne(
      candidate,
      candidateSourceText(candidate.candidateId, options.requestText, options.evidence),
      referenceDate,
      { timeoutMs, signal: options.signal },
    )),
  );
  return settled.filter((one): one is CandidateVerification => one !== null);
}
