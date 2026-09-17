/**
 * The three post-extraction judgments under test. Kept separate from the eval
 * runner so the same question wording and state builders can move into the app
 * unchanged.
 */
import { ask, noul, type Question } from './client';

export interface Extracted { title: string; startDate: string; startTime: string | null; location: string | null }

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/**
 * System One models do not count days reliably from a bare ISO date, so the
 * arithmetic is done here and handed over as a lookup table: the next two weeks
 * with weekday names, plus the extracted date under each candidate year so a
 * weekday in the text can settle an omitted year.
 */
export function calendarState(referenceDate: string, extractedDate: string) {
  const next14Days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(referenceDate, i);
    return { date, weekday: weekdayOf(date), label: i === 0 ? 'today' : i === 1 ? 'tomorrow' : null };
  });
  const [, mm, dd] = extractedDate.split('-');
  const refYear = Number(referenceDate.slice(0, 4));
  const yearOptions = [refYear - 1, refYear, refYear + 1].map((y) => `${y}-${mm}-${dd}`).filter((d) => !Number.isNaN(new Date(d).getTime())).map((date) => ({ date, weekday: weekdayOf(date) }));
  return { referenceWeekday: weekdayOf(referenceDate), next14Days, extractedWeekday: weekdayOf(extractedDate), yearOptions };
}

export async function judgeTimed(text: string, extractedDate: string, extractedStartTime: string | null = null): Promise<number> {
  const a = await ask(
    { text, extractedDate, extractedStartTime },
    {
      timed: {
        type: 'noul',
        instructions: 'Does the event in `text` that falls on `extractedDate` start at a specific clock time, rather than being an all-day item?',
        criteria: {
          true: 'The text states or clearly implies a start time such as 9am, 18:30, noon, or midnight for this event',
          false: 'No start time is given; the item is a whole-day occasion, a deadline with only a date, a holiday, or a closure. An arrival window such as "after 2" or a doors-open time on a multi-day range is not a start time.',
        },
      },
    },
  );
  return noul(a.timed);
}

export interface FieldVerdict { date: number; time: number | null; location: number | null }

export async function verifyFields(text: string, referenceDate: string, extracted: Extracted): Promise<FieldVerdict> {
  const questions: Record<string, Question> = {
    date_ok: {
      type: 'noul',
      instructions: 'Is `extracted.startDate` the date `text` gives for this event? Use `calendar` rather than counting: a bare weekday is the first `calendar.next14Days` entry with that weekday; "next <weekday>" is the second such entry when the reference day is earlier in the week; "tomorrow" and "tonight" use the labels. When the year is omitted, pick the `calendar.yearOptions` entry whose weekday matches a weekday in the text; with no weekday, the nearest occurrence within 90 days before or 365 days after `referenceDate`. If several dates are listed, the intended one is the date the user ordered, confirmed, or last agreed to, and it must agree with `extracted.startTime`. A midnight event on "Thursday Oct 15" starts 00:00 on Oct 16. Judge the date only; do not lower it because the time or location look wrong.',
    },
  };
  if (extracted.startTime) questions.time_ok = {
    type: 'noul',
    instructions: 'Is `extracted.startTime` the start time `text` gives for this event, with the last correction final? Show or start time is the start, not doors. A deadline "by 5pm" starts 17:00; "by midnight" is 23:59 on the stated date. Prices, phone numbers, durations, end times, and "until" times are not start times. OCR may swap 0/O and 1/l/I. Judge the time only; do not lower it because the date or location look wrong.',
  };
  if (extracted.location) questions.location_ok = {
    type: 'noul',
    instructions: 'Is `extracted.location` the place `text` gives for this event, allowing for spelling and OCR noise? The last address in a thread supersedes "usual spot". Judge the location only; do not lower it because the date or time look wrong.',
  };
  const needsCalendar = !/\b(?:19|20)\d{2}\b/.test(text) || /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(?:today|tonight|tomorrow|tmrw|next|this)\b/i.test(text);
  const a = await ask({ text, referenceDate, ...(needsCalendar ? { calendar: calendarState(referenceDate, extracted.startDate) } : {}), extracted }, questions);
  return { date: noul(a.date_ok), time: extracted.startTime ? noul(a.time_ok) : null, location: extracted.location ? noul(a.location_ok) : null };
}

const LEADERS = /^(?:heads up|reminder|re|fw|fwd|yep|yes|yo|hey|hi|sure|ok|join us|subject)\b[!:,\s]*/i;
const TRAILERS = /\s(?:is|begins|starts|are due.*|tonight|tomorrow|today)$|[!?.]+$/i;
const TIME = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm|a|p)\b/gi;
const CLOCK24 = /\b\d{1,2}:\d{2}\b/g;
const ISO = /\b\d{4}-\d{2}-\d{2}(?:T[\d:]+)?\b/g;
const DATEWORDS = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\.?,?|\b(?:january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b\.?|\bmay(?=\s+\d)|\b\d{1,2}(?:st|nd|rd|th)?\b|\b\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?\b|\b(?:19|20)\d{2}\b|\b(?:the )?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|twentieth|thirtieth)\b(?: of)?/gi;
const STOP = /\s(?:on|at|in|with|every|starting|next|tomorrow|tmrw|tonight|today|this|from|via|for|by)\s/i;

function ocrNormalize(s: string): string {
  return s.replace(/(?<=[A-Za-z])0(?=[A-Za-z]|\b)/g, 'O').replace(/(?<=[A-Za-z]{2})1(?=[A-Za-z]|\b)/g, 'l');
}
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s|-)([a-z])/g, (m) => m.toUpperCase());
}
function clean(raw: string): string {
  return raw.replace(LEADERS, '').replace(ISO, '').replace(TIME, '').replace(CLOCK24, '').replace(DATEWORDS, '').replace(/\s{2,}/g, ' ').replace(/^[\s,:\-–—]+|[\s,:\-–—]+$/g, '').replace(TRAILERS, '').trim();
}
const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function titleCandidates(text: string, extractorTitle?: string): string[] {
  const out = new Map<string, string>();
  const offer = (s: string) => { const k = normKey(s); if (k && s.length >= 3 && s.length <= 80 && !/^https?:/.test(s) && !/^\+?\d[\d\s()-]{6,}$/.test(s) && !out.has(k)) out.set(k, s); };
  if (extractorTitle) { offer(extractorTitle); offer(clean(extractorTitle)); }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // Poster titles are often stacked one word per line; offer the joined run.
  let run: string[] = [];
  for (const l of lines) { if (l.length <= 24 && /^[A-Z0-9 '&!-]+$/.test(l) && !/\d/.test(l)) run.push(l); else break; }
  if (run.length >= 2) offer(titleCase(run.join(' ')));
  const chunks = text.split(/\n|,|\s[-–—·|\/]\s|\.\.\.|:\s|\.\s|!\s|\?\s/).map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const variants = new Set<string>();
    const lead = chunk.split(STOP)[0].trim();
    variants.add(clean(chunk)); variants.add(clean(lead));
    const forPhrase = chunk.match(/\bfor (?:the |my |our |a |an )?(.+)/i)?.[1];
    if (forPhrase) variants.add(clean(forPhrase.split(STOP)[0]));
    for (const v of [...variants]) {
      const o = ocrNormalize(v);
      if (o !== v) variants.add(o);
    }
    for (const v of variants) {
      if (!v) continue;
      if (v === v.toUpperCase() && /[A-Z]{3}/.test(v)) offer(titleCase(v)); else offer(v);
    }
  }
  return [...out.values()].slice(0, 12);
}

export interface TitlePick { choice: string; confidence: number; candidates: string[] }

export async function pickTitle(text: string, extractorTitle?: string): Promise<TitlePick> {
  const candidates = titleCandidates(text, extractorTitle);
  const criteria: Record<string, string | null> = Object.fromEntries(candidates.map((s) => [s, null]));
  criteria['none of these'] = 'No candidate names the occasion; the app keeps the extractor title';
  const a = await ask(
    { text },
    { title: { type: 'choice', instructions: 'Which candidate is the best short calendar title for the event in `text`? Prefer the occasion itself, without date, time, place, greetings, or chatter. A candidate that is right apart from capitalisation or OCR digit noise is still the best choice.', criteria } },
  );
  if (a.title.type !== 'choice') throw new Error('expected choice answer');
  return { choice: a.title.choice, confidence: a.title.confidence, candidates };
}

/** Case-fold, undo OCR digit swaps, spell out nothing: a title is accepted when it matches any accepted form after normalisation. */
export function titleMatches(picked: string, accept: string[]): boolean {
  const n = (s: string) => ocrNormalize(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const p = n(picked);
  if (!p) return false;
  return accept.some((t) => { const a = n(t); return a === p || (a.length >= 4 && p.includes(a)) || (p.length >= 4 && a.includes(p)); });
}
