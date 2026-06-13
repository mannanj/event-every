# Plan 002: Close the SSRF/open-proxy hole in /api/scrape-url

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f53bf0e..HEAD -- src/app/api/scrape-url src/lib src/utils/url.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW–MED (legitimate event-page scraping must keep working; redirects are common on event sites)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `f53bf0e`, 2026-06-10

## Why this matters

`POST /api/scrape-url` fetches any URL a client supplies, unauthenticated, with **no URL validation, no private-address blocking, no timeout, no response-size limit, and no rate limit**, then returns the fetched text to the caller. That makes the production deployment (summonit.app) an open proxy: it can be pointed at cloud metadata endpoints and internal services (SSRF), used to exfiltrate content from places only the server can reach, or abused for bandwidth/function-time exhaustion (a URL that streams forever holds a Vercel function open with no abort). It also returns raw `error.message` from failed fetches, leaking internal fetch errors to clients.

## Current state

- `src/app/api/scrape-url/route.ts` — the whole route is 68 lines. The fetch happens with zero guards:

```ts
// src/app/api/scrape-url/route.ts:15-25
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Summon/1.0; +https://event-every.com)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
```

and the error path returns internals:

```ts
// src/app/api/scrape-url/route.ts:55-58
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to scrape URL';
```

- `src/utils/url.ts:1-22` — `normalizeUrl()` is a **client-side cosmetic normalizer** (adds https://, strips zero-width chars). It explicitly allows `localhost` (`url.ts:11`) and does nothing about IPs. The route does not call it at all. Do not treat it as a security boundary and do not change its behavior (the UI uses it for display/normalization).
- There is no rate limiting on this route (it imports nothing from `src/lib/ratelimit.ts`).
- Rate-limit idiom to copy: `src/app/api/waitlist/route.ts:22-33` (`incr` + `expire` on first increment, per-IP daily key, fail-open with `console.error`). Redis client idiom: `src/lib/budget.ts:17-23`.
- Client-IP extraction exists (copy-pasted) in three routes, e.g. `src/app/api/parse/route.ts:12-25`. If plans/005 has already landed there will be a shared `src/lib/clientIp.ts` — use it; otherwise copy the same function locally (005 will consolidate).
- API routes here run on the default Node.js runtime (no `export const runtime` anywhere in `src/app/api/`), so `node:dns` and `node:net` are available.
- Convention: user-facing error messages are friendly and generic (see `src/app/api/waitlist/route.ts:137-166`); details go to `console.error`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run type-check`     | exit 0 (verified passing at f53bf0e) |
| Build     | `bun run build`          | exit 0 (verified passing at f53bf0e) |
| Unit tests | `bun test src`          | all pass            |

Do NOT use `bun run lint` — broken at f53bf0e (plans/004 fixes it).

## Scope

**In scope** (the only files you should modify/create):
- `src/app/api/scrape-url/route.ts`
- `src/lib/safeFetch.ts` (create)
- `src/lib/__tests__/safeFetch.test.ts` (create — `bun test` is built into bun, no runner setup needed; scope invocations to `bun test src` because `bun test` with no path also picks up the Playwright `e2e/*.spec.ts` files and errors on them)

**Out of scope** (do NOT touch, even though they look related):
- `src/utils/url.ts` — client-side normalizer used by the UI; changing it changes UI behavior.
- `src/services/webScraper.ts` and `src/app/api/detect-urls/route.ts` — callers/siblings; the response shape `{ url, text, title, status }` must not change.
- `src/services/urlDetector.ts`.

## Git workflow

- Branch: `advisor/002-harden-scrape-url`
- One commit, e.g. `Plan 002: SSRF guards, limits, and rate limiting for /api/scrape-url`, ending with the repo's `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/lib/safeFetch.ts`

Export `async function fetchPublicUrl(rawUrl: string): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; reason: 'invalid_url' | 'blocked' | 'timeout' | 'too_large' | 'fetch_failed' | 'http_error'; status?: number }>` implementing, in order:

1. **Parse & protocol allowlist**: `new URL(rawUrl)` (reject on throw → `invalid_url`); allow only `http:` and `https:` → else `blocked`.
2. **Hostname/IP guard**: reject when the hostname is `localhost`, `*.localhost`, `*.internal`, or a literal IP in a private/reserved range; otherwise resolve with `lookup` from `node:dns/promises` (`{ all: true }`) and reject if **any** resolved address is private/reserved. Implement and export `isPrivateAddress(ip: string): boolean` covering at minimum: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `198.18.0.0/15`, IPv6 `::1`, `::`, `fc00::/7`, `fe80::/10`, and IPv4-mapped IPv6 (`::ffff:a.b.c.d` — check the embedded IPv4). Use `node:net`'s `isIP` to classify. Keep this function pure (no I/O) so it is trivially unit-testable.
3. **Manual redirect handling**: fetch with `redirect: 'manual'` and `signal: AbortSignal.timeout(8000)`. On 3xx with a `location` header, resolve it against the current URL and **re-run steps 1–2 on the new URL**; follow at most 3 hops, else `blocked`. (DNS re-resolution per hop is the rebinding mitigation we can afford here; note the residual TOCTOU gap in a code comment.)
4. **Size cap**: read the body via `response.body.getReader()` accumulating at most 1_000_000 bytes; past the cap, cancel the reader and return `too_large`. Decode with `TextDecoder`.
5. Non-OK final response → `{ ok: false, reason: 'http_error', status }`; abort/timeout → `timeout`; other errors → `fetch_failed` (log the real error with `console.error`, never return it).

**Verify**: `bun run type-check` → exit 0.

### Step 2: Unit-test the guard

`src/lib/__tests__/safeFetch.test.ts`, testing `isPrivateAddress` directly (table-driven: each range above gets a positive case, plus public addresses like `93.184.216.34` and a normal IPv6 as negatives, and `::ffff:10.0.0.1` as a positive) and `fetchPublicUrl`'s URL-shape rejections (`ftp://x`, `http://localhost:3777`, `http://127.0.0.1`, `http://169.254.169.254/latest/meta-data` → all rejected without any network call — assert by mocking global fetch with `mock` from `bun:test` and asserting it was not called).

**Verify**: `bun test src/lib/__tests__/safeFetch.test.ts` → all pass.

### Step 3: Wire the route

In `src/app/api/scrape-url/route.ts`:

- Add per-IP rate limiting before fetching: key `scrape:rl:${ip}:${new Date().toISOString().slice(0, 10)}`, `incr` + `expire(24*60*60)` when count is 1, limit 100/day, fail-open on Redis errors with `console.error` (copy `src/app/api/waitlist/route.ts:22-33`). Over limit → 429 `{ error: 'Too many link lookups today. Please try again tomorrow.', status: 'error' }`.
- Replace the bare `fetch` with `fetchPublicUrl(url)`. Map failures to generic client messages: `invalid_url`/`blocked` → 400 `{ error: 'That link can't be fetched.', status: 'error' }`; `timeout`/`too_large`/`fetch_failed`/`http_error` → 502 `{ error: 'Couldn't load that page. Try pasting the event text instead.', status: 'error' }`. Keep the success shape exactly `{ url, text, title, status: 'success' }` (the existing title/text extraction at lines 27-44 stays as is, operating on the returned `html`).
- Delete the `error.message` passthrough at lines 55-58; the catch-all returns the generic 502 message and logs the real error.

**Verify**: `bun run type-check` → exit 0; `bun run build` → exit 0.

### Step 4: Manual smoke

`bun dev`, then:
- `curl -s localhost:3777/api/scrape-url -X POST -H 'content-type: application/json' -d '{"url":"http://169.254.169.254/latest/meta-data"}'` → 400, generic message, and the dev server log shows the block reason.
- Same with `{"url":"https://example.com"}` → 200 with `"status":"success"` and text containing "Example Domain".

**Verify**: both curl outputs match.

## Test plan

- Unit tests in Step 2 (pure IP classifier exhaustively; URL-shape rejections with fetch mocked).
- The local e2e suites mock network routes and don't exercise scrape-url against real URLs; no e2e changes needed. If `e2e/event-extraction.spec.ts` fails after this change, that is a STOP condition (it would mean the response contract drifted).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "await fetch(url" src/app/api/scrape-url/route.ts` → no matches (route goes through `fetchPublicUrl`)
- [ ] `grep -n "error.message" src/app/api/scrape-url/route.ts` → no matches
- [ ] `grep -c "incr" src/app/api/scrape-url/route.ts` → ≥ 1 (rate limit wired)
- [ ] `bun test src` exits 0, including ≥ 12 new assertions in `safeFetch.test.ts`
- [ ] `bun run type-check` exits 0 and `bun run build` exits 0
- [ ] Both Step 4 curls behave as specified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The route at f53bf0e's shape (single `fetch(url)` at line 15) is no longer there — someone may have partially hardened it; reconcile instead of layering.
- `node:dns` or `node:net` imports fail to build (would mean the route was moved to the Edge runtime since this plan was written).
- Keeping the success response shape `{ url, text, title, status }` proves impossible.
- `e2e/event-extraction.spec.ts` (mocked-network suite) starts failing.

## Maintenance notes

- Residual risk to document in review: DNS rebinding between the pre-check `lookup` and undici's own resolution is not fully closed (would require a custom dispatcher pinning the resolved IP); the 8s timeout + 1MB cap + redirect re-validation reduce it to a narrow race. If this ever matters, the principled fix is undici `Agent` with a `connect` callback that re-checks the socket address.
- If a future feature needs to scrape authenticated or internal pages, do not relax `isPrivateAddress` — add a separate, authenticated route instead.
- The 100/day per-IP scrape limit is a guess; tune against real usage (it only protects egress/function time, not LLM spend).
