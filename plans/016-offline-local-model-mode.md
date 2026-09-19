# Plan 016: No Network Mode - run the scanner on a local model in the browser

**Revision 2**, 2026-09-14. Every factual claim below was verified against the
Hugging Face API, a primary source, or the local machine. An earlier revision
carried figures from unverified research; those are gone, not corrected in
place. Where something is unknown, this document says so rather than estimating.

## Status

- **Priority**: feature (maintainer-initiated)
- **Effort**: L, three stages
- **Risk**: MED. The architecture is proven by prior art; the open risk is
  extraction quality on photographed posters, which only measurement settles.
- **Planned at**: commit `8ead5cd`

## The feature

A **No Network Mode** control in the account menu opens a modal. The user
downloads a vision model into the browser; from then on scanning runs
on-device with no call to the scan provider.

Rejected at the outset: a packaged Mac app wrapping a webview and a localhost
server. No native shell, no bundled binary, no local server process.

## Locked decisions

1. **Download-first gating.** The Download control is live first. The No
   Network Mode radio stays disabled until verified weights are on disk. There
   is no state where the user is off-network with nothing to run.
2. **Entry point is the account dropdown**, beside `Sign out`
   (`src/components/account-bar/AccountBar.tsx:183`). The comment at
   `AccountBar.tsx:184` explains the menu's single-item styling; adding a second
   item invalidates it, so revise the comment and the styles rather than
   dropping an item in beside a stale rationale.
3. **Modal layout.** Header repeating the feature name with the radio beside it,
   Download button below.
4. **Progress survives navigation.** Closing the modal leaves a bottom
   toast-style progress bar running app-wide; reopening shows the same live
   state. This forces download state into a layout-level store that both the
   modal and the toast subscribe to. It cannot live in the modal.
5. **Completed state**: `✓ <model name> <size>GB downloaded and saved in the
   browser`, with `✕` at the far right.
6. **Delete is inline.** `✕` turns the row into
   `Are you sure you want to delete this?` on the left, `✓` and `Cancel` at the
   right. Confirming empties the store and re-disables the radio.
7. **Storage eviction is accepted risk.** Safari may evict the weights. Request
   persistent storage, handle the missing-weights path honestly, do not reorder
   the staging around it.
8. **Desktop only. iOS is out of scope.** iOS Safari caps the WebContent process
   near 1.0-1.5GB and the OS kills the tab past it; the largest model anyone has
   run there is 135M. The menu item must not appear on iOS, and since this is a
   platform limit rather than a missing feature, no "coming soon" affordance.
9. **Quality is settled by measurement**, against the scanner's existing eval
   harness and real poster photos, not by argument.

## What the codebase already gives us

- `vendor/event-every-scanner/dist/provider-ports.js` exposes a provider-port
  abstraction, and `runCoordinatedScanJob` takes its provider injected
  (`src/app/api/scan/route.ts:50`, `src/platform/runtime.ts:34`). **A local
  model is a third provider implementation, not a fork of the scan pipeline.**
- `@event-every/scanner` is ESM, `sideEffects: false`, and depends only on
  `zod`, `ical.js` and a Temporal polyfill - nothing Node-specific. Whether it
  runs unmodified in a browser is Stage 1's first task.
- Export, history, review and storage are already client-side and untouched.
- `public/` holds only fonts. No manifest, no service worker. Stage 3 starts
  from nothing.

## Prior art

**Faturlens** (`github.com/YASSERRMD/Faturlens`, Apache 2.0, June 2026) is this
architecture already shipped: browser-only invoice extraction on transformers.js
+ WebGPU, VLM in a dedicated Web Worker, two-pass pipeline, deterministic
validation gate, IndexedDB persistence, PWA keeping weights in Cache API with
the HF CDN excluded from the service worker via `navigateFallbackDenylist`.
Read it before writing Stage 2.

**GigScan** (HF blog, June 2026) is this exact task - gig posters to event JSON.
A 1.3B VLM fine-tuned on **276 labelled posters** reached 100% valid JSON and
100% field presence, with date-format compliance going from 34.3% to 100%. It is
not browser-native, and its model (MiniCPM-V) **has no ONNX export path** -
OpenBMB confirmed this in issue #1091 (April 2026). We cannot copy the model.
We take the finding: poster-to-JSON at 1.3B is solved.

## Strategy: two-pass, reason free and constrain late

"The Constraint Tax" (arXiv 2605.26128, 20 May 2026) measures schema-constrained
decoding on sub-3B models:

| Mode | Answer accuracy | Schema valid | Confidently wrong |
|---|---|---|---|
| Prompt for JSON | 19.7% | 61.5% | 49.5% |
| Hard schema constraint | 11.0% | 100% | 88.9% |

Its calendar tool-call benchmark: **91.5% executable accuracy prompting for
JSON, 48.0% under hard schema**, both 100% valid. A 43.5-point tax that persists
at 3B.

Constrained decoding buys validity and spends correctness. The failure it
produces is the one our contracts cannot catch: perfectly valid JSON containing
the wrong date. So:

1. **Pass 1 - read.** The model describes the poster in free text. No schema, no
   grammar, no constraint.
2. **Pass 2 - shape.** Convert that text into the JSON our contracts expect.
3. **Validate deterministically.** Zod plus explicit date sanity checks.
   Anything suspect routes into the review UI that already exists.

Faturlens arrived at the same two-pass split independently. This is the design,
not a workaround for missing tooling.

Tooling note either way: `llguidance` for transformers.js **v4 is not shipped** -
PR #1733 is open, unmerged, not on npm; the published `transformers-llguidance`
package is v3-only.

## Validated model candidates

Sizes are the sum of ONNX shards transformers.js actually fetches, measured from
the HF API on 2026-09-14. Not estimates.

| Model | HF repo | Download | Licence |
|---|---|---|---|
| WebBrain VL 2 450M | `webbrain-one/webbrain-vl-2-450M-onnx` | 481 MB | lfm1.0 |
| Moondream2 | `Xenova/moondream2` | 741 MB | Apache 2.0 |
| FastVLM-0.5B | `onnx-community/FastVLM-0.5B-ONNX` | 807 MB | apple-amlr |
| **Qwen3-VL-2B** | `onnx-community/Qwen3-VL-2B-Instruct-ONNX` | **1,372 MB** | **Apache 2.0** |
| Gemma 3n E2B | `onnx-community/gemma-3n-E2B-it-ONNX` | 2,912 MB | gemma |
| LFM2-VL-1.6B | `onnx-community/LFM2-VL-1.6B-ONNX` | 3,455 MB (fp16 only) | lfm1.0 |

**Qwen3-VL-2B is the pick.** It sits in the size band the evidence supports, and
it is Apache 2.0.

Size evidence: a 256M VLM fine-tuned for receipt extraction reached 99.2% valid
JSON but only **18.3% complete-record accuracy** - well-formed JSON full of wrong
values. GigScan's 1.3B reached 100% on both. The practitioner floor is ~1.3B.
**WebBrain 450M is carried only as a cheap control** to confirm that floor on our
own data; it is not expected to win.

Traps, each confirmed twice:

- **`LiquidAI/LFM2.5-VL-1.6B-ONNX` cannot be loaded.** Its files are named
  `embed_images`/`decoder`; the loader expects
  `vision_encoder`/`decoder_model_merged`. Found by direct file listing and
  independently by Faturlens (their PR #19). Use `onnx-community/LFM2-VL-1.6B-ONNX`.
- **`onnx-community/SmolVLM-*` does not exist** (HTTP 401 on the 2.2B, 500M and
  256M spellings). Real SmolVLM ONNX is under `HuggingFaceTB/`. SmolVLM2-2.2B has
  no ONNX build anywhere and cannot be used.
- **FastVLM is 807 MB, not the ~300 MB commonly cited.** Its research-only
  licence does not bar evaluation, only shipping.
- **Gemma 3n bundles an audio encoder** this product never uses; excluding it
  saves ~400 MB.
- The modal must render the measured size. Every candidate is well under the
  "4GB" in the original sketch.

## Performance and platform

Reported for a 1.3-2B VLM on Apple Silicon over WebGPU: cold load 2-5s, image
encode 0.5-1.5s, generation 3-10s. **Roughly 5-15 seconds per poster**, which the
maintainer has accepted. The WASM CPU path is 30-90 seconds.

**WebGPU is required, not an enhancement.** CPU is a "this browser cannot run
offline mode" message, not a slow mode.

Safari exposes WebGPU only on **macOS 26+**; `navigator.gpu` is undefined on
macOS 15 even with Safari 26 (WebKit commit 61fa3de withdrew it deliberately).
Verified locally: this machine is **macOS 26.2 with Safari 26.2**, so development
is unblocked.

Multi-threaded WASM needs `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, which affects `next.config.js` and
is fragile. Only relevant if the CPU path is ever supported.

## Stage 1 measured results (2026-09-14)

Run in **real Safari 26.2 on macOS 26.2**, Qwen3-VL-2B q4f16, weights served
from a local mirror, via the harness at `/dev/local-model`. Four runs.

**It works.** The pipeline produced a fully correct calendar event from a poster
image with no network call to any provider:

```
title      Midnight Signal          (correct)
startDate  2026-10-02T20:00:00      (correct)
endDate    2026-10-02T23:30:00      (correct)
location   1035 N Western Ave, Chicago
allDay     false
```

### Confirmed

- **`device: "webgpu"`.** Safari does expose WebGPU inside a dedicated Web
  Worker. The architecture's core assumption holds.
- **Pass 1 reads posters accurately.** Every ground-truth field appeared in the
  free-text description on every run.
- **The two-pass split works** once pass 2 is given the image (see below).

### Measured timings

| Run | Pass 1 | Pass 2 | Total | Outcome |
|---|---|---|---|---|
| 1 (cold) | 49.2s | 2.0s | 51.2s | pass 2 broken |
| 2 | 24.9s | 28.1s | 53.0s | pass 2 degenerate |
| 3 | 36.8s | 42.6s | 79.4s | correct fields, allDay wrong |
| 4 | 30.1s | 38.2s | 68.3s | **fully correct** |

**Roughly 70-80 seconds per poster, not the 5-15s the research reported.**
That figure does not survive contact with this model in this browser. The
first run is slower from shader compilation; steady state is still ~70s.
This is the single biggest open problem and it is a UX problem, not a
correctness one.

### Two bugs found by running it

1. **Text-only pass 2 is impossible with this model.** Qwen-VL derives its
   rotary position embeddings from the image grid, so a turn without an image
   degenerates into repeated `{`. Feeding the same prompt through the tokenizer
   instead of the processor does not help; the template is correct and the
   output is still garbage. **Both passes must carry the image**, which is
   roughly half the total cost.
2. **The model reported `allDay: true` alongside a correct `20:00` start time.**
   The code believed the flag and moved the event to midnight while keeping a
   23:30 end. This is precisely the schema-valid-but-wrong failure the Constraint
   Tax paper predicts. `allDay` is now derived from whether a start time exists,
   the flag is ignored, and the contradiction costs confidence. Pinned by a
   regression test quoting the real output.

### Known remaining inaccuracies

- The venue name ("The Empty Bottle") is dropped; the street address survives.
- The description merged two support acts, "Paper Wings" and "Coastal Static",
  into a hallucinated "Paper Static".

### What this does not yet prove

The test poster is a **clean digital render**, the easy case. Nothing here says
anything about photographed posters with angles, glare or stylised type. That is
the next measurement, and it needs real photos.

### Harness

`/dev/local-model` accepts `?auto=1&host=&poster=&collect=` and drives itself,
so it can be measured in a browser that cannot be remote-controlled (Safari
refuses WebDriver without "Allow Remote Automation", and no automatable browser
on this machine exposes WebGPU: Playwright Chromium and WebKit have none, Brave
disables it by default, and installing Chrome needs sudo). Weights are mirrored
to disk and served locally so re-runs never re-download 1.3GB.

## Staging

### Stage 1 - spike

Prove, in this order: the vendored scanner runs in a browser unmodified;
transformers.js loads Qwen3-VL-2B on this machine; the two-pass pipeline returns
a contract-valid event from a real poster photo. Measure wall-clock per scan and
accuracy against a small hand-labelled set. Output is evidence.

### Stage 2 - plain browser, no service worker

Local provider port behind the existing `runOperation` seam; inference in a Web
Worker; resumable download manager with integrity check, cancel and retry;
layout-level download store; the account-menu item and the modal in all five
states (empty, downloading, complete, confirm-delete, weights-missing); the
bottom toast. Chrome first, then Safari.

### Stage 3 - installed and offline

Manifest, service worker, install flow, persistent-storage request, and honest
recovery when the browser has evicted the weights.

## STOP conditions

- If Stage 1 measurement shows Qwen3-VL-2B cannot produce contract-valid events
  from real posters at usable accuracy, stop and report with the numbers. Do not
  quietly ship a text-only offline mode; that call is the maintainer's.
- If the vendored scanner needs Node built-ins, stop and report the specific
  imports before shimming.
