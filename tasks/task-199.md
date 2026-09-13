### Task 199: Fix `/api/summarize` returning 502 `provider_invalid_response`

**Severity: Broken on Cloudflare** · Found 2026-09-12 while validating the Cloudflare deployment. Extraction is unaffected; this breaks the generated titles on saved inputs.

#### Observed

Against the deployed Worker (`event-every.mannanteam.workers.dev`), a normal text submission produces:

```
200 /api/usage
200 /api/detect-urls
200 /api/scan
502 /api/summarize   {"error":"Provider request failed.","code":"provider_invalid_response"}
```

`/api/scan` was fixed separately (the `max_completion_tokens` → `max_tokens` correction in `src/platform/provider/transport.ts`). Summarize was not, and fails on a different mechanism.

#### Likely cause

`DurableSummaryReplaySchema` in `src/platform/provider/replay.ts` is far stricter than the prompt guarantees:

```ts
export const DurableSummaryReplaySchema = z.object({
  summary: bounded(96).refine((value) =>
    /^\p{Lu}\p{Ll}*(?:\p{Zs}+\p{Lu}\p{Ll}*){1,2}$/u.test(value)),
}).strict();
```

That regex admits only two or three words, each starting with an uppercase letter followed by lowercase letters, separated by single Unicode spaces. It rejects an acronym (`NYC`), a digit (`Q3 Planning`), any punctuation (`Team Standup — Friday`), a hyphen, a possessive, a single word, and four or more words. The summarize branch of `fixedProviderBody` sends `max_tokens: 16` with no `response_format`, so nothing constrains the model to that shape — it is asked in prose and validated against a near-unsatisfiable pattern. Any miss becomes `provider_invalid_response`, and the settlement path charges the full reservation for the failed call.

#### Decide first

- [ ] Establish whether the strict Title-Case shape is a real product requirement or an over-tight guard. The materialized value is a short human-readable label for input history; confirm what it must actually guarantee (length bound, no newlines, no control characters, no injected markup).
- [ ] Decide the failure posture. A missing history title should degrade to a fallback label rather than fail the request — confirm whether summarize is allowed to fail soft, and what the UI shows when it does.

#### Implement

- [ ] Constrain the model instead of only validating it: send a `json_schema` `response_format` for summarize the way scan does, so the shape is enforced at generation rather than discovered at parse time.
- [ ] Relax `DurableSummaryReplaySchema` to the guarantees actually required, allowing digits, acronyms, and ordinary punctuation. Keep the byte bound and keep `.strict()`.
- [ ] Add a deterministic fallback (for example, the first N characters of the source text, sanitized) so a rejected or absent summary never produces a 502 on the user's path.
- [ ] Verify the reservation/settlement consequence: a soft-failed summarize must not charge a full reservation or contribute to an owner-budget freeze. See Task 201.

#### Prove

- [ ] Unit tests covering the accepted and rejected summary shapes, including `NYC Trip`, `Q3 Planning`, `Team Standup`, a single word, and a four-word input.
- [ ] A test asserting the fallback path returns 200 with a usable label when the provider response fails validation.
- [ ] Re-run the deployed check: submit text against the Worker and confirm `/api/summarize` returns 200 and input history shows a title.

- Location: `src/platform/provider/replay.ts`, `src/platform/provider/transport.ts`, `src/app/api/summarize/`, `src/server/scanner/`
