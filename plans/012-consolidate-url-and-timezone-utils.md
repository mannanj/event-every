# Plan 012: Consolidate URL and timezone utilities into single authorities (and fix the whitespace-stripping URL bug)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 400bf32..HEAD -- src/utils/url.ts src/utils/timezone.ts src/utils/timeConversion.ts src/services/timezoneResolver.ts src/components/URLPill.tsx src/app/api/detect-urls src/app/api/scrape-url src/app/page.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (At authoring time this diff was
> EMPTY — no drift.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED — legitimate URLs and timezones MUST keep working. The `normalizeUrl` bug fix deliberately changes output for inputs that contain interior spaces (today they are silently corrupted); that behavior change is gated by a new unit test. The timezone consolidation is behavior-preserving except for fixing one latent mislabel (documented in Step 6).
- **Depends on**: plans/003 (SOFT). Plan 003 stands up bun's built-in test runner (`bun test src`) and adds the one-line `"test": "bun test src"` script to `package.json`. Plan 003 is a **written plan that may not be executed yet** — at this HEAD there is no `src/**/__tests__/` directory and no `test` script in `package.json` (only `test:e2e`). This plan does **not** introduce a separate runner: bun's test runner is built in (no dependency to add). If the `"test": "bun test src"` script is absent when you execute (true at this HEAD), Step 1 idempotently adds exactly that one line — the same line plan 003 adds — and nothing more. If 003 has already landed and the script exists, Step 1 reuses it as-is; do NOT add a second script or a different runner.
- **Category**: tech-debt + bug
- **Planned at**: commit `400bf32`, 2026-06-13

## Why this matters

Two small "authorities" in this codebase are each implemented two or three times, and one of those duplicates hides a silent data-corruption bug:

1. **URL handling is scattered and one copy is buggy.** `src/utils/url.ts`'s `normalizeUrl` strips **all** interior whitespace from a URL (the regex character class leads with `\s`), so `https://example.com/my event` silently becomes `https://example.com/myevent`. That corrupted value is written into the exported `.ics` URL field (`src/services/exporter.ts:79,220`) and read back on import (`src/services/icsParser.ts:134`) — the product's actual output. Meanwhile `src/components/URLPill.tsx` hand-rolls `new URL()` parsing **three** times with three separate `try/catch` blocks and writes the `meetup.com` host check **three** times, and detected URLs are sent to the scraper **without** going through `normalizeUrl` at all — so a bare `example.com/event` that `normalizeUrl` could have salvaged fails to scrape. Making `src/utils/url.ts` the single URL authority fixes the bug, removes the triplication, and closes the normalization gap in one move.

2. **Timezone resolution is duplicated and double-classifies.** Three overlapping abbreviation tables exist (`src/utils/timezone.ts` `TIMEZONE_ABBREVIATIONS`, a hardcoded copy of the same ~30 keys in `src/services/timezoneResolver.ts`, and `US_TZ_NORMALIZE` in `src/utils/timeConversion.ts`). `resolveTimezone` calls `normalizeTimezone(raw)` and then re-runs `isKnownTimezone(raw)` to reconstruct a "resolved vs unknown" status that `normalizeTimezone` had already computed and thrown away — and that reconstruction has a latent bug (when the user's browser TZ equals the resolved zone, a legitimately-resolved zone is mislabeled `unknown`). Two dead exports (`convertToIANATimezone`, and the unnecessary `export` on `parseTimezoneFromText`) add noise. Folding `resolveTimezone` into `src/utils/timezone.ts`, deriving the "known" set from the single table, and returning the resolution status directly removes the duplication, deletes a 43-line service, and fixes the mislabel.

When this lands: URLs round-trip through export/import without corruption, `URLPill` parses each URL once, detected URLs are normalized before scraping, there is exactly one timezone abbreviation authority for *resolution*, and `src/services/timezoneResolver.ts` is gone.

## Current state

### URL files

- `src/utils/url.ts` — full file (the URL authority-to-be). **Contains the bug on line 4.**

```ts
// src/utils/url.ts:1-22  (CURRENT — note line 4)
export function normalizeUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  // Strip whitespace + zero-width chars (BOM, ZWJ, ZWNJ) that LLM/OCR may emit
  const cleaned = raw.replace(/[\s​-‍﻿]+/g, '').trim();   // ← BUG: leading \s strips ALL interior spaces
  if (!cleaned) return undefined;

  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function isValidUrl(raw?: string | null): boolean {   // ← DEAD: zero external callers
  return normalizeUrl(raw) !== undefined;
}
```

  - The character class on line 4 is `[\s` + zero-width chars `]`. The literal between `\s` and `]` is the run of zero-width characters U+200B (ZWSP), U+2060 (WORD JOINER), an en-dash range to U+200D (ZWJ), and U+FEFF (BOM). Because `\s` is first **and** the quantifier is `+` with the `g` flag, every interior ASCII space/tab/newline is removed too. `new URL()` would otherwise percent-encode a space in a path to `%20`; the strip prevents that and produces a wrong-but-valid URL.
  - **`normalizeUrl` callers (must all keep working):** `src/app/page.tsx:207`, `src/components/EventEditor.tsx:125`, `src/services/icsParser.ts:134`, `src/services/exporter.ts:79`, `src/services/exporter.ts:220`. (Confirmed via grep at authoring time.)
  - **`isValidUrl` callers: NONE** (only its own definition). Confirmed dead.

- `src/components/URLPill.tsx` — client component (`'use client'`). Does NOT import `src/utils/url`. Hand-rolls `new URL()` three times and repeats the meetup host check three times:

```tsx
// src/components/URLPill.tsx:16-63  (CURRENT — three parses, three meetup checks)
const isMeetupURL = (url: string) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('meetup.com');   // meetup check #1
  } catch {
    return false;
  }
};

const truncateURL = (url: string) => {
  const maxLength = large ? 50 : 12;
  const pathMaxLength = large ? 45 : 10;
  const smallPathMaxLength = large ? 35 : 6;

  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname.replace(/^www\./, '');
    const path = urlObj.pathname + urlObj.search;

    if (hostname.includes('meetup.com')) {           // meetup check #2
      const pathWithoutSlash = path.replace(/^\//, '');
      return pathWithoutSlash.length > maxLength ? `${pathWithoutSlash.substring(0, pathMaxLength)}...` : pathWithoutSlash;
    }

    if (path.length <= (large ? 20 : 8)) {
      return `${hostname}${path}`;
    }

    return `${hostname}${path.substring(0, smallPathMaxLength)}...`;
  } catch {
    return url.length > maxLength ? `${url.substring(0, pathMaxLength)}...` : url;
  }
};

const getTooltipText = (url: string) => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');

    if (hostname.includes('meetup.com')) {           // meetup check #3
      return `Copy Meetup Event ${url}`;
    }

    return url;
  } catch {
    return url;
  }
};
```

  - **IMPORTANT — `isMeetupURL` is dead inside this file.** Grep `isMeetupURL` in `src/components/URLPill.tsx`: it is **defined but never called** (the meetup branches that fire live inside `truncateURL` and `getTooltipText`). Do not preserve a call site that does not exist; just drop it.
  - The component renders `truncateURL(url)` at line 123 and `getTooltipText(url)` at line 141. Both must keep producing the same visible strings.
  - `URLPill` importers (do NOT change their call sites; the prop API stays identical): `src/components/SmartInput.tsx:588`, `src/components/TextInput.tsx:108`, `src/components/InlineEventEditor.tsx:458`, `src/components/EventConfirmation.tsx:95`.

- `src/app/api/detect-urls/route.ts` — LLM URL extractor. Returns the raw model-extracted strings unmodified:

```ts
// src/app/api/detect-urls/route.ts:154-156  (CURRENT)
const result = JSON.parse(toolCalls[0].function.arguments) as URLDetectionResult;

return NextResponse.json(result);
```

  `URLDetectionResult` is `{ urls: string[]; remainingText: string; hasUrls: boolean }` (defined at lines 25-29).

- `src/app/api/scrape-url/route.ts` — fetches the URL with no normalization:

```ts
// src/app/api/scrape-url/route.ts:15-19  (CURRENT)
const response = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; EventEvery/1.0; +https://event-every.com)',
  },
});
```

- Flow (confirmed): `src/app/page.tsx:590` `detectURLs(inputText)` → `page.tsx:603` `scrapeURLsBatch(urlDetectionResult.urls)` → `src/services/webScraper.ts` POSTs each URL to `/api/scrape-url`. `src/services/urlDetector.ts` (`detectURLs`) and `src/services/webScraper.ts` (`scrapeURLsBatch`) are thin client-side `fetch` wrappers — **keep them as-is**.

### Timezone files

- `src/utils/timezone.ts` — full file (the resolution authority-to-be).

```ts
// src/utils/timezone.ts:1-32  (CURRENT — the single source-of-truth table)
const TIMEZONE_ABBREVIATIONS: Record<string, string> = {
  'PST': 'America/Los_Angeles', 'PDT': 'America/Los_Angeles',
  'MST': 'America/Denver',      'MDT': 'America/Denver',
  'CST': 'America/Chicago',     'CDT': 'America/Chicago',
  'EST': 'America/New_York',    'EDT': 'America/New_York',
  'AST': 'America/Halifax',     'ADT': 'America/Halifax',
  'HST': 'Pacific/Honolulu',
  'AKST': 'America/Anchorage',  'AKDT': 'America/Anchorage',
  'GMT': 'Europe/London', 'UTC': 'UTC', 'BST': 'Europe/London',
  'CET': 'Europe/Paris',  'CEST': 'Europe/Paris',
  'EET': 'Europe/Athens', 'EEST': 'Europe/Athens',
  'IST': 'Asia/Kolkata', 'JST': 'Asia/Tokyo', 'KST': 'Asia/Seoul',
  'AEST': 'Australia/Sydney',   'AEDT': 'Australia/Sydney',
  'AWST': 'Australia/Perth',
  'ACST': 'Australia/Adelaide', 'ACDT': 'Australia/Adelaide',
  'NZST': 'Pacific/Auckland',   'NZDT': 'Pacific/Auckland',
};
```
(Abbreviated above for readability — the live file lists each key on its own line, lines 1-32. Do not edit this table's contents.)

```ts
// src/utils/timezone.ts:42-101  (CURRENT)
export function parseTimezoneFromText(text: string): string | null {   // ← export is unnecessary (only internal caller at line 90)
  // ... abbreviation scan, UTC/GMT offset match, IANA match ...
}

export function isValidIANATimezone(timezone: string): boolean {
  try { Intl.DateTimeFormat(undefined, { timeZone: timezone }); return true; }
  catch { return false; }
}

export function normalizeTimezone(timezone: string | undefined): string {
  if (!timezone) return getBrowserTimezone();
  const upperTimezone = timezone.toUpperCase();
  if (TIMEZONE_ABBREVIATIONS[upperTimezone]) return TIMEZONE_ABBREVIATIONS[upperTimezone];
  if (isValidIANATimezone(timezone)) return timezone;
  const parsedTz = parseTimezoneFromText(timezone);
  if (parsedTz) return parsedTz;
  return getBrowserTimezone();   // ← returns browser TZ for BOTH "explicitly UTC-but-equals-browser" and "couldn't parse" — caller can't tell which
}

export function convertToIANATimezone(timezone: string): string {   // ← DEAD: zero callers; no-op alias of normalizeTimezone
  const normalized = normalizeTimezone(timezone);
  return normalized;
}
```

  - **`normalizeTimezone` external callers:** only `src/services/timezoneResolver.ts:20` (and internally `convertToIANATimezone`, which is being deleted). After this plan, `normalizeTimezone` is used only inside `src/utils/timezone.ts`.
  - **`parseTimezoneFromText` callers:** only `src/utils/timezone.ts:90` (internal). Confirmed.
  - **`convertToIANATimezone` callers: NONE.** Confirmed dead.
  - **`isValidIANATimezone` callers:** `src/utils/timezone.ts` (internal) and `src/services/timezoneResolver.ts:41`. Keep this export — it is also used by other plans (e.g. plans/008's parser may call it) and is part of the public surface.
  - **`getBrowserTimezone` is widely used** (`page.tsx`, `clientContext.ts`, `InlineEventEditor.tsx`, `BatchEventList.tsx`, `EventConfirmation.tsx`) — **keep its export and signature unchanged.**

- `src/services/timezoneResolver.ts` — full file (43 lines). To be **absorbed into `src/utils/timezone.ts` and deleted**.

```ts
// src/services/timezoneResolver.ts:1-43  (CURRENT)
import { normalizeTimezone, getBrowserTimezone, isValidIANATimezone } from '@/utils/timezone';
import { TimezoneStatus, TimezoneSource } from '@/types/event';

export interface TimezoneResolution {
  timezone: string;
  status: TimezoneStatus;
  source: TimezoneSource | 'unknown';
}

export function resolveTimezone(
  rawTimezone: string | undefined,
  browserTimezone?: string
): TimezoneResolution {
  const browserTZ = browserTimezone || getBrowserTimezone();

  if (!rawTimezone) {
    return { timezone: browserTZ, status: 'unknown', source: 'unknown' };
  }

  const normalized = normalizeTimezone(rawTimezone);

  // normalizeTimezone falls back to browser TZ if it can't resolve —
  // check if it actually resolved to something different or matched a known pattern
  if (normalized !== browserTZ || isKnownTimezone(rawTimezone)) {   // ← DOUBLE-CLASSIFY + latent mislabel
    return { timezone: normalized, status: 'resolved', source: 'programmatic' };
  }

  return { timezone: browserTZ, status: 'unknown', source: 'unknown' };
}

function isKnownTimezone(raw: string): boolean {
  const upper = raw.toUpperCase().trim();
  const knownAbbreviations = [                                       // ← DUPLICATE of TIMEZONE_ABBREVIATIONS keys
    'PST', 'PDT', 'MST', 'MDT', 'CST', 'CDT', 'EST', 'EDT',
    'AST', 'ADT', 'HST', 'AKST', 'AKDT', 'GMT', 'UTC', 'BST',
    'CET', 'CEST', 'EET', 'EEST', 'IST', 'JST', 'KST',
    'AEST', 'AEDT', 'AWST', 'ACST', 'ACDT', 'NZST', 'NZDT',
  ];
  if (knownAbbreviations.includes(upper)) return true;
  if (/^UTC[+-]\d{1,2}/.test(upper) || /^GMT[+-]\d{1,2}/.test(upper)) return true;
  if (isValidIANATimezone(raw)) return true;
  return false;
}
```

  - **The latent mislabel bug:** when `rawTimezone` IS resolvable (e.g. a valid IANA zone or `"UTC"`) but `normalized === browserTZ` (the user's browser is in that very zone), the first condition `normalized !== browserTZ` is false; the result then hinges entirely on `isKnownTimezone(raw)` re-deriving "known". For inputs that resolve via `parseTimezoneFromText` (free-text like `"3pm Pacific time"` → matched by the `\bPST\b`-style scan) but are NOT a bare abbreviation/offset/IANA string, `isKnownTimezone` returns false, so a correctly-resolved zone is mislabeled `status: 'unknown'`. Folding status into `normalizeTimezone` (Step 5) removes this entire class of bug because the function that *did* the resolution reports whether it succeeded.

- **`resolveTimezone` / `TimezoneResolution` callers (single consumer file — `page.tsx`):**
  - `src/app/page.tsx:25` `import { resolveTimezone } from '@/services/timezoneResolver';`
  - `src/app/page.tsx:173` `const tzResolution = resolveTimezone(rawTz, browserTZ);` inside `convertParsedToCalendarEvent`.
  - The returned object is consumed at `page.tsx:209` (`timezone: tzResolution.timezone`), `page.tsx:213` (`timezoneStatus: tzResolution.status`), `page.tsx:214` (`timezoneSource: tzResolution.source === 'unknown' ? undefined : tzResolution.source`).
  - `page.tsx:225,366,560,729` reference a *different* local async function `resolveTimezoneAsync` — **do NOT touch those; they are unrelated to the `resolveTimezone` service import.**
  - Because `page.tsx` reads `.status` and `.source`, the absorbed function MUST keep returning the same `TimezoneResolution` shape. Step 5 preserves that exact shape; only the **import path** in `page.tsx` changes.

- `src/utils/timeConversion.ts` — owns **conversion and display** (`convertRawToDate`, `getTimezoneOffsetMinutes`, `formatTimeInTimezone`, `getTimezoneAbbreviation`, and `US_TZ_NORMALIZE` at line 94). **OUT OF SCOPE — do NOT modify and do NOT merge into `timezone.ts`.** Resolution (string → IANA zone) and conversion (wall-time + zone → UTC instant) are deliberately separate concerns. `US_TZ_NORMALIZE` maps abbreviations to *display* labels (`'EDT' → 'ET'`), a different mapping than `TIMEZONE_ABBREVIATIONS` (`'EDT' → 'America/New_York'`); it is NOT a duplicate to dedup.

- `src/types/event.ts:10-11` (for reference; do NOT modify):
```ts
export type TimezoneStatus = 'resolved' | 'resolving' | 'unknown';
export type TimezoneSource = 'extracted' | 'programmatic' | 'llm' | 'user';
```

### Repo conventions

- TypeScript strict; no `any`. Path alias `@/*` → `./src/*` (tsconfig). Package manager: **bun**.
- Services use safe fallbacks + `console.warn`/`console.error`; they do not throw to the UI (see `src/services/exporter.ts` and `src/services/icsParser.ts`).
- Comment policy (from `CLAUDE.md`): minimal comments; keep only non-obvious "why" (e.g. the zero-width-strip rationale, the URL bug note).
- **Tests use bun's built-in runner** (`import { describe, expect, test } from 'bun:test'`), live under `src/**/__tests__/*.test.ts`, and run via `bun test src` — the convention plan 003 establishes. No test-framework dependency is added (bun's runner is built in). At this HEAD the `"test": "bun test src"` script is not present yet; Step 1 adds that one line if absent.

## Commands you will need

| Purpose      | Command                | Expected on success |
|--------------|------------------------|---------------------|
| Install      | `bun install`          | exit 0              |
| Typecheck    | `bun run type-check`   | exit 0, no errors (verified passing at `400bf32`) |
| Build        | `bun run build`        | exit 0 (verified passing at `400bf32`) |
| Unit tests   | `bun test src`         | all pass (scoped to `src/` so Playwright e2e specs are not picked up) |
| (do NOT run) | `bun run lint`         | not part of this plan's gate |

Do NOT run `bun run lint` as a gate (per operator). `bun run type-check` and `bun run build` are the static gates; `bun test src` is the behavioral gate. (The `"test"` script — `bun test src` — runs the same thing once Step 1 has added it; invoke `bun test src` directly so it works regardless.) Do **not** run a bare `bun test` — it picks up the Playwright e2e specs and fails.

## Suggested executor toolkit

- When you rewrite `src/components/URLPill.tsx` in Step 4, the Vercel **react-best-practices** guidance applies: in particular `rendering-hoist-jsx` / `js-hoist-regexp` (the `www.` strip regex and any static config can be hoisted to module scope) and avoid re-defining components inside components. Keep the component a pure function of its props — do not introduce effects or state beyond the existing `copied`/`showToast`/`isHovered`.
- bun test docs: https://bun.sh/docs/cli/test — for the `bun:test` API (`describe`/`expect`/`test`). bun honors the tsconfig `@/*` path alias natively, so no bundler/runner config is needed.

## Scope

**In scope** (the only files you may modify or create):
- `src/utils/url.ts` — fix the bug; add `safeParseUrl` + `getUrlDisplayParts`; delete dead `isValidUrl`.
- `src/components/URLPill.tsx` — rewrite to parse once via the new helpers; collapse the three try/catch and three meetup checks.
- `src/app/api/detect-urls/route.ts` — normalize extracted URLs through `normalizeUrl` before returning.
- `src/utils/timezone.ts` — derive the "known" set from `TIMEZONE_ABBREVIATIONS`; add the `{timezone, resolved}` resolver core + absorbed `resolveTimezone`/`TimezoneResolution`; drop dead `convertToIANATimezone`; drop the `export` on `parseTimezoneFromText`.
- `src/app/page.tsx` — **import-path change only** (line 25: import `resolveTimezone`/`TimezoneResolution` from `@/utils/timezone` instead of `@/services/timezoneResolver`). No logic change.
- `src/services/timezoneResolver.ts` — **DELETE** (after its contents move to `timezone.ts`).
- **Create**: `src/utils/__tests__/url.test.ts`, `src/utils/__tests__/timezone.test.ts` (`bun:test` files).
- **Edit `package.json`**: add the single script `"test": "bun test src"` *only if it is not already present* (Step 1). No test-framework dependency is added — bun's runner is built in. *(If plan 003 already added that script, leave it untouched — see Step 1.)*

**Out of scope** (do NOT touch, even though they look related):
- `src/utils/timeConversion.ts` — conversion/display authority; distinct concern. You may *call* nothing new from it; do not edit it. (`US_TZ_NORMALIZE` is a display map, not a duplicate.)
- `src/services/urlDetector.ts`, `src/services/webScraper.ts` — clean fetch wrappers; leave as-is.
- **SSRF / URL safety hardening in `src/app/api/scrape-url/route.ts` is plan 002's job.** This plan adds *normalization only* and does so in the `detect-urls` route (Step 3). Do NOT add SSRF checks, allow/block lists, IP filtering, or DNS resolution here — that would collide with plan 002.
- `src/components/EventEditor.tsx`, `src/services/icsParser.ts`, `src/services/exporter.ts` — they call `normalizeUrl`; the fix is internal to `normalizeUrl`, so their call sites need no change. Do not modify them.
- `src/types/event.ts` — no new types; reuse `TimezoneStatus`/`TimezoneSource`.
- `resolveTimezoneAsync` and lines 222-end of the timezone block in `page.tsx` — unrelated.

## Git workflow

- Branch: `advisor/012-consolidate-url-and-timezone-utils` (create from `main` at `400bf32` or current HEAD if drift check is clean).
- **One commit** for the whole plan. Message style matches the repo (subject line + body; end with the trailer). Example subject: `Plan 012: single URL + timezone authorities; fix normalizeUrl space-strip bug`. End the commit body with:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- Do **NOT** push or open a PR.

## Steps

> Order is chosen so the tree compiles after every step: ensure the `bun test` script exists, fix/extend `url.ts` (additive + bug fix), switch `URLPill` to the new helpers, add the route normalization, then do the timezone move (add new exports in `timezone.ts` → switch the `page.tsx` import → delete the service), then the test files, then the full gate.

### Step 1: Ensure the `bun test` script exists (idempotent)

This plan uses bun's built-in test runner — there is **no runner to build and no dependency to add**. The only thing to ensure is the convenience script plan 003 defines.

First check whether the script is already present:
`grep -n '"test"' package.json`

- **If `"test": "bun test src"` already exists** (plan 003 landed): use it as-is. Do not add a second script. Go to Step 2. (You will still ADD the two new test files in Step 8, and if 003's tests assert the now-removed `convertToIANATimezone` or the old `normalizeTimezone` behavior, update them per the COORDINATION note below.)
- **Otherwise** (true at this HEAD — only `test:e2e` scripts exist): add exactly the one line plan 003 adds, nothing more. In `package.json` `scripts`, add:
  ```json
  "test": "bun test src"
  ```
  Leave the existing `test:e2e` scripts untouched. Do not add any dependency, config file, or other script. bun honors the tsconfig `@/*` alias natively, so no further setup is required.

**Verify**: `bun test src` → exits 0 (no test files under `src/` yet, so it runs 0 tests and passes) — confirms the runner resolves before any tests exist. Do **not** run a bare `bun test` here; it would pick up the Playwright e2e specs. Step 8 adds the test files and Step 9 is the real gate.

### Step 2: Fix the `normalizeUrl` bug and add the URL helpers in `src/utils/url.ts`

Rewrite `src/utils/url.ts` so it is the single URL authority. Three changes:

1. **Fix the strip (the bug).** Drop `\s` from the character class and drop the `+` quantifier's reliance on whitespace; let `.trim()` handle leading/trailing whitespace and let `new URL()` percent-encode legitimate interior spaces. The strip must remove **only** zero-width junk. Replace line 4 with a class containing only the zero-width characters (preserve the exact same zero-width set already present — U+200B, U+2060, the U+200B–U+200D range, U+FEFF):
   ```ts
   // Strip only zero-width junk (BOM, ZWSP/ZWNJ/ZWJ, word-joiner) that LLM/OCR may emit.
   // Do NOT strip ASCII spaces — a space in a path is real and must be percent-encoded by new URL(), not deleted.
   const cleaned = raw.replace(/[​-‍⁠﻿]/g, '').trim();
   ```
   (Using explicit `\u` escapes avoids the invisible-literal hazard of the current line. This set covers the same characters the original intended.)

2. **Add `safeParseUrl`** — the one place a `URL` is constructed for *display/inspection* (accepts an already-normalized or raw absolute URL string; returns `null` instead of throwing):
   ```ts
   export function safeParseUrl(url: string): URL | null {
     try {
       return new URL(url);
     } catch {
       return null;
     }
   }
   ```

3. **Add `getUrlDisplayParts`** — collapses the host/path/meetup logic `URLPill` needs into one parse:
   ```ts
   export interface UrlDisplayParts {
     hostname: string;   // www. stripped
     path: string;       // pathname + search
     isMeetup: boolean;
   }

   export function getUrlDisplayParts(url: string): UrlDisplayParts | null {
     const parsed = safeParseUrl(url);
     if (!parsed) return null;
     const hostname = parsed.hostname.replace(/^www\./, '');
     return {
       hostname,
       path: parsed.pathname + parsed.search,
       isMeetup: hostname.includes('meetup.com'),
     };
   }
   ```

4. **Delete `isValidUrl`** (lines 20-22) — zero callers.

Keep `normalizeUrl`'s signature and all other behavior identical (protocol-prefixing, the `hostname.includes('.')` guard, returning `undefined` on failure).

**Verify**: `bun run type-check` → exit 0. `grep -n "isValidUrl" src/` → no matches.

### Step 3: Normalize detected URLs before they reach the scraper

In `src/app/api/detect-urls/route.ts`, run each extracted URL through `normalizeUrl` and drop any that don't normalize, **before** returning. This makes `src/utils/url` the single gate so a bare `example.com/event` is salvaged and a junk entry can't reach `/api/scrape-url`.

- Add the import at the top: `import { normalizeUrl } from '@/utils/url';`
- Replace lines 154-156 with:
  ```ts
  const result = JSON.parse(toolCalls[0].function.arguments) as URLDetectionResult;

  // utils/url is the single normalization gate: salvage bare hosts, drop junk before scraping.
  const normalizedUrls = result.urls
    .map((u) => normalizeUrl(u))
    .filter((u): u is string => Boolean(u));

  return NextResponse.json({
    ...result,
    urls: normalizedUrls,
    hasUrls: normalizedUrls.length > 0,
  });
  ```
- Do **not** add any SSRF/safety logic here (plan 002 owns that — see Scope).

**Verify**: `bun run type-check` → exit 0.

### Step 4: Rewrite `URLPill` to parse once via the helpers

In `src/components/URLPill.tsx`:
- Add `import { getUrlDisplayParts } from '@/utils/url';`.
- **Delete the unused `isMeetupURL` function entirely** (it has no call site).
- Rewrite `truncateURL` and `getTooltipText` to call `getUrlDisplayParts(url)` once and branch on the returned `parts` (handling the `null` fallback exactly as the old `catch` blocks did — return the raw/truncated raw string). The visible output must be byte-for-byte the same as today for valid URLs:
  ```tsx
  const truncateURL = (url: string) => {
    const maxLength = large ? 50 : 12;
    const pathMaxLength = large ? 45 : 10;
    const smallPathMaxLength = large ? 35 : 6;

    const parts = getUrlDisplayParts(url);
    if (!parts) {
      return url.length > maxLength ? `${url.substring(0, pathMaxLength)}...` : url;
    }
    const { hostname, path, isMeetup } = parts;

    if (isMeetup) {
      const pathWithoutSlash = path.replace(/^\//, '');
      return pathWithoutSlash.length > maxLength ? `${pathWithoutSlash.substring(0, pathMaxLength)}...` : pathWithoutSlash;
    }
    if (path.length <= (large ? 20 : 8)) {
      return `${hostname}${path}`;
    }
    return `${hostname}${path.substring(0, smallPathMaxLength)}...`;
  };

  const getTooltipText = (url: string) => {
    const parts = getUrlDisplayParts(url);
    if (!parts) return url;
    return parts.isMeetup ? `Copy Meetup Event ${url}` : url;
  };
  ```
- Leave the JSX, the three state hooks, `handlePillClick`, `handleRemove`, and the prop interface unchanged.

**Verify**: `bun run type-check` → exit 0. `grep -n "new URL(" src/components/URLPill.tsx` → **no matches** (all parsing now flows through `utils/url`). `grep -n "isMeetupURL" src/components/URLPill.tsx` → no matches.

### Step 5: Add the resolution core + absorbed `resolveTimezone` into `src/utils/timezone.ts`

Make `src/utils/timezone.ts` the single timezone-resolution authority.

1. **Add a private known-set derived from the single table** (no second list of strings):
   ```ts
   const KNOWN_ABBREVIATIONS = new Set(Object.keys(TIMEZONE_ABBREVIATIONS));
   ```

2. **Add an internal classifier** that resolves AND reports success in one pass (this is what kills the double-classify and the mislabel):
   ```ts
   export interface ResolvedTimezone {
     timezone: string;   // always a valid IANA zone (falls back to browser zone)
     resolved: boolean;  // true iff `raw` was understood; false iff we fell back blindly
   }

   export function resolveTimezoneZone(raw: string | undefined): ResolvedTimezone {
     if (!raw) return { timezone: getBrowserTimezone(), resolved: false };

     const upper = raw.toUpperCase().trim();
     if (KNOWN_ABBREVIATIONS.has(upper)) {
       return { timezone: TIMEZONE_ABBREVIATIONS[upper], resolved: true };
     }
     if (isValidIANATimezone(raw)) {
       return { timezone: raw, resolved: true };
     }
     const parsed = parseTimezoneFromText(raw);
     if (parsed) return { timezone: parsed, resolved: true };

     return { timezone: getBrowserTimezone(), resolved: false };
   }
   ```
   Note this mirrors `normalizeTimezone`'s existing resolution order (abbrev table → valid IANA → free-text parse → browser fallback), so it is behavior-preserving for the *zone* while additionally reporting `resolved`.

3. **Reimplement `normalizeTimezone` in terms of the core** (keep its exact signature and string return so no other behavior shifts):
   ```ts
   export function normalizeTimezone(timezone: string | undefined): string {
     return resolveTimezoneZone(timezone).timezone;
   }
   ```

4. **Absorb `resolveTimezone` + `TimezoneResolution`** from the service, fixing the mislabel by reading `resolved` directly instead of comparing against the browser zone:
   ```ts
   import { TimezoneStatus, TimezoneSource } from '@/types/event';

   export interface TimezoneResolution {
     timezone: string;
     status: TimezoneStatus;
     source: TimezoneSource | 'unknown';
   }

   export function resolveTimezone(
     rawTimezone: string | undefined,
     browserTimezone?: string
   ): TimezoneResolution {
     const browserTZ = browserTimezone || getBrowserTimezone();
     const { timezone, resolved } = resolveTimezoneZone(rawTimezone);
     if (resolved) {
       return { timezone, status: 'resolved', source: 'programmatic' };
     }
     return { timezone: browserTZ, status: 'unknown', source: 'unknown' };
   }
   ```
   This returns the **same `TimezoneResolution` shape** `page.tsx` already consumes (`.timezone`, `.status`, `.source`). The behavior difference vs. the old service is intentional and is the mislabel fix: a free-text zone that resolves but happens to equal the browser zone is now correctly `status: 'resolved'` (old code returned `unknown`).

5. **Delete `convertToIANATimezone`** (old lines 98-101) and **remove the `export` keyword** from `parseTimezoneFromText` (line 42 → `function parseTimezoneFromText(...)`). Keep `isValidIANATimezone`, `getBrowserTimezone`, and `normalizeTimezone` exported.

**Verify**: `bun run type-check` → exit 0 (page.tsx still imports `resolveTimezone` from the old path at this point — that's fine because the symbol now also exists in `timezone.ts`; the import switch is Step 6, and the old file is deleted in Step 7). `grep -n "convertToIANATimezone" src/` → only matches will disappear after this edit; expect none.

### Step 6: Switch `page.tsx` to import from `@/utils/timezone`

In `src/app/page.tsx`, change **only** line 25:
- From: `import { resolveTimezone } from '@/services/timezoneResolver';`
- To: `import { resolveTimezone } from '@/utils/timezone';`

No other change to `page.tsx`. (`TimezoneResolution` is not imported by name in `page.tsx` — it's inferred — so only the function import path moves. Confirm with `grep -n "TimezoneResolution" src/app/page.tsx` → if it returns a line, add `TimezoneResolution` to this import too; at authoring time it returned nothing.)

**Verify**: `grep -rn "@/services/timezoneResolver" src/` → only `src/services/timezoneResolver.ts`'s own (none importing it) — i.e. **no importers remain** outside the file itself. `bun run type-check` → exit 0.

### Step 7: Delete the absorbed service

- `git rm src/services/timezoneResolver.ts` (or delete the file).

**Verify**: `bun run type-check` → exit 0. `bun run build` → exit 0. `git status` shows the file deleted and no other unexpected changes.

### Step 8: Add unit tests

Create `src/utils/__tests__/url.test.ts` and `src/utils/__tests__/timezone.test.ts` (bun's runner; `import { describe, expect, test } from 'bun:test'`).

**`url.test.ts` — must include the bug-regression test:**
- `normalizeUrl('https://example.com/my event')` → the result is defined and **contains `%20`** (interior space preserved/encoded), and does **NOT** equal `https://example.com/myevent`. *(This is the exact bug this plan fixes — assert both the positive and the negative.)*
- `normalizeUrl('https://example.com/​﻿path')` → zero-width junk stripped → `https://example.com/path` (no `%E2%80%8B`, no zero-width chars).
- `normalizeUrl('example.com/event')` → gets `https://` prefix → starts with `https://example.com/event`.
- `normalizeUrl('not a url with no dot')` → after the space fix the protocol-prefixed host has no dot → `undefined` (host guard still holds). `normalizeUrl('')`, `normalizeUrl(null)`, `normalizeUrl(undefined)` → `undefined`.
- `getUrlDisplayParts('https://www.meetup.com/group/events/123')` → `{ hostname: 'meetup.com', path: '/group/events/123', isMeetup: true }`.
- `getUrlDisplayParts('https://www.example.com/x?y=1')` → `{ hostname: 'example.com', path: '/x?y=1', isMeetup: false }`.
- `safeParseUrl('not a url')` → `null`; `safeParseUrl('https://a.com')` → a `URL` whose `.hostname === 'a.com'`.

**`timezone.test.ts` — resolution + the mislabel fix:**
- `resolveTimezoneZone('EST')` → `{ timezone: 'America/New_York', resolved: true }`.
- `resolveTimezoneZone('America/Chicago')` → `{ timezone: 'America/Chicago', resolved: true }`.
- `resolveTimezoneZone('total garbage zone')` → `{ timezone: <getBrowserTimezone()>, resolved: false }` (assert `resolved === false`; for `timezone`, assert it equals `getBrowserTimezone()` imported from the same module so the test is environment-independent).
- `resolveTimezoneZone(undefined)` → `resolved === false`.
- `normalizeTimezone('PST')` → `'America/Los_Angeles'`; `normalizeTimezone(undefined)` → `getBrowserTimezone()`.
- **Mislabel-fix test:** `resolveTimezone('UTC', 'UTC')` (raw resolves to the same zone as the browser) → `status === 'resolved'` and `source === 'programmatic'` (the OLD service returned `'unknown'` here — this asserts the fix). Also `resolveTimezone('America/New_York', 'America/New_York')` → `status === 'resolved'`.
- `resolveTimezone('total garbage', 'UTC')` → `{ status: 'unknown', source: 'unknown', timezone: 'UTC' }`.
- `resolveTimezone(undefined, 'Europe/Paris')` → `{ status: 'unknown', source: 'unknown', timezone: 'Europe/Paris' }`.

Use plain `bun:test` assertions (`describe`/`test`/`expect`); no DOM/network.

**Verify**: `bun test src` → all pass; both new files execute.

### Step 9: Full gate

Run all gates:
- `bun test src` → exit 0, all tests pass (the two new files + any pre-existing).
- `bun run type-check` → exit 0.
- `bun run build` → exit 0.

Then commit (single commit, per Git workflow). Update `plans/README.md` status row for 012 to DONE.

**Verify**: all three commands exit 0; `git status` shows only in-scope files changed/created and `src/services/timezoneResolver.ts` deleted.

## COORDINATION with plan 003 (read before Step 1 and Step 8)

Plan 003 stands up the `bun test src` baseline (the `"test": "bun test src"` script, no new dependency) and characterization tests, and (per its description) its `src/utils/__tests__/timezone.test.ts` pins the **current** signatures/behavior of `convertToIANATimezone` and `normalizeTimezone`. This plan **deletes `convertToIANATimezone`** and **changes `resolveTimezone`'s classification** (the mislabel fix). Both plans target the same `src/utils/__tests__/timezone.test.ts` path, so coordinate rather than duplicate. Therefore:

- **If 003 has landed before you execute:** its timezone characterization tests WILL break under this change. That is expected — flip them from "characterization of old behavior" to "assertion of new behavior" **in the same commit**:
  - Remove/replace any test asserting `convertToIANATimezone(...)` (the function no longer exists). If a test only existed to pin that no-op alias, delete it; if it meaningfully tested zone resolution, rewrite it against `normalizeTimezone`/`resolveTimezoneZone`.
  - Update any test that pins `resolveTimezone('<zone-equal-to-browser>')` as `unknown` to expect `resolved` (the mislabel fix).
  - Do not create a *second* `timezone.test.ts` if 003 already created one at the same path — extend the existing file with the new cases from Step 8 instead.
  - Files to update in that case (exact paths): `src/utils/__tests__/timezone.test.ts` (003's), plus add `src/utils/__tests__/url.test.ts` if 003 didn't create it.
- **If 003 has NOT landed (authoring-time reality):** you create the runner (Step 1) and both test files (Step 8) fresh; there is nothing to reconcile.

Either way, the **new `normalizeUrl` interior-space regression test is mandatory** (Step 8, `url.test.ts`).

## Test plan

- **New (`url.test.ts`)**: the interior-space bug regression (positive `%20` + negative `!== 'myevent'`), zero-width strip, protocol-prefix salvage, host-guard `undefined` cases, `getUrlDisplayParts` happy paths (meetup + non-meetup, `www.` strip), `safeParseUrl` ok/null.
- **New (`timezone.test.ts`)**: `resolveTimezoneZone` for abbrev / IANA / garbage / undefined; `normalizeTimezone` parity; the `resolveTimezone` mislabel-fix cases (resolved-equals-browser now `resolved`); unknown + undefined cases.
- **Structural pattern**: these are the first unit tests this plan adds; model the file structure on bun's runner (`import { describe, expect, test } from 'bun:test'`) under `src/utils/__tests__/*.test.ts`, run via `bun test src`. If 003 landed, mirror its existing `__tests__` file layout instead.
- **Verification**: `bun test src` → all pass; `bun run type-check` + `bun run build` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun test src` exits 0; `src/utils/__tests__/url.test.ts` and `src/utils/__tests__/timezone.test.ts` exist and pass; the interior-space regression test is present.
- [ ] `grep -rn "isValidUrl" src/` → no matches.
- [ ] `grep -rn "convertToIANATimezone" src/` → no matches.
- [ ] `grep -rn "new URL(" src/components/URLPill.tsx` → no matches (URLPill parses only via `utils/url`).
- [ ] `grep -rn "isMeetupURL" src/components/URLPill.tsx` → no matches (dead fn removed).
- [ ] `src/services/timezoneResolver.ts` no longer exists (`git status` shows it deleted).
- [ ] `grep -rn "@/services/timezoneResolver" src/` → no matches (page.tsx imports from `@/utils/timezone`).
- [ ] `grep -n "export function parseTimezoneFromText" src/utils/timezone.ts` → no matches (export dropped; the `function` remains).
- [ ] `bun run type-check` exits 0 and `bun run build` exits 0.
- [ ] `git status` shows only the in-scope files modified/created and `timezoneResolver.ts` deleted.
- [ ] `plans/README.md` status row for 012 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check is non-empty and any "Current state" excerpt no longer matches the live code (the codebase drifted since `400bf32`).
- `src/app/page.tsx` consumes `resolveTimezone`'s result in a way the absorbed function's `TimezoneResolution` shape does not satisfy (e.g. it reads a field other than `.timezone`/`.status`/`.source`) — re-read `page.tsx:200-220` and report rather than reshaping the type.
- Rewriting `URLPill` would change a visible truncation/tooltip string for any valid URL (the outputs must be identical) — report the diverging case.
- Plan 003's tests exist and reconciling them would require touching files outside this plan's Scope — report which files.
- A verification command fails twice after a reasonable fix attempt.
- You find yourself needing to add SSRF/safety logic to `scrape-url` to make scraping work — that's plan 002; stop and note it.

## Maintenance notes

For whoever owns this code next:

- **`src/utils/url.ts` is now the single URL authority.** Any new place that needs to parse, normalize, or display a URL must go through `normalizeUrl` / `safeParseUrl` / `getUrlDisplayParts` — do not hand-roll `new URL()` again (that was the triplication this plan removed).
- **`src/utils/timezone.ts` owns string→zone *resolution*; `src/utils/timeConversion.ts` owns zone+walltime→instant *conversion* and display.** Keep them separate. If you need "is this a zone we understand," use `resolveTimezoneZone(...).resolved`, not a new abbreviation list.
- The `normalizeUrl` strip is intentionally **zero-width-only**. If a future input class needs other characters stripped, add them to the explicit `\u` class — never re-introduce `\s`, which deletes legitimate path spaces.
- **Reviewer focus**: (1) confirm the `normalizeUrl` regex change preserves `%20` and still strips the original zero-width set; (2) confirm `URLPill`'s visible output is unchanged for valid URLs (the refactor is meant to be output-identical); (3) confirm the `resolveTimezone` mislabel fix (resolved-equals-browser → `resolved`) is the only intended behavior change and that `page.tsx`'s `timezoneStatus`/`timezoneSource` still populate correctly.
- **Deferred (not this plan)**: SSRF hardening of `scrape-url` (plan 002); any merge of `US_TZ_NORMALIZE` display logic with resolution (deliberately kept separate).
