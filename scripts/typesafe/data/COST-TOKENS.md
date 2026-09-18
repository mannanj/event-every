# Vision token cost & caching research (2026-09-17)

## 1. How models count image tokens

- **Mistral Small 3.1 / Pixtral**: patch = 14px, merged into 2x2 blocks -> effective 28px "token cell". Long edge is capped at **1540px**, short edge rounded to the nearest multiple of 28. Approx formula: `tokens ~= (H/28) x (W/28)` after that resize. Source is HF/community fine-tuning writeups, not an official Mistral spec page — **not fully confirmed**. [Pixtral HF docs](https://huggingface.co/docs/transformers/v4.52.1/en/model_doc/pixtral), [fine-tune writeup](https://medium.com/@yoelvis.orozco_42583/how-to-fine-tune-mistral-small-3-1-24b-instruct-2503-2a71e0a591f2). Important: **Mistral already downscales anything above 1540px long edge server-side**, so a 2100px upload is being resized by the provider before it's ever tokenized.
- **Gemini 2.x / Flash-Lite**: fixed-tile scheme. Both dims <=384px -> flat **258 tokens**. Larger images are cropped/scaled into 768x768 tiles, each tile = **258 tokens**. [Firebase AI Logic: count tokens](https://firebase.google.com/docs/ai-logic/count-tokens), [Gemini API image understanding](https://gemini-api.apidog.io/doc-965860).
- **OpenAI GPT-4o-class**: low detail = flat 85 tokens; high detail = `85 + 170 x tiles`, tiles counted after scaling shortest side to <=768px and tiling in 512px squares. **GPT-4.1/5-nano class**: OpenAI's own docs say these are billed by measured post-hoc token usage, not a published tile formula — you can't precompute cost, only read it from the response (**unconfirmed exact formula**). [OpenAI images/vision guide](https://developers.openai.com/api/docs/guides/images-vision), [community thread](https://community.openai.com/t/how-do-i-calculate-image-tokens-in-gpt4-vision/492318/2).
- **Qwen2/2.5-VL**: patch 14px, merged 2x2 -> 28x28 effective cell; `tokens = pixels / (28x28)`, bounded by configurable min/max pixel windows (e.g. 100x28x28 to 16384x28x28). [Qwen2-VL HF](https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct), [Qwen2-VL paper](https://arxiv.org/pdf/2409.12191).
- **Llama 3.2 Vision (11B/90B)**: tile-based cross-attention vision tower, tile size 448px (11B base) or 560px (instruct/90B), patch 14px -> 32x32 = 1024 tokens/tile; reported real-world range ~1,601–6,404 tokens depending on resolution/tiling. These numbers come from community reverse-engineering, not an official Meta token-billing page (**unconfirmed**). [HF mllama docs](https://huggingface.co/docs/transformers/en/model_doc/mllama), [Llama 3.2 blog](https://huggingface.co/blog/llama32).

## 2. OCR legibility vs. resolution

- Peer-reviewed: multimodal LLMs **match conventional OCR at ~300 ppi** and **degrade significantly below ~150 ppi**; visual complexity of the glyphs has only a weak effect once resolution is controlled for (resolution dominates). [arXiv 2503.23667](https://arxiv.org/abs/2503.23667) (2025 paper, character-level OCR study).
- Community/practitioner guidance (not peer-reviewed): downscaling to a **max side of ~1000px** is usually enough to keep field-level text extraction working; moderate JPEG compression keeps text legible while cutting size a lot, but very small type or low-contrast scans should stay PNG/high-quality JPEG since compression artifacts blur thin strokes; grayscale helps *classical* OCR engines more than there is direct evidence it helps LLM vision specifically (**unconfirmed for LLM-vision case**). No single authoritative source; synthesized from OCR/IDP blog posts and a paperless-gpt GitHub issue reporting *worse* OCR from over-high resolution in one local-LLM setup. [USPTO grayscale OCR preprocessing note](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8761511), [paperless-gpt issue](https://github.com/icereed/paperless-gpt/issues/891).

## 3. OpenRouter prompt caching (per OpenRouter's own docs, fetched 2026-09-17)

| Provider | Mechanism | Min cacheable prefix | Cache-read discount |
|---|---|---|---|
| OpenAI | automatic | 1,024 tokens | 0.25x–0.50x |
| Gemini | explicit `cache_control` | 1,024 (2.5 Flash) / 4,096 (2.5 Pro) | 0.25x |
| DeepSeek | automatic | not specified | 0.1x |
| Qwen/Alibaba | explicit `cache_control: ephemeral` | not specified | 0.1x |
| Mistral | **not documented on this page at all** | — | — |

Source: [OpenRouter prompt-caching guide](https://openrouter.ai/docs/guides/best-practices/prompt-caching). **Mistral's caching support on OpenRouter could not be confirmed either way** — treat the current `mistral-small-2603` fixed prompt+schema as uncached.

Whether the `response_format` JSON schema counts as prompt tokens: confirmed for OpenAI — schema is serialized into the input and billed as input tokens (community estimate: ~200 tokens for a 500-field schema). [OpenAI structured outputs guide](https://platform.openai.com/docs/guides/structured-outputs), [community pricing thread](https://community.openai.com/t/question-pricing-of-api-in-structured-format-mode/1013375). Not explicitly documented per-provider elsewhere; reasonable to assume the same (**unconfirmed for Gemini/Mistral/Qwen specifically**).

Practical implication: even if you moved off Mistral to something OpenRouter shows as cache-capable, your fixed system prompt (~400 tok) + schema (a few hundred tok) may sit right at or under the 1,024-token minimum prefix for OpenAI/Gemini — caching may not even engage without padding the shared prefix.

## 4. Does schema/prompt length affect accuracy?

No study found that isolates "trim schema/prompt token count, holding meaning fixed" as a variable. Closest relevant result: a September 2026 paper on how much models weight schema descriptions vs. system prompts — conflicting instructions between prompt and schema caused large accuracy swings (Claude Haiku 4.5 dropped 52.5%→7%); GPT-4.1/GPT-5.4 schema-only performance underperformed system-prompt-only by 11–13 points; adding a reasoning field *before* the label field in the schema improved accuracy 15–24 points. Conclusion: **consistency and field ordering matter far more than raw length** — no evidence that shortening the schema itself (without changing semantics) helps or hurts. [arXiv 2608.08254](https://arxiv.org/abs/2608.08254).

## Recommendation

Add client-side downscale before upload: **long edge = 1024px, JPEG quality ~85** (fall back to PNG or quality ~95 for dense multi-column flyers / very small type). Using the task's own measurements, this cuts a typical 2100x1470 screenshot from **2,577 -> 1,381 image+prompt tokens, a ~46% reduction**, without touching the ~600-token fixed-prompt floor. Risk: per arXiv 2503.23667, legibility drops sharply below ~150ppi-equivalent text height, so validate against your smallest real fine-print screenshots (timestamps, small addresses) before shipping — 768px (1,176 tokens, ~54% reduction) is more aggressive and higher-risk for tiny text.
