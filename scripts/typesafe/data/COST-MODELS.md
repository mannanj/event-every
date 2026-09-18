# Cheaper vision models for Event Every scans (Sept 2026)

Baseline: `mistralai/mistral-small-2603`, $0.15/$0.60 per M tok. Measured: 2100x1470 screenshot = 2577p+200c = $0.00051; small image = 613p+200c = $0.00017.

Note on tooling: OpenRouter's model pages are JS-rendered SPAs; static fetch tools return no pricing. All numbers below come from OpenRouter-scraping aggregators (pricepertoken.com, llmreference.com, tokentab.dev) cross-checked against each other and against WebSearch snippets of the live openrouter.ai pages. Where sources disagreed, both figures are shown and flagged UNCONFIRMED.

## 1-3: Shortlist, pricing, schema support, image billing, accuracy evidence

| Model (OpenRouter id) | Input $/M | Output $/M | json_schema strict? | Image billing | Context | Accuracy evidence |
|---|---|---|---|---|---|---|
| `google/gemini-2.5-flash-lite` | 0.10 | 0.40 | Yes — Google AI Studio route natively supports structured output/responseSchema | Token-based: ~258 tok flat ≤384px side; tiled 768x768 @ ~258 tok/tile above that | ~1M | No independent OCR/flyer benchmark found. Vendor claims only. Beats GPT-4.1-nano on CharXiv-R/GPQA/MMMLU per llm-stats.com comparison (general, not OCR-specific) |
| `openai/gpt-4.1-nano` | 0.10 | 0.40 | Yes — `response_format` accepted, OpenAI json_schema strict mode is standard on this family | Tile-based: 512px blocks, low-detail flat 85 tok, high-detail 85+170/tile | ~1,047,576 | No flyer/screenshot-specific benchmark found. General doc-extraction study (arxiv 2510.01235) shows GPT-4.1 (not nano) at F1 0.82-0.91 on structured property extraction — vendor-adjacent, not nano-specific |
| `openai/gpt-5-nano` (or `gpt-5.4-nano`) | 0.05 | 0.40 | UNCONFIRMED — OpenAI json_schema strict mode expected but not directly verified for this id on OpenRouter | UNCONFIRMED — no image-tile figures found for this id | UNCONFIRMED | None found |
| `mistralai/pixtral-12b` | 0.15 | 0.15 | Likely yes — same Mistral provider/schema plumbing as the currently-used Mistral Small, so `require_parameters: true` should route the same | UNCONFIRMED billing method | 128k (2024-era model) | None found; Pixtral 12B is a 2024 release, may be less current for 2026 doc-OCR tasks than newer entrants |
| `qwen/qwen3-vl-8b-instruct` | 0.117-0.195 (sources disagree) | 0.455-1.56 (sources disagree — high end is the "Thinking" variant) | UNCONFIRMED on OpenRouter; Qwen VL models often need `reasoning: {exclude: true}` support, unverified | UNCONFIRMED | UNCONFIRMED | None found |
| `meta-llama/llama-4-scout` | 0.08 | 0.30 | UNCONFIRMED | UNCONFIRMED | Large (10M claimed) | None found |
| `google/gemma-3-4b-it` | 0.04 | 0.08 | UNCONFIRMED — Gemma models have historically weaker strict-schema/function-calling compliance than Gemini/GPT | UNCONFIRMED | 128k | None found; 4B size is a real accuracy risk for dense flyer text vs. the ~small-to-mid models above |
| `meta-llama/llama-3.2-11b-vision-instruct` | 0.245 | 0.245 (single source, flat) | UNCONFIRMED | UNCONFIRMED | 128k | None found; 2024-era model, priced *worse* than current Mistral Small at scan-scale (see table below) — not actually a cost win, kept for completeness |
| Mistral OCR (`mistral-ocr-*`) | N/A | N/A | No — it's a page-to-markdown OCR endpoint, not a chat/json_schema completions model | Per-page (~$1/1000 pages, Mistral's own pricing, not confirmed on OpenRouter) | N/A | Not applicable to this pipeline without a second parsing pass; excluded as it does not satisfy "strict JSON" in one call |

## 3: Estimated cost per scan (computed from prices above; UNCONFIRMED prices flagged)

| Model | 1400p+200c | 2600p+200c | Rank (by 2600-tok cost) |
|---|---|---|---|
| Gemma 3 4B IT | $0.000072 | $0.00012 | 1 (cheapest, but accuracy/schema UNCONFIRMED) |
| GPT-5-nano | $0.00015 | $0.00021 | 2 (vision/schema UNCONFIRMED) |
| Llama 4 Scout | $0.000172 | $0.000268 | 3 (schema UNCONFIRMED) |
| Gemini 2.5 Flash-Lite | $0.00022 | $0.00034 | 4 (best *confirmed* schema support) |
| GPT-4.1-nano | $0.00022 | $0.00034 | 4 tied (best *confirmed* schema support) |
| Qwen3 VL 8B | $0.000255-0.00072 | $0.000395-0.0018 | 5-7 (wide range; thinking variant much pricier, exclude reasoning tokens unclear) |
| Pixtral 12B | $0.00024 | $0.00042 | 6 (same provider family as current model — lowest-friction swap) |
| **Mistral Small 3 (current)** | $0.00033 | $0.00051 | baseline |
| Llama 3.2 11B Vision | $0.000392 | $0.000686 | worse than baseline — not a real candidate |

## 4: Free tier / promo pricing, usable for 27-image nightly eval?

- OpenRouter free tier: accounts with <$10 lifetime credit get 50 requests/day across all `:free`-suffixed models; ≥$10 lifetime credit (even historically) unlocks 1,000 requests/day. Hard cap 20 req/min on any `:free` model regardless of balance. (Source: openrouter.zendesk.com rate-limits article, cross-checked with pricepertoken.com/costgoat.com free-model roundups, both Sept 2026.)
- `openrouter/free` auto-router (launched ~Feb 2026) picks among ~21-28 zero-cost models and filters for capabilities requested (vision, structured outputs, tools), per costgoat.com and buldrr.com listings.
- 27 images/night is well under both the 50/day and 1,000/day caps, and far under 20/min — **usable for a nightly eval either on the free tier or on a paid low-cost model**, but free-tier model identity is randomized/rotating, so it is not suitable for a *stable* accuracy comparison run over time; pin a specific paid cheap model (e.g., Gemini 2.5 Flash-Lite or GPT-4.1-nano) for the eval instead and reserve `openrouter/free` only for opportunistic cost-zero smoke tests.
- Could not confirm whether any specific free-tier model both supports vision AND `response_format: json_schema strict` AND `require_parameters: true` simultaneously — this combination narrows the free pool significantly and needs live testing against OpenRouter's `/api/v1/models` endpoint (attempted here but results were truncated/unreliable via automated fetch).

## Caveats
- Static-fetch tools could not render OpenRouter's model pages (client-side JS), so all pricing is via third-party aggregators / search snippets, not the primary source page content itself. Aggregator numbers for Gemini 2.5 Flash-Lite and GPT-4.1-nano agreed across 2+ independent sources; Qwen3 VL, Pixtral, Llama, and Gemma figures came from single or conflicting sources — treat as directional only.
- No OCR/flyer/screenshot-specific independent benchmark was found for any candidate; all accuracy signal is either vendor-published general benchmarks or absent entirely. This is a real gap — recommend running the existing 27-image nightly eval against the top 2 candidates before switching in production.
- Gemini has moved to 3.x Flash-Lite generations in 2026 at higher prices ($0.25-0.30 in/$1.50-2.50 out); 2.5 Flash-Lite pricing above assumes it is still live/routable on OpenRouter, unconfirmed to still be non-deprecated as of Sept 2026.

Sources: https://openrouter.ai/google/gemini-2.5-flash-lite , https://openrouter.ai/openai/gpt-4.1-nano , https://openrouter.ai/openai/gpt-5.4-nano , https://openrouter.ai/qwen/qwen3-vl-8b-instruct , https://openrouter.ai/mistralai/pixtral-12b , https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash-lite , https://pricepertoken.com/pricing-page/model/mistral-ai-pixtral-12b , https://www.llmreference.com/provider/openrouter/models , https://tokentab.dev/pricing/openrouter , https://openrouter.zendesk.com/hc/en-us/articles/39501163636379 , https://costgoat.com/pricing/openrouter-free-models , https://llm-stats.com/models/compare/gemini-3.1-flash-lite-preview-vs-gpt-4.1-nano-2025-04-14
