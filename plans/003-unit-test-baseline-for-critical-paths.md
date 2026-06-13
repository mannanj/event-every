# Plan 003: Stand up `bun test` and put unit tests on the money path and the .ics product output

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f53bf0e..HEAD -- src/services src/utils src/lib package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (tests only — zero production-code changes allowed in this plan)
- **Depends on**: none (and it unblocks plans/005 and plans/008)
- **Category**: tests
- **Planned at**: commit `f53bf0e`, 2026-06-10

## Why this matters

The only tests in this repo are Playwright e2e suites that mock the LLM endpoints, so the logic that actually defines the product has zero coverage: `.ics` generation/parsing (an invalid .ics file *is* a product failure), timezone conversion math, the USD budget metering that caps real spend, and the rate limiter. There is no command that proves this logic works without starting a browser. This plan adds bun's built-in test runner (no new dependencies) plus **characterization tests** for those modules — pinning current behavior, including its known quirks, so the follow-up fix plans (005 rate limiter, 008 ICS dates) can change behavior deliberately and visibly.

**Hard rule for this plan: do not modify any file under `src/` outside new `__tests__` directories.** Where current behavior is buggy, write the test that documents the current behavior with a `// KNOWN QUIRK (plans/NNN)` comment — do not fix it here.

## Current state

- `package.json` scripts (no unit-test script exists):

```json
"scripts": {
  "i": "bun install",
  "dev": "next dev -p 3777",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "type-check": "tsc --noEmit",
  "test:e2e": "bunx playwright test",
  "test:e2e:ui": "bunx playwright test --ui",
  "test:e2e:prod": "E2E_TARGET=prod bunx playwright test"
}
```

- **Verified gotcha**: bare `bun test` at f53bf0e finds the four Playwright files (`e2e/*.spec.ts`), tries to run them, and reports `0 pass, 4 fail, 4 errors`. The unit-test invocation must therefore be scoped: **`bun test src`**. All new test files live under `src/**/__tests__/*.test.ts` so the scoping works.
- Targets and their real exports (verified by grep at f53bf0e):
  - `src/services/icsParser.ts` — `parseICSFile(file: File)` (line 15), `parseICSContent(icsText: string): CalendarEvent[]` (line 25). Known quirks to characterize: `parseICSDate` (line 142) strips everything after `;`, parses 8-char dates with the **local-time** `new Date(year, month, day)` constructor (line 152), ignores TZID on non-Z datetimes (line 167), and **falls back to `new Date()` (now!) for unparseable dates** (line 172).
  - `src/services/exporter.ts` — imports `createEvent, createEvents` from `ics` (line 1); `dateToArray` (line 114) uses **local** getters for all-day events but **UTC** getters for timed events. Read the file to find its exported functions; test through the exported surface only (the DOM-touching `downloadICS` at line 132 cannot run under bun test — see Step 3).
  - `src/utils/timeConversion.ts` — `convertRawToDate(rawISO, sourceTimezone)` (line 11), `formatTimeInTimezone(date, timezone)` (line 75), `getTimezoneAbbreviation(date, timezone)` (line 107).
  - `src/utils/timezone.ts` — `getBrowserTimezone` (34), `parseTimezoneFromText` (42), `isValidIANATimezone` (67), `normalizeTimezone` (76), `convertToIANATimezone` (98).
  - `src/lib/budget.ts` — `DAILY_BUDGET_USD` (12), `getBudgetStatus()` (34), `recordCommunitySpend(costUsd)` (58). Uses `new Redis({url, token})` from `@upstash/redis`, reads `KV_REST_API_URL`/`KV_REST_API_TOKEN`, key `budget:community:<UTC date>` (line 27), fails open when Redis is unavailable or throws (lines 36-39, 51-54 — **by design**, per the comment there; test it as intended behavior, not a bug).
  - `src/lib/ratelimit.ts` — `checkRateLimit(identifier)` (23), `incrementRateLimit(identifier)` (67), `DAILY_LIMIT = 1000` (10). Known quirks to characterize for plans/005: `ttl` of -1/-2 produces a `reset` in the past (lines 41-42); `incrementRateLimit` does non-atomic `get` → `set(key, n, { ex })`, which resets the 24h TTL on **every** increment (line 83) — a sliding window that never resets under steady use.
- TypeScript config: strict, `paths: { "@/*": ["./src/*"] }` — bun honors tsconfig paths natively.
- Conventions: no `any`; test files are new territory, so establish the pattern: `import { describe, expect, test, mock, beforeEach } from 'bun:test'`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run type-check`     | exit 0 (verified passing at f53bf0e) |
| Unit tests | `bun test src`          | all pass            |
| One file  | `bun test src/lib/__tests__/budget.test.ts` | all pass |

Do NOT use `bun run lint` — broken at f53bf0e (plans/004 fixes it). Do not run `bun test` without the `src` argument (picks up Playwright specs).

## Scope

**In scope** (create only — plus one edit to `package.json`):
- `src/services/__tests__/icsParser.test.ts`
- `src/services/__tests__/exporter.test.ts`
- `src/utils/__tests__/timeConversion.test.ts`
- `src/utils/__tests__/timezone.test.ts`
- `src/lib/__tests__/budget.test.ts`
- `src/lib/__tests__/ratelimit.test.ts`
- `package.json` — add exactly one script: `"test": "bun test src"`

**Out of scope** (do NOT touch):
- Any non-test file under `src/` — this plan changes zero production behavior.
- `e2e/**`, `playwright.config.ts`, `bunfig.toml`.
- Adding any test framework dependency (vitest/jest) — bun's runner is built in.

## Git workflow

- Branch: `advisor/003-unit-test-baseline`
- One commit, e.g. `Plan 003: bun test baseline — ICS, timezone, budget, ratelimit unit tests`, ending with the repo's `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the script and prove the runner works

Add `"test": "bun test src"` to `package.json` scripts. Create `src/utils/__tests__/timezone.test.ts` first with straightforward cases: `isValidIANATimezone('America/New_York')` → true, `isValidIANATimezone('Not/AZone')` → false, `normalizeTimezone(undefined)` returns a string, `parseTimezoneFromText` on a string containing `EST` (read `src/utils/timezone.ts` first and assert what it actually does — these are characterization tests).

**Verify**: `bun run test` → reports ≥ 4 pass, 0 fail.

### Step 2: timeConversion characterization

`src/utils/__tests__/timeConversion.test.ts`. Read `src/utils/timeConversion.ts` fully first. Cover at minimum: `convertRawToDate('2026-07-04T19:00:00', 'America/New_York')` produces the UTC instant 2026-07-04T23:00:00Z (assert via `.toISOString()`); a winter date in the same zone (UTC-5 vs UTC-4 — DST boundary behavior); an India offset (`Asia/Kolkata`, +05:30); `formatTimeInTimezone` round-trips one of those instants back to the source-zone wall time. If actual behavior differs from these expectations, **assert the actual behavior** and tag `// KNOWN QUIRK` with one line describing the delta — do not fix.

**Verify**: `bun run test` → all pass.

### Step 3: ICS round-trip tests

`src/services/__tests__/icsParser.test.ts`: feed `parseICSContent` a handcrafted minimal VCALENDAR string (BEGIN/END VCALENDAR + one VEVENT with SUMMARY, DTSTART/DTEND) for each case: Z-suffixed datetime (assert exact UTC instant), 8-char all-day date (characterize: it becomes **local** midnight — tag `// KNOWN QUIRK (plans/008)`), escaped text (`\\n`, `\\,` per `unescapeICSText` line 175), missing SUMMARY → `'Untitled Event'` (line 129), and an unparseable DTSTART (e.g. `DTSTART:garbage`) — characterize that the date becomes "now" (assert it lands within 5s of `Date.now()`, tag `// KNOWN QUIRK (plans/008)`).

`src/services/__tests__/exporter.test.ts`: read `src/services/exporter.ts` fully first; test only exported, DOM-free functions (validation and ICS-string generation). If every generation path funnels through a function that calls `downloadICS` (DOM), test the largest pure layer reachable (e.g. validation + any exported content builder) and note in your report which paths remained untestable without refactoring — **do not refactor**.

**Verify**: `bun run test` → all pass.

### Step 4: budget tests with a mocked Redis

`src/lib/__tests__/budget.test.ts`. Mock the SDK before importing the module under test:

```ts
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const redisMock = { get: mock(async () => 0 as unknown), incrbyfloat: mock(async () => 1), expire: mock(async () => 1) };
mock.module('@upstash/redis', () => ({ Redis: class { constructor() { return redisMock as unknown; } } }));
process.env.KV_REST_API_URL = 'https://test.invalid';
process.env.KV_REST_API_TOKEN = 'test-token';
const { getBudgetStatus, recordCommunitySpend, DAILY_BUDGET_USD } = await import('@/lib/budget');
```

Cases: spent below limit → `exhausted: false`, `remainingUsd` correct; `get` returns a numeric string → parsed; `get` returns ≥ `DAILY_BUDGET_USD` → `exhausted: true`; `get` throws → fail-open (`exhausted: false`) — this is **by design**; `recordCommunitySpend(0.5)` calls `incrbyfloat` with 0.5 and then `expire`; `recordCommunitySpend(0)`, `(-1)`, `(NaN)` → no Redis calls (guard at line 59). If `mock.module` interception of the class constructor fights you, STOP per the conditions below rather than restructuring `budget.ts`.

**Verify**: `bun test src/lib/__tests__/budget.test.ts` → all pass.

### Step 5: ratelimit characterization with the same mock pattern

`src/lib/__tests__/ratelimit.test.ts`. Cases: under limit → `success: true`, `remaining` arithmetic; at `DAILY_LIMIT` with `ttl` mocked to 3600 → `success: false`, `reset` ≈ now + 3600s; **quirk pins** for plans/005: `ttl` mocked to `-1` → assert `reset < Date.now()` with `// KNOWN QUIRK (plans/005): negative TTL yields a reset in the past`; `incrementRateLimit` calls `set(key, n, { ex: 86400 })` on every call (assert the mock saw `ex` on a second consecutive increment) with `// KNOWN QUIRK (plans/005): TTL reset on every increment — sliding window never resets under steady use`; Redis throwing → fail-open `success: true` (by design).

**Verify**: `bun run test` → all pass.

## Test plan

This plan *is* the test plan. Target: ≥ 35 assertions across 6 files, every one runnable offline in under ~5 seconds total, no network, no secrets, no OpenRouter spend.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run test` exits 0 with ≥ 35 passing tests and 0 failures
- [ ] `git diff --name-only` shows only `package.json` and new files under `src/**/__tests__/`
- [ ] `grep -rn "KNOWN QUIRK" src --include="*.test.ts" | wc -l` → ≥ 4 (the quirks for 005/008 are pinned)
- [ ] `bun run type-check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- You feel the need to change any production file to make something testable — report which file and why; the refactor belongs to a separate plan.
- `mock.module('@upstash/redis', ...)` cannot intercept the `new Redis(...)` constructed inside `getRedis()` after two attempts — report the limitation; budget/ratelimit tests may then cover only the no-Redis (env-unset) paths.
- `bun test src` mis-resolves the `@/*` tsconfig path alias — report; do not add a bundler config.
- Any test requires hitting the network.

## Maintenance notes

- Plans/005 and plans/008 will deliberately flip the `KNOWN QUIRK` assertions; the tags tell their executors which tests to update.
- plans/004 wires `bun run test` into CI; keep the suite fast and offline so that stays viable.
- When the dead components are deleted (plans/006), nothing here is affected (no tests target them — they're dead).
