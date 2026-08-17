# Event Every C1-B Private Provider State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove the local owner-only provider-state boundary with atomic daily budget reservation, at-most-once transport, durable minimized replay/ambiguity, reload-safe request recovery, and no community/public provider path.

**Architecture:** A per-request SQLite Durable Object owns immutable request binding, the only provider permit, minimized replay, and settlement outbox. A per-UTC-day SQLite Durable Object serializes integer owner-budget holds and settlements. The OpenNext host coordinates the two authorities, one fixed non-redirecting OpenRouter transport, and route-specific replay projections; browser operation records retain only content-free UUID/deadline metadata across reload.

**Tech Stack:** Next.js 15 App Router, TypeScript, Bun tests, Zod 4, OpenNext for Cloudflare, SQLite Durable Objects, Cloudflare Vitest pool, MSW, IndexedDB, Playwright Chromium/WebKit.

---

## Accepted authority and execution boundary

Implement the accepted design at `docs/superpowers/specs/2026-08-12-c1-b-private-state-design.md`, committed at `fbacf54`. Its accepted review is:

```text
/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T201855Z-14029-c1-b-private-design-final-acceptance/report.json
provider=openai model=gpt-5.6-sol effort=high verified=true timed_out=false verdict=VERIFIED:true
```

The program authority is Calendar-owned and must continue to hash exactly:

```text
/Users/manblack/Documents/calendar/docs/superpowers/specs/2026-08-11-private-use-process-redesign.md
c6d6e97ce3206f05e804a65576eb7cc9301cb63b12c30013665e63a228564c6f
```

This plan authorizes local, reversible implementation with synthetic data and injected transports. It does not authorize credentials, private/owner data, a provider call, non-loopback traffic, deployment, Access changes, DNS, remote resources, external legacy retirement, or publication.

Before each commit, preserve these six pre-existing protected Event Every entries exactly as found:

```text
 M docs/testing/e1-mutation-ledger.md
?? .claude/
?? scripts/run-c1-a-mutations.ts
?? scripts/run-c1-a-mutations.test.ts
?? tasks/task-192.md
?? tasks/task-193.md
```

Never read or stage those entries during implementation. `bun run assert:e1-protected` may inspect its own accepted protected inventory; implementation tasks may not modify it.

## File map and ownership

Create `scripts/c1-b-owned-paths.txt` in Task 1 with this exact sorted allowlist. Every ordinary C1-B change must be in this list; deleted files remain listed so Git deletion records are authorized.

```text
.env.example
.gitignore
bun.lock
cloudflare/app-worker.ts
docs/superpowers/plans/2026-08-12-event-every-c1-b-private.md
docs/superpowers/plans/2026-08-13-community-processing-pause.md
docs/superpowers/specs/2026-08-12-c1-b-private-state-design.md
docs/superpowers/specs/2026-08-13-community-processing-pause-design.md
docs/testing/c1-a-private-control-matrix.md
docs/testing/c1-b-private-mutation-ledger.md
e2e/c1-a-runtime-admission.spec.ts
e2e/community-limit.spec.ts
e2e/helpers.ts
e2e/private-provider-state.spec.ts
e2e/recent-input.spec.ts
package.json
playwright.c1-a.config.ts
playwright.config.ts
playwright.private.config.ts
scripts/assert-c1-a-config.test.ts
scripts/assert-c1-a-config.ts
scripts/assert-c1-a-e2e-inventory.test.ts
scripts/assert-c1-a-e2e-inventory.ts
scripts/assert-c1-b-paths.test.ts
scripts/assert-c1-b-paths.ts
scripts/assert-private-worker.test.ts
scripts/assert-private-worker.ts
scripts/c1-a-offline-preload.cjs
scripts/c1-a-offline-preload.test.ts
scripts/c1-b-owned-paths.txt
scripts/private-offline-preload.cjs
scripts/run-c1-a-offline.test.ts
scripts/run-c1-a-offline.ts
scripts/run-c1-a-worker-e2e.test.ts
scripts/run-c1-a-worker-e2e.ts
scripts/run-c1-b-mutations.test.ts
scripts/run-c1-b-mutations.ts
scripts/run-c1-b-offline.test.ts
scripts/run-c1-b-offline.ts
scripts/run-e1-focused.test.ts
scripts/run-private-offline.test.ts
scripts/run-private-offline.ts
scripts/run-private-privacy.test.ts
scripts/run-private-privacy.ts
scripts/run-private-worker-e2e.test.ts
scripts/run-private-worker-e2e.ts
src/app/api/__tests__/limit-gating.test.ts
src/app/api/provider-status/__tests__/route.test.ts
src/app/api/provider-status/route.ts
src/app/api/resolve-timezone/__tests__/route.test.ts
src/app/api/resolve-timezone/route.ts
src/app/api/scan/__tests__/route.test.ts
src/app/api/scan/route.ts
src/app/api/summarize/__tests__/route.test.ts
src/app/api/summarize/route.ts
src/app/api/usage/__tests__/route.test.ts
src/app/api/usage/route.ts
src/app/api/waitlist/__tests__/route.test.ts
src/app/api/waitlist/route.ts
src/app/page.tsx
src/app/spent/page.tsx
src/components/AuthWrapper.tsx
src/components/CommunityLimitScreen.tsx
src/components/OwnerBudgetBoundary.tsx
src/components/OwnerBudgetScreen.tsx
src/components/SmartInput.tsx
src/components/landing/LandingSections.tsx
src/lib/__tests__/budget.test.ts
src/lib/__tests__/limits.test.ts
src/lib/__tests__/llm.test.ts
src/lib/__tests__/ratelimit.test.ts
src/lib/budget.ts
src/lib/limits.ts
src/lib/llm.ts
src/lib/ratelimit.ts
src/lib/redisClient.ts
src/platform/__tests__/admission.test.ts
src/platform/__tests__/route-manifest.test.ts
src/platform/__tests__/runtime.test.ts
src/platform/cloudflare-context.ts
src/platform/cloudflare/owner-budget-authority.ts
src/platform/cloudflare/provider-operation.ts
src/platform/cloudflare/provider-request-authority.ts
src/platform/contracts.ts
src/platform/legacy/index.ts
src/platform/legacy/provider.ts
src/platform/legacy/usage.ts
src/platform/legacy/waitlist.ts
src/platform/provider/__tests__/cost.test.ts
src/platform/provider/__tests__/operation.test.ts
src/platform/provider/__tests__/policy.test.ts
src/platform/provider/__tests__/replay.test.ts
src/platform/provider/__tests__/request-binding.test.ts
src/platform/provider/__tests__/transport.test.ts
src/platform/provider/contracts.ts
src/platform/provider/cost.ts
src/platform/provider/policy.ts
src/platform/provider/replay.ts
src/platform/provider/request-binding.ts
src/platform/provider/transport.ts
src/platform/route-manifest.ts
src/platform/runtime.ts
src/server/scanner/__tests__/scan.test.ts
src/server/scanner/__tests__/transport.test.ts
src/server/scanner/job.ts
src/server/scanner/transport.ts
src/services/__tests__/inputStorage.test.ts
src/services/__tests__/providerOperation.test.ts
src/services/__tests__/scanClient.test.ts
src/services/__tests__/summarizer.test.ts
src/services/inputStorage.ts
src/services/providerOperation.ts
src/services/requestId.ts
src/services/scanClient.ts
src/services/summarizer.ts
src/services/urlDetector.ts
src/utils/communityLimit.ts
tasks/task-198.md
test/worker/app-worker.test.ts
test/worker/owner-budget-authority.integration.test.ts
test/worker/private-provider.integration.test.ts
test/worker/provider-privacy.integration.test.ts
test/worker/provider-request-authority.integration.test.ts
vitest.config.private-workers.ts
vitest.config.workers.ts
worker-configuration.d.ts
wrangler.jsonc
```

The accepted design is already committed. After this plan passes independent review, commit the plan alone and record that commit as the implementation range base before Task 1. Both documents are allowlisted only so the terminal checker can compare the whole accepted C1-B range. Do not amend them during Tasks 1–10 unless a reviewed defect requires a separate documented repair commit.

### Task 1: Lock ownership and implement pure provider policy

**Files:**
- Create: `scripts/c1-b-owned-paths.txt`
- Create: `scripts/assert-c1-b-paths.ts`
- Create: `scripts/assert-c1-b-paths.test.ts`
- Create: `scripts/private-offline-preload.cjs`
- Create: `scripts/run-private-offline.ts`
- Create: `scripts/run-private-offline.test.ts`
- Create: `src/platform/provider/contracts.ts`
- Create: `src/platform/provider/policy.ts`
- Create: `src/platform/provider/request-binding.ts`
- Create: `src/platform/provider/cost.ts`
- Create: `src/platform/provider/replay.ts`
- Test: `src/platform/provider/__tests__/policy.test.ts`
- Test: `src/platform/provider/__tests__/request-binding.test.ts`
- Test: `src/platform/provider/__tests__/cost.test.ts`
- Test: `src/platform/provider/__tests__/replay.test.ts`

- [ ] **Step 1: Build and test the fail-closed local command boundary first**

First write the minimal preload, then load the runner tests through it before implementing the runner. `private-offline-preload.cjs` must delete inherited credential-like variables before loading application modules, reject non-loopback `net`, `tls`, `http`, `https`, WebSocket, and global `fetch` destinations, and allow in-process MSW interception of the exact provider URL without a real socket. `run-private-offline.ts` accepts a command only after `--`, constructs an allowlisted child environment, applies the preload to Bun and Node descendants, bounds stdout/stderr, enforces a timeout, forwards termination, and reports only a fixed stage error.

```bash
bun test --preload ./scripts/private-offline-preload.cjs scripts/run-private-offline.test.ts --isolate
```

Expected: RED until the runner exists, then PASS including injected secret, outbound-socket, timeout, signal, and bounded-output cases.

- [ ] **Step 2: Write the ownership and policy tests**

Add tests that lock the exact route/variant policy, stable request name, current/previous HMAC behavior, lossless numeric handling, minimized replay, and protected-path filtering. The cost test must include:

```ts
test.each([
  ['0', { kind: 'exact', nanodollars: 0 }],
  ['0.0000000001', { kind: 'exact', nanodollars: 1 }],
  ['0.1234567890', { kind: 'exact', nanodollars: 123_456_789 }],
  ['5', { kind: 'exact', nanodollars: 5_000_000_000 }],
  ['01', { kind: 'malformed' }],
  ['-1', { kind: 'malformed' }],
  ['1e100', { kind: 'positive-overflow' }],
  ['9.007194254740992e6', { kind: 'positive-overflow' }],
])('classifies %s without binary rounding', (lexeme, expected) => {
  expect(parseCostLexeme(lexeme)).toEqual(expected);
});

test('rejects duplicate usage and usage.cost before decoding', () => {
  expect(() => parseBoundedProviderJson('{"usage":{"cost":1},"usage":{"cost":2}}')).toThrow('duplicate usage');
  expect(() => parseBoundedProviderJson('{"usage":{"cost":1,"cost":2}}')).toThrow('duplicate usage.cost');
});
```

The replay test injects a candidate URL, provider-authored issue message, evidence locator/excerpt, and raw marker. Expect bounded calendar values only, `sourceUid: null`, empty evidence, and locally reconstructed issue copy. Use strict lowercase UUIDs for source/candidate IDs.

- [ ] **Step 3: Run the tests and verify RED through the offline boundary**

```bash
bun -- scripts/run-private-offline.ts -- bun test scripts/assert-c1-b-paths.test.ts src/platform/provider/__tests__/policy.test.ts src/platform/provider/__tests__/request-binding.test.ts src/platform/provider/__tests__/cost.test.ts src/platform/provider/__tests__/replay.test.ts --isolate
```

Expected: FAIL because the C1-B modules and ownership checker do not exist.

- [ ] **Step 4: Implement the pure contracts**

Define these exact public discriminants in `contracts.ts`:

```ts
export type ProviderRoute = 'scan' | 'resolve-timezone' | 'summarize';
export type ProviderVariant = 'scan-text' | 'scan-image' | 'resolve-timezone' | 'summarize';
export type CostOutcome =
  | Readonly<{ kind: 'exact'; nanodollars: number }>
  | Readonly<{ kind: 'missing' | 'malformed' }>
  | Readonly<{ kind: 'positive-overflow' }>;
export type StoredProviderFailure = Readonly<{
  code: 'provider_rejected' | 'provider_unavailable' | 'provider_timeout' |
    'provider_rate_limited' | 'owner_provider_credit_unavailable' |
    'privacy_endpoint_unavailable' | 'provider_invalid_response' |
    'provider_outcome_unknown' | 'accounting_policy_breach' |
    'accounting_cost_overflow';
  httpStatus: 502 | 503 | 504;
}>;
```

`policy.ts` exports immutable `OWNER_POLICY_VERSION`, `OWNER_DAILY_LIMIT_NANODOLLARS`, route policy, 2/14/15-minute deadlines, 48/72-hour retention, exact models, and `https://openrouter.ai/api/v1/chat/completions`.

`request-binding.ts` exports stable UUID normalization/name derivation and current/previous HMAC candidate construction using Web Crypto. `cost.ts` stream-counts to 2 MiB, fatal-decodes UTF-8, rejects duplicate paths/trailing JSON, preserves the cost lexeme, and converts to `number` only after `BigInt <= 9_007_194_254_740_991n`.

`replay.ts` defines `DurableScanReplaySchema`, `DurableSummaryReplaySchema`, `DurableTimezoneReplaySchema`, `toDurableScanReplay`, and `materializeScanReplay`. Use a local exhaustive `Record<IssueCode, string>` plus the Scanner-exported issue traits; never persist incoming issue message/evidence. Add boundary and boundary-plus-one tests for 50 candidates, 200 issue references, every per-field UTF-8 ceiling, the 64 KiB serialized-candidate ceiling, 96-byte summary, and 255-byte timezone. Oversize input is `provider_invalid_response`, never truncation.

For summary, accept only Title Case with exactly two or three whitespace-separated words and reject punctuation/control characters, one/four words, non-Title-Case text, and 97 UTF-8 bytes. For timezone, validate the complete IANA identifier/link set by successfully constructing `new Intl.DateTimeFormat('en-US', { timeZone: value })`, at most 255 UTF-8 bytes, and finite confidence in `[0,1]`; accept `UTC`, `Etc/UTC`, `America/New_York`, and the IANA link `US/Eastern`, while rejecting an unknown zone, `NaN`, infinities, and boundary overflow. Serialize the first materialized response and a later replay and require byte-for-byte identical JSON for scan, summary, and timezone.

- [ ] **Step 5: Implement the path checker**

`assert-c1-b-paths.ts` parses NUL-delimited `git diff --name-status`, rejects absolute/traversal/glob/generated/credential paths, allows only the exact manifest, rejects staged protected paths, and ignores only the six named protected working entries. Terminal mode requires zero ordinary staged/unstaged/untracked paths.

- [ ] **Step 6: Run focused tests and static checks**

```bash
bun -- scripts/run-private-offline.ts -- bun test scripts/run-private-offline.test.ts scripts/assert-c1-b-paths.test.ts src/platform/provider/__tests__/policy.test.ts src/platform/provider/__tests__/request-binding.test.ts src/platform/provider/__tests__/cost.test.ts src/platform/provider/__tests__/replay.test.ts --isolate
bun -- scripts/run-private-offline.ts -- bun run type-check
git diff --check
```

Expected: all tests PASS, type-check exits 0, and diff check is empty.

- [ ] **Step 7: Commit the pure boundary**

```bash
git add scripts/c1-b-owned-paths.txt scripts/assert-c1-b-paths.ts scripts/assert-c1-b-paths.test.ts scripts/private-offline-preload.cjs scripts/run-private-offline.ts scripts/run-private-offline.test.ts src/platform/provider
git diff --cached --name-only
git commit -m "feat(event-every): define private provider policy"
```

Expected staged paths: only the fifteen Task 1 paths.

### Task 2: Implement the atomic owner-day budget authority

**Files:**
- Create: `src/platform/cloudflare/owner-budget-authority.ts`
- Create: `test/worker/owner-budget-authority.integration.test.ts`
- Modify: `cloudflare/app-worker.ts`
- Modify: `wrangler.jsonc`
- Modify: `worker-configuration.d.ts`
- Modify: `vitest.config.workers.ts`
- Modify: `src/platform/contracts.ts`

- [ ] **Step 1: Write Workerd tests for the budget state machine**

Cover identical reservation replay, changed-binding conflict, concurrent final-slot winner, committed rows counted in outstanding total, release only before commit, exact/full settlement, one primary breach plus one secondary concurrent breach, positive overflow, frozen-day admission, alarm-before-state crash on both sides of `setAlarm`/SQL commit, no-later-RPC expiry, safe-integer rows/aggregates, 72-hour cleanup, and UTC day mismatch. Assert the durable phase discriminator after eviction for: missing/malformed cost → `settled_full`; post-permit provider failure/unknown → `settled_full`; committed expiry → `settled_full`; exact cost equal to reservation → `settled`; and exact cost below reservation → `settled`. Prove both settlement phases survive retention/usage aggregation and are removed only at the 72-hour rule.

Use real Workerd concurrency:

```ts
const results = await Promise.all([
  authority.reserve(lastSlot('a')),
  authority.reserve(lastSlot('b')),
]);
expect(results.map((value) => value.status).sort()).toEqual(['exhausted', 'reserved']);

await Promise.all([
  authority.settle(primaryAboveReservation),
  authority.settle(secondAboveReservation),
]);
const rows = await budgetRows(stub);
expect(rows.filter((row) => row.breach_class === 'primary_breach')).toHaveLength(1);
expect(rows.filter((row) => row.breach_class === 'secondary_breach')).toHaveLength(1);
expect(Number.isSafeInteger(rows.reduce((sum, row) => sum + row.settled_nanodollars, 0))).toBe(true);
```

- [ ] **Step 2: Run the Workerd test and verify RED**

```bash
bun -- scripts/run-private-offline.ts -- bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/owner-budget-authority.integration.test.ts
```

Expected: FAIL because `OwnerBudgetAuthority` and its binding do not exist; `.open-next` and `.wrangler` are removed by the wrapper.

- [ ] **Step 3: Implement the authority and SQLite schema**

Use these exact row phases:

```sql
CREATE TABLE owner_budget_policy (
  authority_day TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  limit_nanodollars INTEGER NOT NULL,
  frozen_code TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE owner_budget_operation (
  execution_id TEXT PRIMARY KEY,
  request_authority_name TEXT NOT NULL,
  route TEXT NOT NULL,
  variant TEXT NOT NULL,
  reservation_nanodollars INTEGER NOT NULL,
  settled_nanodollars INTEGER,
  phase TEXT NOT NULL CHECK(phase IN ('reserved','committed','released','settled','settled_full')),
  breach_class TEXT CHECK(breach_class IN ('primary_breach','primary_overflow','secondary_breach')),
  reserved_until_ms INTEGER NOT NULL,
  transport_deadline_ms INTEGER,
  committed_until_ms INTEGER,
  terminal_at_ms INTEGER
);
```

Before any row/outbox requiring later work, durably arm an alarm no later than `min(existingAlarm, requiredDeadline, Date.now()+30_000)`. Never move an alarm later from an RPC. `commit` derives and idempotently returns absolute deadlines from the authority clock. All arithmetic asserts nonnegative safe integers before and after SQL. Trusted exact settlement uses `settled`; missing/malformed cost, post-permit failure/unknown, committed expiry, and positive overflow use `settled_full`. An exact cost equal to the reservation remains `settled`, not `settled_full`.

- [ ] **Step 4: Export and bind only the budget authority**

Add `OWNER_BUDGET_AUTHORITY` and migration tag `c1-b-budget-v1`. Do not change `STATE_AUTHORITY_MODE` from `legacy` yet; provider routes remain fail-closed until their whole coordinator exists. Exactly update `worker-configuration.d.ts` with no secret values.

- [ ] **Step 5: Run focused proof**

```bash
bun -- scripts/run-private-offline.ts -- bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/owner-budget-authority.integration.test.ts
bun -- scripts/run-private-offline.ts -- bun run type-check
git diff --check
```

Expected: PASS, zero type errors, no generated outputs.

- [ ] **Step 6: Commit the budget authority**

```bash
git add src/platform/cloudflare/owner-budget-authority.ts test/worker/owner-budget-authority.integration.test.ts cloudflare/app-worker.ts wrangler.jsonc worker-configuration.d.ts vitest.config.workers.ts src/platform/contracts.ts
git commit -m "feat(event-every): reserve owner budget atomically"
```

### Task 3: Implement the eviction-safe request authority

**Files:**
- Create: `src/platform/cloudflare/provider-request-authority.ts`
- Create: `test/worker/provider-request-authority.integration.test.ts`
- Modify: `cloudflare/app-worker.ts`
- Modify: `wrangler.jsonc`
- Modify: `worker-configuration.d.ts`
- Modify: `vitest.config.workers.ts`
- Modify: `src/platform/contracts.ts`

- [ ] **Step 1: Write Workerd request-state tests**

Test every state and idempotent RPC, same UUID/different binding, frozen day/key version across midnight, previous-key retry, lost claim response, raw nonce absence, constant-time completion rejection for a different nonce, absolute deadline, exact-boundary late completion, stored replay, fixed failure, unknown, settlement outbox, 48-hour completion-anchored erasure, permanent tombstone, alarm-before-state crash with no later RPC, and `status()` read-only behavior. Parameterize `evictDurableObject` before and after every durable phase (`prepared`, `reserved`, `budget_committed`, `provider_inflight`, `completed`, `failed`, `unknown`, and replay erasure) and before/after every alarm/SQLite boundary; after each eviction require the same idempotent result and no second permit.

After 48-hour erasure, inspect SQLite and require the permanent tombstone table row to contain exactly four columns/values: `{ requestDigest, executionId, terminalClass, state: 'expired' }`. Assert no request row or auxiliary row remains, so the UUID, request-shape digest/key version, route/variant/day, permit verifier, replay/error body, reservation/settlement values, outbox/retry fields, and transient timestamps are absent. A retry against that tombstone remains expired forever.

```ts
const permit = await authority.claimTransport({ executionId });
expect(permit.status).toBe('permit');
if (permit.status !== 'permit') return;
expect(JSON.stringify(await requestRows(stub))).not.toContain(permit.nonce);
await evictDurableObject(stub);
await expect(authority.completeKnown({
  executionId,
  nonce: permit.nonce,
  replay,
  costOutcome: { kind: 'exact', nanodollars: 1 },
})).resolves.toMatchObject({ status: 'stored' });
```

- [ ] **Step 2: Run RED**

```bash
bun -- scripts/run-private-offline.ts -- bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/provider-request-authority.integration.test.ts
```

Expected: FAIL because the class/binding does not exist.

- [ ] **Step 3: Implement the request schema and RPCs**

Persist exactly `prepared`, `reserved`, `budget_committed`, `provider_inflight`, `completed`, `failed`, `unknown`, and `expired`, with terminal settlement discriminant `settlement_pending | settlement_complete`. Store only `permit_verifier`, never the nonce. `claimTransport` creates 32 random bytes, persists `SHA-256("event-every/provider-permit/v1\0" + nonce)`, and returns nonce plus the stored absolute deadline. Completion recomputes and timing-safely compares bytes after eviction. `status()` runs deterministic expiry housekeeping but cannot create a request, reserve/settle budget, issue a nonce, or change retention.

Create a settlement outbox row in the same transaction as terminal replay/failure. Apply the same alarm-before-state invariant as Task 2. Result expiry is created in the `completed`/`failed` transaction, never in `begin`. The erasure transaction rewrites to the exact four-field logical tombstone above and deletes verifier, replay, error, settlement/outbox, binding, and transient timing columns rather than merely nulling the replay blob.

- [ ] **Step 4: Add the binding**

Export `ProviderRequestAuthority`, add `PROVIDER_REQUEST_AUTHORITY`, and add migration tag `c1-b-request-v1`. Keep provider routes closed.

- [ ] **Step 5: Run focused proof and commit**

```bash
bun -- scripts/run-private-offline.ts -- bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/provider-request-authority.integration.test.ts test/worker/owner-budget-authority.integration.test.ts
bun -- scripts/run-private-offline.ts -- bun run type-check
git diff --check
git add src/platform/cloudflare/provider-request-authority.ts test/worker/provider-request-authority.integration.test.ts cloudflare/app-worker.ts wrangler.jsonc worker-configuration.d.ts vitest.config.workers.ts src/platform/contracts.ts
git commit -m "feat(event-every): persist provider request outcomes"
```

Expected: both Workerd suites PASS and only Task 3 paths are committed.

### Task 4: Build the single coordinator and fixed provider transport

**Files:**
- Create: `src/platform/provider/transport.ts`
- Create: `src/platform/provider/__tests__/transport.test.ts`
- Create: `src/platform/cloudflare/provider-operation.ts`
- Create: `src/platform/provider/__tests__/operation.test.ts`
- Modify: `src/platform/cloudflare-context.ts`
- Modify: `src/server/scanner/transport.ts`
- Modify: `src/server/scanner/job.ts`
- Modify: `src/server/scanner/__tests__/transport.test.ts`

- [ ] **Step 1: Write transport and coordinator tests first**

Cover all four operation variants, the fixed model table, the fixed OpenRouter origin, `redirect: 'manual'`, exact outbound request shape, no body read for non-2xx responses, body cancellation exactly once for redirects/non-2xx, fatal UTF-8 decoding, the 2 MiB streamed-body cap, duplicate `usage`/`cost` rejection, trailing JSON rejection, and abort classification. Test the whole coordinator with fakes proving:

```ts
expect(providerFetch).not.toHaveBeenCalled(); // before the durable permit
expect(await runOperation(sameRequest)).toEqual(firstTerminalResult);
expect(providerFetch).toHaveBeenCalledTimes(1);
expect(requestAuthority.completeKnown).toHaveBeenCalledBefore(returnToRoute);
```

Assert this exact successful RPC order:

```text
request.begin
budget.reserve
request.recordReservation
budget.commit
request.recordBudgetCommitted
request.claimTransport
provider transport
request.completeKnown | request.completeFailed | request.completeUnknown
budget.settle through the durable outbox
```

Simulate a lost response after every cross-object call, including `reserve`, `recordReservation`, `commit`, `recordBudgetCommitted`, `claimTransport`, terminal completion, and settlement. Also test budget rejection, replay hit, fixed failure, primary above-reservation breach, positive overflow, and two concurrent above-reservation completions: breach/overflow must become durable fixed 502 failures with no replay body, and only one concurrent breach is primary.

With a fake clock, prove that no permit is issued before both authorities durably hold the absolute deadlines, that `Date.now() >= transportDeadlineMs` loses to `unknown`, and that transport plus response streaming receive the same combined abort signal produced from the caller signal and the authority deadline.

- [ ] **Step 2: Run RED**

```bash
bun -- scripts/run-private-offline.ts -- bun test src/platform/provider/__tests__/transport.test.ts src/platform/provider/__tests__/operation.test.ts src/server/scanner/__tests__/transport.test.ts
```

Expected: FAIL because the common transport/coordinator do not exist and the scanner still controls provider work directly.

- [ ] **Step 3: Implement the fixed transport**

Export one `callOpenRouter` function. It must accept only the closed `ConsumerKind` union and look up the route/model/token reservation from `PROVIDER_POLICY`; callers cannot pass a URL, model, or price. Fetch exactly:

```ts
await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  redirect: 'manual',
  headers: {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(providerBody),
  signal,
});
```

Reject every redirect and non-success status without reading its body and cancel that body exactly once. Stream success bytes through `TextDecoder('utf-8', { fatal: true })`; cancel and reject before byte 2,097,153. Parse exactly one JSON value and hand its sole usage/cost field to Task 1's exact parser.

- [ ] **Step 4: Implement the coordinator**

`runProviderOperation` is the only module allowed to call `callOpenRouter`. It derives both authority names and executes exactly `begin → budget.reserve → recordReservation → budget.commit → recordBudgetCommitted → claimTransport`. Only after all six acknowledgements may it invoke transport. Every retry replays those idempotent calls from `begin`; it never skips forward based on process memory.

Use the authority-returned absolute `transportDeadlineMs` to construct one `AbortSignal.any([callerSignal, deadlineSignal])`; pass that same signal to `fetch` and every response-reader operation. If the authority clock observes `Date.now() >= transportDeadlineMs`, persist `unknown` and do not invoke/accept transport. Never derive a new deadline from retry time. After transport, store `completeKnown`, `completeFailed`, or `completeUnknown` before returning and drive settlement only through the durable request-authority outbox.

The coordinator passes the raw request only as an in-memory closure into the one transport call; the raw request must not occur in an RPC argument, log, metric, exception, or durable record.

Keep `src/server/scanner/transport.ts` as a typed adapter only. Refactor `src/server/scanner/job.ts` to call the coordinator and map the minimized replay back into the established scanner result contract.

- [ ] **Step 5: Prove the coordinator and commit**

```bash
bun -- scripts/run-private-offline.ts -- bun test src/platform/provider/__tests__/transport.test.ts src/platform/provider/__tests__/operation.test.ts src/server/scanner/__tests__/transport.test.ts
bun -- scripts/run-private-offline.ts -- bun run type-check
git diff --check
git add src/platform/provider/transport.ts src/platform/provider/__tests__/transport.test.ts src/platform/cloudflare/provider-operation.ts src/platform/provider/__tests__/operation.test.ts src/platform/cloudflare-context.ts src/server/scanner/transport.ts src/server/scanner/job.ts src/server/scanner/__tests__/transport.test.ts
git commit -m "feat(event-every): coordinate provider execution"
```

Expected: all named tests PASS, types PASS, and no provider fetch is possible without a durable permit.

### Task 5: Put every provider route behind the authority graph

**Files:**
- Create: `src/app/api/provider-status/route.ts`
- Create: `src/app/api/provider-status/__tests__/route.test.ts`
- Modify: `src/app/api/scan/route.ts`
- Modify: `src/app/api/scan/__tests__/route.test.ts`
- Modify: `src/app/api/summarize/route.ts`
- Modify: `src/app/api/summarize/__tests__/route.test.ts`
- Modify: `src/app/api/resolve-timezone/route.ts`
- Modify: `src/app/api/resolve-timezone/__tests__/route.test.ts`
- Modify: `src/app/api/usage/route.ts`
- Modify: `src/app/api/usage/__tests__/route.test.ts`
- Modify: `src/platform/__tests__/route-manifest.test.ts`
- Modify: `src/platform/route-manifest.ts`
- Modify: `src/platform/runtime.ts`
- Modify: `src/platform/__tests__/admission.test.ts`
- Modify: `src/platform/__tests__/runtime.test.ts`
- Modify: `src/server/scanner/job.ts`
- Modify: `src/server/scanner/__tests__/scan.test.ts`
- Delete: `src/platform/legacy/provider.ts`
- Delete: `src/platform/legacy/usage.ts`
- Delete: `src/platform/legacy/waitlist.ts`
- Delete: `src/platform/legacy/index.ts`
- Delete: `src/lib/budget.ts`
- Delete: `src/lib/limits.ts`
- Delete: `src/lib/llm.ts`
- Delete: `src/lib/ratelimit.ts`
- Delete: `src/lib/redisClient.ts`
- Delete: `src/lib/__tests__/budget.test.ts`
- Delete: `src/lib/__tests__/limits.test.ts`
- Delete: `src/lib/__tests__/llm.test.ts`
- Delete: `src/lib/__tests__/ratelimit.test.ts`
- Delete: `src/app/api/__tests__/limit-gating.test.ts`
- Delete: `src/app/api/waitlist/route.ts`
- Delete: `src/app/api/waitlist/__tests__/route.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Write route contract tests**

For scan, summarize, and timezone, require a strict UUID in `X-Event-Every-Request-Id`, reject missing/malformed IDs before any authority call, and assert the coordinator receives the correct closed operation variant. Test replay, budget denial, pending/conflict/expired, state unavailable, and every fixed provider failure without leaking upstream bodies or stack traces. The exact mappings are: `402 → 503 owner_provider_credit_unavailable`; `408 → 504 provider_timeout`; `429 → 503 provider_rate_limited`; Scanner fixed-model privacy `503 → 503 privacy_endpoint_unavailable`; other 4xx → `502 provider_rejected`; other 5xx → `502 provider_unavailable`; ambiguous post-invocation outcome → `502 provider_outcome_unknown`; request validation → existing fixed 400; pending/conflict/expired → fixed 409; owner budget rejection → `402 owner_budget_exhausted`; binding/secret/state failure → `503 provider_state_unavailable`.

For `POST /api/provider-status`, set a manifest wire-body limit of exactly 1 KiB and accept only strict JSON `{ requestId }` with no unknown keys. Assert it performs `status()` on the derived request authority and table-drive pending metadata, minimized replay for each route, every fixed terminal failure, unknown, expired, and malformed/oversize input. Explicitly assert zero calls to begin, budget reserve/commit/release/settle, permit claim, transport, alarm/retention extension, or any other mutator.

Usage must expose only the accepted content-free shape:

```ts
type UsageResponse = {
  status: 'available';
  policyVersion: 'owner-v1';
  authorityDay: string;
  limitNanodollars: number;
  spentNanodollars: number;
  reservedNanodollars: number;
  remainingNanodollars: number;
  exhausted: boolean;
  frozen: boolean;
  resetAt: string;
};
```

Table-drive usage arithmetic: `reservedNanodollars` equals all `reserved + committed` holds; `remainingNanodollars = max(0, limit - spent - reserved)`; `exhausted` becomes true when less than the 500,000-nanodollar minimum route reservation remains; either accounting freeze class sets `frozen`; unavailable state is fixed `503 owner_budget_unavailable` with no Redis fallback. Assert `Cache-Control: no-store` on both successful usage and fixed unavailable responses.

At route level, freeze a request on day D, retry after UTC midnight on day D+1, exhaust its original day authority, and require `402 owner_budget_exhausted` with day D's reset timestamp—not the retry day's reset.

- [ ] **Step 2: Run route tests RED**

```bash
bun -- scripts/run-private-offline.ts -- bun test src/app/api/scan/__tests__/route.test.ts src/app/api/summarize/__tests__/route.test.ts src/app/api/resolve-timezone/__tests__/route.test.ts src/app/api/usage/__tests__/route.test.ts src/app/api/provider-status/__tests__/route.test.ts src/platform/__tests__/route-manifest.test.ts
```

Expected: FAIL because routes still use the legacy provider and the status route does not exist.

- [ ] **Step 3: Implement thin authority-backed routes**

Validate with Zod at the edge, call only `runProviderOperation` or the read-only status adapter, and map errors through the existing route error boundary. Do not add a second coordinator or route-specific provider call.

Keep `/api/waitlist` in the retired manifest with `410 Gone`, but remove its route module so the request is answered by the existing edge retirement path. Preserve `src/platform/legacy/dispatch.ts` solely as unreachable archival compatibility code; no application module may import it.

- [ ] **Step 4: Remove the product-reachable legacy stack**

Delete the listed modules and `@upstash/redis`. Make `src/platform/runtime.ts` a Cloudflare-only binding accessor with no `STATE_AUTHORITY_MODE` fallback and no environment-selectable provider URL/model. Add graph assertions that product-reachable code cannot import the deleted modules, `legacy/dispatch`, or call provider `fetch` outside `src/platform/provider/transport.ts`.

- [ ] **Step 5: Prove the route cutover and commit**

```bash
bun -- scripts/run-private-offline.ts -- bun test src/app/api/scan/__tests__/route.test.ts src/app/api/summarize/__tests__/route.test.ts src/app/api/resolve-timezone/__tests__/route.test.ts src/app/api/usage/__tests__/route.test.ts src/app/api/provider-status/__tests__/route.test.ts src/platform/__tests__/route-manifest.test.ts src/platform/__tests__/runtime.test.ts
bun -- scripts/run-private-offline.ts -- bun run lint
bun -- scripts/run-private-offline.ts -- bun run type-check
git diff --check
git add src/app/api src/platform/runtime.ts src/platform/__tests__/runtime.test.ts src/platform/route-manifest.ts src/platform/__tests__/route-manifest.test.ts src/platform/legacy src/lib package.json bun.lock
git commit -m "refactor(event-every): route provider work through durable state"
```

Expected: named suites PASS; their product-graph assertions find no Upstash import, provider base-URL/model override, runtime mode fallback, legacy dispatch import, or provider fetch outside the one transport. `wrangler.jsonc` still contains the intentionally unchanged legacy mode label until Task 7 performs the final atomic configuration cutover.

### Task 6: Add reload-safe browser operations and retire community UX

**Files:**
- Create: `src/services/providerOperation.ts`
- Create: `src/services/__tests__/providerOperation.test.ts`
- Modify: `src/services/inputStorage.ts`
- Modify: `src/services/__tests__/inputStorage.test.ts`
- Modify: `src/services/requestId.ts`
- Modify: `src/services/scanClient.ts`
- Modify: `src/services/__tests__/scanClient.test.ts`
- Modify: `src/services/summarizer.ts`
- Modify: `src/services/__tests__/summarizer.test.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write browser lifecycle tests**

Test IndexedDB upgrade from the current version, successful transaction completion, the strict content-free operation record, a UUID created once per operation and reused across POST retry/status polling, reload restoration, new-submission blocking while any record is nonterminal, replay delivery to its consumer, terminal deletion only after acknowledgement, and explicit preterminal Cancel abandonment.

```ts
expect(await listProviderOperations()).toEqual([{
  requestId: expect.stringMatching(UUID_PATTERN),
  route: '/api/scan',
  consumerKind: 'scan_text',
  consumerRef: expect.stringMatching(UUID_PATTERN),
  createdAtMs: expect.any(Number),
  transportDeadlineMs: null,
  state: 'pending',
}]);
expect(JSON.stringify(await listProviderOperations())).not.toContain(rawInput);
```

Test newly created history-entry IDs as UUIDs while legacy IDs remain readable. Test that browser code never reads or sends the owner key.

- [ ] **Step 2: Run browser tests RED**

```bash
bun -- scripts/run-private-offline.ts -- bun test src/services/__tests__/providerOperation.test.ts src/services/__tests__/inputStorage.test.ts src/services/__tests__/scanClient.test.ts src/services/__tests__/summarizer.test.ts
```

Expected: FAIL because operation persistence/restoration does not exist.

- [ ] **Step 3: Implement the content-free operation store**

Increment the IndexedDB schema version and add `provider-operations` keyed by `requestId`. Store exactly the seven fields in the accepted design; define `transportDeadlineMs` as `number | null`, with `null` before authority metadata arrives, and reject extra keys when reading. Every write helper resolves only after `transaction.oncomplete`; transaction abort/error rejects, and inability to persist fails before the first provider POST.

Before the first provider POST, create and persist the record. `scanClient` and `summarizer` accept an operation object instead of creating a request ID internally. On network/no-response or 409 pending, and on page startup, restore/block before enabling new provider work and poll `/api/provider-status` with the same body/UUID using abort-aware delays `250 ms, 500 ms, 1 s, 2 s, 4 s`, capped at `5 s`. Polling continues past 750 ms, updates the local nullable deadline only from pending authority metadata, continues through that absolute deadline, and performs one final observation. It never derives a deadline from retry time or creates a replacement UUID.

Deliver a minimized replay to `consumerRef` and delete the record only after consumer acknowledgement. A pre-permit operation whose raw body was lost waits for durable expiry; status never recreates or transports it. Only explicit Cancel may abandon a preterminal operation. Add fake-clock tests for the exact delay sequence, the final observation, reload continuation, stable UUID, and acknowledgement-before-deletion.

- [ ] **Step 4: Prove browser lifecycle and commit**

```bash
bun -- scripts/run-private-offline.ts -- bun test src/services/__tests__/providerOperation.test.ts src/services/__tests__/inputStorage.test.ts src/services/__tests__/scanClient.test.ts src/services/__tests__/summarizer.test.ts
bun -- scripts/run-private-offline.ts -- bun run type-check
bun -- scripts/run-private-offline.ts -- bun run lint
git diff --check
git add src/services/providerOperation.ts src/services/__tests__/providerOperation.test.ts src/services/inputStorage.ts src/services/__tests__/inputStorage.test.ts src/services/requestId.ts src/services/scanClient.ts src/services/__tests__/scanClient.test.ts src/services/summarizer.ts src/services/__tests__/summarizer.test.ts src/app/page.tsx
git commit -m "feat(event-every): recover provider work after reload"
```

Expected: tests PASS, browser operations survive reload with the original UUID, and source/tests prove the Worker owner secret is absent from browser request construction.

### Task 7: Make the private Worker graph authoritative and retain C1-A

**Files:**
- Modify: `.env.example`
- Modify: `cloudflare/app-worker.ts`
- Modify: `wrangler.jsonc`
- Modify: `worker-configuration.d.ts`
- Modify: `package.json`
- Modify: `test/worker/app-worker.test.ts`
- Modify: `scripts/assert-c1-a-config.ts`
- Modify: `scripts/assert-c1-a-config.test.ts`
- Modify: `scripts/run-c1-a-worker-e2e.ts`
- Modify: `scripts/run-c1-a-worker-e2e.test.ts`
- Modify: `scripts/assert-c1-a-e2e-inventory.ts`
- Modify: `scripts/assert-c1-a-e2e-inventory.test.ts`
- Modify: `scripts/run-c1-a-offline.ts`
- Modify: `scripts/run-c1-a-offline.test.ts`
- Modify: `playwright.c1-a.config.ts`
- Modify: `e2e/c1-a-runtime-admission.spec.ts`
- Modify: `e2e/community-limit.spec.ts`
- Modify: `docs/testing/c1-a-private-control-matrix.md`
- Create: `src/components/OwnerBudgetBoundary.tsx`
- Create: `src/components/OwnerBudgetScreen.tsx`
- Modify: `src/components/AuthWrapper.tsx`
- Modify: `src/components/SmartInput.tsx`
- Modify: `src/components/landing/LandingSections.tsx`
- Modify: `src/services/urlDetector.ts`
- Delete: `src/app/spent/page.tsx`
- Delete: `src/components/CommunityLimitScreen.tsx`
- Delete: `src/utils/communityLimit.ts`
- Create: `scripts/assert-private-worker.ts`
- Create: `scripts/assert-private-worker.test.ts`

- [ ] **Step 1: Write authoritative-graph assertions**

Extend the C1-A config tests without weakening its edge-admission, resolver, offline, cleanup, port, or protected-input checks. Require the app Worker to export both provider authorities and bind them with SQLite migrations. Require checked-in `STATE_AUTHORITY_MODE=cloudflare`, fixed policy/key-version labels, and secret binding types for `OPENROUTER_OWNER_KEY`, `PROVIDER_REQUEST_HMAC_CURRENT`, and optional previous-key rotation values; reject literal secret assignments.

`assert-private-worker.ts` owns the entire credential-scrubbed offline build lifecycle. Before building it refuses any pre-existing `.open-next` or `.wrangler` path and hashes every authored build input it will consume. Starting from `.open-next/worker.js`, it resolves every static emitted import, rejects unresolved or non-literal dynamic reachability, and scans every reachable JavaScript asset plus source-map `sources` and `sourcesContent`. It fails on the legacy provider/usage/waitlist graph, Redis/Upstash symbols, community or waitlist product copy, `OPENROUTER_COMMUNITY_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, environment model selectors, `/spent`, and imports of `src/platform/legacy/dispatch.ts`. It requires the exact provider origin and both new authority class names, rehashes/authenticates all authored inputs after the scan, and removes only outputs it created in `finally`.

Add fixtures proving failure when a forbidden symbol exists only in a statically imported child chunk, source-map source/content, unresolved import, or dynamic import target. Add tests for pre-existing-output refusal and authored-input hash drift, including proof the scanner never deletes output it did not create. Unit tests use a temporary fake artifact; they do not build.

- [ ] **Step 2: Run RED**

```bash
bun -- scripts/run-private-offline.ts -- bun test scripts/assert-c1-a-config.test.ts scripts/assert-c1-a-e2e-inventory.test.ts scripts/run-c1-a-offline.test.ts scripts/assert-private-worker.test.ts test/worker/app-worker.test.ts --isolate
```

Expected: FAIL because the final bindings and artifact scanner are not installed.

- [ ] **Step 3: Wire the final Cloudflare-only configuration**

Export both authorities from `cloudflare/app-worker.ts`; add the Durable Object bindings/migrations to `wrangler.jsonc`; keep C1-A's admission/resolver bindings unchanged. Checked-in vars may contain only non-secret `STATE_AUTHORITY_MODE=cloudflare`, `PROVIDER_POLICY_VERSION=owner-v1`, `PROVIDER_REQUEST_HMAC_CURRENT_VERSION=c1-b-current-v1`, and an optional previous-version label. Secret binding types are exactly `OPENROUTER_OWNER_KEY`, `PROVIDER_REQUEST_HMAC_CURRENT`, and optional `PROVIDER_REQUEST_HMAC_PREVIOUS`; no secret value is checked in. `.env.example` documents these names with empty values and states that real values are later deployment-gate inputs, not C1-B inputs.

Update the existing C1-A assertion from its old exact artifact to the accepted C1-B superset while retaining every original safety property. Do not make the legacy keepalive worker importable from the app Worker.

Replace the C1-A harness variables with synthetic `OPENROUTER_OWNER_KEY`, `PROVIDER_REQUEST_HMAC_CURRENT`, `PROVIDER_REQUEST_HMAC_CURRENT_VERSION=c1-b-current-v1`, `PROVIDER_POLICY_VERSION=owner-v1`, and `STATE_AUTHORITY_MODE=cloudflare`; remove `OPENROUTER_COMMUNITY_KEY`. Its outbound canary still makes exactly one MSW-intercepted request to the fixed origin with zero real sockets, but now expects fixed `502 provider_outcome_unknown` after the injected post-permit network failure.

Add runner tests that missing/empty owner or HMAC bindings, wrong binding names, wrong mode, wrong policy version, or wrong HMAC version fail before transport. Prove an HMAC value mismatch by retrying an existing UUID/shape/version frozen under a different synthetic key and expecting idempotency conflict before transport. Treat an arbitrary nonempty owner key as opaque: send a deliberately invalid synthetic value only to the intercepted transport seam, map its synthetic provider rejection through the fixed route contract, and never add production comparison against a known key value.

- [ ] **Step 4: Retire community UX and remap C1-A proof atomically**

Delete `/spent`, the community-limit utility, and whole-page community screen. `OwnerBudgetBoundary` reads only `/api/usage`; `OwnerBudgetScreen` renders fixed exhausted/frozen/unavailable states without request IDs, provider details, or waitlist actions. The owner provider credential remains exclusively `OPENROUTER_OWNER_KEY` in the Worker binding and is absent from browser code.

Remove every landing/app statement about community sponsorship, shared daily limits, public free use, membership, or waitlist. Rewrite `e2e/community-limit.spec.ts` in place as owner-budget exhaustion/freeze/unavailable coverage, then update the exact C1-A E2E inventory and offline focused-test mapping to those surviving tests. Do not weaken or remove edge admission, resolver, offline, cleanup, protected-hash, mutation, or both-engine requirements.

Do not add the cross-product user-data FAQ here; `EE-DATA-FAQ` remains the next separately reviewed artifact after the behavioral/privacy canary.

- [ ] **Step 5: Turn the reported React hydration failure into a browser gate**

In both Chromium and WebKit, capture `pageerror` and error/warning console messages before navigation. Type `Lunch with Priya` into the content-editable input, wait for the local draft transaction, reload, and assert the draft is restored only after the server-identical first hydration render. Assert no message contains `Hydration failed`, `didn't match the client`, `did not match`, or a React error boundary/invalid nesting warning. Keep that person name explicitly classified as ordinary event input, not a product or brand label.

Keep `SmartInput`'s server and first client markup deterministically empty and non-editable; set `contentEditable` and apply IndexedDB/browser-restored text only in effects after hydration. Do not render stored text during the initial client render, and do not use a time/random/browser-value initializer in JSX.

- [ ] **Step 6: Build, scan, regress C1-A, and commit**

```bash
bun -- scripts/run-private-offline.ts -- bun test scripts/assert-c1-a-config.test.ts scripts/assert-c1-a-e2e-inventory.test.ts scripts/run-c1-a-offline.test.ts scripts/assert-private-worker.test.ts scripts/run-c1-a-worker-e2e.test.ts test/worker/app-worker.test.ts --isolate
bun -- scripts/run-private-offline.ts -- bun scripts/assert-private-worker.ts
bun -- scripts/run-private-offline.ts -- bun run verify:c1:a
git diff --check
git add .env.example cloudflare/app-worker.ts wrangler.jsonc worker-configuration.d.ts package.json test/worker/app-worker.test.ts scripts/assert-c1-a-config.ts scripts/assert-c1-a-config.test.ts scripts/assert-c1-a-e2e-inventory.ts scripts/assert-c1-a-e2e-inventory.test.ts scripts/run-c1-a-offline.ts scripts/run-c1-a-offline.test.ts scripts/run-c1-a-worker-e2e.ts scripts/run-c1-a-worker-e2e.test.ts playwright.c1-a.config.ts e2e/c1-a-runtime-admission.spec.ts e2e/community-limit.spec.ts docs/testing/c1-a-private-control-matrix.md src/components/OwnerBudgetBoundary.tsx src/components/OwnerBudgetScreen.tsx src/components/AuthWrapper.tsx src/components/SmartInput.tsx src/components/CommunityLimitScreen.tsx src/components/landing/LandingSections.tsx src/services/urlDetector.ts src/app/spent/page.tsx src/utils/communityLimit.ts scripts/assert-private-worker.ts scripts/assert-private-worker.test.ts
git commit -m "chore(event-every): lock the private worker graph"
```

Expected: artifact scan and C1-A gate PASS, both browser engines report no hydration/React errors, and their owned `.open-next`/`.wrangler`/Playwright outputs are removed.

### Task 8: Build the offline privacy canary and private Worker E2E

**Files:**
- Create: `scripts/run-private-privacy.ts`
- Create: `scripts/run-private-privacy.test.ts`
- Create: `vitest.config.private-workers.ts`
- Create: `test/worker/private-provider.integration.test.ts`
- Create: `test/worker/provider-privacy.integration.test.ts`
- Create: `scripts/run-private-worker-e2e.ts`
- Create: `scripts/run-private-worker-e2e.test.ts`
- Create: `playwright.private.config.ts`
- Create: `e2e/private-provider-state.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Unit-test the canary orchestrators**

Use injected process/build/browser seams to prove exact stage order, scrubbed child environments, loopback-only sockets, bounded output, signal/timeout cleanup, authored-input hash preservation, collision refusal, and removal of every owned `.open-next`, `.wrangler`, test-results, report, and temporary directory. Test that a simulated external socket, inherited credential, marker leak, missing cleanup, or changed authored input makes the runner fail closed.

- [ ] **Step 2: Write Workerd privacy and concurrency tests**

With synthetic keys and an MSW handler for only the exact fixed provider URL, exercise text, image, summary, timezone, provider error, abort, retry, settlement failure, final-slot concurrency, provider crash, ambiguous retry, and UTC rollover. Inspect Durable Object SQLite directly through `cloudflare:test`—never through a production route.

Use four distinct markers: raw-only, provider-envelope/evidence, secret, and documented result. Assert the first three never occur in response errors, logger output, either authority's rows, alarms/outboxes, cache APIs, or generated artifacts. Permit the documented marker only in the minimized first/replayed result and request replay row before 48-hour expiry; require its removal from the permanent tombstone afterward.

- [ ] **Step 3: Write reload browser E2E in both engines**

The Worker E2E pauses one synthetic provider request after the local record is committed, reloads the page, confirms IndexedDB contains only the seven allowed fields, resumes through `/api/provider-status` with the original UUID, delivers the replay to the correct consumer, deletes the local record, and observes one provider transport. It also covers explicit Cancel and asserts zero hydration/React console errors.

- [ ] **Step 4: Implement the exact canary command**

Add these scripts exactly:

```json
{
  "verify:private:privacy": "bun scripts/run-private-privacy.ts",
  "test:e2e:private": "bun scripts/run-private-worker-e2e.ts"
}
```

The Task 1 preload deletes credential-like variables before module import and denies every non-loopback socket. The MSW provider response is in-process and never reaches the network. The privacy runner invokes focused unit tests, private Workerd suites, local artifact scan, and both-engine private E2E, then performs a second marker/output filesystem scan after cleanup.

- [ ] **Step 5: Run the required canary and commit**

```bash
bun -- scripts/run-private-offline.ts -- bun test scripts/run-private-privacy.test.ts scripts/run-private-worker-e2e.test.ts --isolate
bun run verify:private:privacy
git diff --check
git add scripts/run-private-privacy.ts scripts/run-private-privacy.test.ts vitest.config.private-workers.ts test/worker/private-provider.integration.test.ts test/worker/provider-privacy.integration.test.ts scripts/run-private-worker-e2e.ts scripts/run-private-worker-e2e.test.ts playwright.private.config.ts e2e/private-provider-state.spec.ts package.json
git commit -m "test(event-every): prove private provider privacy"
```

Expected: command exits 0 without real provider/network/credential use and leaves no generated output.

### Task 9: Prove every critical guarantee with causal mutations

**Files:**
- Create: `scripts/run-c1-b-mutations.ts`
- Create: `scripts/run-c1-b-mutations.test.ts`
- Create: `docs/testing/c1-b-private-mutation-ledger.md`
- Modify: `package.json`

- [ ] **Step 1: Test the mutation runner itself**

Assert a fixed manifest of exactly the 25 accepted design mutations. Each entry names one production file, one unambiguous source edit, one focused command, and one expected failing assertion. Reject missing/duplicate IDs, edits outside the C1-B allowlist, no-op edits, broad regex matches, a green mutant, wrong failure text, changed source hashes, inherited credentials, network access, or leftover temp worktrees/output.

- [ ] **Step 2: Implement isolated committed-head mutations**

For each entry, export committed `HEAD` into a fresh directory under `mkdtemp`, attach only the repository's existing dependency tree as a read-only symlink, apply exactly one edit, run its focused test with the private offline preload and a timeout, require nonzero exit plus the named assertion, and remove the directory in `finally`. Never edit the six protected working entries or the primary checkout.

The manifest has these exact one-for-one entries:

1. `C1B-M01` permits a second transport after a lost claim response.
2. `C1B-M02` skips durable permit-verifier comparison after object eviction.
3. `C1B-M03` performs owner-day reservation outside the SQLite transaction.
4. `C1B-M04` omits committed rows from outstanding budget.
5. `C1B-M05` releases, rather than fully settles, an expired committed row.
6. `C1B-M06` treats missing cost as zero instead of the full reservation.
7. `C1B-M07` converts provider cost with binary `Number` before exact nanodollar classification.
8. `C1B-M08` answers the client before minimized replay persistence acknowledges.
9. `C1B-M09` lets an alarm or ambiguous state call provider transport.
10. `C1B-M10` omits normalized shape/key-version binding from idempotency.
11. `C1B-M11` rebinds a cross-midnight retry to the new UTC day.
12. `C1B-M12` materializes a provider non-success response body.
13. `C1B-M13` persists Scanner evidence/provider-authored message data.
14. `C1B-M14` creates a replacement browser UUID after a lost response.
15. `C1B-M15` adds `OPENROUTER_API_KEY` as an owner-key fallback.
16. `C1B-M16` changes `/api/waitlist` from retired 410 to OpenNext delegation.
17. `C1B-M17` accepts an environment-selected provider model.
18. `C1B-M18` changes provider redirect policy from `manual` to `follow`.
19. `C1B-M19` commits deadline/outbox state before the durable alarm and crashes with no later RPC.
20. `C1B-M20` derives transport timeout from retry time rather than the authority deadline.
21. `C1B-M21` stops polling after 750 ms and creates a replacement UUID.
22. `C1B-M22` demotes a positive exponent cost to ordinary missing accounting.
23. `C1B-M23` lets two concurrent above-reservation completions both store actual amounts.
24. `C1B-M24` deletes a restored pending local operation before status polling; its focused reload proof requires the original UUID, one transport, and the status-route suite independently requires zero mutator/transport/retention calls.
25. `C1B-M25` removes the preload's non-loopback global-fetch rejection.

- [ ] **Step 3: Generate and verify the bounded ledger**

`docs/testing/c1-b-private-mutation-ledger.md` is deterministic and contains only mutation ID, guarantee, production file, focused command, expected assertion, observed nonzero exit, and restored-green result. It contains no source bodies, user/provider markers, credentials, timestamps, random paths, stack traces, or child stdout/stderr.

- [ ] **Step 4: Run all mutations and commit**

```bash
bun -- scripts/run-private-offline.ts -- bun test scripts/run-c1-b-mutations.test.ts --isolate
bun -- scripts/run-private-offline.ts -- bun scripts/run-c1-b-mutations.ts --write-ledger
bun -- scripts/run-private-offline.ts -- bun scripts/run-c1-b-mutations.ts --verify-ledger
git diff --check
git add scripts/run-c1-b-mutations.ts scripts/run-c1-b-mutations.test.ts docs/testing/c1-b-private-mutation-ledger.md package.json
git commit -m "test(event-every): prove private state mutations"
```

Expected: every mutant is observed RED, restored committed code is GREEN, ledger verification passes, and no temp/output path remains.

### Task 10: Run the committed-head gate and close C1-B

**Files:**
- Modify: `package.json`
- Modify: `docs/testing/c1-a-private-control-matrix.md`
- Create: `scripts/run-c1-b-offline.ts`
- Create: `scripts/run-c1-b-offline.test.ts`
- Verify only: the six protected Event Every paths named above

- [ ] **Step 1: Define the aggregate local gate**

Add exactly `"verify:c1:b": "bun scripts/run-c1-b-offline.ts"`. Unit-test the runner's fixed stage list, fail-fast behavior, bounded output, signal/timeout cleanup, credential scrubbing, authored/protected hashes, and output removal. The runner executes, in order, through Task 1's offline child boundary:

1. `bun run type-check`;
2. `bun run lint`;
3. `bun test src --isolate`;
4. `bun test scripts/run-private-offline.test.ts scripts/assert-c1-b-paths.test.ts scripts/assert-c1-a-config.test.ts scripts/assert-c1-a-e2e-inventory.test.ts scripts/run-c1-a-offline.test.ts scripts/run-c1-a-worker-e2e.test.ts scripts/assert-private-worker.test.ts scripts/run-private-privacy.test.ts scripts/run-private-worker-e2e.test.ts scripts/run-c1-b-mutations.test.ts scripts/run-c1-b-offline.test.ts --isolate` so the protected C1-A mutation files are never opened;
5. `bun run test:workers`;
6. `bun run verify:c1:a`;
7. `bun run verify:private:privacy`;
8. `bun scripts/run-c1-b-mutations.ts --verify-ledger`;
9. `bun scripts/assert-private-worker.ts`;
10. `bun scripts/assert-c1-b-paths.ts terminal`; and
11. `bun run assert:e1-protected` plus final generated-output/worktree/hash checks.

It forbids ordinary install, deploy, publication, external service, or remote-resource commands and removes all owned generated output in `finally`.

- [ ] **Step 2: Update the control matrix**

Record each accepted design guarantee against its unit, Workerd, route, privacy, browser, artifact, and mutation proof. Record the reported hydration failure as a Chromium/WebKit console/page-error assertion. State plainly that `Priya` is only event fixture content and not an Event Every or cross-product brand. Record that real keys, real user data, Access, remote resources, deployment, and external retirement remain unauthorized.

- [ ] **Step 3: Commit the gate, then run it on that committed head**

```bash
git add package.json docs/testing/c1-a-private-control-matrix.md scripts/run-c1-b-offline.ts scripts/run-c1-b-offline.test.ts
git commit -m "test(event-every): close private state gate"
bun run verify:c1:b
git status --short
```

Expected: gate exits 0; the only Event Every status entries are the exact six pre-existing protected entries with their original hashes; no generated output remains.

- [ ] **Step 4: Obtain independent final review**

Route an architecture/security review to an independent `gpt-5.6-sol` reviewer at high reasoning. Give it the accepted design, this plan, the full committed C1-B range, gate output, mutation ledger, protected hashes, and explicit forbidden scope. Acceptance requires `VERIFIED: true`, no Critical finding, and no Important finding. Repair any finding in a separate allowlisted commit and rerun the entire committed-head gate and review.

After Task 10 is accepted, the parent orchestrator—not an Event Every implementation worker—uses Calendar Casa's separately owned process to record the final report/range, increment its monotonic revision, close C1-B, and set the next cursor to `EE-DATA-FAQ`. Those external tracker writes are outside this plan and this allowlist.

`EE-DATA-FAQ` must describe the actual cross-product handling of raw submissions, derived calendar results, 48-hour replay rows, content-free browser operation records, logs/errors/caches, credentials, and deletion/expiry. It remains a later writing/review task and is not silently folded into C1-B implementation.
