# Plan 013: Unify the community-budget and per-IP rate-limit into ONE limit authority, enforced on every LLM route

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in the existing `plans/README.md` index (the advisor maintains that file;
> the executor only flips this plan's own status row to `DONE`).
>
> **Drift check (run first)**:
> `git diff --stat 400bf32..HEAD -- src/lib/budget.ts src/lib/ratelimit.ts src/lib/llm.ts src/app/api src/components/CommunityLimitScreen.tsx src/components/RateLimitBanner.tsx src/components/AuthWrapper.tsx src/app/page.tsx src/app/spent/page.tsx src/utils/communityLimit.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — changes user-visible limiting across ALL LLM routes (today the per-IP limiter runs only on `/api/parse`); gate with the unit tests this plan introduces (Step 6). The community-budget axis is unchanged in behavior; the new axis is the per-IP enforcement spreading to three more routes plus a unified status surface.
- **Depends on plan 005 (an existing plan): execute 005 with or before this plan.** 005 fixes the per-IP limiter's atomic increment / fixed UTC-day window, which makes the per-IP counts this authority surfaces trustworthy. Do **NOT** re-implement 005's fix here. Plan 005 already exists as a plan file in `plans/`; it simply may not be *executed* (landed in code) yet. At `400bf32`, `src/lib/clientIp.ts` does not yet exist and there is no `test` script in `package.json` — so this plan is meant to land **WITH or AFTER 005** and to avoid regressing the limiter if 005 lands first. See "Coordination with plan 005" below — read it before Step 2.
- **Category**: tech-debt (consolidating two divergent authorities) with a bug component (contradictory UX signals; un-enforced per-IP limit on 3 of 4 LLM routes).
- **Planned at**: commit `400bf32`, 2026-06-13

## Why this matters

Today the app has **two independent limit systems with different reset semantics**, plus a **third** ad-hoc reset formula in the UI:

1. The **USD community budget** (`src/lib/budget.ts`): `getBudgetStatus()` returns `exhausted: spent >= DAILY_BUDGET_USD`, and the reset is next UTC midnight via `nextResetISO()` (`budget.ts:29-32`). This is the **global** gate — when the community pool is spent, every anonymous user is blocked. It is enforced on ALL four LLM routes via `ensureCommunityBudget()`.
2. The **per-IP rate limiter** (`src/lib/ratelimit.ts`): `DAILY_LIMIT = 1000` per IP, with a reset computed as `now + WINDOW_DURATION` (a rolling 24h, currently buggy — see 005). This is the **per-user** gate. It is enforced on **only one** route: `/api/parse` (`route.ts:31, 81, 136`). `summarize`, `detect-urls`, and `resolve-timezone` have NO per-IP limit at all.
3. A **third reset formula**: `CommunityLimitScreen.tsx:13-16` recomputes its *own* next-UTC-midnight when `resetAt` is null/NaN — which can disagree with `nextResetISO()`.

The owner's decision: **keep BOTH axes** (the USD budget is the global gate; per-IP rate limiting is *also* a per-user requirement) but **route them through ONE authority, with ONE reset-time source per reason, and enforce the per-IP axis on ALL LLM routes** — not just `parse`.

Concrete costs this fixes:
- **Inconsistent enforcement**: a user blocked on `parse` can still freely hit `summarize`/`detect-urls`/`resolve-timezone`. After this plan, all four share the per-IP gate.
- **Contradictory UX**: `RateLimitBanner` (live at `page.tsx:1052`, fed by `updateRateLimitFromHeaders` at `page.tsx:146-158`) shows the per-IP `990/1000` count, while a *budget*-exhausted user is fully blocked by the full-screen `CommunityLimitScreen`. The two signals derive from different systems and can contradict. After this plan, the status the client reads is unified, so the banner reflects the actual blocking reason.
- **Three reset formulas → one**: `nextResetISO()` becomes the single source for the budget reset everywhere; the inline recompute in `CommunityLimitScreen.tsx:13-16` is deleted.

## Coordination with plan 005

Plan 005 fixes the per-IP limiter's **internals**: atomic `incr` (instead of non-atomic get→set), a fixed UTC-day window (instead of a rolling TTL that never resets under steady use), a sane future reset, and one shared `getClientIP` in `src/lib/clientIp.ts`. **Plan 013 does NOT re-implement any of that** — it *wraps* the existing limiter (whatever its internals) in one authority and spreads the per-IP gate to all LLM routes.

- **013 should land WITH or AFTER 005 (005 is a written plan; do NOT re-implement its fix here).** 005's atomicity/window fix is what makes the per-IP counts trustworthy enough to surface in a unified status. If 005 has already been executed when you run this: the limiter's `reset` is already exact UTC midnight and `getClientIP` already lives in `src/lib/clientIp.ts` — use that import. If 005 has NOT yet been executed: build the authority over the **current** limiter (`ratelimit.ts` as excerpted below) WITHOUT regressing it, extract `getClientIP` into `src/lib/clientIp.ts` yourself (Step 1 — this is the same extraction 005's Step 1 specifies; doing it here is forward-compatible and 005 will find it already done), and add a `Maintenance note` that 005 must still be executed to fix the limiter internals.
- **Do NOT change the `RateLimitResult` shape** (`{ success, remaining, reset, error? }`) or the `X-RateLimit-*` header names/units — `page.tsx:146-158` parses them and 005 also pins them. The unified authority *contains* a `RateLimitResult`, it does not replace it.
- **Do NOT touch the limiter's fail-open-on-Redis-error posture** — it is intentional in both `ratelimit.ts` and `budget.ts`; preserve it in the authority (the authority must be `allowed: true` when Redis is unavailable, exactly as both underlying functions already are).

## Current state

Read every file below before editing. Excerpts are verified at `400bf32`.

### The two limit systems

`src/lib/budget.ts` — the USD community pool (the global gate). Verified excerpts:

```ts
// src/lib/budget.ts:11-15 — the budget ceiling
export const DAILY_BUDGET_USD = (() => {
  const parsed = parseFloat(process.env.DAILY_BUDGET_USD || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
})();
```

```ts
// src/lib/budget.ts:29-32 — THE canonical reset formula (next UTC midnight)
export function nextResetISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}
```

```ts
// src/lib/budget.ts:34-55 — getBudgetStatus(); note exhausted + resetAt + fail-open
export async function getBudgetStatus(): Promise<BudgetStatus> {
  const base = { limitUsd: DAILY_BUDGET_USD, resetAt: nextResetISO() };
  if (!isRedisAvailable()) {
    return { ...base, spentUsd: 0, remainingUsd: DAILY_BUDGET_USD, exhausted: false };
  }
  try {
    const raw = await getRedis().get<number | string>(budgetKey());
    const spent = typeof raw === 'number' ? raw : parseFloat(raw || '0') || 0;
    return { ...base, spentUsd: spent, remainingUsd: Math.max(0, DAILY_BUDGET_USD - spent), exhausted: spent >= DAILY_BUDGET_USD };
  } catch (error) {
    console.error('Budget status error:', error);
    return { ...base, spentUsd: 0, remainingUsd: DAILY_BUDGET_USD, exhausted: false };
  }
}
```

`BudgetStatus` shape (`budget.ts:3-9`): `{ limitUsd, spentUsd, remainingUsd, exhausted, resetAt }` (`resetAt` is an ISO string). `recordCommunitySpend(costUsd)` (`budget.ts:58`) writes spend and is unchanged by this plan.

`src/lib/ratelimit.ts` — the per-IP limiter (the per-user gate). Verified excerpts:

```ts
// src/lib/ratelimit.ts:3-11
export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;     // epoch milliseconds — page.tsx and the headers depend on this
  error?: string;
}
export const DAILY_LIMIT = 1000;
const WINDOW_DURATION = 24 * 60 * 60; // 24 hours in seconds
```

```ts
// src/lib/ratelimit.ts:23 — read-only check (does NOT increment)
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> { /* fail-open when Redis missing; returns {success,remaining,reset} */ }
// src/lib/ratelimit.ts:67 — increments the counter
export async function incrementRateLimit(identifier: string): Promise<RateLimitResult> { /* ... */ }
```

Both functions **fail open** (return `success: true`) when Redis is unavailable or errors (`ratelimit.ts:24-30, 57-64, 68-74, 93-99`). **Keep that.** (005 fixes the internals — the rolling-TTL/non-atomic bugs at `ratelimit.ts:80-83` and the negative-reset bug at `ratelimit.ts:40-42` — NOT in scope here.)

### The LLM gating glue

`src/lib/llm.ts` — the per-request budget gate and mode detection. Verified excerpts:

```ts
// src/lib/llm.ts:13-16 — admin (valid pattern cookie) bypasses community gating
export function getLlmMode(request: NextRequest): LlmMode {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return token && verifyAuthToken(token) ? 'admin' : 'community';
}
```

```ts
// src/lib/llm.ts:33-37 — the ONLY thing routes call to gate on budget today
export async function ensureCommunityBudget(mode: LlmMode): Promise<void> {
  if (mode === 'admin') return;
  const status = await getBudgetStatus();
  if (status.exhausted) throw new CommunityLimitError(status.resetAt);
}
```

`CommunityLimitError` (`llm.ts:24-31`) carries `resetAt: string` and `code = 'community_limit'`. `communityLimitResponse(error)` (`llm.ts:45-50`) returns a 402 `{ error, code, resetAt }`. `upstreamCommunityLimit(mode, status)` (`llm.ts:41-43`) maps an OpenRouter 402 to a `CommunityLimitError(nextResetISO())`. These are the contract the client's `emitIfCommunityLimited` (`src/utils/communityLimit.ts:17-29`) listens for. **Keep all of this.**

### The four LLM routes and how each gates today

| Route | Budget gate (`ensureCommunityBudget`) | Per-IP gate (`checkRateLimit`/`incrementRateLimit`) |
|-------|----------------------------------------|------------------------------------------------------|
| `src/app/api/parse/route.ts` | YES (`route.ts:55-61`) | **YES** — `checkRateLimit` at `:31`, `incrementRateLimit` at `:81` (batch path only), `checkRateLimit` again at `:136` for response headers |
| `src/app/api/summarize/route.ts` | YES (`:51-56`) | **NO** |
| `src/app/api/detect-urls/route.ts` | YES (`:69-74`) | **NO** |
| `src/app/api/resolve-timezone/route.ts` | YES (`:26-31`) | **NO** |

`parse/route.ts` also has its own local `getClientIP` (`:12-25`) — one of three identical copies (the others: `src/app/api/auth/verify/route.ts:22-35`, `src/app/api/waitlist/route.ts:16-20`).

The per-IP 429 response in `parse/route.ts:33-53` sets `X-RateLimit-Limit/Remaining/Reset` headers and a JSON body `{ error, remaining, reset, hoursUntilReset }`. The streaming success path sets the same three headers from a fresh `checkRateLimit` (`:136, 143-145`).

### The client consumers (where signals contradict today)

- `src/app/page.tsx:68` — state: `const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; total: number; resetTime: number } | undefined>();`
- `src/app/page.tsx:146-158` — `updateRateLimitFromHeaders(headers)` parses `X-RateLimit-Remaining/Limit/Reset` (defaulting to `'5'`, `'5'`, `'0'`) and calls `setRateLimitInfo` only when `reset > 0`. Called at `:331, :493, :671`.
- `src/app/page.tsx:1052` — `<RateLimitBanner rateLimitInfo={rateLimitInfo} />`.
- `src/components/RateLimitBanner.tsx` — pure presentational; renders `{remaining}/{total}` and a countdown to `resetTime`. Returns null when `remaining >= 10` (`:50`). **This is the per-IP banner.**
- `src/components/AuthWrapper.tsx:33-47` — on mount (anonymous, not loading), fetches `/api/usage`, and if `data.exhausted && !data.isAdmin` shows `CommunityLimitScreen` with `data.resetAt`. **This is the budget full-screen block.**
- `src/components/AuthWrapper.tsx:50-59` — also flips to the limit screen on the `COMMUNITY_LIMIT_EVENT` (mid-session 402), using `detail.resetAt`.
- `src/components/CommunityLimitScreen.tsx:11-25` — `formatResetTime(resetAt)`: **THE THIRD RESET FORMULA**. When `resetAt` is null/NaN it recomputes its own next-UTC-midnight (`:13-16`). This is what we delete.
- `src/app/spent/page.tsx:15-27` — **a SECOND `/api/usage` consumer** (preview of the limit screen). It reads `data.resetAt` only. Must keep working.
- `src/utils/communityLimit.ts:8-29` — `emitCommunityLimit(resetAt?)` / `emitIfCommunityLimited(response)`: detects a 402 with `code === 'community_limit'` from ANY route and dispatches `COMMUNITY_LIMIT_EVENT`. Unchanged by this plan (it already handles 402 from all routes).

### `/api/usage` today

`src/app/api/usage/route.ts:7-20` — `GET` returns `{ ...getBudgetStatus(), spentUsd: round, remainingUsd: round, isAdmin }` with `Cache-Control: no-store`. **No per-IP info today.** This plan extends it to also return the per-IP status so the client can present one coherent picture.

### Repo conventions to match

- Path alias `@/*` → `./src/*` (`tsconfig.json:21-22`), TS strict (`tsconfig.json:7`). No `any`.
- Redis access pattern: instantiate inside the function via a `getRedis()` helper guarded by `isRedisAvailable()` (see `budget.ts:17-23, 36` and `ratelimit.ts:13-21, 24`). The authority must NOT create its own Redis client — it composes the existing functions.
- Comment policy (CLAUDE.md): explain *why*, not *what*; acceptable to document the reset-semantics decision and the fail-open posture.
- Commit trailer (from `git log`): end the commit body with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)` then a blank line then
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Commands you will need

| Purpose    | Command                 | Expected on success |
|------------|-------------------------|---------------------|
| Install    | `bun install`           | exit 0              |
| Typecheck  | `bun run type-check`    | exit 0, no errors (verified passing at `400bf32`) |
| Build      | `bun run build`         | exit 0 (verified passing at `400bf32`) |
| Unit tests | `bun test src`          | all pass — uses bun's built-in runner (no third-party test framework). The `"test": "bun test src"` script does NOT exist yet; Step 6 adds it idempotently per plan 003. |
| E2E (opt.) | `bun run test:e2e -- e2e/community-limit.spec.ts` | all pass (Playwright; config at `playwright.config.ts`) |

Do **NOT** run `bun run lint` (the brief flags it as out of scope here; only `type-check`/`build`/`test` gate this plan).

**There is no `"test"` script in `package.json` at `400bf32`** (and no `src/**/__tests__` yet). The only tests are Playwright e2e in `e2e/`. This repo's unit runner is **bun's built-in test runner** (`import { describe, expect, test } from 'bun:test'`, files under `src/**/__tests__/*.test.ts`, invoked as `bun test src`) — the explicit choice of plan 003, which lists adding a third-party test framework (jest or similar) as OUT OF SCOPE. This plan does NOT introduce any third-party test runner or test dependency. Soft dependency on plan 003: it stands up the `bun test` runner and the `"test": "bun test src"` script. If 003 has already been executed (`grep -n '"test"' package.json` shows the script), Step 6 just adds the test file in the established location/style; if not, Step 6 idempotently adds `"test": "bun test src"` itself (per 003) — no extra runner, no config file, no deps.

## Scope

**In scope** (the only files you should modify or create):
- `src/lib/limits.ts` (**create**) — the unified authority.
- `src/lib/clientIp.ts` (**create**) — shared `getClientIP` (same extraction 005 specifies; see Step 1).
- `src/lib/llm.ts` — add a budget-status-returning variant the authority can consume without double-fetching (see Step 2); keep all existing exports.
- `src/app/api/parse/route.ts` — route both gates through the authority; replace local `getClientIP` with the import.
- `src/app/api/summarize/route.ts`, `src/app/api/detect-urls/route.ts`, `src/app/api/resolve-timezone/route.ts` — add the per-IP gate via the authority.
- `src/app/api/auth/verify/route.ts`, `src/app/api/waitlist/route.ts` — ONLY replace their local `getClientIP` with the shared import (no behavior change). (Forward-compatible with 005.)
- `src/app/api/usage/route.ts` — return the unified status (budget + ipRate).
- `src/components/AuthWrapper.tsx` — consume the unified `/api/usage` shape (keep behavior; read the unified fields).
- `src/components/CommunityLimitScreen.tsx` — DELETE the inline reset recompute (`:13-16`); always require a server `resetAt`, format only.
- `src/components/RateLimitBanner.tsx` — make it reflect the unified status so it can't contradict the full-screen block (see Step 4).
- `src/app/page.tsx` — pass the unified status to `RateLimitBanner` (the header parsing stays; see Step 4).
- `src/lib/__tests__/limits.test.ts` (**create**) — the authority's `bun:test` unit tests.
- `package.json` — add `"test": "bun test src"` ONLY if it is not already present (Step 6; per plan 003). No test-runner config file or test-runner deps of any kind.
- `plans/README.md` (already exists) — the executor only updates this plan's own status row; do NOT create or rewrite the index (the advisor maintains it).

**Out of scope** (do NOT touch, even though related):
- **The internals of `src/lib/ratelimit.ts`** (atomicity, window, reset math, key shape). That is plan 005. You compose its public functions; you do not rewrite them. (If 005 already landed, its new internals are fine — still don't touch.)
- **`src/lib/budget.ts`** — correct as-is (date-keyed pool, canonical `nextResetISO`). Do not change its logic.
- **The `RateLimitResult` shape and the `X-RateLimit-*` header names/units** — pinned by 005 and parsed by `page.tsx:146-158`.
- **The fail-open-on-Redis posture** anywhere — keep it.
- **`recordCommunitySpend` / `recordLlmUsage`** and the spend-recording flow — unchanged.
- **When the per-IP increment happens relative to parse success** (`parse/route.ts:81` charges before the stream completes) — a product question, out of scope (005 also defers it).
- **The `COMMUNITY_LIMIT_EVENT` / `emitIfCommunityLimited` mechanism** (`src/utils/communityLimit.ts`) — already route-agnostic; leave it.
- **`src/utils/clientContext.ts`** — read for context only; nothing to change here.

## Git workflow

- Branch: `advisor/013-unify-ratelimit-and-budget-authority` (create from `main` at `400bf32` or current HEAD if it still matches the drift check).
- **One commit.** Suggested message subject: `Plan 013: unified limit authority (budget + per-IP) enforced on all LLM routes`. Body should summarize the two-axis unification and the per-IP spread to summarize/detect-urls/resolve-timezone, and end with the repo's trailer (see conventions above).
- Do **NOT** push or open a PR unless the operator instructs it.

## Steps

Order matters: build the new authority first, switch routes, then unify the client surface, then tests. The app stays green between steps.

### Step 1: Extract `getClientIP` into `src/lib/clientIp.ts`

Create `src/lib/clientIp.ts` exporting the existing function verbatim:

```ts
import { NextRequest } from 'next/server';

export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  if (forwarded) return forwarded.split(',')[0].trim();
  if (realIP) return realIP;
  return 'unknown';
}
```

Replace the three local copies with `import { getClientIP } from '@/lib/clientIp';`:
- `src/app/api/parse/route.ts:12-25` (delete the local function)
- `src/app/api/auth/verify/route.ts:22-35`
- `src/app/api/waitlist/route.ts:16-20`

Zero behavior change. (If 005 already created `src/lib/clientIp.ts`, skip the create and just verify the three imports exist.)

**Verify**: `grep -rln "function getClientIP" src/` → exactly `src/lib/clientIp.ts`. `bun run type-check` → exit 0.

### Step 2: Add a budget-status accessor for the authority (avoid double-fetch)

The authority needs the full `BudgetStatus` (not just the throw from `ensureCommunityBudget`). `getBudgetStatus()` already returns it. Add to `src/lib/llm.ts` a small helper that resolves the budget *decision* for a mode without throwing, so the authority can compose it:

```ts
// src/lib/llm.ts — add near ensureCommunityBudget; KEEP ensureCommunityBudget as-is for callers not yet migrated
import type { BudgetStatus } from './budget';

// Admins bypass the community pool entirely (unrestricted key).
export async function getCommunityBudgetStatus(mode: LlmMode): Promise<BudgetStatus | null> {
  if (mode === 'admin') return null;
  return getBudgetStatus();
}
```

(Import `getBudgetStatus` is already imported in `llm.ts:3`. Add the `BudgetStatus` type import. Do not remove `ensureCommunityBudget` — Step 3 routes use the authority, but keeping it avoids breaking anything and the authority may reuse it.)

**Verify**: `bun run type-check` → exit 0.

### Step 3: Create the unified authority `src/lib/limits.ts`

Create `src/lib/limits.ts`. It composes the existing budget + per-IP functions into ONE decision with ONE reset-time source per reason. It must NOT create its own Redis client and must preserve fail-open.

Target shape (exact field names are load-bearing — the route and `/api/usage` and the client read them):

```ts
import { NextRequest } from 'next/server';
import { getClientIP } from './clientIp';
import { getLlmMode, getCommunityBudgetStatus, LlmMode } from './llm';
import { checkRateLimit, incrementRateLimit, DAILY_LIMIT, RateLimitResult } from './ratelimit';
import { nextResetISO, BudgetStatus } from './budget';

export type LimitReason = 'community-budget' | 'ip-rate' | null;

export interface UnifiedLimitStatus {
  allowed: boolean;
  reason: LimitReason;          // which gate is blocking (budget checked first), or null
  resetAt: string;             // ISO; the reset for the BLOCKING reason (budget → nextResetISO; ip → from the limiter), or budget reset when allowed
  isAdmin: boolean;
  budget: {
    limitUsd: number;
    spentUsd: number;
    remainingUsd: number;
    exhausted: boolean;
    resetAt: string;           // nextResetISO()
  } | null;                    // null for admins (no community pool)
  ipRate: {
    limit: number;             // DAILY_LIMIT
    remaining: number;
    exhausted: boolean;
    resetAt: string;           // ISO derived from RateLimitResult.reset (epoch ms → ISO)
  };
}

const msToISO = (ms: number) => new Date(ms).toISOString();

// READ-ONLY evaluation (no increment). Use for gating the request and for /api/usage.
// Budget is the GLOBAL gate and is checked first; per-IP is the per-user gate.
export async function evaluateLimits(request: NextRequest): Promise<UnifiedLimitStatus> {
  const mode: LlmMode = getLlmMode(request);
  const isAdmin = mode === 'admin';

  const budgetStatus: BudgetStatus | null = await getCommunityBudgetStatus(mode);
  const ip = getClientIP(request);
  const ipResult: RateLimitResult = await checkRateLimit(ip);

  const budget = budgetStatus && {
    limitUsd: budgetStatus.limitUsd,
    spentUsd: budgetStatus.spentUsd,
    remainingUsd: budgetStatus.remainingUsd,
    exhausted: budgetStatus.exhausted,
    resetAt: budgetStatus.resetAt, // === nextResetISO()
  };

  const ipRate = {
    limit: DAILY_LIMIT,
    remaining: ipResult.remaining,
    exhausted: !ipResult.success,
    resetAt: msToISO(ipResult.reset),
  };

  // Admins: only the per-IP gate applies (they bypass the community pool).
  const budgetExhausted = budget?.exhausted ?? false;

  let reason: LimitReason = null;
  let resetAt = budget?.resetAt ?? nextResetISO();
  if (budgetExhausted) {
    reason = 'community-budget';
    resetAt = budget!.resetAt;
  } else if (ipRate.exhausted) {
    reason = 'ip-rate';
    resetAt = ipRate.resetAt;
  }

  return { allowed: reason === null, reason, resetAt, isAdmin, budget: budget ?? null, ipRate };
}

// Charges the per-IP counter (call once per accepted request, mirroring parse's
// current incrementRateLimit). Returns the post-increment per-IP view so callers
// can set fresh X-RateLimit-* headers.
export async function chargeIpRate(request: NextRequest): Promise<RateLimitResult> {
  return incrementRateLimit(getClientIP(request));
}
```

Notes the executor must honor:
- **Budget is checked before per-IP** so a globally-exhausted pool reports `community-budget` even if the user is also under their per-IP cap — matches the owner's "USD budget controls ALL users" framing.
- **Fail-open is inherited**: when Redis is missing, `getBudgetStatus` returns `exhausted: false` and `checkRateLimit` returns `success: true` → `allowed: true`. Do not add any Redis check here.
- `resetAt` for the `ip-rate` reason comes from the limiter's own `reset` (epoch ms). After 005 lands this equals UTC midnight; before 005 it is the limiter's current value — either way the client formats whatever ISO it receives (Step 4 deletes the client's own recompute).
- Do **not** call `incrementRateLimit` inside `evaluateLimits` — evaluation is read-only; charging is explicit via `chargeIpRate`, mirroring today's split (`checkRateLimit` at `parse:31` vs `incrementRateLimit` at `parse:81`).

**Verify**: `bun run type-check` → exit 0.

### Step 4: Route ALL four LLM routes through the authority

For each route, replace the standalone budget/IP gating with one `evaluateLimits` call, and return the unified 402/429. Keep each route's existing OpenRouter call, `recordLlmUsage`, and `upstreamCommunityLimit` handling untouched.

**4a. `src/app/api/parse/route.ts`** — this route already has both gates; consolidate them:
- Remove the local `getClientIP` (done in Step 1) and the direct `checkRateLimit`/`DAILY_LIMIT` import usage for gating; import `{ evaluateLimits, chargeIpRate }` from `@/lib/limits` and keep `DAILY_LIMIT` (still needed for headers).
- At the top of `POST`, replace the `checkRateLimit` block (`:29-53`) AND the `ensureCommunityBudget` block (`:55-61`) with a single evaluation:

```ts
const limits = await evaluateLimits(request);
if (!limits.allowed) {
  if (limits.reason === 'community-budget') {
    return communityLimitResponse(new CommunityLimitError(limits.resetAt));
  }
  // ip-rate
  const resetMs = Date.parse(limits.resetAt);
  const hoursUntilReset = Math.max(0, Math.ceil((resetMs - Date.now()) / (1000 * 60 * 60)));
  return NextResponse.json(
    { error: `Daily limit of ${DAILY_LIMIT} events reached`, remaining: 0, reset: limits.resetAt, hoursUntilReset },
    { status: 429, headers: {
      'X-RateLimit-Limit': DAILY_LIMIT.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': resetMs.toString(),
    } }
  );
}
const mode = getLlmMode(request);
```
  - Keep `mode` for `getLlmKey(mode)` later. (You can derive `mode` from `getLlmMode(request)` as today; the authority also computed it but does not return the raw mode — re-deriving is cheap and keeps `getLlmKey` usage unchanged.)
- In the batch branch, replace `await incrementRateLimit(clientIP)` (`:81`) with `await chargeIpRate(request)`, and replace the `await checkRateLimit(clientIP)` at `:136` with a fresh `await evaluateLimits(request)` read for the response headers, setting `X-RateLimit-Remaining` from `.ipRate.remaining` and `X-RateLimit-Reset` from `Date.parse(updated.ipRate.resetAt)`:

```ts
const updated = await evaluateLimits(request);
return new Response(stream, { headers: {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-RateLimit-Limit': DAILY_LIMIT.toString(),
  'X-RateLimit-Remaining': updated.ipRate.remaining.toString(),
  'X-RateLimit-Reset': Date.parse(updated.ipRate.resetAt).toString(),
} });
```
- Net effect: identical external contract for `parse` (same 429 body/headers, same 402), now sourced from the authority.

**4b. `summarize`, `detect-urls`, `resolve-timezone`** — add the per-IP gate they lack. In each, replace the existing `ensureCommunityBudget` try/catch block (summarize `:51-56`, detect-urls `:69-74`, resolve-timezone `:26-31`) with:

```ts
const limits = await evaluateLimits(request);
if (!limits.allowed) {
  if (limits.reason === 'community-budget') {
    return communityLimitResponse(new CommunityLimitError(limits.resetAt));
  }
  return NextResponse.json(
    { error: 'Daily request limit reached', reset: limits.resetAt },
    { status: 429, headers: {
      'X-RateLimit-Limit': DAILY_LIMIT.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': Date.parse(limits.resetAt).toString(),
    } }
  );
}
```
  - Add imports: `{ evaluateLimits, chargeIpRate }` from `@/lib/limits`, `{ DAILY_LIMIT }` from `@/lib/ratelimit`, and ensure `CommunityLimitError` + `communityLimitResponse` stay imported (they already are in all three).
  - **Charge the per-IP counter on accepted requests**: after a successful OpenRouter response (right where each route currently calls `recordLlmUsage(mode, data.usage)` — summarize `:109`, detect-urls `:147`, resolve-timezone `:97`), add `await chargeIpRate(request);`. This mirrors `parse` charging once per accepted request. Charging *after* success keeps a failed upstream call from consuming the user's quota — acceptable and consistent with the owner's "per-user gate" intent. (If you prefer charging before the upstream call to also rate-limit failures, that is a product call; default to after-success to match `recordLlmUsage` placement and avoid penalizing upstream errors.)
  - Keep `mode = getLlmMode(request)` as each route already derives it (summarize `:45`, detect-urls `:63`, resolve-timezone `:17`) — `getLlmKey(mode)`/`upstreamCommunityLimit(mode, …)`/`recordLlmUsage(mode, …)` all stay.
  - These three routes are NOT streaming; they need no fresh-header second read.

**Verify**: `bun run type-check` → exit 0. `grep -rn "ensureCommunityBudget(" src/app/api` → no remaining *call sites* in the four LLM routes (the export in `llm.ts` may remain). `bun run build` → exit 0.

### Step 5: Unify `/api/usage` and the client surface

**5a. `src/app/api/usage/route.ts`** — return the unified status. Replace the body of `GET` so it calls the authority (read-only) and returns budget + ipRate + reason in one payload, preserving the existing top-level fields the current consumers read (`exhausted`, `resetAt`, `isAdmin`, `spentUsd`, `remainingUsd`, `limitUsd`) so nothing breaks, and ADD the unified block:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { evaluateLimits } from '@/lib/limits';

const round = (value: number) => Math.round(value * 10000) / 10000;

export async function GET(request: NextRequest) {
  const limits = await evaluateLimits(request);
  const b = limits.budget;
  return NextResponse.json(
    {
      // Back-compat top-level budget fields (AuthWrapper + spent/page read these):
      isAdmin: limits.isAdmin,
      exhausted: b?.exhausted ?? false,
      resetAt: limits.resetAt,            // unified: blocking reason's reset, else budget reset
      limitUsd: b?.limitUsd ?? 0,
      spentUsd: round(b?.spentUsd ?? 0),
      remainingUsd: round(b?.remainingUsd ?? 0),
      // Unified status:
      allowed: limits.allowed,
      reason: limits.reason,
      budget: b ? { ...b, spentUsd: round(b.spentUsd), remainingUsd: round(b.remainingUsd) } : null,
      ipRate: limits.ipRate,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
```
  - **Important back-compat nuance**: `AuthWrapper.tsx:39` checks `data.exhausted && !data.isAdmin` to show the full-screen block. Keep `exhausted` reflecting the **community-budget** state only (`b?.exhausted`), NOT the per-IP state — the full-screen "community sponsored, limits hit" copy is budget-specific. The per-IP block is surfaced via the banner (5c), not the full-screen takeover. (Do not set top-level `exhausted: true` just because the per-IP cap is hit.)
  - `resetAt` now reflects the blocking reason's reset; for a budget-exhausted anonymous user it equals `nextResetISO()` exactly as before, so `CommunityLimitScreen` and `spent/page.tsx` are unaffected.

**5b. `src/components/CommunityLimitScreen.tsx`** — DELETE the inline reset recompute (`:13-16`). The server always supplies `resetAt` now (budget reset). Change `formatResetTime` to format only, and if `resetAt` is missing render a neutral fallback string rather than inventing a date:

```ts
// "June 11, 2026, 8:00 PM EDT" — the viewer's own timezone, with the zone listed.
function formatResetTime(resetAt: string | null): string {
  const date = resetAt ? new Date(resetAt) : null;
  if (!date || Number.isNaN(date.getTime())) return 'soon';
  return new Intl.DateTimeFormat(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}
```
  - The copy at `:79` reads `…reset {resetText}.` → with a missing reset it becomes `…reset soon.` (grammatical). Verify that reads acceptably; if not, adjust the sentence to `…and will reset {resetText}.` Keep `useMemo`.
  - Remove the now-unused inline `Date.UTC(...)` recompute entirely — that is the THIRD reset formula being eliminated. `nextResetISO()` (server) is the single source.

**5c. `src/components/RateLimitBanner.tsx` + `src/app/page.tsx`** — make the per-IP banner reflect the unified status so it can't contradict the full-screen block. Minimal, low-risk approach (keeps the header-driven flow):
  - In `page.tsx`, the full-screen `CommunityLimitScreen` already takes over the entire view when the budget is exhausted (rendered by `AuthWrapper`, which wraps `page.tsx`'s output). So when `reason === 'community-budget'`, `RateLimitBanner` is not even mounted (the limit screen replaces children). The remaining contradiction risk is the banner showing a stale/misleading per-IP count while the user is actually fine. Address it by having the banner derive purely from the per-IP headers (its current data source) — which after 005 are trustworthy — and add a guard so it never renders a "limit reached" message that conflicts with a NON-blocking state:
    - In `RateLimitBanner.tsx`, the existing `remaining >= 10` early-return (`:50`) already hides it except when genuinely near the per-IP cap. Keep it. No structural change is required for correctness once the full-screen block owns the budget-exhausted case. **Add one safeguard**: the banner currently can render with `total` defaulting to `5` (from `page.tsx:148`'s `'5'` fallback when headers are absent — e.g. a route with no `X-RateLimit-*`). After Step 4 all four LLM routes set `X-RateLimit-*` on their responses, so the fallback path is no longer hit on real responses; leave the `'5'` default as a harmless cold-start guard but add a comment in `page.tsx:147-149` noting all LLM routes now emit these headers.
  - **Decision recorded**: we keep the two visual surfaces (full-screen for the *global* budget block; corner banner for the *per-user* per-IP countdown) but they now derive from ONE authority's outputs — the budget block from `/api/usage.exhausted`/`reason`, the banner from the `X-RateLimit-*` headers that the authority produces. They can no longer contradict because (a) the budget block takes over the whole screen, unmounting the banner, and (b) both numbers come from `evaluateLimits`. No separate "990/1000 while blocked" path remains.
  - If a reviewer wants the banner to ALSO show a per-IP block message, that is an additive enhancement; the unification requirement is satisfied by the shared source. Do not over-build.

**5d. `src/components/AuthWrapper.tsx`** — no logic change required: it reads `data.exhausted`, `data.isAdmin`, `data.resetAt` (`:39-40`), all still present and now sourced from the authority. Leave it. (Confirm the fields still parse; do not switch it to `reason` unless you also keep `exhausted` — keeping the existing fields is the lower-risk path.)

**Verify**: `bun run type-check` → exit 0. `grep -n "Date.UTC" src/components/CommunityLimitScreen.tsx` → no matches. `bun run build` → exit 0.

### Step 6: Tests

**5/6 ordering note**: this is the test step; it follows the implementation so types are stable.

**6a. Ensure the `bun test` script exists (idempotent; per plan 003)** — run `grep -n '"test"' package.json` first:
- If a `"test"` script already exists (e.g. plan 003 has been executed), leave it; do NOT add or change any script.
- If it does NOT exist, add exactly `"test": "bun test src"` to `package.json` scripts — the same script plan 003 specifies. Do NOT alter the existing `test:e2e*` scripts.
- This repo uses **bun's built-in test runner**; adding a third-party test framework (jest or similar) is explicitly OUT OF SCOPE (plan 003). Do NOT add any test dependency and do NOT create any test-runner config file. bun honors the `@/*` tsconfig path alias natively, so no path plugin is needed. All new test files live under `src/**/__tests__/*.test.ts` so that `bun test src` picks them up and the Playwright specs in `e2e/` are excluded.

**6b. Create `src/lib/__tests__/limits.test.ts`** — a `bun:test` file. Unit-test the authority by mocking `@/lib/budget`, `@/lib/ratelimit`, and `@/lib/llm` (so no Redis is needed). Cover exactly these cases for `evaluateLimits`:
  1. **Neither exhausted** → `allowed: true`, `reason: null`, `resetAt === budget.resetAt`, `ipRate.exhausted === false`.
  2. **Budget exhausted only** → `allowed: false`, `reason: 'community-budget'`, `resetAt === nextResetISO()` value, `budget.exhausted === true`.
  3. **Per-IP exhausted only** (budget fine) → `allowed: false`, `reason: 'ip-rate'`, `resetAt === ISO of the limiter reset ms`, `ipRate.exhausted === true`.
  4. **Both exhausted** → `reason: 'community-budget'` (budget wins / is checked first), `resetAt === budget.resetAt`.
  5. **Admin mode** (`getLlmMode` mocked → `'admin'`) → `budget === null`, `isAdmin: true`, and only the per-IP gate can block (assert that a budget-exhausted mock is irrelevant because `getCommunityBudgetStatus` returns null for admin).
  6. **Fail-open** (mock `getBudgetStatus` → `exhausted: false` and `checkRateLimit` → `success: true`, simulating Redis-absent) → `allowed: true`.
  - For `chargeIpRate`: assert it calls `incrementRateLimit` with the extracted IP and returns its `RateLimitResult` unchanged (mock `getClientIP` or pass a request with an `x-forwarded-for` header).
  - **Style/structure** (match plan 003's `bun:test` files, e.g. `src/lib/__tests__/budget.test.ts` and `src/lib/__tests__/ratelimit.test.ts` once 003 lands): `import { beforeEach, describe, expect, mock, test } from 'bun:test'`, then `mock.module('@/lib/budget', () => ({ … }))` (and the same for `@/lib/ratelimit`, `@/lib/llm`) **before** `await import('@/lib/limits')`, with `beforeEach(() => { /* reset mock return values */ })`. Use `bun:test`'s `mock` / `mock.module` for all mocking — this repo has no other test framework, so there is no `vi.*` mocking API available.

**6c. Route-level coverage** — assert all four LLM routes now enforce the per-IP gate. Two acceptable approaches; pick the lighter one that passes:
  - **Preferred (unit, `bun:test`)**: in `limits.test.ts` or a sibling `__tests__/*.test.ts`, `mock.module('@/lib/limits', …)` so `evaluateLimits` returns `{ allowed: false, reason: 'ip-rate', resetAt: <iso>, … }`, then `await import` each route's `POST`, build a `NextRequest`, and assert the response `status === 429`. Repeat with `reason: 'community-budget'` → `status === 402` and body `code === 'community_limit'`. This proves each of the four routes consults the authority and maps both reasons correctly.
  - **Fallback (e2e)**: extend `e2e/community-limit.spec.ts` (already exists) to mock a 429 from `summarize`/`detect-urls`/`resolve-timezone` and assert the client behavior. Only if the unit approach proves impractical for `NextRequest` construction.

**Verify**: `bun test src` → all pass (≥ 8 new assertions across the 6 evaluate cases + chargeIpRate + the four-route gate). `bun run type-check` → exit 0.

### Step 7: Whole-app sanity + plans index row

- `bun run build` → exit 0.
- Optional but recommended: `bun run test:e2e -- e2e/community-limit.spec.ts` → all pass (the limit-screen flow still works end-to-end; network is mocked in that spec).
- In the existing `plans/README.md`, flip this plan's own status row (013) to `DONE`. Do NOT create or rewrite the index — it already exists and the advisor maintains it (005's row and the dependency notes are already there).

**Verify**: `git status --short` → only in-scope files modified/created. `bun run build` → exit 0.

## Test plan

- **New unit tests** in `src/lib/__tests__/limits.test.ts` are the spec for the authority — the six `evaluateLimits` cases (neither / budget-only / ip-only / both / admin / fail-open), `chargeIpRate`, and the four-route 429/402 mapping (Step 6b/6c). These are the regression gate the Risk rating depends on.
- **Structural pattern**: use bun's built-in runner — `import { describe, expect, test, mock, beforeEach } from 'bun:test'` with `mock.module(...)` for module mocks. Mirror plan 003's `bun:test` files (`src/lib/__tests__/budget.test.ts`, `src/lib/__tests__/ratelimit.test.ts`) for style and location once 003 lands.
- **Existing e2e** `e2e/community-limit.spec.ts` must still pass (the budget full-screen flow is behavior-preserved).
- **Verification**: `bun test src` → all pass; `bun run type-check` and `bun run build` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run type-check` exits 0 and `bun run build` exits 0
- [ ] `bun test src` exits 0 with the new `limits.test.ts` cases passing (six `evaluateLimits` cases + `chargeIpRate` + four-route gate)
- [ ] `src/lib/limits.ts` and `src/lib/clientIp.ts` exist; `grep -rln "function getClientIP" src/` → exactly `src/lib/clientIp.ts`
- [ ] `grep -rn "evaluateLimits(" src/app/api/parse/route.ts src/app/api/summarize/route.ts src/app/api/detect-urls/route.ts src/app/api/resolve-timezone/route.ts` → at least one hit in EACH of the four files
- [ ] `grep -n "Date.UTC" src/components/CommunityLimitScreen.tsx` → no matches (the third reset formula is gone)
- [ ] `/api/usage` response includes `reason`, `budget`, and `ipRate` (inspect `src/app/api/usage/route.ts`) while still including top-level `exhausted`, `resetAt`, `isAdmin`
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] One commit on branch `advisor/013-unify-ratelimit-and-budget-authority`; not pushed
- [ ] In the existing `plans/README.md`, this plan's row (013) is `DONE` (the index was not created or rewritten by this plan)

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code (drift since `400bf32`) — especially if `src/lib/ratelimit.ts`'s `RateLimitResult` shape or the `X-RateLimit-*` headers in `parse/route.ts` differ from what's quoted.
- You discover a caller of `checkRateLimit`/`incrementRateLimit` outside `src/app/api/parse/route.ts` (grep first) — its semantics would change; report it. (At `400bf32` there are none.)
- You discover a `/api/usage` consumer beyond `src/components/AuthWrapper.tsx` and `src/app/spent/page.tsx` that reads a field you'd be changing — report before altering the payload.
- Preserving the exact `RateLimitResult` shape or `X-RateLimit-*` header units proves impossible.
- `bun test src` mis-resolves the `@/*` tsconfig path alias, or `mock.module(...)` cannot intercept the mocked modules after two attempts — report; do NOT add a third-party test framework or a bundler config, and do NOT fall back to leaving the authority untested.
- A verification command fails twice after a reasonable fix attempt.
- It turns out plan 005 has landed and `src/lib/ratelimit.ts` has been substantially rewritten in a way that changes the public functions' signatures — re-read it and confirm `evaluateLimits` still composes cleanly before proceeding.

## Maintenance notes

For the human/agent who owns this after it lands:

- **This plan depends on plan 005 (a written plan).** If 005 has NOT yet been executed when 013 ships, the per-IP `reset` surfaced by the authority is still the limiter's *current* (buggy) value — the unification is correct, but the per-IP reset time is only trustworthy once 005's UTC-day window + atomic `incr` land. 005 must still be executed; it will find `src/lib/clientIp.ts` already created here (Step 1) and should reuse it. 005's row and dependency note already exist in `plans/README.md` (the advisor maintains the index) — do NOT add or rewrite it.
- **One reset-formula authority**: `nextResetISO()` in `src/lib/budget.ts:29-32` is now the single source for the budget reset (server). The client (`CommunityLimitScreen`, `spent/page`) only *formats* a server-supplied ISO; it must never recompute a reset again — the deleted `Date.UTC(...)` block in `CommunityLimitScreen.tsx` is the anti-pattern to never reintroduce.
- **Budget vs per-IP UX split is intentional**: the full-screen `CommunityLimitScreen` is the *global* budget block; the corner `RateLimitBanner` is the *per-user* per-IP countdown. Both now derive from `evaluateLimits` outputs, so they cannot contradict. A reviewer should scrutinize that `/api/usage.exhausted` reflects ONLY the community-budget state (not per-IP) so the full-screen takeover isn't triggered by a per-user cap.
- **Charging policy**: the three newly-gated routes charge the per-IP counter *after* a successful upstream call (next to `recordLlmUsage`), so upstream failures don't consume quota. If product later wants failures to count, move `chargeIpRate` ahead of the OpenRouter `fetch` in those three routes — single-line change per route.
- **What a PR reviewer should scrutinize**: (1) `parse`'s external contract is byte-for-byte unchanged (same 429 body/headers, same 402 code); (2) admins still bypass the community pool (`budget === null`, only per-IP can block them); (3) fail-open is preserved (Redis-absent → `allowed: true`).
- **Follow-up deferred**: whether `parse` should charge per-IP before vs after stream completion (`parse/route.ts:81` charges before) is unchanged here and shared with 005's deferral.

---

## Plans index (`plans/README.md`) — already exists; do NOT create it

`plans/README.md` already exists and is maintained by the advisor; it already contains both plan 005's and plan 013's rows plus the 013→005 dependency note. **This plan does not create or rewrite the index.** The executor's only README action is to flip this plan's own status row (013) to `DONE` after Step 7. Do NOT add 005's row, the header, or the dependency notes — they are already there.

For reference, the relevant rows already present in the index read approximately:

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 005  | Fix the rate limiter — atomic increments, UTC-day window, sane reset, one getClientIP | P2 | S–M | 003 | (its own status) |
| 013  | Unify the community-budget + per-IP rate-limit into one authority, enforced on all LLM routes | P2 | M | 005 | DONE (after this plan executes) |

The dependency relationship already recorded in the index: 013 depends on 005 — 005 makes the per-IP counts/reset trustworthy (atomic incr, UTC-day window); 013 builds the unifying authority over the limiter and already extracts `src/lib/clientIp.ts` (005's Step 1), so 005 reuses it rather than re-creating it.
