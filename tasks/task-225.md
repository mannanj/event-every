### Task 225: A throttled model no longer takes scanning down

Production returned `provider_rate_limited` for every scan, text and image
alike, because both variants are pinned to `mistralai/mistral-small-2603` and
that model was rate-limited on OpenRouter's shared upstream pool. One model
being busy was a total outage.

OpenRouter retries the next entry of a `models` array on any error from the one
before, so the fix is a chain rather than a swap. `mistral-small-2603` stays the
default and leads every chain; the backups are only reachable after it has
already failed, so its measured accuracy still describes what the app does.

- [x] Add `OWNER_MODEL_CHAINS` to the owner policy, each chain led by `OWNER_MODELS[variant]`
- [x] Send the chain as `models` from the fixed transport body, and never alongside a measurement override
- [x] Stop sending `reasoning: { exclude: true }`, which under `require_parameters` 404'd every qwen endpoint
- [x] Log the chain rather than a single model on the scan route, which no longer names who answered
- [x] Repair the stale `C1B-M17` mutation anchor, which had not matched the source since the eval seam landed
- [x] Pin the chain invariants: head equals the measured model, no duplicates, no US-hosted vendor
- [x] Validate both backups on the scan eval before they enter the chain
- Location: `src/platform/provider/policy.ts`, `src/platform/provider/transport.ts`, `src/app/api/scan/route.ts`, `scripts/run-c1-b-mutations.ts`
- [x] Upgrade resolve-timezone and summarize off the text-only v4-flash to v4.1-flash

Measured on scripts/measure-scan-reliability.ts, 2026-09-18, correct/schema:

| model | text | image | price | outcome |
|---|---|---|---|---|
| mistral-small-3.2-24b-instruct | 89% / 100% | 74% / 100% | 0.63x | second on both scan chains |
| bytedance-seed/seed-2.0-mini | 86% / 96% | 52% / 85% | 0.67x | third on scan-text |
| qwen3-vl-235b-a22b-instruct | 75% / 89% | 81% / 96% | 1.4x | third on scan-image |
| deepseek-v4.1-flash | 75% / 82% | 44% / 52% | 1.0x | non-scan variants only |
| glm-5.3-flash | 71% / 75% | - | 0.9x | rejected, malformed output |
| qwen3-vl-30b-a3b-instruct | 39% / 50% | - | 1.3x | rejected |
| mistral-medium-3-5 | 75% / 100% | 59% / 96% | 11.5x | rejected on price and dropped hours |

Verified against the live API under the app's own request body: the primary alone
answered 0 of 6 calls while throttled; the full chain answered 10 of 10. A healthy
head still serves, so the default is unchanged. `bun run check:prod-like` passes
text and image through the real Worker bundle while the primary is rate-limited.
