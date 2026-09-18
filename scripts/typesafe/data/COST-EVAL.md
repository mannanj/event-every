# Cutting OpenRouter eval cost for Event Every's scanner (27 images / 28 text cases)

Researched 2026-09-17. Sources dated 2026 unless flagged.

## 1. OpenRouter cost controls

- **`provider.sort: "price"`** — routes sequentially to the cheapest provider first, disabling normal load-balancing (same as the `:floor` model suffix). Caveat: cheapest ≠ worst by default — some providers (e.g. DeepInfra, Novita) run quantized (FP8/FP4) weights that can match full-precision quality, but you get no log signal when output quality silently shifts. Use `quantizations: ["fp8"]` (etc.) to bound precision if the eval is quality-sensitive. [Provider Routing docs](https://openrouter.ai/docs/guides/routing/provider-selection)
- **`allow_fallbacks: false`** — refuses the request if the pinned/top provider is down, instead of silently failing over to a pricier one. Good for reproducible eval cost, bad for reliability of a nightly job (adds "no run tonight" risk). [Provider Routing docs](https://openrouter.ai/docs/guides/routing/provider-selection)
- **`data_collection: "deny"`** — excludes providers that may log/train on prompts. Not a cost lever, but relevant since eval images may be sensitive test fixtures.
- **`max_price: { prompt: X, completion: Y }`** — hard price ceiling per million tokens; OpenRouter refuses to route if no provider is under it, rather than silently overspending. This is the most direct cost-safety control. [Provider Routing docs](https://openrouter.ai/docs/guides/routing/provider-selection)
- **`usage: { include: true }`** — **confirmed deprecated**, no longer needed. Every response now always includes a `usage` object with prompt/completion/reasoning tokens, cache read/write tokens, and cost. [Usage Accounting docs](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
- **`/generation` endpoint** — fetch exact post-hoc cost/tokens by generation ID; `upstream_inference_cost` is BYOK-only, otherwise 0/null. **`/activity` endpoint** exists for account-level historical usage but detail wasn't confirmed in the fetched page — *unconfirmed, check `openrouter.ai/docs/api-reference` directly*.
- **Per-key spend limits** — a key can carry an optional cap (`limit`, `limit_reset`: daily/weekly/monthly/none); requests over the cap are rejected before hitting the provider, so no overspend risk. Good fit for a dedicated "eval key." [OpenRouter key limits](https://openrouter.zendesk.com/hc/en-us/articles/51680687417499-Can-I-create-one-API-key-per-user-with-its-own-spending-limit-Management-API-keys)
- Caveat throughout: OpenRouter itself adds ~40ms routing overhead per request (minor at 27-image scale).

## 2. Batch/offline discounts

- **OpenAI Batch API**: flat **50% off** sync pricing, no volume tier, completes within 24h (commonly 1-6h). [OpenAI Batch docs](https://developers.openai.com/api/docs/guides/batch)
- **Google Gemini Batch API**: **50% off** input+output on every model, no SLA, up to 24h latency; batch and the 90% prompt-cache discount don't stack (cache wins if both apply). [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- **Mistral batch**: pricing exists but discount % **not confirmed** in this pass — check Mistral's own docs.
- **OpenRouter itself has no general batch/async discount** confirmed — batch pricing found only applies when calling OpenAI/Google directly, not through OpenRouter's routing layer. If the eval used OpenAI or Gemini vision directly (bypassing OpenRouter) for the nightly run specifically, batch mode would roughly halve that run's cost — but this requires a second code path and loses OpenRouter's provider fallback/observability.

## 3. Eval engineering practices that cut spend

- **promptfoo**: disk cache (`~/.promptfoo/cache`, via keyv) keyed by a composite of provider id + prompt content digest + config + context vars; successful responses cached, errors are not (so retries still cost). [Promptfoo caching docs](https://www.promptfoo.dev/docs/configuration/caching/)
- **Braintrust**: tracks token/cost per span, can set **cost limits that halt an eval run** if exceeded; recommends tracking cached-token fields separately since caching zeroes out repeat-call cost entirely. [Braintrust cost tracking](https://www.braintrust.dev/articles/how-to-track-llm-costs-2026)
- **OpenAI evals (open-source repo)**: **no built-in result caching** — teams layer a disk/Redis cache keyed on input hash themselves, and must remember to invalidate it when the rubric/scorer changes. Also recommends a two-stage design: generate once (cached), grade cheaply. [openai/evals](https://github.com/openai/evals)
- **LangSmith**: cost dashboards break out cache-hit vs cache-miss token cost, and support configurable per-model pricing plus spend limits on evaluator runs. [LangSmith cost tracking](https://docs.langchain.com/langsmith/cost-tracking)
- **Inspect AI (UK AISI)**: `cache-prompt` option reuses provider-side prompt caching (system/tool defs/history), reporting 4-way token breakdown (input/cache-write/cache-read/output); cache reads cost ~90% less on Anthropic. This is provider-side caching, not a full result-skip cache. [Inspect caching docs](https://inspect.aisi.org.uk/caching.html)
- None of these frameworks were confirmed to offer built-in "only re-run cases touched by a diff" logic — that's typically hand-rolled: hash `(model, prompt template version, image bytes, params)` and skip unchanged rows, which is exactly the promptfoo/OpenAI-evals caching pattern applied to your own case list.
- Stratified sampling with a fixed seed, and outlier token logging, weren't documented as a named built-in feature in any of the five frameworks in this search pass — they're general eval-design practice, not something to expect out of the box.

## 4. Cost model (27 images, $0.00026/image ≈ $0.00702/run for images alone)

| Runs/day | Cost/day (image-only) | Cost/day (with ~50% batch discount) |
|---|---|---|
| 1 | $0.007 | $0.0035 |
| 5 | $0.035 | $0.018 |
| 20 | $0.141 | $0.070 |

The whole budget is small — even 20 runs/day is ~$0.14/day (~$4/month). At this scale, **no tactic here saves meaningful absolute dollars**; the value is in avoiding accidental 10-100x blowups (wrong model routed, retry storms, someone bumping images to 4K) and in keeping the *text*-case run (28 cases, likely far cheaper than vision) similarly bounded.

- **`max_price` + per-key spend cap**: near-zero effort, saves you from a catastrophic misroute — matters at *any* frequency, including 1 run/day, because the risk is a spike not a steady cost.
- **Caching unchanged cases (hash of model+prompt+image+params)**: starts mattering once you run "after each prompt or code change" — if a code change touches parsing logic but not the prompt/model, a hash-based skip cuts that run's image cost by however many cases are untouched (often most of them). Meaningful once you're above ~5 runs/day or doing nightly + per-commit runs.
- **Batch API discount (bypassing OpenRouter, calling OpenAI/Gemini directly for the nightly run only)**: only worth the added code path once nightly runs are large or frequent (e.g. also running against multiple model candidates) — at 27 images it saves $0.0035/night, not worth the added complexity now.
- **Running only affected cases on prompt-only tweaks**: same order of value as caching — high leverage once you're iterating rapidly (many runs/day), negligible at 1/day.

**Recommendation ranked by effort vs. saving**: (1) set a per-key spend limit and `max_price` ceiling now — minutes of work, caps tail risk; (2) add a local result cache keyed on `(model, prompt hash, image hash, params)` so unaffected cases are skipped after code-only changes — this is the only tactic that scales savings with your stated usage pattern (frequent runs); (3) treat batch APIs and stratified sampling as not-yet-worth-it at current volume — revisit if run frequency or image count grows an order of magnitude.
