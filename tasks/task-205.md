### Task 205: `/api/scan` fails about half the time, and fails silently

**Severity: Blocks launch** · Found 2026-09-13 running the first real end-to-end extraction against production, once the owner budget was unfrozen. This is the core feature, and it is the reason the app is not ready.

#### Observed

Four identical submissions of the same text through the real UI at eventevery.com:

```
attempt 1   502 /api/scan   provider_invalid_response
attempt 2   200 /api/scan   then 502 /api/summarize
attempt 3   502 /api/scan   provider_invalid_response
attempt 4   502 /api/scan   provider_invalid_response
```

Same input, same model, different outcome. Roughly half fail. The `max_tokens` fix in `f90789b` was real and necessary - these requests now reach a model - but reaching a model turned out not to be sufficient.

#### Two separate problems

**1. The replay schema is stricter than the model is reliable.**

`provider_invalid_response` comes from `toDurableScanReplay` in `src/platform/provider/replay.ts`, which validates the model's output after `scanSource` post-processes it. That schema is exacting: UUID-shaped `candidateId`, a `source` object with UUID `sourceId` and `contentHandle`, `issues` drawn from a closed 25-value enum, confidence in [0,1], `evidence` arrays emptied by projection, and a 64 KiB per-candidate bound. `deepseek/deepseek-v4-flash` satisfies all of it *sometimes*.

Nothing constrains generation toward that shape beyond the JSON schema already sent. The options are to constrain harder, to relax what is genuinely not required, or to retry once on a validation failure - but note the third is the most expensive, see below.

**2. A failure shows the user nothing at all.**

This is the worse half. On a 502 the DOM contains **zero** `error-notification` elements. Checked directly:

```
DOM: {"event-card":0,"error-notification":0,"save-events-button":0, ...}
ERR: []
```

The input clears, nothing appears, no message. Indistinguishable from the app ignoring you. Whatever is decided about the schema, a failed scan must say so.

#### The cost, which makes this urgent

A failed call is charged its **full reservation** - $0.02 for scan-text - while a success measured about $0.00007. With the day capped at $1 (`OWNER_DAILY_LIMIT_NANODOLLARS`), a coin-flip failure rate means roughly **50 attempts exhausts the day for everybody**, since the pot is global with no per-user split. Four test submissions cost $0.061.

That is the intersection of three known problems: this one, task 201 (failures charged full reservation) and task 204 (one global pot). Retrying on failure without fixing 201 first would double the burn rate.

#### Decide first

- [ ] Is `deepseek/deepseek-v4-flash` the right model for a strict structured output, or is a more reliable one worth the higher per-call cost given a failure costs 285x a success?
- [ ] Which parts of `DurableScanReplaySchema` are genuine invariants and which are incidental strictness? The UUID shapes are host-assigned and should never depend on the model; if any currently do, that is the bug.
- [ ] Retry policy, but only after task 201 - a retry that charges another full reservation makes the budget problem twice as bad.

#### Implement

- [ ] Capture which validation actually fails, in production, without logging provider content. Zod issue paths and codes are field names, not values, and are safe to record; a temporary diagnostic proved this approach works during the 2026-09-13 debugging.
- [ ] Surface the failure in the UI. `ErrorNotification` exists and is not being reached on this path.
- [ ] Whichever of constrain / relax / retry is chosen, add a test that runs the real pipeline against a recorded model response that previously failed validation.

#### Prove

- [ ] Twenty consecutive submissions of the same text produce twenty event cards, or a stated and measured failure rate with a visible error each time.
- [ ] A forced validation failure renders a visible message and does not clear the user's input.

- Location: `src/platform/provider/replay.ts`, `src/platform/provider/policy.ts`, `src/server/scanner/job.ts`, `src/app/page.tsx`
