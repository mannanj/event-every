# Measured cost anatomy of one real scan (2026-09-17)

Source: scripts/probe-scan-usage.ts running the app's real scan path (real
system prompt, real strict JSON schema, real provider settings) with
OpenRouter's per-request usage and cost. Model mistralai/mistral-small-2603,
$0.15/M input, $0.60/M output.

| Image | Size | Prompt tokens | Completion tokens | Cost |
| --- | --- | --- | --- | --- |
| real-01 (small listing card, 27 KB) | ~500 px | 784 | 1038 | $0.00074 |
| real-13 (2100x1470 screenshot, 209 KB) | 2100 px | 2751 | 881 | $0.00094 |
| real-19 (1088x1070 flyer, 1162 KB) | 1088 px | 2125 | 766 | $0.00078 |

Corrections to what the researchers were told:
- The real cost per scan is about $0.0008, not $0.00026. The $0.00026 came
  from a lagging key-usage counter and a probe with a tiny answer. A full
  27-image eval run is therefore about 2.2 cents, not 0.7.
- The answer (completion) is 60 to 85 percent of the cost of every scan,
  because it is 750 to 1050 tokens at four times the input price. The image
  is second. The fixed prompt is a small third.
- The strict JSON schema is 27,725 characters in the request body but is NOT
  billed as prompt tokens on this provider (a 784-token prompt cannot contain
  it). So schema length is a bandwidth cost, not a token cost, here.

Why the answer is so large (share of characters in one real answer):
- evidence bookkeeping on every field (sourceId, locator, excerpt,
  startOffset, endOffset): about 36 percent
- the temporal value with zoned points (possibleOffsets, sourceOffset,
  chosenOffset, resolution) per point: about 25 percent
- the actual title, description, location, and times: the rest

This answer shape is the vendored scanner contract (@event-every/scanner
ProviderScanObservation). Slimming it means changing that package's schema
and the app's readers of evidence, not a prompt edit.

Levers ranked by what the numbers say, before research:
1. Shrink the answer: drop offsets and locator from evidence, or drop
   evidence for description; drop possibleOffsets/sourceOffset when the
   source names no zone. Plausible 40 to 50 percent of total cost.
2. Downscale images to 1024 px long edge client-side: 30 to 45 percent of
   the image share, which is about 15 to 25 percent of total.
3. Cheaper model at equal quality: input and output rates both matter; a
   $0.10/$0.40 model saves a third across the board.
4. Fixed prompt caching: small, since the prompt is about 400 tokens.
