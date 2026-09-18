# Cutting per-scan cost: synthesis

## The corrected cost picture

A real scan costs about $0.0008, not the $0.00026 the research started from; that low number came from a lagging usage counter. Most of that cost, 60 to 85 percent, is the answer the model writes back (750 to 1050 completion tokens at 4x the input price), not the image or the prompt. So the highest-leverage work is shrinking what the model has to say, not just what it has to look at.

## Ranked levers (percent of today's per-scan cost saved)

| Lever | Est. saving | Effort | Accuracy risk | Needs live 27-image eval first? |
| --- | --- | --- | --- | --- |
| Shrink the answer: drop offsets/locator from evidence, drop evidence for description, drop unused zone fields | 40-50% | Medium (schema change in vendored `@event-every/scanner`, plus app readers of evidence) | Medium — evidence isn't the extracted fields themselves, but schema structure changes are known to swing accuracy double digits | Yes, mandatory |
| Swap to a cheaper model with confirmed strict-schema support (Gemini 2.5 Flash-Lite or GPT-4.1-nano, both $0.10/$0.40 vs Mistral's $0.15/$0.60) | ~33% | Medium (new provider, re-verify schema mode, image tiling differs) | Unknown — no OCR/flyer benchmark exists for either candidate | Yes, mandatory |
| Downscale images client-side to 1024px long edge before upload | 15-25% | Small | Real — legibility drops below ~150ppi; small text/fine print at risk | Yes, before shipping |
| Guardrails: `max_price` ceiling + per-key spend cap on the OpenRouter key | ~0% (tail-risk cap, not a per-scan saving) | Small (minutes) | None | No |
| Prompt caching on the fixed system prompt | Near 0 | Small-medium | None | No |

## Where the sources disagree

- COST-MODELS' per-model dollar table assumed 200 completion tokens; COST-MEASURED shows real completions run 750-1050 tokens. Trust COST-MEASURED for absolute dollars — it's a real run, not a formula — but COST-MODELS' relative input/output rate comparisons across models are still useful once rescaled.
- COST-EVAL's $0.00026/image cost model is superseded by COST-MEASURED's $0.0008; trust COST-MEASURED, since the eval doc says up front it inherited the stale figure.
- COST-TOKENS reports downscaling cuts image+prompt tokens by ~46%, but since output tokens dominate total cost, the true total-cost saving is the smaller 15-25% figure from COST-MEASURED; use the total-cost number when deciding, not the token-count number.
- COST-MODELS lists several cheap candidate models (Gemma 3 4B, Qwen3 VL, Llama 4 Scout) as cost winners, but flags their strict-JSON-schema support as UNCONFIRMED; trust only the two models COST-MODELS itself confirms support strict schema (Gemini 2.5 Flash-Lite, GPT-4.1-nano) as real candidates.
- COST-TOKENS flags Mistral's OpenRouter caching support as undocumented and probably a no-op since the ~400-token fixed prompt sits below the typical 1,024-token cache-eligibility floor; treat prompt caching as not worth pursuing under the current model regardless of what other providers support.

## Recommended order of work

1. **Today, no eval needed:** set an OpenRouter `max_price` ceiling and a per-key spend cap on the production key. Minutes of work, caches no savings but stops a silent misroute or retry storm from costing 10-100x.
2. **This week:** implement client-side downscale to 1024px long edge before upload, then run the 27-image eval (about 2.2 cents) checking specifically the smallest-text real images (timestamps, small addresses) for legibility loss before shipping.
3. **Next:** cut the answer schema (drop evidence offsets/locator, drop possibleOffsets/sourceOffset when the source names no zone) in the vendored scanner package, then run the eval to confirm extraction accuracy didn't move.
4. **Then:** run a head-to-head eval of Gemini 2.5 Flash-Lite and GPT-4.1-nano against current Mistral Small on cost and accuracy before switching models in production.

## Not worth doing at this volume

- Bypassing OpenRouter for OpenAI/Gemini batch API discounts (saves about $0.0035 per nightly eval run)
- Chasing the UNCONFIRMED cheap models (Gemma 3 4B, Qwen3 VL, Llama 4 Scout, Llama 3.2 Vision) without any accuracy evidence
- Prompt caching on the current ~400-token fixed prompt
- Building out eval cost dashboards (Braintrust/LangSmith-style) at 27-image/night scale

## Open questions only a live test can answer

- Does dropping evidence offsets/locator actually hold extraction accuracy steady on the 27-image eval, and does any UI depend on those fields for verification?
- Do Gemini 2.5 Flash-Lite or GPT-4.1-nano match Mistral Small's real accuracy on actual flyers and screenshots, given no OCR-specific benchmark exists for either?
- At what downscale threshold does this app's own smallest real text (timestamps, addresses) start failing?
- Does OpenRouter bill the strict JSON schema as prompt tokens for Gemini/GPT-4.1-nano the way it apparently doesn't for Mistral, changing the cost math for a model swap?
- Would reordering schema fields (reasoning before label, per arXiv 2608.08254) recover any accuracy lost from shrinking the answer, for free?

## Sources

openrouter.ai/google/gemini-2.5-flash-lite, openrouter.ai/openai/gpt-4.1-nano, openrouter.ai/openai/gpt-5.4-nano, openrouter.ai/qwen/qwen3-vl-8b-instruct, openrouter.ai/mistralai/pixtral-12b, pricepertoken.com/pricing-page/model/google-gemini-2.5-flash-lite, pricepertoken.com/pricing-page/model/mistral-ai-pixtral-12b, llmreference.com/provider/openrouter/models, tokentab.dev/pricing/openrouter, openrouter.zendesk.com/hc/en-us/articles/39501163636379, costgoat.com/pricing/openrouter-free-models, llm-stats.com/models/compare/gemini-3.1-flash-lite-preview-vs-gpt-4.1-nano-2025-04-14, huggingface.co/docs/transformers/v4.52.1/en/model_doc/pixtral, medium.com/@yoelvis.orozco_42583/how-to-fine-tune-mistral-small-3-1-24b-instruct-2503-2a71e0a591f2, firebase.google.com/docs/ai-logic/count-tokens, gemini-api.apidog.io/doc-965860, developers.openai.com/api/docs/guides/images-vision, community.openai.com/t/how-do-i-calculate-image-tokens-in-gpt4-vision/492318/2, huggingface.co/Qwen/Qwen2-VL-7B-Instruct, arxiv.org/pdf/2409.12191, huggingface.co/docs/transformers/en/model_doc/mllama, huggingface.co/blog/llama32, arxiv.org/abs/2503.23667, image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8761511, github.com/icereed/paperless-gpt/issues/891, openrouter.ai/docs/guides/best-practices/prompt-caching, platform.openai.com/docs/guides/structured-outputs, community.openai.com/t/question-pricing-of-api-in-structured-format-mode/1013375, arxiv.org/abs/2608.08254, openrouter.ai/docs/guides/routing/provider-selection, openrouter.ai/docs/cookbook/administration/usage-accounting, openrouter.zendesk.com/hc/en-us/articles/51680687417499, developers.openai.com/api/docs/guides/batch, ai.google.dev/gemini-api/docs/pricing, promptfoo.dev/docs/configuration/caching, braintrust.dev/articles/how-to-track-llm-costs-2026, github.com/openai/evals, docs.langchain.com/langsmith/cost-tracking, inspect.aisi.org.uk/caching.html
