# Plan 005: Fix the rate limiter — atomic increments, a real daily window, sane reset times, one getClientIP

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f53bf0e..HEAD -- src/lib/ratelimit.ts src/app/api/parse/route.ts src/app/api/auth/verify/route.ts src/app/api/waitlist/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (changes user-visible limiting behavior; mitigated by the characterization tests from plans/003)
- **Depends on**: plans/003 (the KNOWN QUIRK tests there get deliberately flipped here)
- **Category**: bug
- **Planned at**: commit `f53bf0e`, 2026-06-10

## Why this matters

The "daily" limit of 1000 parse requests per IP is neither daily nor accurate. Three verified defects in `src/lib/ratelimit.ts`: (1) `incrementRateLimit` does a non-atomic `get` → `set`, so concurrent requests lose increments; (2) the `set(key, newCount, { ex: WINDOW_DURATION })` on **every** increment resets the 24h TTL each time — a steady user's window slides forever, so after 1000 cumulative requests with never a 24h gap they are locked out *permanently*; (3) when the key has no TTL (`redis.ttl` returns -1/-2), the computed `reset` is a timestamp in the past, which the UI then renders. A fourth, structural item: `getClientIP` is copy-pasted into three routes, so any future IP-extraction fix must be made three times. This plan replaces the rolling-set idiom with the repo's own proven date-keyed `incr` idiom and consolidates IP extraction.

## Current state

- `src/lib/ratelimit.ts` (read it in full; it is 102 lines). The defective core:

```ts
// src/lib/ratelimit.ts:40-42 (inside checkRateLimit)
    if (currentCount >= DAILY_LIMIT) {
      const ttl = await redis.ttl(key);
      const resetTime = now + (ttl * 1000);   // ttl can be -1/-2 → reset in the past
```

```ts
// src/lib/ratelimit.ts:80-83 (inside incrementRateLimit)
    const current = await redis.get<number>(key);
    const newCount = (current || 0) + 1;       // non-atomic read-modify-write
    await redis.set(key, newCount, { ex: WINDOW_DURATION });  // TTL reset EVERY time
```

- Key shape today: `ratelimit:events:${identifier}` (lines 34, 78). `DAILY_LIMIT = 1000`, `WINDOW_DURATION = 86400` (lines 10-11). Both functions fail open on Redis errors with `console.error` — **by design**; keep that.
- The proven idiom to copy is already in this repo, twice:
  - `src/app/api/waitlist/route.ts:26-28`: ``const key = `waitlist:rl:${ip}:${new Date().toISOString().slice(0, 10)}`; const count = await redis.incr(key); if (count === 1) await redis.expire(key, 24 * 60 * 60);``
  - `src/lib/budget.ts:27`: date-embedded key, and `nextResetISO()` at `budget.ts:29-32` computes next UTC midnight.
- Callers of the rate limiter (the only ones, verified): `src/app/api/parse/route.ts` lines 31 (`checkRateLimit`), 81 (`incrementRateLimit`), 136 (`checkRateLimit` again for response headers). The route also defines its own `getClientIP` at lines 12-25.
- `getClientIP` copies (verified by grep, all three functionally identical — x-forwarded-for first element, then x-real-ip, else 'unknown'): `src/app/api/parse/route.ts:12-25`, `src/app/api/auth/verify/route.ts:22-35`, `src/app/api/waitlist/route.ts:16-20`.
- plans/003 pinned the quirks with `// KNOWN QUIRK (plans/005)` tests in `src/lib/__tests__/ratelimit.test.ts` — you will update those assertions to the new behavior.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run type-check`     | exit 0 (verified passing at f53bf0e) |
| Unit tests | `bun run test`          | exit 0 (script exists after plans/003) |
| Build     | `bun run build`          | exit 0 (verified passing at f53bf0e) |

Do NOT use `bun run lint` unless plans/004 has landed (broken at f53bf0e).

## Scope

**In scope**:
- `src/lib/ratelimit.ts`
- `src/lib/clientIp.ts` (create)
- `src/app/api/parse/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/waitlist/route.ts` (only: replace local `getClientIP` with the shared import)
- `src/lib/__tests__/ratelimit.test.ts` (update the KNOWN QUIRK assertions)

**Out of scope** (do NOT touch):
- `src/lib/budget.ts` (the budget pool is correct as-is — date-keyed already).
- The fail-open posture on Redis errors (documented design; keep it).
- Response shapes: `RateLimitResult { success, remaining, reset, error? }` and the `X-RateLimit-*` headers set in `parse/route.ts:46-50,143-145` — consumers (`RateLimitBanner` via `page.tsx`) depend on `reset` being epoch milliseconds. Do not change field names or units.
- When the increment happens relative to parsing (line 81 charges before parse succeeds) — behavioral product question, not this plan.

## Git workflow

- Branch: `advisor/005-ratelimit-correctness`
- One commit, e.g. `Plan 005: date-keyed atomic rate limiting + shared getClientIP`, ending with the repo's `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract `getClientIP`

Create `src/lib/clientIp.ts` exporting exactly the existing function (signature `getClientIP(request: NextRequest): string`), implementation copied from `src/app/api/parse/route.ts:12-25`. Replace the three local definitions with `import { getClientIP } from '@/lib/clientIp'`. Zero behavior change.

**Verify**: `grep -rln "function getClientIP" src/` → only `src/lib/clientIp.ts`. `bun run type-check` → exit 0.

### Step 2: Re-key the limiter to the UTC day and make increments atomic

In `src/lib/ratelimit.ts`:

- Key becomes ``const rateLimitKey = (identifier: string) => `ratelimit:events:${identifier}:${new Date().toISOString().slice(0, 10)}`;`` (matching `budget.ts:27`).
- Add a module-local `nextResetMs()` returning next UTC midnight in epoch ms (port `nextResetISO` from `budget.ts:29-32`, returning `.getTime()`).
- `incrementRateLimit`: replace the get/set pair with ``const newCount = await redis.incr(key); if (newCount === 1) await redis.expire(key, 26 * 60 * 60);`` (26h TTL comfortably outlives the UTC day the key is scoped to, mirroring the budget comment style). `reset` in the returned object becomes `nextResetMs()`.
- `checkRateLimit`: same key; the `ttl` read and `resetTime` computation (lines 41-42) are deleted — `reset` is always `nextResetMs()` (it is now exact, since the window IS the UTC day). Everything else (fail-open paths, `remaining` arithmetic, `DAILY_LIMIT`) stays.
- Update the header doc comment to state the new semantics: *fixed per-UTC-day window, resets at midnight UTC, matching the community budget pool*.

**Verify**: `grep -n "redis.set(key" src/lib/ratelimit.ts` → no matches; `grep -n "redis.ttl" src/lib/ratelimit.ts` → no matches; `bun run type-check` → exit 0.

### Step 3: Flip the pinned quirk tests

In `src/lib/__tests__/ratelimit.test.ts`: the `// KNOWN QUIRK (plans/005)` tests now assert the fixed behavior — `reset` is always in the future and equals next UTC midnight (±2s tolerance); `incr` is called instead of `get`+`set`; `expire` is called only when the mocked `incr` returns 1 (assert: second increment with `incr` → 2 does NOT call `expire`). Keep the fail-open tests green unchanged.

**Verify**: `bun run test` → all pass, 0 failures.

### Step 4: Whole-app sanity

`bun run build` → exit 0. Optionally `bunx playwright test e2e/community-limit.spec.ts` (mocked network; exercises the limit UI) → all pass.

## Test plan

- Updated unit tests in Step 3 are the spec: atomic incr, expire-once, UTC-midnight reset, fail-open preserved.
- New case to add: two `incrementRateLimit` calls where mocked `incr` returns 999 then 1000 → second result has `success: false` semantics per the existing `newCount <= DAILY_LIMIT` rule (read line 89 and preserve its meaning).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "redis.set(key\|redis.ttl" src/lib/ratelimit.ts` → no matches
- [ ] `grep -rln "function getClientIP" src/` → exactly `src/lib/clientIp.ts`
- [ ] `bun run test` exits 0 and no test is still tagged `KNOWN QUIRK (plans/005)`
- [ ] `bun run type-check` exits 0 and `bun run build` exits 0
- [ ] `git diff --name-only` touches only the six in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/lib/ratelimit.ts` no longer matches the excerpts (drift).
- plans/003's `ratelimit.test.ts` does not exist (003 not landed) — this plan depends on it; report rather than writing throwaway tests.
- You find an additional caller of `checkRateLimit`/`incrementRateLimit` beyond `parse/route.ts` (grep first) — the semantics change would affect it; report it.
- Preserving the exact `RateLimitResult` shape proves impossible.

## Maintenance notes

- Semantics change to announce in review: limits now reset at **midnight UTC** (previously a 24h window that, due to the TTL bug, never reset under steady use). This matches the budget pool's reset and the UI copy on the limit screen.
- The old un-suffixed keys (`ratelimit:events:<ip>`) simply expire within 24h of the deploy; no migration needed.
- If per-IP limiting ever needs to be trustworthy off-Vercel, fix it in ONE place now: `src/lib/clientIp.ts` (header spoofing caveat is documented in the findings table).
