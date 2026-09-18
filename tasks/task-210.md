### Task 210: Recurring events, from text and from a quick control on the card

Asked 2026-09-17, after the Meet invite worked: can the app make a recurring event, either
because the text says "every Monday" or because the user taps something on the card?

- [ ] Carry the scanner's recurrence rule into `CalendarEvent` as a small app-owned shape
- [ ] Export it as `RRULE` (and `EXDATE`/`RDATE` when present) through the existing `ics` path
- [ ] Show it on the card and let the user set or clear it with a quick control
- [ ] Sanitize what the model returns before trusting it, and measure it
- [ ] Round-trip: `.ics` import keeps `RRULE`, history keeps it, sync keeps it
- Location: `src/types/event.ts`, `src/services/reviewEvent.ts`, `src/services/exporter.ts`,
  `src/services/icsParser.ts`, `src/components/event-card/EventCard.tsx`,
  `src/components/EventFields.tsx`, `src/utils/recurrence.ts` (new), `scripts/scan-eval-cases.ts`

#### What exists today (measured 2026-09-17)

The scanner already extracts recurrence. `EventCandidate.recurrence.value` is
`{ rule, rDates, exDates }` where `rule` has `frequency` (DAILY/WEEKLY/MONTHLY/YEARLY),
`interval`, `count`, `until` (a temporal point), `byDay` (`[{ ordinal, weekday }]`),
`byMonth`, `byMonthDay`, `weekStart`. For "Yoga every Monday at 6pm starting March 2 2026"
the production model returned:

```
WEEKLY, interval 1, byDay [MO], byMonth [3], byMonthDay [2]
```

Right frequency and weekday, but the model also copied the start date into `byMonth` and
`byMonthDay`, which as an RRULE would restrict the series to March 2 only. So the rule is
usable, not trustworthy as-is.

Everything after the scanner drops it: `reviewDraftToCalendarEvent` never reads
`candidate.recurrence`, `CalendarEvent` has no recurrence field, the card and `EventFields`
have nothing to show, and `exportMultipleToICS` writes plain VEVENTs. The `ics` package the
exporter uses already accepts `recurrenceRule` (an RRULE string without the `RRULE:` prefix),
so the export side is a string away. The `.ics` importer ignores `RRULE` too.

#### What it would take

1. **Model.** Add `recurrence?: RecurrenceRule` to `CalendarEvent` with the app's own small
   shape (frequency, interval, byDay, count or until, exDates). Keep it independent of the
   scanner types the way `reviewEvent.ts` keeps everything else.
2. **From the scanner.** In `reviewDraftToCalendarEvent`, map `candidate.recurrence.value`
   through a sanitizer: drop `byMonth`/`byMonthDay` when they merely restate the start date,
   drop `byDay` that contradicts the start weekday when `frequency` is WEEKLY with no other
   day, keep `count`/`until` only when the source said so. This is the same lesson as the
   all-day flag: the point outranks the flag, and the start outranks a copied-in restriction.
3. **Export.** Build the RRULE string in `src/utils/recurrence.ts` (pure, tested) and pass it
   as `recurrenceRule` in both the single and batch exporters. `EXDATE` lines need the raw
   line path the attachments already use.
4. **Quick control on the card.** A single "Repeats" affordance beside the time, in the style
   of the timezone chip: None, Daily, Weekly on <start weekday>, Monthly on the <n>th,
   Yearly, plus "Custom" that opens `EventFields` with interval, weekdays and an end
   (never / after n / until date). Text input stays the other path: "every Monday" in the
   source sets the same field.
5. **Round trip.** `icsParser.ts` reads `RRULE` back; history and account sync serialize the
   field (check the encrypted event row schema).
6. **Measure.** Extend `scripts/scan-eval-cases.ts` with recurrence ground truth (weekly on
   a day, every other week, monthly on a date, "until June", "for 6 weeks", and negatives
   like "the Monday meeting" that is one meeting) and score the sanitized rule, not the raw
   one. Verify with `bun scripts/probe-scan.ts` and `bun run check:prod-like`.

#### Decisions to make first

- Whether an `until` from the model that is only a date-only point is trusted, or the series
  is left open-ended with the card saying so.
- Whether a weekly series with several weekdays becomes one event with `byDay` (correct for
  calendars) or one card per weekday (what a user might expect to edit).
- Apple Calendar, Google Calendar and Outlook all read RRULE, but they render `count` and
  `until` differently; the export test needs to import into all three once.
