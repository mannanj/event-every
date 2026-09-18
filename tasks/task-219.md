### Task 219: TypeSafe judgment defaults: fill what the source did not say, and the roadmap for the rest
Priority for the next build. Each item is one extra question in the existing triage call
(`triageQuestions`), answered in parallel with `has_event`, `shape`, and `duration`, so the
default is ready before the scan returns. Code does the arithmetic; Jev only estimates the
most likely value. Every default is gated on confidence and falls back to today's behaviour,
and the raw probabilities are kept so thresholds can be retuned without re-running the model.

- [ ] Location kind: Choice over `physical_place`, `online_link`, `phone_call`, `unknown`; the card shows the matching icon and skips map lookup for non-physical locations
- [ ] All-day or timed: Noul when the source gave a date and no time; replaces the fixed all-day/09:00 assumption
- [ ] Reminder lead time: Score on ordered levels (10 min, 30 min, 1 hour, 3 hours, 1 day) judged from the kind of occasion; written as the VALARM trigger in the export
- [ ] Door-open versus real start: Noul when two times appear; the later one becomes the start and the earlier goes into the description
- [ ] Year for an undated month and day: Choice between next occurrence and the most recent past one, given the reference date and any hint of tense
- [ ] Which Friday: Choice between the weekday relative to today and the weekday inside the header's stated week
- [ ] Importance: Score on a small rubric, stored on the event for a future "busy week" view; no UI change in this task
- [ ] Public and repeated versus personal: Noul; a public listing item gets a softer "save?" prompt instead of an auto-save
- [ ] Tests for each score/choice parser, the confidence gating, and the fallback when triage is unavailable
- Location: `src/server/typesafe/triage.ts`, `src/services/scanTriage.ts`, `src/services/reviewEvent.ts`, `src/app/page.tsx`

#### Other TypeSafe findings, for later tasks

Ordered by payoff. Same rules as above: state the app already holds, one narrow question per
judgment, fall back to current behaviour when the answer is missing or low-confidence.

1. **Verify the scan before showing the card.** Noul per field with the source text and the
   candidate as state: does the date appear in the source, does the time match, is the
   location a place and not a person, is the title the name of the occasion. Low probability
   marks the field "check this" on the card.
2. **Replace the summarize prompt with a Choice.** Code proposes 4 to 6 candidate labels
   (first title words, title plus location, venue name, first line); one Choice picks the best.
   Removes `cleanLabel` and the generate-and-clean prompt in `src/app/api/summarize/route.ts`.
   Smallest change, good first taste.
3. **Grade a scraped page before scanning it.** Choice over single event, listing, checkout,
   login wall, error page; Score for how much of the text is event content versus boilerplate.
   Skip or split listings, trim junk before the scan.
4. **Resolve timezone ambiguity.** Choice over plausible zones for "CST" or a bare time, given
   title, location, and date, with confidence deciding when to ask the reader instead.
5. **Match a new draft against past events.** Code narrows history to a window around the new
   date, then one Noul per candidate ("same occasion?") or one Choice with a "none of these"
   option. Documented limit: a Choice allows at most 255 options; the rerank cookbook
   shortlists to ~30 per call. Offer "update the existing one" instead of saving a duplicate.
6. **Rank and pick when the scanner returns several.** Comparable Score per candidate on one
   rubric ("how central is this to what the reader pasted"); top one opens expanded, the rest
   collapse.
7. **Route the input before scan.** Marked for later, needs more thinking. Choice over input
   kind (event prose, forwarded invite email, ICS blob, URL list, chat screenshot) so each kind
   takes its best path: ICS to the parser, URLs to the scraper, email to a header-aware scan,
   prose to the generic scan.

Reference: https://docs.typesafe.ai/concepts/system-one, https://docs.typesafe.ai/concepts/use-case-map
