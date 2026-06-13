# Implementation Plans

Two advisor waves live here.

- **Wave 1 — security / bugs / DX** (plans **001–008**, generated 2026-06-10 against commit `f53bf0e`; repo verified **public** on GitHub, which raises the severity of anything secret-shaped in source).
- **Wave 2 — refactor / dedup / architecture / modularity + e2e** (plans **009–015**, generated 2026-06-13 against commit `400bf32`). This is the structural code-quality pass the maintainer asked for **before adding new features** — and is explicitly the "follow-up wave once CI is green" that Wave 1 deferred (see the god-component note Wave 1 left below).

Every finding was re-verified by the advisor against the cited code before planning; each Wave-2 plan was authored from **direct reads of the live source** (excerpts verified at `400bf32`, line numbers corrected against reality). The maintainer chose the **high-leverage core** for Wave 2 — the deeper persistence/type-model/`page.tsx`-decomposition work is scoped under "Deferred" below, not yet written.

Each executor: read your plan fully before starting, honor its STOP conditions, run every verification command, and update your row here when done.

## Execution order & status

### Wave 1 — security / bugs / DX (`f53bf0e`)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001  | Rotate admin unlock patterns out of source; Redis-backed lockout; AUTH_SECRET explicit | P1 | M | — | TODO |
| 002  | Close the SSRF/open-proxy hole in /api/scrape-url | P1 | S–M | — | TODO |
| 003  | `bun test` baseline: unit tests on ICS, timezone, budget, ratelimit | P1 | M | — | DONE (58 tests/125 assertions; +@types/bun dev) |
| 004  | Fix lint (ESLint 9 flat config) + GitHub Actions CI | P1 | M | 003 (soft) | TODO |
| 005  | Rate limiter: atomic, fixed UTC-day window, shared getClientIP | P2 | S–M | 003 | DONE (atomic incr + UTC-day key + nextResetMs; `clientIp.ts` extracted; 2 quirk tests flipped) |
| 006  | Delete dead components, drop unused deps, fix run.sh to bun | P2 | S | — (see 010/014) | TODO |
| 007  | Docs truth pass: README / CLAUDE.md / .env.example | P2 | S | — | TODO |
| 008  | ICS date correctness: all-day UTC round-trip, TZID, no silent fallback | P3 | M | 003 | TODO |

### Wave 2 — refactor / dedup / architecture / e2e (`400bf32`)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 009  | E2E refactor-safety net: `data-testid` hooks, .ics download+parse spec, migrate brittle `h3.font-bold` selectors, URL-scrape + pattern-unlock specs, `reuseExistingServer:!CI` | P1 | M–L | — (complements 003) | DONE (48 e2e pass; 3 new specs; testids additive) |
| 010  | Purge dead code (`ProcessingSection`, `ProcessingQueuePanel`) + unify the 4 scattered processing-status types into `src/types/processing.ts` | P2 | S–M | — (extends 006) | TODO |
| 011  | Unify the OpenRouter client into one `openRouterChat()` in `lib/llm.ts` (collapse 4 fetch copies + 3 type copies) | P2 | M | 003 (soft) | TODO |
| 012  | Consolidate URL + timezone utils into single authorities (fix `normalizeUrl` interior-whitespace bug, URLPill ×3 dedup, normalize detected URLs, tz abbrev tables ×3→1, merge `timezoneResolver`) | P2 | M | 003 (soft) | TODO |
| 013  | Unify rate-limit + community-budget into one authority, one reset formula; enforce the per-IP gate on **all** LLM routes | P2 | M | 005, 003 (soft) | TODO |
| 014  | Consolidate event-editing family → `<EventFields>` + promoted `<EditableField>` + shared validation/`<AttachmentList>`; fixes lost-keystroke / all-day / double-fire bugs (~770 fewer lines) | P2 | M–L | 009 | TODO |
| 015  | Consolidate list/card family → `<EventCard>`/`<EventCardList>` + `useEventSelection` + `<ProcessingShimmer>` + `<TimezonePicker>`; memoize rows (~495 fewer lines) | P2 | M–L | 009, 010, 014 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale)

## Recommended sequence

1. **Foundations first** — land **003** (bun-test baseline) and **009** (e2e net + `data-testid` hooks). They are the safety nets every refactor leans on. **004** (lint + CI) makes the whole thing gateable on push.
2. **Independent dedup** — **010**, **011**, **012**, **013** in any order (013 with/after 005).
3. **Component consolidation** — **014** (after 009) → **015** (after 010 + 014).

The maintainer chose to split the eventual `page.tsx` decomposition into 3 plans; it is **not** in this wave (see Deferred).

## Cross-plan reconciliations (so nothing is double-done)

- **014 supersedes part of 006.** Plan 006 deletes `EventEditor`, `EventConfirmation`, `TextInput`, `ExportOptions`. Plan 014 must **harvest** the validation + all-day-toggle logic out of `EventEditor`/`EventConfirmation` before they go, so **014 owns those two deletions**. 006's remaining scope — delete `TextInput`/`ExportOptions`, drop `@anthropic-ai/sdk`, move `dotenv` to devDeps, fix `run.sh` to bun — still stands and is unaffected.
- **010 extends 006.** It deletes `ProcessingSection`/`ProcessingQueuePanel`, which the post-rebrand state orphaned after 006 was written. Disjoint files from 006; converge in any order.
- **`EditableField` is handled once.** 010 deliberately does **not** delete it (it's imported by `BatchEventList`); 014 **promotes** it into the reusable field primitive (fixing its keystroke/blur double-fire).
- **013 coordinates with 005.** 005 fixes the per-IP limiter's atomicity + fixed UTC-day window; 013 wraps both the limiter and the USD budget in one authority and enforces the per-IP gate on every LLM route. Execute 005 with/before 013; 013 does **not** re-implement 005's fix. 013 also pre-extracts `src/lib/clientIp.ts` for 005 to reuse.
- **009 before 014/015.** The component refactors are only safe once the e2e suite asserts the real `.ics` output and the `data-testid` hooks exist.
- **One test runner.** 003 stands up bun's built-in `bun test`; 011/012/013/014/015 all add `bun:test` files (no vitest/jest — that's out of scope per 003).
- **015 builds on 014 + 010.** It renders `<EventFields>` (from 014), reuses the `<TimezonePicker>` 014 extracts, and relies on 010 having deleted the second shimmer copy and created `src/types/processing.ts`.

### Wave 1 dependency notes (still valid)

- **005 and 008 require 003**: 003 pins today's buggy behavior with `// KNOWN QUIRK (plans/005|008)` characterization tests; 005/008 deliberately flip those assertions.
- **004 prefers 003**: the CI workflow runs `bun run test`; without 003 that step is omitted (the plan says how).
- 001, 002, 007 are independent of everything.
- **Operator-only steps** (no executor can do these): set `ADMIN_PATTERNS` + `AUTH_SECRET` on Vercel and local `.env.local` `TEST_AUTH_PATTERN` (001); enable GitHub branch protection so CI gates merges (004).

## Deferred — the next refactor wave (scoped, not yet written)

The maintainer chose the high-leverage core; these remain, fully evidenced, for a follow-up `improve` run:

1. **Persistence dedup.** Collapse `eventStorage` + `inputStorage` onto one generic `createStore<T>` primitive and `useHistory` + `useInputHistory` onto one `usePersistedList` hook; stop components importing storage internals directly (layering breach verified at `page.tsx:21`, `SmartInput.tsx:8`); fix the lossy history `Date` round-trip (all-day/zoned drift after reload) and the swallowed quota errors on the temp-unsaved recovery path. ~−500 lines.
2. **`CalendarEvent` type-model correction.** Make the always-set timezone fields **required** (split a loose `ParsedEvent` from the constructed `CalendarEvent`), unify the three `source` enums into one `EventSource`, drop the un-clearable persisted `'resolving'` status, delete the dead `OCRResult`, and use a discriminated `floating | instant` date encoding for lossless persistence. **Directly de-risks the email feature** (`tasks/task-192`, which adds `source: 'email'`).
3. **`page.tsx` decomposition (1596 → ~120 lines), split into 3 plans** (maintainer's choice): (a) pure extractions — `src/types/processing.ts` types already done in 010, plus `convertParsedToCalendarEvent` service + the duplicated SSE-stream reader (`parseEventStream`); (b) leaf + stateful hooks — `useErrorToasts`, `useExportAll`, `useDateRangeFilter`, `useInputSummaries`/`useInputDraft`, `useUnsavedEvents`, `useTimezoneResolution`(+context), `useEventExtraction`; (c) orchestrator + view subcomponents — `<DateRangePickerModal>` (310 inline lines, 12 copy-pasted preset buttons), `<DeleteConfirmModal>`, memoized `<SavedEventsList>`/`<SavedEventRow>`. This wave also fixes: the single-`abortRef` cancel leak (concurrent submits orphan the first controller), the `userTouchedTimezones` stale-closure that overwrites a user's in-progress timezone edit, the `totalEventsInStorage` `-1`/`+prev` drift, the dead `addEvents` batch path (export does N× single `addEvent` + N reloads), and the per-second export-cooldown `setInterval` re-rendering the whole 1596-line tree.

### Still deferred from Wave 1's "not planned" list (perf / deps — unchanged)

- Redis round-trip stacking on `/api/parse` (~5 sequential Upstash calls/request) — best after 013 changes the limiter shape.
- No client-side image compression (5 MB photo → ~6.7 MB base64 to `/api/parse`; localStorage pressure) — perf wave, MED risk (EXIF/HEIC).
- `ics` statically imported into the main bundle via `page.tsx`→`exporter.ts` — dynamic-import it during the `page.tsx` decomposition.
- `@types/react@^18` with React 19 + the Next 16 / ESLint forced-migration pairing — do alongside the Next-16 decision after 004's flat-config lint.
- Error messages leak internals in the remaining routes (`parse/route.ts` returns `error.message`) — 002 fixes scrape-url; sweep the rest during the route work.

## Direction options (maintainer decisions — evidence-grounded, not planned)

1. **Events from email** (`tasks/task-192`, fully specced) — forward-to-address + Gmail-connected inbox feeding the existing parser/exporter. The Wave-2 type-model + LLM-client + input-pipeline cleanups (esp. deferred items 1–2) are the prerequisites that make this drop in cleanly.
2. **Ship duplicate detection** (Tasks 33–41, designed in `tasks/DUPLICATE_DETECTION_CONTEXT.md`; zero code) — highest-confidence "unfinished intent."
3. **.ics import review UI** — `icsParser.ts` is wired into `page.tsx`, but imported events skip the review/merge step that export has. Pairs with #2.
4. **Location enrichment** (`tasks/ENRICHMENT_FEATURES_ROADMAP.md`) — GPS-usable LOCATION fields, multi-stop events.
5. **Define what "Spirit & Hammer collective" membership grants** — the waitlist is live but no doc defines the product behind it.

## Findings considered and rejected (so nobody re-audits them)

- **"Budget accumulates across UTC days if `expire` fails"**: wrong — the key embeds the UTC date; a missed TTL leaves an orphan key only.
- **"Email-bombing via waitlist Resend sends"**: already defended (D1 `ON CONFLICT DO NOTHING` + `alreadyJoined` gate + per-email `Idempotency-Key`).
- **"wrangler.jsonc leaks secrets"**: `account_id`/`database_id` are identifiers, not credentials.
- **"Budget/ratelimit fail-open is a bug"**: explicit, commented design with the credit-limited upstream key as backstop.
- **Timezone "offset math duplicated in two files"** (Wave-2 hypothesis): false — offset math lives only in `timeConversion.ts`; the real issue is triplicated *abbreviation tables* (planned in 012).
- **URL "detection regex duplicated"** (Wave-2 hypothesis): false — detection is an LLM tool call, not a regex; the real issue is URLPill not using the `utils/url` authority + the whitespace bug (planned in 012).
- **Float drift in `incrbyfloat` USD accumulation**: bounded to sub-cent at $5/day. Not worth doing.
