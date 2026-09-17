# TypeSafe judgment strategy (round 3)

Scores: A 118/119, B 1204/1246, C 78/119. Reference 2026-09-16 is a Wednesday.

## Failure clusters

- **B1 Weekday/relative date arithmetic, 11 cases (~24 field fails):** f-12, f-14, f-30, s-21, s-32, s-35, h-14, h-20, h-26, h-32, h-38. Date scores low on every variant: the model cannot compute "next Thursday" from a bare ISO reference. Root: state missing.
- **B2 Past date in real history, r-1 (3):** "Thursday, September 3" scanned before Sep 16; "on or after referenceDate" forces 2027. Root: wording plus wrong case referenceDate. The weekday resolves it.
- **B3 Dataset convention conflicts, 4 cases (9):** midnight is 00:00 next day in f-15 but 23:59 in s-37; doors is the start in h-9 but show is in f-05. Root: label subjectivity.
- **B4 Cross-field contamination (~6):** s-14, s-37, f-18, h-9. A corrupted field drags the others down. Root: wording.
- **B5 Multi-date listing, f-31 (3).** Root: wording.
- **B6 Numeric noise accepted as time (3):** s-3, h-12, h-35. Root: model limit, mitigated by criteria.
- **B7 Deadline with clock time, f-18.** Root: wording.
- **C1 Candidate coverage, 21 cases:** f-11, f-12, f-17, f-18, f-19, f-30, f-32, f-39, f-40, r-2, s-8, s-20, s-22, s-23, s-28, s-30, s-32, s-38, h-5, h-17, h-26. Root: generator (no sentence split, 60-char cap, no noun phrase after "for the", ISO dates kept).
- **C2 Dirty candidate chosen, 13 cases:** s-1, h-1, h-2, f-35, s-5, f-06, f-38, h-6, f-36, f-37, s-36, s-37, h-40. Root: generator; `\b\d{1,4}\b` never strips "2pm".
- **C3 Compositional truths, 10 cases:** f-10, h-40, f-24, f-35, f-36, f-37, s-29, h-16, h-18, h-31. Truth is not a substring of the text. Root: labels.

## Dataset fixes

- h-32: date to 2026-09-26 (the 27th is a Sunday).
- r-1: referenceDate to the scan date, or rely on the weekday rule.
- h-20: drop; "Wednesday 11am" on a Wednesday is a coin flip.
- h-9: time to 20:30 so show-is-start holds everywhere.
- f-15, s-37: keep, encode both midnight conventions in criteria.
- Add `truth.titleAccept` and score C by normalized match (case-fold, 0/O 1/l/I, ordinal words = digits, strip trailing punctuation). Accept the picked phrase for f-10, h-40, f-24, s-29, h-18, h-31, h-16, and "City Marathon Expo", "Book club", "Site visit" for f-35, f-36, f-37.

## Judgment changes

**A.** Append to `false`: "An arrival window such as 'after 2' or a doors-open time on a multi-day range is not a start time." Add state `extractedStartTime`.

**B. New state, computed in code:**
```ts
calendar: {
  referenceWeekday: 'Wednesday',
  next14Days: [{ date: '2026-09-16', weekday: 'Wednesday', label: 'today' }, ...],
  extractedWeekday: 'Thursday',
  yearOptions: [{ date: '2026-09-03', weekday: 'Thursday' }, { date: '2027-09-03', weekday: 'Friday' }],
}
```
- `date_ok`: "Is `extracted.startDate` the date `text` gives for this event? Use `calendar` rather than counting: a bare weekday is the first `next14Days` entry with that weekday; 'next <weekday>' is the second when the reference day is earlier in the week; 'tomorrow' and 'tonight' use the labels. When the year is omitted, pick the `yearOptions` entry whose weekday matches a weekday in the text; with no weekday, the nearest occurrence within 90 days before or 365 after `referenceDate`. If several dates are listed, the intended one is the date the user ordered, confirmed, or last agreed to, and it must agree with `extracted.startTime`. A midnight event on 'Thursday Oct 15' starts 00:00 on Oct 16. Judge the date only; do not lower it because time or location look wrong."
- `time_ok`: "Is `extracted.startTime` the start time `text` gives, with the last correction final? Show or start time is the start, not doors. A deadline 'by 5pm' starts 17:00; 'by midnight' is 23:59 on the stated date. Prices, phone numbers, durations, end times and 'until' times are not start times. OCR may swap 0/O and 1/l/I. Judge the time only."
- `location_ok`: add "The last address in a thread supersedes 'usual spot'. Judge the location only."

**C.** "Which candidate is the best short calendar title for the event in `text`? Prefer the occasion itself, without date, time, place, greetings or chatter. A candidate that is right apart from capitalisation or OCR digit noise is still the best choice." Always offer `extractorTitle` and its cleaned form. "None of these": "No candidate names the occasion; the app keeps the extractor title."

## Candidate generator changes

1. Also split on `. `, `! `, `? `, ` - `; cap 80 chars.
2. Strip leaders `^(heads up|reminder|re|fw|fwd|yep|yes|yo|hey|sure|join us)[!:,]*\s*`.
3. Strip trailers `\s(is|begins|starts|are due.*|tonight|tomorrow)$` and `[!?.]+$`.
4. Time regex `\b\d{1,2}(:\d{2})?\s?(am|pm)\b`; also strip `\d{4}-\d{2}-\d{2}`.
5. Noun phrase after `for (the|my|our)?\s` or `the\s` up to the next stop word.
6. OCR-normalize 0->O, 1->l inside letter runs; collapse spaces; dictionary-split no-space caps runs (h-2) or skip.
7. Title-case ALL CAPS candidates and offer the cased form instead of the raw one.
8. Dedupe by normalized form; at most 12, extractor title first.

## Threshold and policy

A false flag costs a glance; a false accept produced the 06:30 export.
- **A:** p >= 0.8 timed; <= 0.2 all-day; between, keep the extractor flag and show a "check the time" hint.
- **B per field:** >= 0.75 accept silently; 0.35-0.75 amber highlight; < 0.35 red highlight and open the field editor. Never auto-change a value.
- **C:** choice not none and confidence >= 0.6 use it; otherwise keep the extractor title, highlighted if over 60 chars or containing a date or time.

## Priority order

1. `calendar` state and date_ok wording (B1, B2: ~27 field fails).
2. Generator rules 1-8 plus always-offer extractor title (C1, C2: ~34 cases).
3. Title scoring normalization and `titleAccept`; relabel h-32, h-9; drop h-20 (~10).
4. Independence clause and time_ok noise criteria (B4, B6, B7: ~10).
5. Thresholds in the app.
