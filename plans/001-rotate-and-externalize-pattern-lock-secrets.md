# Plan 001: Rotate the admin unlock patterns out of source and make brute-force protection real

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f53bf0e..HEAD -- src/app/api/auth src/lib .env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (auth flow is small and isolated; the dangerous part is operational — env vars must be set before deploy)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `f53bf0e`, 2026-06-10

## Why this matters

This repository is **public** (github.com/mannanj/event-every, verified `"visibility":"PUBLIC"`). The pattern-lock is the only thing separating anonymous visitors from "admin" mode, and admin mode switches LLM calls to the **unrestricted** OpenRouter key with no budget cap (`src/lib/llm.ts`). The complete set of valid unlock patterns is hardcoded in committed source at `src/app/api/auth/verify/route.ts:4-9` — anyone reading the public repo can mint an admin session on summonit.app and spend the owner's OpenRouter balance. Additionally, the brute-force lockout is an in-memory `Map` that resets on every serverless cold start and is not shared between concurrent Vercel instances, and the HMAC secret for session cookies falls back to a random per-instance value when `AUTH_SECRET` is unset (so unlocks can silently fail across instances). This plan rotates the credential out of source, moves attempt-tracking to Redis, and makes `AUTH_SECRET` an explicit requirement.

**Secret-handling rule for this plan**: never write any pattern value (old or new) into code, comments, commits, or this plans directory. The four arrays currently at `verify/route.ts:4-9` are burned — they are in public git history forever. The maintainer must choose **new** patterns; do not reuse the committed ones.

## Current state

- `src/app/api/auth/verify/route.ts` — POST endpoint validating a pattern (array of 2–9 integers 0–8). Contains the secrets and the in-memory lockout:

```ts
// src/app/api/auth/verify/route.ts:4-12 (array contents redacted — they are secrets)
const VALID_L_PATTERNS = [
  [/* redacted */],
  [/* redacted */],
  [/* redacted */],
  [/* redacted */],
];

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
```

```ts
// src/app/api/auth/verify/route.ts:20
const attemptStore = new Map<string, AttemptRecord>();
```

- Pattern check at `verify/route.ts:105-107`: `VALID_L_PATTERNS.some(validPattern => arraysEqual(pattern, validPattern))`. On success it sets an HMAC-signed cookie (lines 111-123, cookie flags are already correct: httpOnly, secure in prod, sameSite strict).
- `src/app/api/auth/shared.ts:8-14` — secret fallback:

```ts
export function getAuthSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (!fallbackSecret) {
    fallbackSecret = crypto.randomBytes(32).toString('hex');
  }
  return fallbackSecret;
}
```

- `src/lib/llm.ts:13-22` — the cookie is the admin signal; admin mode uses `OPENROUTER_API_KEY` directly and bypasses the community budget. This is what the patterns protect.
- `.env.example` — has **no** `AUTH_SECRET` and no patterns entry (verified by grep).
- The repo already has the exact Redis attempt-counting idiom to copy: `src/app/api/waitlist/route.ts:22-33` (`overSignupLimit`) does `incr` + `expire` on first increment, fails open on Redis errors with a `catch`. Match it.
- Redis client construction convention: see `src/lib/budget.ts:17-23` (`isRedisAvailable` + `getRedis` reading `KV_REST_API_URL`/`KV_REST_API_TOKEN`). Match it.
- Repo conventions: TypeScript strict, no `any`. Server-only code lives in `src/lib/` and `src/app/api/`. Errors on the Redis path log via `console.error` and fail open (see `budget.ts:51-54` and the comment there explaining why).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run type-check`     | exit 0, no output (verified passing at f53bf0e) |
| Build     | `bun run build`          | exit 0 (verified passing at f53bf0e) |
| Unit tests | `bun test src`          | all pass (only if plans/003 has landed; otherwise skip) |

Do NOT use `bun run lint` — it is broken at f53bf0e (no ESLint config; plans/004 fixes it).

## Scope

**In scope** (the only files you should modify/create):
- `src/app/api/auth/verify/route.ts`
- `src/app/api/auth/shared.ts`
- `src/lib/authAttempts.ts` (create)
- `.env.example`
- `src/lib/__tests__/authAttempts.test.ts` and `src/app/api/auth/__tests__/shared.test.ts` (create, only if plans/003 landed first — otherwise note in your report that tests are deferred to 003)

**Out of scope** (do NOT touch, even though they look related):
- `src/components/PatternLock.tsx`, `src/hooks/useAuth.ts` — the client UI contract (POST `{pattern: number[]}`, response `{success, attemptsLeft, lockedOut, lockoutMinutes}`) must not change.
- `src/lib/llm.ts`, `src/app/api/auth/check/route.ts`, `src/app/api/auth/logout/route.ts` — unchanged.
- The 48-hour session duration (`AUTH_DURATION_S`) — a separate posture decision, noted in the findings table, not this plan.
- `e2e/prod.spec.ts` — it reads `TEST_AUTH_PATTERN` from `.env.local`, which keeps working as long as the maintainer updates `.env.local` with one of the new patterns.

## Git workflow

- Branch: `advisor/001-rotate-pattern-secrets`
- One commit, message style matching the repo (imperative title + bullet list), e.g. `Plan 001: Move unlock patterns to env and Redis-back the lockout`. End with the repo's `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read patterns from an environment variable

In `src/app/api/auth/verify/route.ts`, delete the `VALID_L_PATTERNS` literal (lines 4-9) and replace it with a parser:

```ts
// ADMIN_PATTERNS format: patterns separated by commas, cells by dashes,
// e.g. "0-1-2-5-8,6-3-0-1-2" (values here are format examples, not real patterns).
function getValidPatterns(): number[][] {
  const raw = process.env.ADMIN_PATTERNS || '';
  return raw
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.split('-').map(Number))
    .filter(p => p.length >= 2 && p.length <= 9 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 8));
}
```

In the POST handler, replace the `VALID_L_PATTERNS.some(...)` check: call `getValidPatterns()` per request; if it returns an empty array (env unset or malformed), log `console.error('ADMIN_PATTERNS not configured — admin unlock disabled')` once and treat every attempt as invalid (fail **closed** — unlike the rate limiter, an unconfigured credential must not grant access).

**Verify**: `grep -nE "VALID_L_PATTERNS|\[[0-8](, ?[0-8]){1,8}\]" src/app/api/auth/verify/route.ts` → no matches (the regex matches ANY inline cell-array literal without encoding the real values). `bun run type-check` → exit 0.

### Step 2: Move attempt tracking to Redis

Create `src/lib/authAttempts.ts` exporting two functions, modeled line-for-line on `src/app/api/waitlist/route.ts:22-33` and `src/lib/budget.ts:17-23`:

- `recordFailedAttempt(ip: string): Promise<{ lockedOut: boolean; lockoutMinutes: number }>` — `incr` on key `auth:attempts:${ip}`, `expire 900` (15 min) when the count is 1. Locked out when count > 3. Also `incr` a global key `auth:attempts:global:${new Date().toISOString().slice(0, 13)}` (hourly bucket, `expire 7200` on first); when the global count exceeds 30, report locked out regardless of per-IP count (distributed-guessing backstop).
- `isLockedOut(ip: string): Promise<{ lockedOut: boolean; lockoutMinutes: number }>` — `get` both keys and apply the same thresholds without incrementing.
- On Redis unavailable/error: log via `console.error` and return `{ lockedOut: false, lockoutMinutes: 0 }` (fail open, matching the repo's documented posture — the env-var patterns plus fail-closed-on-missing-config from Step 1 remain the primary control).

In `verify/route.ts`, delete `attemptStore`, `AttemptRecord`, `getOrCreateRecord`, and `cleanupOldRecords` (lines 14-55) and wire the handler: check `isLockedOut` before validating; on failed attempt call `recordFailedAttempt`; on success do nothing (per-IP key simply expires). Keep the existing JSON response shapes exactly (`attemptsLeft` may be computed as `Math.max(0, 3 - count)`; if you simplify, the client only renders `attemptsLeft`, `lockedOut`, `lockoutMinutes` — keep those fields present and correctly typed).

**Verify**: `grep -n "attemptStore\|new Map" src/app/api/auth/verify/route.ts` → no matches. `bun run type-check` → exit 0.

### Step 3: Make AUTH_SECRET explicit

In `src/app/api/auth/shared.ts`, change `getAuthSecret()`: when `process.env.AUTH_SECRET` is unset and `process.env.NODE_ENV === 'production'`, `throw new Error('AUTH_SECRET must be set in production — admin sessions cannot be verified consistently across serverless instances without it')`. Keep the random fallback for non-production so local dev needs no setup.

**Verify**: `bun run type-check` → exit 0; `bun run build` → exit 0 (build runs with NODE_ENV=production but does not execute the route handler, so it must still pass).

### Step 4: Document the new env vars

Append to `.env.example` under the Authentication section (formats only — never real values):

```
# Admin unlock patterns (server-only, REQUIRED for admin unlock to work).
# Patterns separated by commas, cells 0-8 separated by dashes. Choose NEW
# patterns — every pattern that was ever committed to this repo is public.
# ADMIN_PATTERNS=
# HMAC secret for the admin session cookie. REQUIRED in production.
# Generate with: openssl rand -hex 32
# AUTH_SECRET=
```

**Verify**: `grep -c "ADMIN_PATTERNS\|AUTH_SECRET" .env.example` → `2` or more.

### Step 5 (only if plans/003 landed): unit tests

Add `src/app/api/auth/__tests__/shared.test.ts` (token round-trip: generate → verify true; tampered token → false; expired token → false) and `src/lib/__tests__/authAttempts.test.ts` (mock `@upstash/redis` with `mock.module`; assert lockout after 4th failure, global backstop at 31, fail-open on Redis throw). Model the Redis mock on the pattern established in plans/003's tests.

**Verify**: `bun test src` → all pass.

## Test plan

- Unit tests as in Step 5 (deferred to after plans/003 if it hasn't landed).
- Manual smoke (no secrets in code): run `ADMIN_PATTERNS="<a-test-pattern>" bun dev`, visit `http://localhost:3777/?unlock`, confirm a wrong pattern decrements `attemptsLeft` and the right one unlocks. Use a throwaway pattern for local testing only.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "VALID_L_PATTERNS" src/` → no matches
- [ ] `grep -n "new Map" src/app/api/auth/verify/route.ts` → no matches
- [ ] `grep -c "ADMIN_PATTERNS" .env.example` → ≥ 1 and `grep -c "AUTH_SECRET" .env.example` → ≥ 1
- [ ] `bun run type-check` exits 0
- [ ] `bun run build` exits 0
- [ ] No pattern values (old or new) appear anywhere in the diff: `git diff advisor/001-rotate-pattern-secrets~1 | grep -E "\[[0-8], [0-8]," ` → no matches
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `verify/route.ts:4-9` no longer contains a hardcoded pattern array (someone already fixed this — report and mark the plan superseded).
- The client (`src/hooks/useAuth.ts` or `src/components/PatternLock.tsx`) turns out to depend on response fields beyond `success/attemptsLeft/lockedOut/lockoutMinutes/error`.
- You find yourself needing to print, log, or commit an actual pattern value anywhere.
- `bun run build` fails after Step 3 because something imports `getAuthSecret()` at module top-level during build — report; do not weaken the production throw.

## Maintenance notes

- **Operator actions required before this deploys**: set `ADMIN_PATTERNS` (new patterns, not the committed ones) and `AUTH_SECRET` in Vercel project env vars, and update `TEST_AUTH_PATTERN` in local `.env.local` for the prod e2e suite. Until `ADMIN_PATTERNS` is set, admin unlock is disabled by design (community mode keeps working).
- Consider also rotating the OpenRouter admin key if there is any sign the committed patterns were ever used by a third party (OpenRouter dashboard → usage anomalies).
- Pattern space for L-shaped patterns is small; the Redis lockout (per-IP + global hourly backstop) is the real control. A reviewer should scrutinize the fail-open vs fail-closed split: config missing → closed; Redis down → open.
- Deferred follow-ups (intentionally out of scope): shortening the 48h session, server-side session revocation.
