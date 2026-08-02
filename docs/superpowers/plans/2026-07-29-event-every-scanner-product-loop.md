# Event Every Scanner Product Loop Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan one task at a time, and `verification-before-completion` before accepting each task.

**Goal:** Replace Event Every’s permissive parse-and-export path with the proven Event Scanner contracts, producing a simple text/image scan → transparent review/edit → standards-compliant ICS export loop.

**Architecture:** Event Every remains the host: it owns request validation, rate/budget policy, provider credentials and transport, opaque source resolution, browser state, and downloads. `@event-every/scanner` owns provider request/response validation, null-bearing `EventCandidate` truth, readiness diagnostics, and ICS bytes. The browser stores a `ReviewDraft` whose scanner candidate is the single source of truth; edits update that candidate and every export runs fresh readiness validation and generation.

**Stack:** Next.js 15 App Router, React 19, TypeScript 5, Bun test, Playwright, Zod 4, vendored `@event-every/scanner` package pinned to the accepted reusable-package commit `c03cf1a79d0d1f2151ee602d67aa0a2eede673e4`.

---

## Reconciled baseline and locked boundaries

- Event Every begins at `main@4cc32012ca510006ab672e8699f3e07c7c7b11a6`.
- This plan file is committed as the E1 planning artifact before Task 1. It is an allowed pre-implementation path in every `4cc32012..HEAD` audit; implementation commits do not modify it unless an accepted review finding first requires a plan revision.
- Event Scanner begins at clean `main@98aec60cf9d87544196bfd0fa702c8170453bfd8`.
- Accepted reusable-package revision: the program's independently reviewed RPKG-1 through RPKG-4
  gates advanced Scanner from that historical E1 baseline to clean
  `main@c03cf1a79d0d1f2151ee602d67aa0a2eede673e4`. That commit is the authoritative E1 vendor pin
  and supersedes `98aec60cf9d87544196bfd0fa702c8170453bfd8` wherever this plan specifies the packaged
  snapshot, provenance assertion, refresh command, or final reproducibility check. Provenance
  schema 2 binds its canonical 138-entry pack SHA-256
  `1f3d909e17c71706fd6c41a4e16a094dd4ef577a933ca58b9219cc38e60a27e8` and projected artifact
  digest `f5b7af00b5d0bdd938c9392057b8f43b50876ca833da5084f24e5c3fdbb9d4f8`. The terminal RPKG
  acceptance and independent-review evidence are recorded in Calendar Casa work-plan Revisions
  79–84 and the active reusable-package tracker; this revision changes no other E1 boundary.
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
- `src/services/__tests__/inputStorage.test.ts` — WebKit-safe byte DTO round-trip proof for the pre-existing Recent/draft image gate.
- `src/types/review.ts` — browser review-state contract.
- `src/services/scannerDraft.ts` and `src/services/__tests__/scannerDraft.test.ts` — candidate/draft projection and edits.
- `src/services/__tests__/urlServices.test.ts` — preserved URL-enrichment cancellation/signal proof.
- `src/types/scannerHttp.ts` — shared strict browser/API scan contract.
- `src/types/scanRequest.ts` — CJS-safe shared scan-request contract used by the API and Playwright fixtures.
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
- `src/services/inputStorage.ts` — preserve existing Recent/draft semantics using an IndexedDB-safe byte DTO instead of directly cloning `File`.
- `src/app/layout.tsx`, `src/app/globals.css`, `playwright.config.ts` — local font and offline Playwright boundary.
- `src/app/api/__tests__/limit-gating.test.ts`, `src/lib/__tests__/limits.test.ts` — replace the deleted parse-route gate fixture/token with `/api/scan`.
- `e2e/{community-limit.spec.ts,event-extraction.spec.ts,export-ics.spec.ts,draft-and-history.spec.ts,inline-edit-timezone.spec.ts,timezone-resolution.spec.ts,url-scrape.spec.ts,helpers.ts}` — migrate or retire only Scanner-path legacy assertions; preserve unrelated community, input-shell, and Recent-input behavior without falsely giving it Scanner mutation credit.
- `e2e/recent-input.spec.ts` — preserved Recent-input IndexedDB/history and summary behavior, separated from the Scanner-path mutation matrix.
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
- Create: `src/services/__tests__/inputStorage.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `playwright.config.ts`
- Modify: `src/services/inputStorage.ts`

**Step 1: Write the failing provenance test**

`src/services/__tests__/scannerVendor.test.ts` must:

1. load `vendor/event-every-scanner/PROVENANCE.json`;
2. assert `sourceCommit` equals the accepted superseding pin
   `c03cf1a79d0d1f2151ee602d67aa0a2eede673e4`;
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
- rerun the pinned local TypeScript compiler with `--listEmittedFiles` and fail unless that exact
  emitted `dist/**` inventory equals the on-disk `dist/**` inventory, rejecting stale ignored output;
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

When `E1_OFFLINE=1`, `playwright.config.ts` must not load `.env.local`, must force the local base URL, must never reuse an existing server, must start its web server with `node --require=<absolute preload path> node_modules/next/dist/bin/next dev -p 3777`, and must configure the browser proxy as `http://127.0.0.1:9` with loopback bypass. Remove `next/font/google` from `src/app/layout.tsx`; define `--font-press-start` and `--font-bubblegum` as local/system fallback stacks in `globals.css`, retaining the existing local Wichy font. A test scans `layout.tsx`, the resolved offline web-server command, and the offline child environment to prove no Google-font import or production target survives, the server has the preload, existing-server reuse is disabled, and every credential-shaped value is empty.

**Step 4: Repair the live WebKit prerequisite exposed by the offline gate**

The first fail-closed baseline run proved that WebKit cannot structured-clone the current stored `File` objects: both existing image draft/history E2Es read back no IndexedDB record, while Chromium passes. In `src/services/inputStorage.ts`, persist each `StoredInputFile` as an internal strict DTO containing its existing metadata plus `bytes: ArrayBuffer`; reconstruct `File` on read. Accept legacy stored `File`/`Blob` values on read, and keep public `InputDraft`/`InputHistoryEntry` types and DB/store/key names unchanged. `inputStorage.test.ts` proves byte/name/MIME/kind/eventCount round trips and legacy hydration. The two existing WebKit E2Es are the integration proof; do not weaken or skip them.

**Step 5: Generate and prove**

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
- Create: `src/types/scanRequest.ts`
- Modify: `e2e/helpers.ts`
- Modify: `e2e/community-limit.spec.ts`
- Modify: `e2e/event-extraction.spec.ts`
- Modify: `e2e/export-ics.spec.ts`
- Modify: `e2e/draft-and-history.spec.ts`
- Modify: `e2e/inline-edit-timezone.spec.ts`
- Modify: `e2e/timezone-resolution.spec.ts`
- Modify: `e2e/url-scrape.spec.ts`

**Step 1: Replace the SSE fixture seam**

Extract `ScanRequestSchema` and `ScanRequest` unchanged from `src/types/scannerHttp.ts` into
`src/types/scanRequest.ts`, then re-export them from `scannerHttp.ts`. This narrow prerequisite
keeps the request validator importable by Playwright's CommonJS transform without loading the
Scanner-dependent response schema. Add the new path to `scripts/assert-e1-paths.ts`.

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

The pre-review explicit Chromium command is retired. It must not be run because its direct
Playwright process can inherit credentials, use the shared server, and names files that the later
disposition retires. Use only the R2 isolated launcher and its one-test `--list` preflight.

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

### Task 8 revision — E1-T8-LIVE-SCENARIO-DISPOSITION (authoritative)

This 2026-08-01 revision repairs the stale “every remaining `test()` in the eight files” wording in
Task 8 Steps 2–4. The exact 67-definition inventory and exact focused commands are recorded in
`docs/testing/e1-mutation-ledger.md` under **Terminal live-inventory reconciliation**. Its scenario
IDs are the authoritative names for this revision. The inventory total is fixed at
`C:9 + X:14 + E:3 + D:17 + I:2 + T:2 + U:2 + S:18 = 67`; rerun the recorded `--list` command before
each implementation batch and stop if either the names or count drift.

**Scope rule.** A Scanner-path scenario is a browser-visible consequence of `/api/scan`,
`ReviewDraft`, Scanner temporal/readiness state, Scanner export, or the host’s Scanner limit and
URL-enrichment handoff. It must be mapped to one or more accepted E1-M01…E1-M21 RED transcripts.
Community-screen, waitlist/pattern-lock, SmartInput affordance, and pre-existing Recent-input
IndexedDB/history/summary behavior still run in the complete offline Chromium/WebKit gate, but are
explicitly **non-Scanner coverage**. Do not mutate Scanner production code merely to manufacture
credit for them, and do not describe their green runs as caught by an E1 mutation.

**The stable-ID correction.** The live partial-retention test at
`e2e/scanner-product-loop.spec.ts:719` is `E1-T8-S21`, not `E1-T8-S08`; its accepted causal row is
E1-M21. `S08` is intentionally unused. The ledger’s live inventory row must be corrected before
any new evidence is recorded; do not rename the test solely to preserve the obsolete ID.

**Required dispositions for all 67 live definitions.** “Keep” means preserve the assertion in the
full offline gate and mark it `non-Scanner coverage` in the final matrix; “migrate” means retain
the product assertion but replace legacy `/api/parse`/SSE/`ParsedEvent` mechanics with a strict
`mockScanAPI` fixture and record the listed accepted causal row; “delete” means remove the obsolete
legacy assertion and record the exact Scanner replacement named here. These are not interchangeable.

| Live IDs (exact names remain in ledger) | Disposition and destination | Causal status or required replacement |
|---|---|---|
| C01–C08 | Keep in `e2e/community-limit.spec.ts`; community UI, waitlist, and pattern-lock contracts are unrelated to Scanner execution. | Non-Scanner coverage; no E1 mutation claim. |
| C09 | Keep in `e2e/community-limit.spec.ts` with its strict `/api/scan` 402 fixture. | E1-M15. |
| X01, X06, X10 | Consolidate into route-independent `e2e/calendar-event-regression.spec.ts`; preserve wall-clock/timezone-chip/description-expansion behavior through seeded legacy `CalendarEvent` records. | Non-Scanner coverage; no E1 mutation claim. |
| X02, X05, X07 | Delete from `e2e/event-extraction.spec.ts`; they are duplicate legacy extraction-count/render assertions. | X03 (E1-M20). |
| X04 | Migrate from legacy parser error to the explicit valid-zero Scanner completion: no review drafts and no fabricated error. | Non-mutation Scanner browser/unit proof; malformed S16/M01 is not a replacement. |
| X13, X14 | Retire browser route tests and preserve strict request-edge behavior in scan route/client unit tests. | Non-browser, non-E1-mutation proof in `src/app/api/scan/__tests__/route.test.ts` and `src/services/__tests__/scanClient.test.ts`. |
| X03 | Keep in `e2e/event-extraction.spec.ts`; it already proves ordered Scanner candidates reach selectable review drafts. | E1-M20. |
| X08, X09 | Keep in `e2e/event-extraction.spec.ts`; empty/minimum-text submit affordances are input-shell behavior and make no scan request. | Non-Scanner coverage; no E1 mutation claim. |
| X11 | Migrate in `e2e/event-extraction.spec.ts` from legacy SSE error to malformed successful `/api/scan` response, retaining dismissal of the visible processing error. | E1-M01; the RED must reach the error-notification assertion, not fixture setup. |
| X12 | Migrate in `e2e/event-extraction.spec.ts` to a strict Scanner text response; retain Cmd+Enter and add the raw-free review-storage assertion used by the image request proof. | E1-M07. |
| E01–E03 | Consolidate in `e2e/calendar-event-regression.spec.ts` through seeded legacy `CalendarEvent` batch export. | Non-Scanner coverage: UTC timed bytes, `batch-events-3.ics`, and selected subset all remain asserted. |
| D01–D11, D14–D17 | Move unchanged Recent-input draft/image/history/modal/search/summary assertions to `e2e/recent-input.spec.ts`. Replace only the successful-transform fixture with strict `mockScanAPI` where needed; retain their `/api/summarize` mock where presently used. | Non-Scanner coverage; no E1 mutation claim. The move must preserve every assertion and its full-gate execution. |
| D12 | Delete from `e2e/draft-and-history.spec.ts`; parse-stream cancellation is obsolete. | S15 (E1-M08). |
| D13 | Delete from `e2e/draft-and-history.spec.ts`; SSE arrival/legacy-card selection is obsolete. | S07 (E1-M09) and S15 (E1-M08). |
| I01, I02 | Consolidate in `e2e/calendar-event-regression.spec.ts` through seeded legacy `CalendarEvent` inline edits. | Non-Scanner coverage: edited timezone persistence and start/end duration invariant remain asserted. |
| T01, T02 | Keep in `e2e/timezone-resolution.spec.ts` with strict Scanner candidates and Scanner ICS bytes. | E1-M17. |
| U01 | Keep in `e2e/url-scrape.spec.ts`; URL-pill recognition is an input-shell contract before any scan. | Non-Scanner coverage; no E1 mutation claim. |
| U02 | Keep in `e2e/url-scrape.spec.ts` with strict host-enriched Scanner request fixture. | E1-M16. |
| S01 | Delete as redundant, non-causal Scanner happy-path duplication. | S14 (E1-M04, E1-M05) is the retained text scan → edit → fresh-byte replacement. |
| S02–S07, S09–S18, S21 | Keep in `e2e/scanner-product-loop.spec.ts`; retain the existing assertions and exact accepted mappings in the ledger. | Respectively: M19; M07; M14; M14; M13; M09; M02/M03; M06; M12; M11; M10; M04/M05; M08; M01; M18; M18; M21. |

The movement above is necessary to retain Recent-input coverage while Task 9 removes the parser
fixture seam. The follow-up review repair below supersedes the initial single-path allowlist
instruction.

**Proof-sized implementation batches (execute in order).**

1. **Inventory and fixture seam — allowed paths:**
   `docs/testing/e1-mutation-ledger.md`, `e2e/helpers.ts`, `src/types/scanRequest.ts`,
   `src/types/scannerHttp.ts`, `scripts/assert-e1-paths.ts`, and this plan. Correct S21, add the
   one new allowlist path, remove only shared legacy fixture exports once no retained test imports
   them, and make `mockScanAPI` validate every request with `ScanRequestSchema` and every fixture
   candidate with `EventCandidateSchema`. Run `rg -n '/api/parse|buildSSE|mockParseAPI|ParsedEvent'
   e2e/helpers.ts`, `bun run assert:e1-protected`, and `git diff --check`; expected: no legacy
   helper match, protected inventory passes, and no whitespace error.
2. **Preserved non-Scanner coverage — allowed paths:** `e2e/draft-and-history.spec.ts`,
   `e2e/recent-input.spec.ts`, `e2e/community-limit.spec.ts`, `e2e/url-scrape.spec.ts`,
   `e2e/event-extraction.spec.ts`, and the path guard. Move exactly D01–D11/D14–D17, leave
   C01–C08/X08/X09/U01 semantically unchanged, and retain X11/X12 only after their Scanner
   migrations. Run each moved title with the exact ledger command (substituting
   `e2e/recent-input.spec.ts`) plus `bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD`.
   Expected: each preserved title is green; the guard accepts the sole added path; no matrix row
   assigns an E1-M row to these preserved contracts.
3. **Retire legacy product-path tests — allowed paths:** `e2e/event-extraction.spec.ts`,
   `e2e/export-ics.spec.ts`, `e2e/draft-and-history.spec.ts`, `e2e/inline-edit-timezone.spec.ts`,
   `e2e/scanner-product-loop.spec.ts`, and `e2e/helpers.ts`. Apply every delete/migrate row above,
   retaining X03/X11/X12 and removing S01. Run `rg -n '/api/parse|buildSSE|mockParseAPI|ParsedEvent|event-card|EventCard'
   e2e`; expected: no legacy production-path mechanics remain in E1 Scanner suites (the explicit
   Recent-input exemptions are only the preserved test names, never parser fixtures). Run the
   current eight-suite `--list` command and record the post-disposition count and every retained
   title in the ledger; expected: every retained Scanner-path title has a nonblank accepted E1-M
   cell and every preserved non-Scanner title says `non-Scanner coverage`.
   The earlier explicit eight-file and discovery commands are retired. Use only the R2 isolated
   launcher, first in `--list` mode and then in run mode. Expected: every retained E2E file,
   including `e2e/recent-input.spec.ts`, is green under the scrubbed offline environment; no
   deleted legacy filename is passed as an explicit Playwright argument.
4. **Causal mutation evidence — allowed paths:** one named production file at a time, its focused
   E2E scenario, and `docs/testing/e1-mutation-ledger.md`. Re-run/repair only missing or invalid
   E1-M01…E1-M21 RED/restored-green transcripts using Task 8 Step 3’s snapshot, literal inverse,
   SHA-256, and focused-assertion procedure. For M21 use S21 and the already reviewed
   successful-partial-export transition scope. Expected: all 21 rows show intended assertion RED,
   byte-identical restoration, and green rerun; a compile/setup/timeout failure receives no credit.
5. **Terminal acceptance and commit — Task 8 paths only.** Run the original complete offline gate:

   ```bash
   bun run verify:e1:offline
   bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
   bun run assert:e1-protected
   git diff --check
   git status --short
   ```

   Expected: Chromium and WebKit are green offline; all 21 accepted mutation rows are complete;
   every Scanner-path scenario is causal; every preserved non-Scanner scenario ran but has no
   false causal claim; only Task 8 paths plus protected untracked paths are present. Stage exact
   Task 8 paths and commit `test(event-every): prove scanner product loop` only after those
   expectations hold.

**Plan self-review.** This revision maps every current stable ID exactly once in the table above,
does not weaken unrelated coverage, gives every deletion a named Scanner replacement and accepted
mutation row, preserves the reviewed Scanner topology, and leaves Task 9’s parser deletion gated
on this proof. It introduces no provider, credential, port, browser-server, publication, or
deployment authority.

### Task 8 review repair — E1-T8-LIVE-SCENARIO-DISPOSITION-R2 (authoritative)

This revision supersedes any conflicting Task 8 command, deletion, count, and launcher wording
above. It preserves the Scanner topology and all accepted mutation evidence; it changes only the
future implementation and proof contract after the independent review found that the original
leaf-title `^…$` selectors cannot match Playwright’s describe-prefixed full titles.

**Inventory arithmetic and checkpoints.** Record all three counts in the ledger, with the exact
`--list` output attached before moving to the next batch:

| Checkpoint | Files and definitions | Required record |
|---|---|---|
| Initial | The original eight files contain exactly 67 definitions: C9 + X14 + E3 + D17 + I2 + T2 + U2 + S18. | Preserve the 67 exact baseline titles and IDs. C04 (`"Enter pattern lock" switches to the pattern screen as it looks today`) is a discovery-only pattern-unlock probe: it still runs offline, but is outside Scanner mutation acceptance. |
| Transitional | The eight original files plus `e2e/recent-input.spec.ts` contain exactly the same 67 definitions after moving D01–D11 and D14–D17. | The move changes path only; titles, assertions, and full-gate execution remain intact. Keep `buildSSE`, `mockParseAPI`, and `mockParseAPIDelayed` until the last consumer has migrated or been retired. |
| Post-disposition | Sixteen obsolete original leaf definitions are retired, leaving 50 classified original-ID entries plus the separately recorded C04 discovery-only probe. | The ledger must list the 16 removed IDs, the 50 classified remaining IDs, C04, and the separately retained CalendarEvent regression assertions below. |

The 16 retired original definitions are X02, X05, X07, X13, X14, D12, D13, S01, and the
eight legacy definitions that are consolidated into route-independent CalendarEvent regression
coverage (X01, X06, X10, E01, E02, E03, I01, I02). Consolidation removes duplicate parser-driven
test definitions, not any user-visible behavior. X04 is migrated to the valid-zero Scanner
contract, so it remains one of the 50 classified tests. The resulting 50 is the Task 8 classified matrix;
the separate regression suite below continues to run in both browsers and is reported beside—not
as a mutation row within—that matrix.

**Retained CalendarEvent coverage; do not delete it.** Create
`e2e/calendar-event-regression.spec.ts` with three non-Scanner Chromium/WebKit tests, each seeded
without `/api/parse` and never mapped to E1-M01…E1-M21:

1. Seed `event_every_temp_unsaved` in `page.addInitScript` *after clearing storage and before*
   `page.goto('/')`, with serialized `CalendarEvent` records. This is the exact unsaved seam read
   by `src/app/page.tsx` through `eventStorage.getTempUnsavedEvents()` (page lines 102–105) and
   rendered by `UnsavedEventsSection.tsx` → `event-card/EventCardList.tsx`. Assert X01’s exact
   wall-clock/date, X06’s visible timezone chip, and X10’s collapsed-hidden then expanded-visible
   description on the seeded `EventCard`.
2. Use the same seeded unsaved record with explicit `rawStartDate`, `rawEndDate`, and
   `rawTimezone` to assert I01’s edit-then-timezone-change persistence and I02’s start-past-end
   duration preservation. The test must inspect the expanded legacy `EventCard` end value rather
   than only its start control.
3. Seed three unsaved `CalendarEvent` records to assert E01’s timed UTC VEVENT bytes, E02’s
   `batch-events-3.ics` filename, and E03’s selected-subset bytes. Also seed saved history through
   `event_every_history` before navigation and upload a fixture `.ics` through SmartInput’s
   calendar-file input; assert both the saved `useHistory`/`EventFields` path and the imported
   `handleCalendarFilesSubmit` path remain distinct from Scanner review drafts.

This is the smallest behavior-preserving destination: add only
`e2e/calendar-event-regression.spec.ts`, `e2e/recent-input.spec.ts`, and
`scripts/run-e1-focused.ts` to `E1_PATHS` and this file map. Retain old E2E paths in the allowlist
while their deletions are present in the base-to-HEAD audit; otherwise the deletion itself is
rejected. No other allowlist widening is authorized.

**Correct X04/X12/X13/X14 disposition.** X04 migrates from the legacy parser error to an explicit
valid-zero Scanner contract, never malformed-response proof: a schema-valid response with
`candidates: []` is a truthful “no claims to review” completion, and E1 does not invent a legacy
parser error. Its focused Scanner client/unit assertion returns an empty draft list, creates no
review article, and exposes no fake extraction error; it is non-mutation product proof.
X12 keeps Cmd+Enter but must assert exactly
`localStorage.getItem('event-every:last-scan-source') === null` after the successful strict scan;
E1-M07 is causal only when its RED reaches that assertion. X13/X14 retire as browser route tests
and are replaced by strict request-edge unit proof in
`src/app/api/scan/__tests__/route.test.ts` (the parameterized invalid request cases) and
`src/services/__tests__/scanClient.test.ts` (request validation before fetch). They are non-browser,
non-E1-mutation proof; do not cite S16/M01 for them.

**Canonical isolated focused launcher; no naked Playwright execution.** Create
`scripts/run-e1-focused.ts`. Its complete responsibility is to accept a Playwright argv tail from
the ledger and run either its `--list` preflight or its test execution under the following fixed
lifecycle:

1. Reject an argv tail without exactly one `--project=chromium` or `--project=webkit`, one
   `--workers=1`, and one `--grep` ending in `$`. For a preflight it appends `--list`, captures the
   output, and requires exactly one listed test for that project before allowing the matching run.
2. Reserve `127.0.0.1:3794` only after `lsof -nP -iTCP:3794 -sTCP:LISTEN` has no output. Before
   mutation, SHA-256 snapshot `playwright.config.ts`, `next.config.js`, and `tsconfig.json` into a
   unique `mktemp -d /private/tmp/e1-t8-focus.XXXXXX` directory. Apply literal forward patches:
   replace the 3777 `localUrl` and offline `next dev -p 3777` literals with 3794, set
   `webServer: undefined`, and add `distDir: '.next-e1-t8-focus-3794'` to `next.config.js`.
   Record the forward patch and hashes in the ledger.
3. Call `createE1OfflineEnvironment()` from `scripts/run-e1-offline.ts`; launch only
   `node --require <E1_OFFLINE_PRELOAD> node_modules/next/dist/bin/next dev -p 3794` through
   `Bun.spawn` with that scrubbed environment. Wait for loopback HTTP 200, then spawn the exact
   Playwright argv with the same scrubbed environment and egress preload. The launcher never reads
   `.env.local`, starts no shared 3777 listener, and never uses `.next`.
4. In `finally`, stop only the recorded child PID, apply the literal inverse configuration patches,
   reverse any Next-generated `tsconfig.json` edits, compare all three restored files to their
   snapshots, confirm 3794 is closed, and remove only `.next-e1-t8-focus-3794` and the inspected
   temporary directory/test output. A failed list/run still performs this lifecycle; any failed
   inverse, hash comparison, or port closure invalidates the proof.

The ledger’s focused-command column is consequently an argv tail, never an executable `node …
playwright` line. For each row first run
`bun scripts/run-e1-focused.ts --list -- <ledger argv tail>` and require one Chromium listing, then
run `bun scripts/run-e1-focused.ts -- <same ledger argv tail>`. The Task 8 full browser proof uses
the same launcher once for Chromium and once for WebKit; the original offline unit/type/lint/build
checks still run through `createE1OfflineEnvironment()`, but no browser proof may use port 3777 or
the shared `.next` directory.

**Repaired proof-sized order.**

1. Record the initial 8-file/67-definition list and correct every ledger grep tail; run only the
   isolated `--list` preflight for each row. Do not run tests in this batch.
2. Add the two E2E destination paths and `scripts/run-e1-focused.ts` to the allowlist, move the 15
   D cases, and migrate their successful transformations to strict Scanner fixtures. Where a
   transformation is required, replace `waitForEvents` with an exact wait for
   `getByRole('region', { name: 'Scanner review drafts' })` and its expected `article` count; the
   Recent-input assertion follows that synchronization. Keep all legacy helpers until this and all
   CalendarEvent relocation consumers are complete. Record the transitional 9-file/67 count.
3. Consolidate the eight retained CalendarEvent contracts using the exact three seed seams above;
   retire only the enumerated 17 definitions, migrate X11/X12, add the explicit valid-zero X04
   unit proof, and record the 50 classified entries plus separate C04 and CalendarEvent coverage.
4. Run missing mutation RED/restored-green proof exclusively through the isolated launcher. Then
   run the complete offline units/type/lint/build gate and isolated Chromium and WebKit discovery
   runs; commit only after all lifecycle, mutation, matrix, protected, and diff evidence is green.

### Task 8 review repair — E1-T8-LIVE-SCENARIO-DISPOSITION-R3 (authoritative)

R3 supersedes the R2 three-test consolidation. Exactly 16 original definitions retire; 51 original
definitions remain, consisting of 50 classified matrix rows plus separately recorded discovery-only
C04. Eight independent non-Scanner CalendarEvent regression definitions replace the eight retired
legacy CalendarEvent leaf tests, so the exact final Task 8 non-production discovery total is
**59 definitions per browser**: `C9 + X6 + D15 + T2 + U2 + S17 + CE8`. C04 remains in the C9
collection and is separately reported as the existing pattern-unlock discovery probe, never a
Scanner mutation row. The final discovery suite paths are
`community-limit`, `event-extraction`, `recent-input`, `timezone-resolution`, `url-scrape`,
`scanner-product-loop`, and `calendar-event-regression`.

`e2e/calendar-event-regression.spec.ts` uses an explicit fresh-page fixture for every definition:
it registers auth/URL/summary mocks, then one `addInitScript` that clears local storage and writes
only the specified seed before `page.goto('/')`. No case calls `/api/parse` or `setupLocal` after
seeding. The stable IDs, exact titles, pinned contexts, and ledger argv tails are:

| ID | Exact title and isolated seed | Chromium argv tail |
|---|---|---|
| E1-T8-CE01 | `legacy CalendarEvent renders exact America/New_York wall-clock date` — one unsaved `event_every_temp_unsaved` event; `timezoneId: America/New_York`. Preserves X01. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent renders exact America/New_York wall-clock date$"` |
| E1-T8-CE02 | `legacy CalendarEvent renders UTC timezone chip` — fresh unsaved seed; `timezoneId: UTC`. Preserves X06. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent renders UTC timezone chip$"` |
| E1-T8-CE03 | `legacy CalendarEvent reveals description only after expansion` — fresh unsaved seed with description; `timezoneId: UTC`. Preserves X10. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent reveals description only after expansion$"` |
| E1-T8-CE04 | `legacy CalendarEvent single export writes one timed UTC VEVENT` — fresh one-event unsaved seed; `timezoneId: UTC`. Preserves E01. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent single export writes one timed UTC VEVENT$"` |
| E1-T8-CE05 | `legacy CalendarEvent batch export writes three VEVENTs and batch-events-3.ics` — fresh three-event unsaved seed; `timezoneId: UTC`. Preserves E02. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent batch export writes three VEVENTs and batch-events-3.ics$"` |
| E1-T8-CE06 | `legacy CalendarEvent batch export omits the deselected event` — independent fresh three-event unsaved seed; `timezoneId: UTC`. Preserves E03. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent batch export omits the deselected event$"` |
| E1-T8-CE07 | `legacy CalendarEvent edited start survives timezone change` — fresh seed with raw start/end/timezone; `timezoneId: UTC`. Preserves I01. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent edited start survives timezone change$"` |
| E1-T8-CE08 | `legacy CalendarEvent moving start past end preserves duration` — independent fresh seed with raw start/end/timezone; `timezoneId: UTC`. Preserves I02. | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent moving start past end preserves duration$"` |

All CE rows are `non-Scanner coverage`. CE01/CE02/CE03 seed only
`event_every_temp_unsaved`, which page.tsx loads through `eventStorage.getTempUnsavedEvents()`
into `UnsavedEventsSection` and `EventCardList`. CE04–CE06 additionally seed saved
`event_every_history` and upload a fixture `.ics` through the SmartInput calendar-file input on
their own fresh pages, asserting saved `useHistory`/`EventFields` and imported
`handleCalendarFilesSubmit` remain distinct from Scanner review. No extra spec path is authorized:
the only new test destination is `e2e/calendar-event-regression.spec.ts` alongside the already
planned `e2e/recent-input.spec.ts`.

**R3 launcher contract.** `scripts/run-e1-focused.ts` has exactly two modes.

- **Focused:** accepts exactly one ledger argv tail containing one `--project=chromium`, one
  `--workers=1`, and one unique `--grep` ending in `$`; it rejects every other project/count/grep
  shape. It first invokes the identical argv with `--list` and accepts only one listed Chromium
  title, then invokes the test argv.
- **Discovery:** accepts `--projects=chromium`, `--projects=webkit`, or
  `--projects=chromium,webkit`, forbids `--grep`, and first lists each chosen project. It requires
  exactly the seven suite paths above, exactly 59 titles for each project, and the C04 full title
  `community limit screen "Enter pattern lock" switches to the pattern screen as it looks today`
  before it runs that full project. This is the explicit separately-accounted pattern-unlock check.

For both modes, establish `try/finally` and SIGINT/SIGTERM handlers *before the first config
patch*. Make a unique invocation suffix from `mktemp -d /private/tmp/e1-t8-focus.XXXXXX`; derive
and prove absent before patching the unique paths `.next-e1-t8-focus-<suffix>` and
`test-results-e1-t8-focus-<suffix>`. Check that loopback port 3794 has no listener. Snapshot and
SHA-256 hash `playwright.config.ts`, `next.config.js`, and `tsconfig.json`; forward-patch only the
local URL/dev port to 3794, `webServer: undefined`, and the unique Next `distDir`. Use
`createE1OfflineEnvironment()` and its preload to start one recorded `Bun.spawn` child PID for
Next; wait for loopback 200, then spawn Playwright with the same scrubbed environment. In finally,
kill and await only that recorded child, inverse-patch and byte/hash-verify all three configs,
confirm 3794 is closed, and remove only the invocation-created dist/test-results/temp paths. Any
setup, signal, list, run, inverse, hash, child-wait, or cleanup failure is non-accepting.

**X04 exact migration.** The migrated X04 route fixture must count and parse exactly one request,
assert `{ kind: 'text', text: 'The weather is nice today' }`, fulfill one schema-valid response
with an opaque text source, `candidates: []`, and `issues: []`, and await that response. It then
awaits the idle discriminator `getByTestId('cancel-job-button').toHaveCount(0)`, asserts zero
`article` descendants under (or absence of) `getByRole('region', { name: 'Scanner review drafts' })`,
and asserts `getByTestId('error-notification')` has count zero. The matching unit proof validates
the same empty response projection. Neither proof may cite E1-M01.

### Task 8 review repair — E1-T8-LIVE-SCENARIO-DISPOSITION-R4 (authoritative)

R4 refines R3 discovery and launcher ownership. The Task 8 subset discovery is exactly **59
definitions per browser** across its seven retained paths: `community-limit`, `event-extraction`,
`recent-input`, `timezone-resolution`, `url-scrape`, `scanner-product-loop`, and
`calendar-event-regression`. Complete non-production discovery additionally includes the existing
`e2e/pattern-unlock.spec.ts`, yielding **60 definitions per browser / 120 across Chromium and
WebKit**. The final full verification must use complete non-production discovery; the 59-count
subset is only the Task 8 implementation checkpoint. Record both counts separately in the ledger.

R4 also makes every launcher output invocation-owned. Before the config forward patch, create the
unique `mktemp -d /private/tmp/e1-t8-focus.XXXXXX` directory, require it to be that exact returned
path and initially empty, then derive its suffix and prove only the three derived paths are absent:
`.next-e1-t8-focus-<suffix>`, `test-results-e1-t8-focus-<suffix>`, and
`playwright-report-e1-t8-focus-<suffix>`. The literal temporary `playwright.config.ts` forward patch sets
`outputDir: 'test-results-e1-t8-focus-<suffix>'` and replaces the shorthand HTML reporter with
`reporter: [['html', { outputFolder: 'playwright-report-e1-t8-focus-<suffix>', open: 'never' }]]`.
The same forward patch changes only the local URL/dev port to 3794 and `webServer: undefined`; the
temporary `next.config.js` patch sets `distDir: '.next-e1-t8-focus-<suffix>'`. Snapshot/hash
`playwright.config.ts`, `next.config.js`, and `tsconfig.json` before any patch, and literal
inverse-patch/hash-verify all three in `finally`.

The launcher records both child handles and PIDs: first the scrubbed/preloaded Next child, then the
scrubbed/preloaded Playwright child (including `--list` children). SIGINT/SIGTERM handlers only set
the termination path and enter the already-installed `finally`; they do not kill by port or process
name. On normal completion, test failure, setup failure, or signal, teardown is strict: terminate
and await the recorded Playwright child first; then terminate and await the recorded Next child;
then inverse-restore/hash-verify configuration; confirm port 3794 is closed; and remove only the
four invocation-created paths. If a child PID was never created, its teardown is skipped and noted;
if any created child cannot be awaited, or any owned path/config hash remains, the run is
non-accepting.

### Task 8 proof unit — E1-T8-FOCUSED-RUNNER-SEAM (2026-08-01)

The isolated launcher seam is now implemented in `scripts/run-e1-focused.ts` with a pure Bun test
at `scripts/run-e1-focused.test.ts`. The helper contract rejects malformed focused tails, requires
the Chromium/serial/end-anchored shape, distinguishes the 59-title Task 8 subset from complete
60-per-browser discovery (120 for Chromium plus WebKit), requires C04, derives only the invocation
owned paths from the exact `mktemp` result, and proves Playwright teardown/await precedes Next.
The production entry owns the R4 lifecycle: scrubbed/preloaded environment, unused 3794 check,
empty exact mktemp directory, absent derived outputs, config snapshots/hashes and literal forward
patches, recorded children, list preflight, inverse restoration/hash verification, port closure,
and owned-only cleanup. Signal handling enters that installed finalization path without port or
process-name killing.

TDD evidence: `bun test scripts/run-e1-focused.test.ts` first failed because
`./run-e1-focused` did not exist (0 pass, 1 fail); after implementation it passed 7 tests / 22
expectations. Targeted ESLint and `bunx tsc --noEmit` passed. This proof unit deliberately ran no
browser, Next server, provider, credential, or production E2E command. `E1_PATHS` now admits only
the runner/test and the already-authorized future `recent-input` and CalendarEvent destinations.
R4 remains blocking: actual 59/60/120 discovery, browser executions, and mutation evidence are
still separate downstream gates.

### Task 8 repair — E1-T8-FOCUSED-RUNNER-SEAM-R5 (2026-08-01)

The preceding 7-test runner-seam claim is **rejected and non-accepting** after independent review:
it permitted argument injection, could treat collided output as owned, masked unsafe child cleanup,
used snapshot overwrite rather than literal inverse restoration, and represented signal termination
as a rejected promise. This R5 repair supersedes that claim. Focused mode now accepts exactly five
tokens: one authorized Task 8 `e2e/` path, literal `--project=chromium`, literal `--workers=1`,
literal `--grep`, and one end-anchored title. Discovery separately accepts WebKit and the ordered
Chromium/WebKit dual-project form.

Outputs are eligible for deletion only after all three derived-path absence checks complete; a
collision retains its pre-existing bytes. Child teardown attempts and awaits every recorded handle
in Playwright-before-Next order, uses only the recorded handle for the bounded SIGKILL fallback,
and blocks inverse/removal while a child remains unsettled. Configuration cleanup literally reverses
only the runner-generated Playwright/Next edits, then independently hash-checks every config;
primary, child, inverse, hash, port, and removal failures aggregate rather than mask each other.
The signal sentinel resolves to a controlled lifecycle error, and the pure phase harness covers
pre-patch, Next-wait, list, and run termination without spawning a process.

Repair TDD evidence: the expanded test suite first failed because the required literal-inverse
export did not exist (0 pass, 1 fail). The repaired suite passed **15 tests / 63 expectations**;
incremental-disabled typecheck and targeted ESLint passed. This remains a pure, non-browser proof:
no Next server, browser, provider, credentials, network, E2E, staging, or commit was used. R4's
live discovery, mutation, and browser gates remain blocking.

### Task 8 repair — E1-T8-FOCUSED-RUNNER-SEAM-R6 (2026-08-01)

R5 is **rejected and non-accepting** for omitting literal reversal of the observed Next-generated
`tsconfig.json` shape, auth-pattern scrubbing local to the focused runner, and independent owned
path-removal aggregation. R6 adds a strict tsconfig inverse: it recognizes only the generated
multi-line include containing the invocation-specific `distDir/types/**/*.ts` literal and restores
the exact pristine bytes before hash verification. The runtime applies this inverse along with the
Playwright and Next inverses; it never copies a snapshot over a mutated file.

`createFocusedEnvironment()` wraps the existing offline environment without modifying it, blanks
`TEST_AUTH_PATTERN` and `AUTH_PATTERN` unconditionally, and blanks any inherited or supplied
dotenv-discovered `*_AUTH_PATTERN` name before either child starts. Owned dist, result, report, and
temporary paths are removed independently in deterministic order; later removals still run after a
failure, and nested aggregate causes are rendered without environment values.

R6 TDD evidence: the newly added tests first failed because `inverseTsconfigMutation` was absent
(0 pass, 1 fail). The repaired suite passed **18 tests / 70 expectations**, with typecheck and
targeted lint green. It did not start a browser, server, network request, provider, or credential
operation. R4 live discovery, mutation, and browser acceptance remain blocking.

### Task 8 repair — E1-T8-FOCUSED-RUNNER-SEAM-R7 (2026-08-01)

R6 is **rejected and non-accepting**: its tsconfig inverse modeled only a reduced include fixture,
not the installed Next serializer's complete JSON side effect. R7 derives the one accepted generated
byte sequence from the full pristine repository `tsconfig.json`: JSON serialization expands the
complete config, sorts the existing include entries, preserves `.next/types/**/*.ts`, then appends
the invocation-specific `distDir/types/**/*.ts` entry. Cleanup restores pristine tsconfig bytes
only if the current bytes exactly equal that full derived generated form. Any mismatch is treated as
a concurrent edit, is left untouched, and fails the gate.

R7 TDD evidence: replacing the reduced fixture with the actual repository pristine bytes and the
recorded complete generated bytes first failed at the literal-shape assertion (17 pass, 1 fail).
After the repair, the pure suite passed **18 tests / 72 expectations**; it explicitly proves the
full generated form, pristine hash equality, and concurrent-edit preservation. Typecheck and
targeted lint passed. No browser, server, network, provider, credential, staging, or commit action
was used; R4 live gates remain blocking.

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

- Scanner snapshot is reproducible from exact clean accepted reusable-package commit
  `c03cf1a79d0d1f2151ee602d67aa0a2eede673e4`.
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

## Task 8 terminal acceptance — E1-T8-POST-DISPOSITION (2026-08-02)

Task 8 is accepted at the live pre-commit fixed point. Exactly 16 parser-driven definitions were
retired, the seven Task 8 suites discover exactly **59** definitions per browser, and the separate
`pattern-unlock` case raises complete discovery to **60 per browser / 120 total**. CE01–CE08 retain
the specified CalendarEvent behavior as independent `non-Scanner coverage`; X04 is the strict
valid-zero Scanner browser/unit contract; X11 and X12 retain malformed-success dismissal and
Cmd+Enter/raw-free behavior. The focused launcher accepts Playwright's live list shape, owns its
isolated outputs, literally reverses Next config effects, and blocks config/output cleanup whenever
recorded child termination is not confirmed.

The first post-review broad replay is explicitly non-accepting because Bun 1.3.13 itself
segfaulted while entering `scanClient.test.ts`. That test then passed **5/5** in isolation. A fresh
authoritative `bun run verify:e1:offline` passed **246/246 unit tests / 949 expectations**, lint
with **0 errors** (18 pre-existing warnings), typecheck and production build, then **120/120**
Chromium and WebKit browser tests. The focused X04 Chromium replay passed. Cumulative path guard
and protected-inventory proof, whitespace checks, closed isolated ports, and owned-output cleanup
were also green.

Independent controlled Sol/high review first returned `VERIFIED:false` for the missing X04
projection unit and unsafe rejected-child settlement. The repaired projection is now owned by
`scannerDraft.ts` and consumed by `page.tsx`; its unit proves an empty schema-valid response creates
no drafts and invokes no identity factory. Rejected child exit now produces `settled:false`, and a
unit proves inverse/hash/port/removal phases are skipped. Rereview returned **`VERIFIED:true`** with
no Critical, Important, or Minor findings. Verified route metadata is
`provider=openai`, `model=gpt-5.6-sol`, `reasoning_effort=high`; report:
`/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260802T153028Z-66377-e1-t8-post-disposition-acceptance-rereview/report.json`.
No provider credential, external network, staging, publication, deployment, or production action
was used. Task 9's removal-assertion RED gate is next.

## Task 9 removal assertions RED — E1-T9-LEGACY-PARSE-REMOVAL-RED (2026-08-02)

Starting from accepted Task 8 commit `ab872d0`, `scripts/assert-e1-paths.ts` now expresses the
terminal Task 9 boundary before any production deletion. It rejects `/api/parse`,
`parseEventsBatch`, legacy scan-path `ParsedEvent`, `buildSSE`, and `mockParseAPI`; forbids review
components from importing the legacy exporter or `ics`; forbids browser-reachable Scanner
OpenRouter imports; requires exactly one production `/api/scan` literal in
`src/services/scanClient.ts`; and requires all three parser paths to be absent.

The first attempted RED also counted an E2E route fixture as a browser production call site and is
rejected as a false positive. After narrowing that assertion to production `src/**`, the exact
cumulative guard failed for the intended remaining legacy boundary: `/api/parse` in the parser
test, `parseEventsBatch` in the route/service, `ParsedEvent` in the service/test, and all three
legacy paths still present. Incremental-disabled typecheck, targeted lint, and `git diff --check`
passed. No production file was deleted or changed; no browser, server, network, provider,
credential, staging, commit, publication, or deployment action occurred. The minimal Task 9 GREEN
deletion/documentation step is next.

## Task 9 removal GREEN — E1-T9-LEGACY-PARSE-REMOVAL-GREEN (2026-08-02)

The minimal GREEN deletes only `src/app/api/parse/route.ts`, `src/services/parser.ts`, and
`src/services/__tests__/parser.test.ts`. README and `.env.example` now document exact Scanner
provenance/refresh, fixed text-link and vision model roles, Event Every versus Scanner ownership,
server-only raw-source lifetime, raw-free review storage, the separate unchanged Recent-input
IndexedDB feature, offline guarantees, and deferred E1/Cloudflare work. `OPENROUTER_MODEL` remains
documented for host URL detection only. The `ics` dependency and lockfile remain unchanged because
the untouched saved-history exporter still imports `ics`; Scanner review export does not.

The first GREEN guard attempt exposed an ignored stale `.next/types/validator.ts` import of the
deleted route. Only that generated validator was removed; no source/config assertion was weakened,
and Next build will regenerate it. The terminal guard then passed with **203 changed paths**.
Focused proof passed **241 unit tests / 943 expectations**, incremental-disabled typecheck,
targeted lint with zero errors (13 existing warnings), protected inventory 53,300, and whitespace
checks. Full offline/browser proof, exact Task 9 commit, post-commit replay, and independent
acceptance remain blocking and are next.

## Task 9 terminal local proof — E1-T9-TERMINAL-LOCAL-PROOF (2026-08-02)

`bun install --frozen-lockfile` passed without lockfile change. Fresh
`bun run verify:e1:offline` passed **241/241 unit tests / 943 expectations**, lint with **0
errors** (18 existing warnings), typecheck, and the production build; the generated route table has
16 pages and no `/api/parse`. The complete browser matrix passed **120/120** across Chromium and
WebKit. Terminal path guard accepted 203 cumulative paths, protected inventory verified 53,300
records, whitespace passed, ports 3777/3794 were closed, and status contained only the exact Task 9
candidate plus protected untracked paths. Exact-path commit and independent post-commit acceptance
remain next; no provider, credential, external network, staging, publication, or deployment was
used.

## Task 9 first terminal review disposition — E1-T9-PLAN-PIN-RECONCILIATION (2026-08-02)

Post-commit proof against `195e9b4` reproduced the frozen install, **241/241 unit tests / 943
expectations**, zero lint errors (18 existing warnings), typecheck, production build without
`/api/parse`, **120/120** Chromium/WebKit scenarios, the 203-path guard, and the 53,300-record
protected inventory. The independent controlled Sol/high review found no implementation,
privacy, provider-boundary, storage, export, network, deletion, or protected-path defect, but
returned **`VERIFIED:false`** for one Important authority inconsistency: this plan still called
the historical Scanner baseline `98aec60` the final vendor pin even though the accepted RPKG
program, vendor command, provenance, tests, and README all bind `c03cf1a`.

This revision explicitly records the independently accepted RPKG supersession and makes
`c03cf1a79d0d1f2151ee602d67aa0a2eede673e4` authoritative for packaged provenance and final E1
reproducibility while preserving `98aec60` as the historical starting baseline. Review report:
`/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260802T155801Z-83291-e1-terminal-acceptance-review/report.json`.
The corrected plan requires focused static proof, an exact docs-only commit, and independent
rereview before E1 can become proven; Cloudflare remains blocked.

## E1 terminal acceptance — E1-PROVEN (2026-08-02)

The two-document authority correction is committed at `cdae13d` after Task 9 implementation commit
`195e9b4`. Post-commit static proof passed the 203-path cumulative guard, the 53,300-record
protected inventory, both diff checks, and exact protected-only status. The resumed controlled
Sol/high reviewer confirmed that `98aec60` is now historical baseline only, `c03cf1a` is the
authoritative accepted package/provenance/reproducibility pin, and the live vendor command,
provenance, tests, README, RPKG acceptance chain, pack digest, and projected-artifact digest agree.
It returned **`VERIFIED:true`** with no Critical or Important finding. Report:
`/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260802T160919Z-90528-e1-terminal-acceptance-pin-rereview/report.json`.

Together with the already recorded separate post-`195e9b4` frozen install and full offline replay
(241/241 units / 943 expectations, zero lint errors, typecheck/build without `/api/parse`, and
120/120 Chromium/WebKit scenarios), this closes Event Every E1 Tasks 1–9. Protected user paths
remain untouched and untracked. No provider call, credential use, external network, deployment,
publication, or remote action occurred. E1 is proven; Cloudflare planning is the next program gate.
