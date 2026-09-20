# TypeSafe in the scan path: design with a no-op fallback

Status: built in Task 232, except the review-card markers (build order step 4)
and the daily budget counter (fallback rung 4). The question wording now lives
in `src/server/typesafe/judgments.ts`, carried over from
`scripts/typesafe/judgments.ts` unchanged.

Two things the build found that this design did not anticipate:

- The durable replay projection drops ALL evidence on purpose, so the excerpts
  are gone by the time the scan route sees a candidate. `runCoordinatedScanJob`
  now keeps them in memory for the life of the request only, and only when a
  TypeSafe key is present. Nothing new is written to the operation record.
- A duration judgment was added, which this document did not list. It fills the
  end time for a timed event whose source stated no end, the same ladder the
  pre-scan triage uses, so images stop defaulting to one hour.

## Principle

TypeSafe only ever ADDS to a scan response. It never changes, removes, or
invents a value. When it is missing, slow, or wrong, the response is exactly
what the scanner produced today, and the review card behaves exactly as today.

## Where it plugs in

`src/app/api/scan/route.ts`, after `runCoordinatedScanJob` returns
`status: 'completed'` and before `NextResponse.json(result.value)`.

```
candidates = result.value.candidates
enriched   = await enrichWithTypeSafe(candidates, sourceText, context)   // may be a no-op
return NextResponse.json({ ...result.value, verification: enriched })   // optional field
```

`ScanResponseSchema` in `src/types/scannerHttp.ts` is a strict object, so it
gains one optional field, `verification`, on both server and client. Clients
that ignore it see no change. The durable replay stays the scanner's own
output; verification is computed on the way out and never stored in the
provider operation record.

## Source text

- Text and URL scans: the request text (or scraped page text) is the state.
- Image scans: the vision model returns claims with `evidence[].excerpt`.
  The concatenated excerpts are the state. When there are no excerpts,
  verification is skipped for that candidate. No OCR pass is added.

## What runs, per candidate, in one TypeSafe call

| Judgment | Runs when | Output stored |
| --- | --- | --- |
| Field verification (date, time, location Nouls) | always, if source text exists | `fields: { date, time, location }` probabilities |
| All-day resolver (Noul) | `allDay === 'unknown'` or issue `unknown_all_day` | `timed` probability |
| Title pick (Choice) | title claim missing, over 60 chars, or contains a date/time | `title: { choice, confidence }` |

Extra questions cost tokens, not latency; they run in parallel in one request.
Per-candidate calls run with `Promise.all` and a 1500 ms overall deadline.

## Thresholds (from STRATEGY.md, to be re-tuned on real history)

- Field: p >= 0.75 accept silently; 0.35 to 0.75 amber outline on the field;
  < 0.35 red outline and the field opens for editing. The value is never changed.
- All-day: p >= 0.8 set timed; p <= 0.2 set all-day; between, keep the
  scanner's flag and show a "check the time" hint.
- Title: use the choice when it is not "none of these" and confidence >= 0.6;
  otherwise keep the scanner's title.

## Fallback ladder (the app must work great without TypeSafe)

1. `TYPESAFE_API_KEY` absent in `getCloudflareContext().env` (or `.dev.vars`
   locally): the enrichment module is never constructed. Response has no
   `verification` field. Zero extra latency.
2. Key present, call fails (401, 422, 429, 529, network) or exceeds the
   1500 ms deadline: `verification` is omitted for that scan. One structured
   log line (`event: 'typesafe', status`) and nothing else. The scan still
   returns the scanner's result in full.
3. Call succeeds but an answer is missing or malformed: that judgment is
   treated as absent, the others are kept.
4. A daily budget counter, like the existing OpenRouter owner budget, freezes
   enrichment for the day when exceeded. The scan path is unaffected.

The review card renders markers only when a probability is present. With no
`verification` field it renders exactly as it does today, so the fallback is
the absence of the feature, not a degraded version of it.

## Cost per scan (measured on the 118-case set)

About 1,100 tokens and 150 to 250 ms per candidate when the calendar lookup
state is included, about half that when it is not. The calendar state is only
sent when the text lacks a four-digit year or uses weekday or relative words.

## Secrets

- Local: add `TYPESAFE_API_KEY` to `.dev.vars` (already in `.env.local`).
- Production: `wrangler secret put TYPESAFE_API_KEY`.
- Never exposed to the client; the enrichment runs only in the route.

## Build order

1. `src/server/typesafe/client.ts` and `judgments.ts` (copied from scripts).
2. Optional `verification` on `ScanResponseSchema`, server and client.
3. Enrichment in the scan route with the fallback ladder and log line.
4. Field markers in `src/components/event-card/EventCard.tsx` and
   `EventFields.tsx`, rendered only when probabilities exist.
5. Re-tune thresholds on exported history once the app retains scan text.

## Product gap found on the way

Image scans keep the original image as an attachment but not the text the
model read, and `originalInput` for images is a blob URL that dies with the
session. Retaining the model's evidence excerpts on the saved event would give
a real-history eval set for free and let verification run on re-opened cards.
