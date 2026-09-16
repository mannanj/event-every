### Task 208: Image scans threw away correct answers, text scans dropped the time, and nothing logged it

Reported 2026-09-15 from production: a screenshot of a Google Meet invite came back as
"error scanning", then as an all-day card titled "Google Meet joining info"; the pasted
text of the same invite came back at 12:00 AM. "This stuff used to work."

- [x] Trace the history: which changes made extraction fragile, and which one is recent
- [x] Restore the evidence-offset repair for image scans, with a regression test
- [x] Guide the schema the model sees so a stated time is returned as a timed point
- [x] Put time, end, zone and title rules back into the host context message
- [x] Move text scanning to the model that gets the time right, measured on ground truth
- [x] Log one structured line per scan and keep Workers Logs in the dashboard
- [x] Stop the scanning shimmer lingering after an image error
- [x] Rename the button to Scan it
- [x] A production-like check: real Worker bundle, real providers, real UI
- Location: `src/server/scanner/transport.ts`, `src/server/scanner/schemaGuidance.ts`,
  `src/server/scanner/scanContext.ts`, `src/platform/provider/policy.ts`,
  `src/platform/provider/transport.ts`, `src/app/api/scan/route.ts`, `src/app/page.tsx`,
  `wrangler.jsonc`, `scripts/probe-scan.ts`, `scripts/prod-like-check.mjs`,
  `scripts/measure-scan-reliability.ts`, `scripts/scan-eval-cases.ts`, `scripts/render-eval-images.mjs`

#### History: how it got fragile

| When | Change | Effect on extraction |
| --- | --- | --- |
| before 2026-08-02 | `/api/parse`: one rich prompt (time, all-day, end-time rules, worked examples) on `mistralai/mistral-large-2512` for text and images | worked |
| 2026-07-29 to 08-03 | vendored scanner: eleven-line prompt, strict JSON-schema output, `temperature: 0`, zero-data-retention routing; text moved to `deepseek/deepseek-v4-flash`, images to `mistralai/mistral-small-2603` | quality never re-measured against real inputs until September |
| 2026-09-13 | task 205: evidence offsets found to discard 82% of correct text extractions; app-side repair added (`withoutEvidenceOffsets`), measured 44% to 78% correct | text fixed |
| 2026-09-13, same day | `e11178a` re-vendored the library with a text-only offset tolerance and **deleted the app-side repair** | **image scans re-broke**: the vision model cites offsets on nearly every image, and for images that is fatal in the library |
| 2026-09-15 | `f72a4e5` reference date; `aa21f31` all-day derived from the points | text years fixed; a date-only point now renders all-day instead of midnight, which is what the screenshot showed |

The recent one is `e11178a`. Measured on a rendered screenshot of the invite: the vision model
returned the correct zoned 19:00-20:30 on every run and the observation was discarded on 6 of 7
(`Image evidence must have null offsets, got startOffset=27 endOffset=58`). The user saw
"error scanning" for an answer that was right.

#### The text side was worse than the image side

`scripts/measure-scan-reliability.ts` had been comparing the current model with itself: the
provider transport overwrites the body's `model`, so its "candidate" runs were the same model.
With a real override (`modelOverride`, evaluation only) and the production context message:

| model | text, 27-28 ground-truth cases | notes |
| --- | --- | --- |
| deepseek/deepseek-v4-flash (was production) | 15/27 correct, 56% | clean inputs 0/3: date-only points, title null; 13-80s per call |
| mistralai/mistral-small-2603 (now production) | 27/28 correct, 96% | ~4s per call; the one miss was a provider 5xx |

The dropped time was not the prompt: the wire schema lists the `date` kind first in each
temporal `oneOf` and describes none of them, and under strict decoding that is what came back
for "Friday March 13 2026 at 9:30am". `schemaGuidance.ts` reorders the branches (floating,
zoned, partial, date) and describes each, in the host transport, so it survives re-vendoring.
Same model, same input: 09:30 on every run afterwards.

#### What was added for next time

- One JSON line per scan from `/api/scan` (request id, kind, model, ms, status, candidate
  count, the kind of each start, issue codes; never the source) and `observability.enabled`
  in `wrangler.jsonc`, so the dashboard keeps them.
- `bun scripts/probe-scan.ts --text "..." | --image x.png [--model m] [--no-context]` runs one
  source through the exact production path and prints what came back, including the swallowed
  validation error when the scanner rejects it.
- `bun run check:prod-like` builds the Worker bundle, serves it with `wrangler dev` reading
  `.dev.vars`, and drives the real UI with the invite as text and as a screenshot.

#### Still open

- Other candidate models are rejected at OpenRouter's parameter filter: the pinned body
  sends `reasoning` and `temperature`, which the larger Mistral, OpenAI and Gemini endpoints
  do not accept under `require_parameters`. Widening the model choice means relaxing the
  pinned body per model. Not done here.
- The vision model still returns a date-only point on roughly one run in three for the
  invite screenshot even with guidance. Measured, not fixed.
