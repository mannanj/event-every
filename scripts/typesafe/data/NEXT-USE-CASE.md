# Next TypeSafe use case: pre-scan triage of text input

## Where the time goes today

Text path (`src/app/page.tsx` `handleTextSubmit`, ~line 383): paste -> tap Transform -> `detectURLs` -> one `runScan({kind:'text'})` -> 3-8 s provider call -> cards. Nothing starts before the tap, and a multi-event text is one call whose output (up to 50 candidates) grows linearly, so a six-event schedule is the slowest scan the app makes. A non-event paste pays the full call to come back empty.

(Not TypeSafe, but the largest single waste found: `handleImageSelect` ~line 343 awaits `runScan` per image in a `for` loop, so N images cost N x the slow call. `Promise.all` inside the existing queue fixes that for free. Do it first.)

## The use case

One 150 ms call on the raw text, before the provider, answering in parallel:

State: `{ referenceDate, referenceWeekday, source: 'paste'|'typed'|'url-page', paragraphs: [{ k, text }] }` (split on blank lines and bullets, cap 40).

- `has_event` (Noul): "Does `paragraphs` describe at least one concrete happening a person would put on a calendar, with a date, weekday or time, even relative like 'tomorrow'? A price list, recipe, bare URL or chatter with no when is false."
- `complete` (Noul, paste/typed only): "Is this input finished enough to scan now: it names an occasion and a when, and does not end mid-sentence or mid-word?"
- `shape` (Choice): `one_event | several_events_shared_date | several_independent_events | recurring_schedule | listing_of_many | no_event`.
- `boundary_k` (Noul per paragraph k >= 1, only with 3+ paragraphs): "Does paragraph k begin a different event from the one paragraph k-1 belongs to? A date header that applies to the lines under it is not a new event."

Policy:
1. `has_event` <= 0.1 and `no_event` >= 0.8: skip the provider, show "No date or time found - add one" at once.
2. `complete` >= 0.9 and `one_event` >= 0.7: start `runScan` on the paste/debounce, before Transform is tapped; the tap attaches to the in-flight queue item, an edit cancels it (`processingQueue` already has `cancelled`). Saves the paste-to-tap gap, 1-3 s, on every ordinary event.
3. `several_independent_events` >= 0.7 with 3+ paragraphs: cut at boundaries with p >= 0.8 (cap 6 chunks, prepend paragraph 0 for shared-date shape), enqueue each chunk as its own scan-text request through the existing `maxConcurrent = 3` queue, merge with `mergeScannedEvents`. A six-event text drops from ~8 s to ~4 s, first cards after the first chunk.
4. Anything else: today's single scan on tap.

## Plug-in points

- New `src/services/scanTriage.ts` calling a new `/api/triage` route (server holds the key; 16 KiB body policy like `resolve-timezone`).
- `src/app/page.tsx`: `handleTextSubmit` reads the verdict before `runScan`; the SmartInput debounce calls triage on paste/idle for the speculative start.
- `route.ts`/`job.ts` untouched; each chunk is a normal scan-text operation with its own settlement.

## Fallback

`Promise.race(triage, 400 ms)`; on timeout, error or missing key the verdict is `null` and every branch collapses to path 4: one scan, on tap, same request hash, same logs. Triage never changes a field; it only decides when and how many calls run.

## Measuring

Client marks per submit: `t_input_ready`, `t_tap`, `t_first_card`, `t_save`; add `triage: { shape, chunks, ms, skipped }` to the server operation log. Ship behind `NEXT_PUBLIC_SCAN_TRIAGE`, compare on/off medians of input-ready -> first card and -> Save. Guardrails: false skips (path 1 then a retry that finds an event) < 1%; split scans lose no candidates versus a single scan on the curated 118.

## Runner-ups

- Duration Score (30m / 1h / 90m / 2h / 3h / half day / all day) to pre-fill the end time instead of the fixed +1 h in `reviewEvent.ts`.
- Choice on scraped URL text (single event page / listing / schedule / not an event) before sending a whole page to the scan model.
