# Event Every Scanner Product Loop Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan one task at a time, and `verification-before-completion` before accepting each task.

**Goal:** Replace Event Every’s permissive parse-and-export path with the proven Event Scanner contracts, producing a simple text/image scan → transparent review/edit → standards-compliant ICS export loop.

**Architecture:** Event Every remains the host: it owns request validation, rate/budget policy, provider credentials and transport, opaque source resolution, browser state, and downloads. `@event-every/scanner` owns provider request/response validation, null-bearing `EventCandidate` truth, readiness diagnostics, and ICS bytes. The browser stores a `ReviewDraft` whose scanner candidate is the single source of truth; edits update that candidate and every export runs fresh readiness validation and generation.

**Stack:** Next.js 15 App Router, React 19, TypeScript 5, Bun test, Playwright, Zod 4, vendored `@event-every/scanner` package pinned to Scanner commit `98aec60cf9d87544196bfd0fa702c8170453bfd8`.

---

## Reconciled baseline and locked boundaries

- Event Every begins at `main@4cc32012ca510006ab672e8699f3e07c7c7b11a6`.
- This plan file is committed as the E1 planning artifact before Task 1. It is an allowed pre-implementation path in every `4cc32012..HEAD` audit; implementation commits do not modify it unless an accepted review finding first requires a plan revision.
- Event Scanner begins at clean `main@98aec60cf9d87544196bfd0fa702c8170453bfd8`.
- Preserve the existing untracked `.claude/`, `tasks/task-192.md`, and `tasks/task-193.md`; no task may stage, edit, or delete them.
- Scanner has no configured Git remote or published registry package. E1 therefore commits the exact built package under `vendor/event-every-scanner/` and declares `"@event-every/scanner": "file:vendor/event-every-scanner"`. A SHA-pinned script and provenance manifest make the snapshot reproducible. Publication may replace this seam later, but is not part of E1.
- Automated tests are offline. They use fixture transports or intercepted HTTP; they never read provider keys, call OpenRouter, spend money, deploy, or touch production data.
- Scanner evidence excerpts are deliberately preserved for transparent review and may equal all of a short text submission; each excerpt remains bounded by Scanner’s 240-character schema. “Raw-free review storage” means no request object, image data URL, file/blob, provider request/response, prompt, credential, or unbounded source body—not removal of bounded candidate evidence.
- Existing user-facing Recent input/draft history in IndexedDB remains unchanged in E1, including its current source-text/file semantics. The new Scanner review-draft store is separate and raw-free; redesigning or migrating Recent history is a later explicit privacy/product decision.
- E1 includes separate text or image scan, the existing host-side URL detect/scrape enrichment feeding Scanner as resolved text, review/edit, and single/multiple ICS export. A combined text+image submission is explicitly rejected without losing the draft or calling a provider because the proven Scanner ports have no mixed-source observation contract. Mixed multimodal scanning, Scanner-native link capture, email capture, browser/on-device models, deduplication, Calendar Casa integration, Cloudflare/D1/R2 migration, production deployment, and legacy-infrastructure retirement are later gates.

## File map

**Create**

- `docs/superpowers/plans/2026-07-29-event-every-scanner-product-loop.md` — reviewed and committed E1 authority (this file).
- `scripts/vendor-event-scanner.ts` — exact-SHA, clean-tree, verified-build vendor command.
- `scripts/assert-e1-paths.ts` — E1 staging/path allowlist guard.
- `scripts/assert-e1-protected.ts` — canonical protected-tree inventory guard.
- `scripts/e1-offline-preload.cjs` and `scripts/run-e1-offline.ts` — loopback-only, credential-scrubbed E1 gate.
- `vendor/event-every-scanner/{package.json,README.md,PROVENANCE.json,dist/**}` — deployable Scanner snapshot.
- `src/services/__tests__/scannerVendor.test.ts` — vendor provenance, root-allowlist, and offline-guard proof.
- `src/types/review.ts` — browser review-state contract.
- `src/services/scannerDraft.ts` and `src/services/__tests__/scannerDraft.test.ts` — candidate/draft projection and edits.
- `src/services/__tests__/urlServices.test.ts` — preserved URL-enrichment cancellation/signal proof.
- `src/types/scannerHttp.ts` — shared strict browser/API scan contract.
- `src/server/scanner/image.ts` and `src/server/scanner/__tests__/image.test.ts` — decoded image size/signature admission.
- `src/server/scanner/{transport.ts,scan.ts}` and `src/server/scanner/__tests__/{transport.test.ts,scan.test.ts}` — host-only provider boundary.
- `src/services/scanClient.ts` and `src/services/__tests__/scanClient.test.ts` — browser API seam.
- `src/services/scannerExporter.ts` and `src/services/__tests__/scannerExporter.test.ts` — Scanner-owned validation/generation/download.
- `src/services/reviewStorage.ts` and `src/services/__tests__/reviewStorage.test.ts` — versioned, raw-free draft persistence.
- `src/app/api/scan/route.ts` and `src/app/api/scan/__tests__/route.test.ts` — strict scan endpoint.
- `src/components/review/{ReviewDraftSection.tsx,ReviewDraftCard.tsx,ReviewDraftFields.tsx,ReviewIssues.tsx}` — Scanner-only review UI, separate from legacy/imported `CalendarEvent` components.
- `e2e/scanner-product-loop.spec.ts` and `docs/testing/e1-mutation-ledger.md` — offline loop proof and mutation evidence.

**Modify**

- `package.json`, `bun.lock` — local Scanner and direct Zod dependencies plus vendor/path-check scripts.
- `src/lib/llm.ts` and `src/lib/__tests__/llm.test.ts` — admit Scanner’s validated chat request without moving auth, fetch, 402 mapping, or metering.
- `src/app/page.tsx` — one scan handler and a separate `ReviewDraft[]` state while retaining imported/saved `CalendarEvent` paths.
- `src/services/{urlDetector.ts,webScraper.ts}` — thread the active scan-submission abort signal through preserved URL enrichment.
- `src/app/layout.tsx`, `src/app/globals.css`, `playwright.config.ts` — local font and offline Playwright boundary.
- `src/app/api/__tests__/limit-gating.test.ts`, `src/lib/__tests__/limits.test.ts` — replace the deleted parse-route gate fixture/token with `/api/scan`.
- `e2e/{community-limit.spec.ts,event-extraction.spec.ts,export-ics.spec.ts,draft-and-history.spec.ts,inline-edit-timezone.spec.ts,timezone-resolution.spec.ts,url-scrape.spec.ts,helpers.ts}` — migrate every live parse-path assertion to the Scanner loop.
- `README.md`, `.env.example` — document the host/package boundary and supported provider configuration.

**Delete only in Task 9, after replacement proof**

- `src/app/api/parse/route.ts`
- `src/services/parser.ts`
- `src/services/__tests__/parser.test.ts`

## Task 1: Make the Scanner package reproducible and installable

**Files**

- Create: `scripts/vendor-event-scanner.ts`
- Create: `scripts/assert-e1-paths.ts`
- Create: `scripts/assert-e1-protected.ts`
- Create: `scripts/e1-offline-preload.cjs`
- Create: `scripts/run-e1-offline.ts`
- Create: `vendor/event-every-scanner/package.json`
- Create: `vendor/event-every-scanner/README.md`
- Create: `vendor/event-every-scanner/PROVENANCE.json`
- Create: `vendor/event-every-scanner/dist/**`
- Create: `src/services/__tests__/scannerVendor.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `playwright.config.ts`

**Step 1: Write the failing provenance test**

`src/services/__tests__/scannerVendor.test.ts` must:

1. load `vendor/event-every-scanner/PROVENANCE.json`;
2. assert `sourceCommit` equals `98aec60cf9d87544196bfd0fa702c8170453bfd8`;
3. assert `packageName` equals `@event-every/scanner`;
4. recompute SHA-256 for every sorted `files[]` entry, including staged `package.json`, `README.md`, and every `dist/**` file, and require exact matches;
5. reject every vendor-root entry outside the exact allowlist `PROVENANCE.json`, `package.json`, `README.md`, and `dist/**`; and
6. import `EventCandidateSchema`, `validateForIcs`, and `generateIcs` from `@event-every/scanner`, plus `createOpenRouterTextLinkProvider` from `@event-every/scanner/openrouter`, proving both export surfaces resolve.

Run `bun test src/services/__tests__/scannerVendor.test.ts --isolate`. It must fail because the local dependency and manifest do not exist.

**Step 2: Implement the vendor command**

`scripts/vendor-event-scanner.ts` accepts exactly one positional Scanner checkout path and no environment-based fallback. It must:

- resolve the path and run `git rev-parse HEAD`, requiring the pinned full SHA;
- run `git status --porcelain`, requiring an empty result;
- run `bun run verify` in that checkout with provider credential variables explicitly removed from the child environment;
- delete only a newly created temporary staging directory from `mkdtemp`, never the live vendor directory;
- copy `package.json`, `README.md`, and `dist/` into staging;
- rewrite the staged package to retain only `name`, `version`, `private`, `type`, `sideEffects`, `exports`, and runtime `dependencies`;
- enumerate staged `package.json`, `README.md`, and every `dist/**` file in lexical order and record lowercase SHA-256 digests;
- write `PROVENANCE.json` with schema version `1`, package name, source commit, and file/digest entries; and
- rename any existing vendor directory to a sibling backup, rename staging into the target, roll the backup back if the second rename fails, and remove the backup only after the new target is installed.

Do not record a local source path, username, timestamp, credential, or environment value in the artifact.

Add exact dependencies:

```json
{
  "dependencies": {
    "@event-every/scanner": "file:vendor/event-every-scanner",
    "zod": "4.4.3"
  },
  "scripts": {
    "vendor:scanner": "bun scripts/vendor-event-scanner.ts",
    "assert:e1-paths": "bun scripts/assert-e1-paths.ts",
    "assert:e1-protected": "bun scripts/assert-e1-protected.ts",
    "verify:e1:offline": "bun scripts/run-e1-offline.ts"
  }
}
```

Preserve every existing script and dependency. `scripts/assert-e1-paths.ts` takes a base revision and head revision, unions paths from `git diff --name-only <base>..<head>`, `git diff --name-only`, and `git diff --cached --name-only`, and fails unless every path is in the file map in this plan, including this already committed plan path. It explicitly rejects staging `.claude/**` and `tasks/task-192.md`/`tasks/task-193.md`.

`scripts/assert-e1-protected.ts` recursively inventories exactly `.claude`, `tasks/task-192.md`, and `tasks/task-193.md` without following symlinks. For each path it emits a canonical lexical record: `d<TAB>path`, `l<TAB>path<TAB>link-target`, or `f<TAB>path<TAB>byte-length<TAB>sha256`; it sorts all newline-terminated records, hashes their concatenation with SHA-256, and requires `b942bbc69387c45f23708c70c4aa96c99e6a91666fee4a089e318412f7c6e2d5` (53,300 records at reconciliation). Missing roots, unreadable entries, unsupported file types, record-count drift, or digest drift fail. This content proof supplements the staging guard and runs before every E1 commit and at terminal acceptance.

**Step 3: Establish the fail-closed offline runner**

`scripts/e1-offline-preload.cjs` sets `globalThis.__E1_OFFLINE_GUARD__ = true` and wraps `fetch`, `http.request/get`, `https.request/get`, `net.connect/createConnection`, and `tls.connect`. It permits only `localhost`, `127.0.0.0/8`, and `::1`; every other destination throws `E1_OFFLINE_EGRESS_BLOCKED` before socket creation. Its own unit probes must show loopback admission and public-IP/hostname rejection.

`scripts/run-e1-offline.ts` creates a sanitized child environment by finding every current or `.env.local` variable name containing `OPENROUTER`, `ANTHROPIC`, `API_KEY`, `TOKEN`, `SECRET`, `CLOUDFLARE`, `RESEND`, or `KV_REST` and setting its child value to the empty string; it reads variable names only and never prints or copies values. It also sets `E2E_TARGET=''`, `E2E_PROD_URL=''`, `E1_OFFLINE=1`, `E1_OFFLINE_PRELOAD=<absolute preload path>`, and `NODE_OPTIONS=--require=<absolute preload path>`. Empty predeclared values prevent Next’s env loader from repopulating `.env.local` credentials.

Because pinned Bun 1.3.13 ignores `NODE_OPTIONS=--require`, the runner first executes separate Bun and Node probes that require `globalThis.__E1_OFFLINE_GUARD__ === true`, attempt `fetch('http://192.0.2.1')`, and pass only when the synchronous/rejected error code is `E1_OFFLINE_EGRESS_BLOCKED`; if preload is absent they exit before attempting fetch. It then runs, stopping on first failure:

```text
bun --preload=<absolute preload path> test src --isolate
node --require=<absolute preload path> node_modules/typescript/bin/tsc --noEmit
node --require=<absolute preload path> node_modules/eslint/bin/eslint.js .
node --require=<absolute preload path> node_modules/next/dist/bin/next build
node --require=<absolute preload path> node_modules/@playwright/test/cli.js test
```

When `E1_OFFLINE=1`, `playwright.config.ts` must not load `.env.local`, must force the local base URL, must start its web server with `node --require=<absolute preload path> node_modules/next/dist/bin/next dev -p 3777`, and must configure the browser proxy as `http://127.0.0.1:9` with loopback bypass. Remove `next/font/google` from `src/app/layout.tsx`; define `--font-press-start` and `--font-bubblegum` as local/system fallback stacks in `globals.css`, retaining the existing local Wichy font. A test scans `layout.tsx`, the resolved offline web-server command, and the offline child environment to prove no Google-font import or production target survives, the server has the preload, and every credential-shaped value is empty.

**Step 4: Generate and prove**

Run:

```bash
bun run vendor:scanner /Users/manblack/Documents/event-scanner
bun install
bun test src/services/__tests__/scannerVendor.test.ts --isolate
bun run type-check
bun run verify:e1:offline
bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
bun run assert:e1-protected
git diff --check
```

Expected: vendor test and typecheck pass; path guard reports only Task 1 paths. Commit only Task 1 paths with message `build(event-every): vendor proven scanner package`.

## Task 2: Establish `ReviewDraft` as the browser authority

**Files**

- Create: `src/types/review.ts`
- Create: `src/services/scannerDraft.ts`
- Create: `src/services/__tests__/scannerDraft.test.ts`

**Step 1: Define the contract and failing tests**

`src/types/review.ts`:

```ts
import type {
  CandidateField,
  EventCandidate,
  IcsReadiness,
  ScannerIssue,
  SourceHandle,
} from '@event-every/scanner';

type ReviewSourceHandle = Extract<SourceHandle, { kind: 'text' | 'image' }>;

export type ReviewSource = Readonly<{
  handle: ReviewSourceHandle;
  label: string | null;
}>;

export type ReviewDraft = Readonly<{
  id: string;
  exportUid: string;
  createdAt: string;
  candidate: EventCandidate;
  scanIssues: readonly ScannerIssue[];
  readiness: IcsReadiness;
  source: ReviewSource;
}>;

export type ReviewFieldEdit =
  | Readonly<{ field: Exclude<CandidateField, 'sourceUid' | 'temporal' | 'recurrence'>; value: string | null }>
  | Readonly<{ field: 'temporal'; value: EventCandidate['temporal']['value'] }>
  | Readonly<{ field: 'recurrence'; value: EventCandidate['recurrence']['value'] }>;
```

Tests must prove:

- a null provider title remains null and is never replaced with “Untitled Event”;
- missing start remains missing and yields a readiness blocker;
- draft identity, export UID, and creation time are injected inputs, not generated inside pure logic;
- a human string edit sets the selected value, `confidence: null`, and `evidence: []`, leaving every other claim byte-for-byte equal;
- temporal and recurrence edits follow the same evidence-free rule;
- editing a field removes only stale `candidate.issues` entries for that field before readiness is recomputed, so repairing recurrence/temporal/URL claims clears their old blockers while unrelated candidate issues remain;
- an evidence-free human zoned edit at a DST fold remains blocked by Scanner’s `dst_fold` contract; clearing the timezone converts the edit to a floating point and yields Scanner’s warning instead of fabricating offset evidence;
- clearing a field restores `null`, not an empty-string substitute; and
- every edit recomputes readiness.

Run the focused test and observe missing-module failure.

**Step 2: Implement pure draft construction and editing**

`src/services/scannerDraft.ts` exports:

```ts
export function createReviewDraft(
  candidate: EventCandidate,
  scanIssues: readonly ScannerIssue[],
  source: ReviewSource,
  identity: Readonly<{ id: string; exportUid: string; createdAt: string }>,
): ReviewDraft;

export function editReviewDraft(
  draft: ReviewDraft,
  edit: ReviewFieldEdit,
): ReviewDraft;
```

Both functions parse candidate input through `EventCandidateSchema`. `createReviewDraft` calls `validateForIcs(candidate, { uid: exportUid, dtstamp: createdAt, prodId: '-//Event Every//Scanner//EN' })`. `editReviewDraft` immutably replaces exactly one claim with `{ value, confidence: null, evidence: [] }`, filters `candidate.issues` only where `issue.field === edit.field`, reparses, and calls the same readiness policy. No function reads the clock, generates UUIDs, or invents event data.

**Step 3: Prove and commit**

Run:

```bash
bun test src/services/__tests__/scannerDraft.test.ts --isolate
bun run type-check
bun run lint
bun run assert:e1-protected
git diff --check
```

Commit only Task 2 paths with message `feat(event-every): add scanner review draft model`.

## Task 3: Add the host-only provider transport and scan orchestration

**Files**

- Create: `src/server/scanner/transport.ts`
- Create: `src/server/scanner/scan.ts`
- Create: `src/server/scanner/__tests__/transport.test.ts`
- Create: `src/server/scanner/__tests__/scan.test.ts`
- Modify: `src/lib/llm.ts`
- Modify: `src/lib/__tests__/llm.test.ts`

**Step 1: Write offline failing tests**

Transport tests use an injected `openRouterChat` spy. They must prove:

- the Scanner request is forwarded once with Event Every’s `{ key, mode }` auth;
- `usage.cost` remains recorded exactly once by `openRouterChat`;
- provider errors are not retried;
- a typed upstream `503` becomes Scanner’s HTTP failure shape so the adapter can enforce the privacy-endpoint error;
- empty, text, or malformed-JSON non-2xx bodies are checked status-first: community `402` still maps to `CommunityLimitError`, `503` still becomes typed privacy-endpoint failure, and other statuses use only `OpenRouter API error` without exposing body text;
- the returned value contains only the provider JSON body expected by Scanner; and
- no key appears in serialized success or error values.

Scan tests use fake `TextLinkProviderPort` and `VisionProviderPort` objects. They must prove:

- a text job invokes only its text port and an image job invokes only its vision port;
- multiple candidates preserve null claims and sorted Scanner issues;
- the host generates candidate IDs using injected `candidateIdFactory`; and
- one request causes one provider attempt.

Run both tests and observe missing-module failures.

**Step 2: Implement the narrow host adapter**

Modify `src/lib/llm.ts` so `OpenRouterMessage` is exported and `openRouterChat` accepts `OpenRouterChatOptions | OpenRouterChatRequest` without widening role/content/tool schemas to `unknown`. When given a Scanner request it forwards the exact `response_format`, `temperature`, `max_completion_tokens`, `reasoning`, `provider`, and `stream` fields; it does not translate them into the legacy tool-call request. Check `response.ok/status` before requiring JSON: map community `402` immediately, safe-parse any other error JSON only for the existing `error.message`, fall back to `OpenRouter API error` for empty/text/malformed bodies, and never copy a raw body. Add an exported `OpenRouterUpstreamError` carrying `status` and `retryable`; non-402 HTTP failures throw this type with `retryable = status === 408 || status === 429 || status >= 500`. A successful malformed JSON response remains a sanitized failure. Keep `fetch`, credentials, 402 mapping, and usage accounting in `openRouterChat`.

`src/server/scanner/transport.ts` imports `type OpenRouterTransport` from `@event-every/scanner/openrouter` and exports:

```ts
export function createEventEveryOpenRouterTransport(
  auth: LlmCallAuth,
  call: typeof openRouterChat = openRouterChat,
): OpenRouterTransport;
```

The returned `complete` method performs exactly one `call(request, auth)`. Success returns `{ ok: true, body }`. A thrown `CommunityLimitError` becomes `{ ok: false, failure: 'http', status: 402, retryable: false }`; `OpenRouterUpstreamError` becomes `{ ok: false, failure: 'http', status, retryable }`; every other thrown value becomes `{ ok: false, failure: 'network', status: null, retryable: false }` without copying its message or stack. This is necessary because Scanner deliberately sanitizes thrown transports; Task 4 maps the resulting community-mode `ProviderAdapterError.status === 402` back to the existing community-limit response. The transport never logs request bodies or credentials and never retries.

`src/server/scanner/scan.ts` defines:

```ts
export type HostScanJob =
  | Readonly<{
      kind: 'text';
      handle: Extract<SourceHandle, { kind: 'text' }>;
      provider: TextLinkProviderPort;
    }>
  | Readonly<{
      kind: 'image';
      handle: Extract<SourceHandle, { kind: 'image' }>;
      provider: VisionProviderPort;
    }>;

export type HostScanResult = Readonly<{
  candidates: readonly EventCandidate[];
  issues: readonly ScannerIssue[];
}>;

export async function scanSource(
  job: HostScanJob,
  dependencies: Readonly<{
    candidateIdFactory: CandidateIdFactory;
  }>,
): Promise<HostScanResult>;
```

Call the selected provider once, convert its observation with `candidatesFromProviderObservation`, validate every candidate with `EventCandidateSchema`, and return only the converted observation’s top-level scan issues through `sortIssues`. Candidate-specific issues remain on their own candidate and are not duplicated across drafts. Do not add confidence filtering, default dates, title fallback, retries, or raw source fields.

**Step 3: Prove and commit**

Run:

```bash
bun test src/server/scanner src/lib/__tests__/llm.test.ts --isolate
bun run type-check
bun run lint
bun run assert:e1-protected
git diff --check
```

Commit only Task 3 paths with message `feat(event-every): host scanner provider boundary`.

## Task 4: Replace the permissive parse endpoint with a strict scan API

**Files**

- Create: `src/types/scannerHttp.ts`
- Create: `src/server/scanner/image.ts`
- Create: `src/server/scanner/__tests__/image.test.ts`
- Create: `src/app/api/scan/route.ts`
- Create: `src/app/api/scan/__tests__/route.test.ts`
- Create: `src/services/scanClient.ts`
- Create: `src/services/__tests__/scanClient.test.ts`
- Modify: `src/app/api/__tests__/limit-gating.test.ts`
- Modify: `src/lib/__tests__/limits.test.ts`

**Step 1: Define strict HTTP contracts**

`src/types/scannerHttp.ts` exports:

```ts
import { EventCandidateSchema, ScannerIssueSchema } from '@event-every/scanner';
import { z } from 'zod';

const ScannerImageDataUrlSchema = z
  .string()
  .max(12_000_000)
  .regex(
    /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  )
  .refine((value) => value.slice(value.indexOf(',') + 1).length > 0);

export const E1SourceHandleSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    sourceId: z.string().min(1),
    kind: z.literal('text'),
    contentHandle: z.string().min(1),
  }),
  z.strictObject({
    sourceId: z.string().min(1),
    kind: z.literal('image'),
    contentHandle: z.string().min(1),
  }),
]);

export const ScanRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    text: z.string().max(100_000).refine((value) => value.trim().length > 0),
  }),
  z.strictObject({
    kind: z.literal('image'),
    dataUrl: ScannerImageDataUrlSchema,
  }),
]);

export const ScanResponseSchema = z.strictObject({
  source: E1SourceHandleSchema,
  candidates: z.array(EventCandidateSchema).max(50),
  issues: z.array(ScannerIssueSchema),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type ScanResponse = z.infer<typeof ScanResponseSchema>;
```

The browser response deliberately contains an opaque source handle and candidates, not `ReviewDraft`s or raw source material. IDs, export UID, and timestamp for browser review state are created at the browser boundary. Relative-date context is intentionally absent because the proven Scanner ports do not accept host context; supporting it requires a later Scanner contract.

**Step 2: Write failing route/client tests**

`src/server/scanner/__tests__/image.test.ts` covers valid PNG/JPEG/WebP signatures, declared-MIME spoofing for all three formats, invalid base64, empty bytes, and decoded payloads above 8 MiB. `src/server/scanner/image.ts` exports:

```ts
export const MAX_SCANNER_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateScannerImageDataUrl(
  dataUrl: string,
): Readonly<{ mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; byteLength: number }>;
```

It strictly decodes base64 once, requires `0 < byteLength <= MAX_SCANNER_IMAGE_BYTES`, and matches magic bytes: PNG `89 50 4e 47 0d 0a 1a 0a`, JPEG `ff d8 ff`, or WebP `RIFF` at bytes 0–3 plus `WEBP` at bytes 8–11. It returns metadata only and drops decoded bytes.

Route tests inject or mock the scan host and verify:

- invalid JSON, unknown keys, empty/whitespace-only text, non-png/jpeg/webp images, malformed/empty base64, and oversized input return `400` before budget/rate charge or provider call;
- syntactically valid spoofed-MIME or decoded-oversize images return `400` before `evaluateLimits`, `chargeIpRate`, resolver, or transport;
- budget exhaustion remains `402`, IP exhaustion remains `429`, and an accepted request charges the IP gate once;
- the route imports `randomUUID` from `node:crypto` and constructs one opaque `SourceHandle`;
- integration cases use the real Scanner text/vision adapters with a fixture transport: each resolver accepts only the route-created handle, a mismatched handle reaches the selected adapter but fails before transport invocation, raw input exists only in the resolver result, and candidates/issues/response contain no request object or image data URL;
- response bodies contain the opaque source handle and pass `ScanResponseSchema`;
- a community-mode `ProviderAdapterError` with status `402` maps to the existing `communityLimitResponse`; `privacy_endpoint_unavailable` maps to `{ error: 'No privacy-compatible model endpoint is available.', code: 'privacy_endpoint_unavailable' }`/`503`; every other `ProviderAdapterError` maps to `{ error: 'The provider could not scan this source.', code: 'scan_provider_failed' }`/`502`, without stack, raw input, upstream response, key, or provider prompt; and
- unexpected failures return `{ error: 'Unable to scan this source.' }` with status `500`.

Client tests replace `globalThis.fetch` and verify one POST to `/api/scan`, strict response parsing, abort-signal forwarding, stable handling of 402/429, and rejection of a `200` response with an invented field.

Migrate `src/app/api/__tests__/limit-gating.test.ts` to import the new scan POST with a valid strict text body. Change the neutral request URL in `src/lib/__tests__/limits.test.ts` from `/api/parse` to `/api/scan`; preserve every existing limit-order/count assertion.

**Step 3: Implement one request/one response**

`src/app/api/scan/route.ts` performs this order:

1. parse JSON and `ScanRequestSchema.safeParse`;
2. for image input, call `validateScannerImageDataUrl` and discard its metadata after admission;
3. call `evaluateLimits`;
4. derive mode/key with existing helpers;
5. create `sourceId` and `contentHandle` using `randomUUID()` from `node:crypto`;
6. build the exact `SourceHandle`;
7. call `chargeIpRate` once for the admitted request, before provider work;
8. create only the selected Scanner OpenRouter adapter with `createEventEveryOpenRouterTransport`, and a resolver closure that rejects any non-matching handle;
9. call `scanSource` once with candidate IDs from `randomUUID`; and
10. validate `{ source, candidates, issues }` through `ScanResponseSchema`.

The route is non-streaming. It must not log body content, data URLs, provider bodies, or errors containing them.

`src/services/scanClient.ts` exports:

```ts
export async function scan(
  request: ScanRequest,
  signal?: AbortSignal,
): Promise<ScanResponse>;
```

It is the sole browser `fetch('/api/scan')` seam and validates both request and success response. Preserve the existing community-limit response code/reset fields through a typed `ScanClientError`.

**Step 4: Prove and commit**

Run:

```bash
bun test src/app/api/scan src/server/scanner/__tests__/image.test.ts src/services/__tests__/scanClient.test.ts --isolate
bun test src/app/api/__tests__/limit-gating.test.ts src/lib/__tests__/limits.test.ts --isolate
bun run type-check
bun run lint
bun run assert:e1-protected
git diff --check
```

Commit only Task 4 paths with message `feat(event-every): expose strict scanner API`.

## Task 5: Move the page and review UI to null-bearing Scanner drafts

**Files**

- Modify: `src/app/page.tsx`
- Modify: `src/services/__tests__/scannerDraft.test.ts`
- Create: `src/services/__tests__/urlServices.test.ts`
- Modify: `src/services/urlDetector.ts`
- Modify: `src/services/webScraper.ts`
- Create: `src/components/review/ReviewDraftSection.tsx`
- Create: `src/components/review/ReviewDraftCard.tsx`
- Create: `src/components/review/ReviewDraftFields.tsx`
- Create: `src/components/review/ReviewIssues.tsx`

**Step 1: Write failing interaction tests**

Extend `src/services/__tests__/scannerDraft.test.ts`; visible behavior and request cancellation are proved through the existing Playwright stack in Task 8 because this repository has no component-rendering test dependency. The focused tests must show:

- absent title, location, URL, end, and recurrence remain null and produce the exact Scanner readiness warnings/omissions;
- missing start and unknown all-day state produce blockers while optional-field absence produces warnings only;
- changing a field through `editReviewDraft` removes provider confidence/evidence for only that claim and recomputes readiness; and
- constructing N drafts from one response accepts N injected IDs/UIDs and one injected UTC timestamp without calling a clock or UUID source internally.

**Step 2: Replace the three duplicated parse/SSE paths**

In `src/app/page.tsx`:

- replace only text/image scan-created `CalendarEvent`s with a separate `ReviewDraft[]`; retain `unsavedEvents: CalendarEvent[]` and `UnsavedEventsSection` for imported ICS files, and retain saved history unchanged;
- introduce one `runScan(request: ScanRequest, signal: AbortSignal)` callback used by text and image submissions;
- own one `AbortController` per active scan submission, abort it on explicit cancellation/unmount, and clear it only if it is still current;
- for an images-only submission, convert each supported file to a data URL and await `runScan` sequentially with the same submission signal, appending each response; this preserves multiple-image input without overlapping requests or canceling sibling images;
- call `scan()` exactly once per `runScan`;
- capture `const createdAt = new Date().toISOString()` once after a successful response;
- call `createReviewDraft(candidate, response.issues, { handle: response.source, label: null }, { id: crypto.randomUUID(), exportUid: \`${crypto.randomUUID()}@event-every\`, createdAt })` for each candidate;
- preserve the existing Recent-history summary update by passing only non-null candidate title values as `eventTitles`; do not convert drafts into `CalendarEvent`;
- remove all three SSE readers and the `ParsedEvent → CalendarEvent` converter; and
- do not infer title, start, end, timezone, all-day, or duration.

If a submission contains both non-whitespace text and one or more images, keep the SmartInput draft intact, make no `/api/scan` call, and show the accessible message `Scan text and images separately for now.` Add the corresponding intercepted-network E2E assertion in Task 8.

Preserve the existing URL detect/scrape branch as explicit host enrichment. Change `detectURLs(text, signal)`, `scrapeURLsBatch(urls, signal)`, and their internal fetches to accept the active scan-submission signal; an abort is rethrown rather than converted into a scrape-error record. `urlServices.test.ts` proves signal forwarding and abort propagation. Successful scraped records are converted to text blocks `Original Event: <normalized-url>\n<scraped-text>`, combined with non-URL remaining text in input order using two newlines, and passed once to `runScan({ kind: 'text', text: combinedText }, controller.signal)`. No Scanner `link` handle is created in E1. A failed scrape keeps the current user-visible error behavior and does not fall through to a provider call with an empty string.

The browser `ReviewSource` stores only the opaque handle returned by `/api/scan` and a user-safe label. It must not retain raw text or image data inside any `ReviewDraft`.

**Step 3: Add a separate Scanner review stack**

Create the four `src/components/review/**` components. They accept only `ReviewDraft` and `ReviewFieldEdit`; they never import `CalendarEvent`, `EventFields`, `EventCard`, `EventCardList`, `UnsavedEventsSection`, `src/services/exporter.ts`, or `ics`. `ReviewDraftSection` owns selection by draft ID and delegates edits/deletes/export callbacks to the page. Present:

- title/description/location/URL as nullable claim values;
- temporal start/end/all-day/time-zone as one temporal edit;
- no manual offset-evidence control: an unresolved DST fold stays visibly blocked and export-disabled; the UI truthfully offers changing the local time or clearing the timezone to a floating-time warning;
- recurrence as an optional structured edit;
- separately labeled `draft.scanIssues` and `draft.candidate.issues`, plus `draft.readiness.blockers` when `canGenerate === false`, warnings, and omitted fields; deduplicate only identical rendered issue tuples and never hide which candidate owns an issue;
- an “Export” affordance disabled exactly when `canGenerate` is false; and
- an accessible missing-value label rather than a fabricated field value.

`ReviewDraftFields` keeps date/time text in local input buffers and emits one `ReviewFieldEdit` only on Enter or blur; it does not mutate the committed draft on each keystroke. This preserves the repository’s existing lost-keystroke fix while changing the underlying model.

Render `ReviewDraftSection` adjacent to the existing `UnsavedEventsSection`. Legacy imported ICS, temporary unsaved events, and saved-history UI continue to use `CalendarEvent` behind their existing component boundary. Do not modify those components or build a lossy adapter from Scanner drafts into `CalendarEvent`.

**Step 4: Prove and commit**

Run:

```bash
bun test src/services/__tests__/scannerDraft.test.ts src/services/__tests__/urlServices.test.ts src/hooks --isolate
bun run type-check
bun run lint
bun run build
bun run assert:e1-protected
git diff --check
```

Commit only Task 5 paths with message `feat(event-every): add scanner review and edit loop`.

## Task 6: Make Scanner the only live-loop ICS authority

**Files**

- Create: `src/services/scannerExporter.ts`
- Create: `src/services/__tests__/scannerExporter.test.ts`
- Modify: `src/components/review/ReviewDraftSection.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Write failing exporter tests**

Use injected browser effects (`createObjectURL`, anchor click, `revokeObjectURL`) and fixed drafts. Prove:

- export invokes `generateIcs` with the current candidate and `{ uid: draft.exportUid, dtstamp: draft.createdAt, prodId: '-//Event Every//Scanner//EN' }`;
- an edit made immediately before export appears in the ICS, proving no cached bytes/readiness;
- blockers produce no Blob, URL, or click;
- warnings and omitted optional fields still produce a calendar;
- CRLF/calendar bytes exactly equal Scanner output;
- filename sanitization does not alter calendar content; and
- multiple export combines Scanner-generated VEVENTs through a deliberate calendar combiner that rejects any blocked draft and keeps one VCALENDAR header/footer.

Run focused tests and observe missing-module failure.

**Step 2: Implement fresh generation**

`src/services/scannerExporter.ts` exports:

```ts
export type BrowserDownloadEffects = Readonly<{
  download(input: Readonly<{
    calendarText: string;
    filename: string;
    mimeType: 'text/calendar;charset=utf-8';
  }>): void;
}>;

export type ScannerExportResult =
  | Readonly<{ ok: true; warnings: readonly ScannerIssue[]; omittedFields: readonly OmittedIcsField[] }>
  | Readonly<{ ok: false; blockers: readonly ScannerIssue[]; warnings: readonly ScannerIssue[] }>;

export function createScannerExporter(effects: BrowserDownloadEffects): Readonly<{
  exportReviewDraft(draft: ReviewDraft): ScannerExportResult;
  exportReviewDrafts(
    drafts: readonly ReviewDraft[],
    filename: string,
  ): ScannerExportResult;
}>;
```

The production `BrowserDownloadEffects` implementation alone owns Blob/object-URL/anchor/revocation calls; tests inject a recording effect. Each export call invokes `generateIcs` anew. The multi-event implementation parses only the outer Scanner-generated `BEGIN:VCALENDAR`/`END:VCALENDAR` envelope, requires the same VERSION/PRODID, concatenates complete VEVENT sections without rewriting them, and emits CRLF. On any malformed or blocked result it returns failure before `effects.download`.

Wire `ReviewDraftSection` only to these functions. `src/services/exporter.ts` and `src/services/exportAll.ts` remain unchanged for legacy imported/saved `CalendarEvent`s, but no component receiving `ReviewDraft` may import either legacy exporter or `ics`.

**Step 3: Prove and commit**

Run:

```bash
bun test src/services/__tests__/scannerExporter.test.ts src/services/__tests__/exporter.test.ts --isolate
bun run type-check
bun run lint
bun run build
bun run assert:e1-protected
git diff --check
```

Commit only Task 6 paths with message `feat(event-every): export scanner-reviewed calendars`.

## Task 7: Persist review drafts without persisting source payloads

**Files**

- Create: `src/services/reviewStorage.ts`
- Create: `src/services/__tests__/reviewStorage.test.ts`
- Modify: `src/app/page.tsx`

**Step 1: Write failing storage tests**

Tests use an in-memory `localStorage` and prove:

- the new key is exactly `event-every:review-drafts:v1`;
- serialized records contain only `version`, `id`, `exportUid`, `createdAt`, `candidate`, `scanIssues`, and opaque `source`;
- scan request objects, image data URLs, files/blobs, unbounded source bodies, provider requests/responses, credentials, and cached `readiness` are absent; bounded Scanner evidence excerpts are allowed only inside validated candidates;
- load validates candidate/issues/source, recomputes readiness, and rejects the entire corrupt record without partially returning it;
- save then load preserves null claims and human edits;
- clearing the new key does not alter `event_every_history`, `event_every_temp_unsaved`, or IndexedDB input history; and
- existing legacy saved events remain readable through `eventStorage`.

Run `bun test src/services/__tests__/reviewStorage.test.ts --isolate` and observe the missing module.

**Step 2: Implement a versioned DTO**

`src/services/reviewStorage.ts` defines:

```ts
const StoredReviewDraftSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  exportUid: z.string().min(1),
  createdAt: z.string().datetime(),
  candidate: EventCandidateSchema,
  scanIssues: z.array(ScannerIssueSchema),
  source: z.strictObject({
    handle: E1SourceHandleSchema,
    label: z.string().max(120).nullable(),
  }),
});
```

Export `reviewStorage.save(drafts)`, `reviewStorage.load()`, and `reviewStorage.clear()`. `save` maps drafts field-by-field to the DTO and never spreads a draft or request object. `load` calls `createReviewDraft` to recompute readiness. Storage errors return the existing `StorageResult` shape without including serialized data in messages.

In `src/app/page.tsx`, persist new unsaved Scanner drafts through `reviewStorage` and restore them on mount. After successful export or dismissal, remove only the affected draft IDs, save every remaining draft, and call `reviewStorage.clear()` only when none remain. The pure storage test proves saving/loading the remainder; Task 8’s Playwright partial-retention case and E1-M21 catch the page wiring. Remove Scanner-path calls to `saveTempUnsavedEvents`/`getTempUnsavedEvents`; retain those methods solely for legacy history compatibility.

**Step 3: Prove and commit**

Run:

```bash
bun test src/services/__tests__/reviewStorage.test.ts src/services/__tests__/scannerDraft.test.ts --isolate
bun run type-check
bun run lint
bun run assert:e1-protected
git diff --check
```

Commit only Task 7 paths with message `feat(event-every): persist raw-free scanner drafts`.

## Task 8: Prove the offline scan → review/edit → export loop with mutations

**Files**

- Create: `e2e/scanner-product-loop.spec.ts`
- Create: `docs/testing/e1-mutation-ledger.md`
- Modify: `e2e/helpers.ts`
- Modify: `e2e/community-limit.spec.ts`
- Modify: `e2e/event-extraction.spec.ts`
- Modify: `e2e/export-ics.spec.ts`
- Modify: `e2e/draft-and-history.spec.ts`
- Modify: `e2e/inline-edit-timezone.spec.ts`
- Modify: `e2e/timezone-resolution.spec.ts`
- Modify: `e2e/url-scrape.spec.ts`

**Step 1: Replace the SSE fixture seam**

In `e2e/helpers.ts`, delete `buildSSE`, `SSE_HEADERS`, `mockParseAPI`, and `mockParseAPIDelayed`. Add:

```ts
export async function mockScanAPI(
  page: Page,
  response: ScanResponse,
): Promise<void>;

export async function mockScanAPIDelayed(
  page: Page,
  response: ScanResponse,
  delayMs: number,
): Promise<void>;
```

Both intercept only `**/api/scan`, assert the request body passes `ScanRequestSchema`, and fulfill JSON. Fixture builders construct candidates through `EventCandidateSchema.parse`; they do not use the legacy `ParsedEvent` shape.

**Step 2: Add end-to-end scenarios**

`e2e/scanner-product-loop.spec.ts` covers, entirely via intercepted `/api/scan`:

1. text request → one candidate → visible claims/readiness → download;
2. image data URL request → vision candidate → download, with the data URL absent from localStorage;
3. multiple candidates → selection → one calendar with only selected VEVENTs;
4. missing title warning remains visible and export succeeds without `SUMMARY`;
5. missing start blocker disables export until a temporal edit supplies a complete start;
6. title/time/location edits appear in downloaded bytes and untouched evidence remains intact in localStorage;
7. corrupt/malformed API success is rejected with no draft created;
8. canceling a delayed scan prevents stale drafts, while the next scan succeeds;
9. reload restores raw-free drafts with recomputed readiness; and
10. a narrow viewport exposes every editable field, issue, and export control with keyboard-accessible names; and
11. an evidence-free DST-fold edit stays blocked with no fabricated offset, then clearing its timezone becomes a floating-time warning and enables export; and
12. mixed text+image submission preserves the SmartInput draft, shows the exact deferral message, and makes zero `/api/scan` requests.

The existing multi-image cases must also prove two images produce two sequential `/api/scan` requests and both candidates survive; canceling after the first prevents the second request.

Add a partial-retention case: create two drafts, export or dismiss one selected ID, reload, prove the affected draft is absent and the unselected draft remains with recomputed readiness.

Migrate every listed existing suite from legacy parse fixtures to Scanner candidates. `community-limit.spec.ts` intercepts `/api/scan`; `timezone-resolution.spec.ts` exercises Scanner zoned/floating/DST readiness instead of the removed post-parse timezone inference; and `url-scrape.spec.ts` proves the preserved host scrape-to-text request. Preserve the exact lost-keystroke, all-day, selection, community-limit, URL-enrichment, timezone/readiness, and downloaded-byte assertions.

Run Chromium first:

```bash
bunx playwright test e2e/scanner-product-loop.spec.ts e2e/community-limit.spec.ts e2e/event-extraction.spec.ts e2e/export-ics.spec.ts e2e/draft-and-history.spec.ts e2e/inline-edit-timezone.spec.ts e2e/timezone-resolution.spec.ts e2e/url-scrape.spec.ts --project=chromium
```

**Step 3: Execute the required scenario-complete mutations**

For each row, copy the pristine production file to a unique file under a `mktemp -d` directory for evidence only, apply one mutation with `apply_patch`, run the named focused test until it fails for the intended assertion, restore with an explicit inverse `apply_patch` (never `cp` over a repository file), compare the restored file to the evidence copy, rerun the same test green, and record both patches, command, red assertion, restored-green command/output, and pre/post SHA-256 in `docs/testing/e1-mutation-ledger.md`.

| ID | Production mutation | Required catching scenario |
|---|---|---|
| E1-M01 | Remove `ScanResponseSchema.parse` from `scanClient` | malformed success rejection |
| E1-M02 | Substitute `"Untitled Event"` when title is null | missing-title warning/export |
| E1-M03 | Treat any warning as `canGenerate: false` in the review UI | warning remains exportable |
| E1-M04 | Preserve provider confidence/evidence in `editReviewDraft` | edit evidence reset |
| E1-M05 | Reuse pre-edit cached ICS instead of calling `generateIcs` at export | edited downloaded bytes |
| E1-M06 | Enable export when readiness has blockers | missing-start disabled export |
| E1-M07 | Add `localStorage.setItem('event-every:last-scan-source', JSON.stringify(request))` to `runScan` after request validation | request object/data-URL absence |
| E1-M08 | Allow a canceled first response to append drafts after a second scan | cancellation stale-result guard |
| E1-M09 | In `ReviewDraftSection`, pass all drafts rather than the selected-ID filter to `exportReviewDrafts` | selected multi-VEVENT bytes |
| E1-M10 | In `reviewStorage.load`, replace `createReviewDraft` with a fabricated always-generate readiness object | reload readiness recomputation |
| E1-M11 | Remove the accessible name from the review export control | narrow keyboard/accessibility contract |
| E1-M12 | Treat `dst_fold` as a warning in the review export-disabled predicate | truthful DST-fold blocking |
| E1-M13 | Remove the mixed text+image early-return guard | mixed-input deferral and draft preservation |
| E1-M14 | Replace the sequential image loop with `Promise.all` | ordered multi-image requests/cancel-before-second |
| E1-M15 | Map community-mode upstream `402` to generic provider `502` | community-limit screen/status/reset |
| E1-M16 | Omit successful scraped URL text when building the host-enriched scan request | URL enrichment request/candidate |
| E1-M17 | Convert zoned provider points to floating points in `createReviewDraft` | zoned/floating/timezone readiness |
| E1-M18 | Construct an all-day review edit as a timed floating point | all-day display and `VALUE=DATE` bytes |
| E1-M19 | Commit `ReviewDraftFields` buffered time edits on every keystroke | lost-keystroke/buffered-edit assertion |
| E1-M20 | Drop candidates after the first from a valid scan response | multiple-candidate extraction/count |
| E1-M21 | Call `reviewStorage.clear()` after a partial export instead of saving remaining IDs | partial export/dismiss reload retention |

A compile error, patch failure, timeout, or failure in an unrelated setup assertion is non-accepting. Every red must name the behavior in the rightmost column. After all rows, require `git diff --check` and byte-identical production-file hashes.

Before acceptance, enumerate every remaining `test()` in the eight migrated E2E files plus `scanner-product-loop.spec.ts` into a ledger coverage matrix with stable scenario ID, focused Playwright command, and one or more E1-M01…E1-M21 rows that made that exact scenario red. Legacy SSE/parser/confidence/post-parse-timezone scenarios that no longer express product behavior are deleted with a rationale and a named Scanner replacement scenario; they are not silently weakened. No new or migrated E1 scenario may have a blank mutation cell.

**Step 4: Run both browsers and commit**

Run:

```bash
bun run verify:e1:offline
bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
bun run assert:e1-protected
git diff --check
```

Expected: all offline unit and Playwright gates pass in Chromium and WebKit, all 21 mutation rows carry red/restored-green evidence, every E1 scenario maps to catching evidence, and no provider request occurs. Commit only Task 8 paths with message `test(event-every): prove scanner product loop`.

## Task 9: Remove the legacy parse path and close E1

**Files**

- Delete: `src/app/api/parse/route.ts`
- Delete: `src/services/parser.ts`
- Delete: `src/services/__tests__/parser.test.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `scripts/assert-e1-paths.ts`

**Step 1: Write the removal assertions**

Extend `scripts/assert-e1-paths.ts` with terminal assertions that:

- no source or E2E file contains `/api/parse`, `parseEventsBatch`, `ParsedEvent` on the scan path, `buildSSE`, or `mockParseAPI`;
- no `ReviewDraft` component imports `src/services/exporter.ts` or package `ics`;
- no browser-reachable module imports `@event-every/scanner/openrouter`;
- exactly one browser call site references `/api/scan`, in `src/services/scanClient.ts`; and
- the three legacy parser paths are absent.

Run `bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD` before deletion and observe the removal assertion fail.

**Step 2: Delete legacy extraction and document the boundary**

Delete the three parser paths. Retain `OPENROUTER_MODEL` because the existing host-side `/api/detect-urls` route still uses it; document that it does not control Scanner’s two fixed model IDs. Retain the key/base URL and summary-model configuration. Update `README.md` to state:

- Scanner package/version provenance and the vendor refresh command;
- fixed text/link and vision provider roles;
- Event Every ownership of secrets, rate/budget policy, source resolution, and downloads;
- Scanner ownership of observation validation, null-bearing candidates, readiness, and ICS bytes;
- server raw-source lifetime, raw-free Scanner review storage, and the explicitly separate unchanged Recent-input IndexedDB feature;
- offline test guarantees; and
- E1 exclusions/deferred Cloudflare work.

Keep `ics` only if `rg` proves the untouched legacy saved-history exporter still imports it. Otherwise remove `ics` and regenerate `bun.lock`.

**Step 3: Run terminal local proof**

Run:

```bash
bun install --frozen-lockfile
bun run verify:e1:offline
bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
bun run assert:e1-protected
git diff --check
git status --short
```

Expected: all gates pass offline; status contains only Task 9 changes plus the protected untracked `.claude/`, `tasks/task-192.md`, and `tasks/task-193.md`. Stage exact Task 9 paths, never `git add .`, and commit with message `refactor(event-every): retire legacy parse path`.

**Step 4: Independent acceptance**

Run the same terminal proof against the resulting commit. Obtain an independent native `gpt-5.6-sol/high` review with verified routing metadata. The reviewer inspects the full E1 diff, mutation ledger, provider/browser boundary, raw-data lifetime, null preservation, fresh export, protected-path status, and automated-network exclusions. Critical or Important findings reject E1 and become the next repair cursor; no deployment or Cloudflare task begins until the rereview returns `VERIFIED:true`.

## Final acceptance checklist

- Scanner snapshot is reproducible from exact clean commit `98aec60cf9d87544196bfd0fa702c8170453bfd8`.
- Text/image requests use the correct fixed Scanner adapters through Event Every’s single metered transport.
- The client/API boundary is strict and returns opaque source metadata, candidates, and issues—never raw sources.
- Missing claims remain missing; edits are explicit, evidence-free human claims.
- Readiness is recomputed after load/edit and immediately before fresh Scanner ICS generation.
- Scanner review-draft localStorage contains no request object, data URL, file/blob, unbounded source body, provider body, prompt, key, or cached ICS; bounded candidate evidence is allowed, and existing Recent-input IndexedDB behavior is unchanged and separately documented.
- Legacy `/api/parse` and parser code are absent; the live review path does not use `ics`.
- Unit/build/lint/type/E2E gates are offline and green in both browsers.
- All 21 deliberate production mutations fail for their intended assertion, every E1 E2E scenario maps to at least one caught mutation, and all production files restore green byte-for-byte.
- Protected user paths are unchanged and untracked.
- Independent Sol/high review is `VERIFIED:true` before E1 advances.
