/**
 * Ground truth for the scan evaluation.
 *
 * Stratified rather than "three sentences I thought of": an extractor breaks on
 * particular SHAPES of input, so the set is organised by shape and every
 * category has more than one member. Written once, by hand, because there is no
 * way to have a model generate its own answer key without inheriting its
 * mistakes.
 *
 * The negative cases are the point of the whole file. A model that returns an
 * empty candidate list scores a clean pass against a schema check, so without
 * inputs that SHOULD yield nothing there is no way to tell "extracted correctly"
 * from "extracted nothing, validly".
 */

export interface EvalCase {
  id: string;
  category: string;
  text: string;
  /** How many events a correct reading finds. 0 means "there is no event here". */
  expectCandidates: number;
  /** Lowercased substring the title should contain. Omitted where any title is fine. */
  expectTitle?: string;
  /** Expected start as Y/M/D. Omitted for relative dates, which depend on today. */
  expectDate?: { year: number; month: number; day: number };
  /** Expected start hour/minute, 24h. Omitted where the input gives no time. */
  expectTime?: { hour: number; minute: number };
}

export const EVAL_CASES: readonly EvalCase[] = [
  // Plain and unambiguous. If these fail, nothing else matters.
  { id: 'clean-1', category: 'clean', text: 'Team standup on Friday March 13 2026 at 9:30am in the Blue Room',
    expectCandidates: 1, expectTitle: 'standup', expectDate: { year: 2026, month: 3, day: 13 }, expectTime: { hour: 9, minute: 30 } },
  { id: 'clean-2', category: 'clean', text: 'Dentist appointment April 7 2026 at 2pm',
    expectCandidates: 1, expectTitle: 'dentist', expectDate: { year: 2026, month: 4, day: 7 }, expectTime: { hour: 14, minute: 0 } },
  { id: 'clean-3', category: 'clean', text: 'Product launch party on 12 June 2026, 7:00 PM, at The Winery',
    expectCandidates: 1, expectTitle: 'launch', expectDate: { year: 2026, month: 6, day: 12 }, expectTime: { hour: 19, minute: 0 } },

  // NEGATIVES. A model returning [] here is right; a model inventing an event is
  // the worst failure in the set, and the one a schema check cannot see.
  { id: 'none-1', category: 'negative', text: 'I cannot make Tuesday, sorry - let me know how it goes', expectCandidates: 0 },
  { id: 'none-2', category: 'negative', text: 'Thanks for lunch yesterday, that place was great', expectCandidates: 0 },
  { id: 'none-3', category: 'negative', text: 'Reminder to buy milk, eggs and coffee filters', expectCandidates: 0 },
  { id: 'none-4', category: 'negative', text: 'The quarterly numbers are up 14% year over year', expectCandidates: 0 },

  // Several events in one blob.
  { id: 'multi-1', category: 'multiple', text: 'Dentist Tue Apr 7 2026 2pm, then dinner with Sam 7pm at Lupa the same day',
    expectCandidates: 2 },
  { id: 'multi-2', category: 'multiple', text: 'Standup 9am, design review 2pm, retro 4pm - all on March 4 2026',
    expectCandidates: 3 },

  // Relative dates. No expectDate: the right answer depends on today, and this
  // measures whether an event is found at all rather than which day it lands on.
  { id: 'rel-1', category: 'relative', text: 'Sprint review next Thursday 11am to 12pm, Zoom link in the invite', expectCandidates: 1, expectTitle: 'sprint' },
  { id: 'rel-2', category: 'relative', text: 'Coffee with Priya tomorrow at 8:15am', expectCandidates: 1 },
  { id: 'rel-3', category: 'relative', text: 'All-hands in three weeks, 10am', expectCandidates: 1 },

  // A date with no year stated.
  { id: 'noyear-1', category: 'implicit-year', text: 'Board meeting on March 15 at 9am', expectCandidates: 1, expectTitle: 'board' },
  { id: 'noyear-2', category: 'implicit-year', text: 'Flu shot Nov 3, 4:45pm, Walgreens on Main', expectCandidates: 1 },

  // Timezones, stated and absent.
  { id: 'tz-1', category: 'timezone', text: 'Client call March 9 2026 at 9am EST', expectCandidates: 1, expectTitle: 'client' },
  { id: 'tz-2', category: 'timezone', text: 'Handover 16:00 CET on 2026-05-21', expectCandidates: 1 },
  { id: 'tz-3', category: 'timezone', text: 'Webinar 2026-07-02 1pm PT / 4pm ET', expectCandidates: 1 },

  // Formats a US-centric reader gets wrong.
  { id: 'fmt-1', category: 'format', text: 'Team offsite 05/03/2026 09:00, Berlin office', expectCandidates: 1 },
  { id: 'fmt-2', category: 'format', text: 'Wedding on the fifth of September 2026 at half past three', expectCandidates: 1, expectTitle: 'wedding' },
  { id: 'fmt-3', category: 'format', text: 'standup tmrw 9a', expectCandidates: 1 },

  // Ranges and recurrence.
  { id: 'range-1', category: 'range', text: 'Conference March 3-5 2026 in Austin', expectCandidates: 1, expectTitle: 'conference' },
  { id: 'recur-1', category: 'recurrence', text: 'Yoga every Monday at 6pm starting March 2 2026', expectCandidates: 1 },

  // Minimal, conflicting, and noisy.
  { id: 'min-1', category: 'minimal', text: 'Meeting 3pm', expectCandidates: 1 },
  { id: 'conflict-1', category: 'conflicting', text: 'Sync at 3pm on March 10 2026... actually make it 4pm', expectCandidates: 1, expectTime: { hour: 16, minute: 0 } },
  { id: 'noise-1', category: 'noisy', text: 'FW: RE: FW: --- Original Message --- Hi all, quick one: the budget review is March 18 2026 at 1pm in Room 4B. Please bring numbers. Sent from my iPhone',
    expectCandidates: 1, expectTitle: 'budget', expectDate: { year: 2026, month: 3, day: 18 }, expectTime: { hour: 13, minute: 0 } },
  { id: 'noise-2', category: 'noisy', text: 'unsubscribe | privacy policy | JOIN US! Spring Gala — April 24 2026 — 6:30pm — Grand Hall — tickets $40 — view in browser',
    expectCandidates: 1, expectTitle: 'gala', expectDate: { year: 2026, month: 4, day: 24 }, expectTime: { hour: 18, minute: 30 } },

  // Long input, to see whether it truncates or hallucinates.
  { id: 'long-1', category: 'long', text: `${'Background context that is not an event. '.repeat(40)}The only real item: kickoff on March 20 2026 at 10am.`,
    expectCandidates: 1, expectDate: { year: 2026, month: 3, day: 20 }, expectTime: { hour: 10, minute: 0 } },
];
