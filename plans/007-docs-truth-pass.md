# Plan 007: Make README/CLAUDE.md/.env.example tell the truth about the shipped product

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f53bf0e..HEAD -- README.md CLAUDE.md .env.example`
> If these changed since planning, reconcile rather than overwrite.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (docs only — but precision matters: these files steer every future agent session)
- **Depends on**: none (coordinates with plans/001 and plans/006 — see Maintenance notes)
- **Category**: docs
- **Planned at**: commit `f53bf0e`, 2026-06-10

## Why this matters

This repo is developed almost entirely by coding agents (190 task files), and the two files every session loads — `CLAUDE.md` and `README.md` — describe a product that does not exist: a to-be-built app using Tesseract OCR, Zustand, and a file tree containing six phantom files. An agent following them will search for `src/services/ocr.ts`, propose adding Tesseract, or "choose" Zustand. The README also presents a shipped, deployed product (summonit.app) as an unimplemented roadmap. Stale docs that are *actively wrong* are worse than no docs; for an agent-driven repo they are a recurring tax on every session.

## Current state

Every claim verified against the tree at f53bf0e:

- `README.md`:
  - Line 63: `### Stack (To Be Implemented)` — the stack is implemented and live.
  - Lines 70-92 (Project Structure): lists `src/services/ocr.ts`, `src/utils/dateParser.ts`, `src/styles/globals.css`, `HistoryPanel.tsx` — none exist (verified against `git ls-files`).
  - Lines 94-110 (Roadmap): every item unchecked, yet items like "Calendar export (iCal format)", "History storage (LocalStorage)", "Mobile responsive design" are shipped.
  - Lines 112-134 (Community Access & Budget) and 135-158 (Getting Started): **accurate and recent — keep, do not rewrite.**
- `CLAUDE.md`:
  - "Tech Stack" section claims `OCR: Tesseract.js or cloud service (TBD)` and `State: React Context or Zustand (lightweight)` — reality: images go as base64 to `/api/parse`, which calls an LLM with vision via OpenRouter (`src/services/parser.ts`, `src/lib/llm.ts`); there is no OCR library and no Context/Zustand (plain `useState` + custom hooks).
  - "Project Structure" block lists phantom files: `src/services/ocr.ts`, `src/hooks/useOCR.ts`, `src/hooks/useParser.ts`, `src/utils/dateParser.ts`, `src/utils/validation.ts`, `src/components/HistoryPanel.tsx` — none exist. It also omits the real load-bearing modules: `src/lib/{llm,budget,ratelimit,d1}.ts`, `src/components/SmartInput.tsx`, `BatchEventList.tsx`, `InlineEventEditor.tsx`, `src/services/{processingQueue,summarizer,webScraper,urlDetector,icsParser,exportAll,inputStorage,timezoneResolver}.ts`, `workers/waitlist-d1-proxy/`, `e2e/`.
  - "OCR Integration" section (Tesseract-first guidance) — obsolete.
  - "Project Status": "Currently in initial development phase" — false; ~190 tasks shipped, deployed at summonit.app.
  - The Task Workflow, Code Standards, Styling, and Comment Policy sections are accurate — **keep**.
- `.env.example`:
  - Lines 1-2: `# Anthropic API Configuration` / `# Get your API key from: https://console.anthropic.com/` — wrong: the vars below are `OPENROUTER_*` (correct console: https://openrouter.ai/settings/keys).
  - Missing entirely: `AUTH_SECRET` (read by `src/app/api/auth/shared.ts:9`; absence in production silently breaks admin sessions across serverless instances). If plans/001 has landed, its Step 4 already added `AUTH_SECRET` + `ADMIN_PATTERNS` — don't duplicate.
- Verified e2e/test commands for the README dev section: `bun run type-check` passes; `bun run lint` is **broken** at f53bf0e (do not document it as working; if plans/004 landed, it works — check before writing).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Structure ground truth | `git ls-files 'src/**' 'workers/**' 'e2e/*'` | the real tree to document |
| Typecheck (unchanged)  | `bun run type-check`     | exit 0 |

## Scope

**In scope**: `README.md`, `CLAUDE.md`, `.env.example` (header comment + missing-var entries only).

**Out of scope** (do NOT touch):
- All code. All other docs (`docs/*`, `BRANDING.md`, `MONETIZATION_STRATEGY.md`, `PATTERN_LOCK_DESIGN.md`, `tasks/*`).
- The accurate sections called out above (README Community/Getting-Started; CLAUDE.md Task Workflow/Code Standards/Styling/Comments).
- Do not document or hint at any real secret value, unlock pattern, or key anywhere.

## Git workflow

- Branch: `advisor/007-docs-truth-pass`
- One commit, e.g. `Plan 007: align README/CLAUDE.md/.env.example with the shipped app`, ending with the repo's `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: README.md

- Retitle `### Stack (To Be Implemented)` → `### Stack` and rewrite the five bullets to reality: Next.js 15 App Router + TypeScript strict; LLM extraction via OpenRouter (vision for images — no OCR library); Upstash Redis for rate limiting + the community budget; Cloudflare D1 (Worker proxy) + Resend for the waitlist; `ics` + `jszip` for export; localStorage/IndexedDB for client history; Playwright e2e (+ `bun test src` unit suite if plans/003 landed — check).
- Replace the Project Structure block with the real tree (from `git ls-files`, summarized to the directory level with one-line annotations — keep it under ~25 lines).
- Replace the Roadmap checklist with: a short "Shipped" list (the previously-unchecked-but-done items, checked) and keep genuinely open items (duplicate detection, location enrichment — see `tasks/ENRICHMENT_FEATURES_ROADMAP.md`) unchecked.

**Verify**: `grep -c "To Be Implemented" README.md` → 0; `grep -c "ocr.ts\|dateParser.ts\|HistoryPanel" README.md` → 0.

### Step 2: CLAUDE.md

- Tech Stack: `OCR` row → `Image understanding: LLM vision via OpenRouter (/api/parse with base64 images) — no OCR library`; `State` row → `State: plain React useState + custom hooks (useHistory, useProcessingQueue, useAuth); server state in Upstash Redis & Cloudflare D1`; `Parsing` row → name OpenRouter and the env-selected models (`OPENROUTER_MODEL`, `OPENROUTER_SUMMARY_MODEL`).
- Project Structure: regenerate from the real tree (same source as Step 1), including `src/lib/`, `workers/waitlist-d1-proxy/`, `e2e/`, `migrations/`, `plans/`.
- Delete the "OCR Integration" section; replace with 3 lines on the actual extraction path (client base64 → `/api/parse` SSE stream → `parseEventsBatch`).
- Project Status: replace with one truthful paragraph (shipped at summonit.app; community budget model; pointer to `plans/README.md` for the current improvement queue).
- Development Commands: ensure the listed commands match `package.json` exactly as of your checkout (include `test` script only if it exists; mark `lint` per its actual state — see Current state note).

**Verify**: `grep -c "Tesseract\|Zustand\|useOCR\|initial development phase" CLAUDE.md` → 0.

### Step 3: .env.example

- Replace lines 1-2 with `# OpenRouter API Configuration` / `# Get your API key from: https://openrouter.ai/settings/keys`.
- If plans/001 has NOT landed: append a documented `AUTH_SECRET` entry (commented, with `openssl rand -hex 32` guidance and a note that production admin sessions require it). If 001 landed, verify its entries exist and skip.

**Verify**: `grep -c "console.anthropic.com" .env.example` → 0; `grep -c "AUTH_SECRET" .env.example` → ≥ 1.

### Step 4: Cross-check no phantom paths remain

**Verify**: `grep -rn "services/ocr\|hooks/useOCR\|hooks/useParser\|utils/dateParser\|utils/validation\|HistoryPanel" README.md CLAUDE.md` → no matches.

## Test plan

Docs-only; the done-criteria greps are the tests. Additionally have a fresh eye (or a fresh agent session) read only CLAUDE.md and answer: "how does an image become an event, and what command verifies the repo?" — both answers must now be correct.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] All Step 1–4 verify-greps return the stated counts
- [ ] `git diff --name-only` is exactly: `README.md CLAUDE.md .env.example` (plus `plans/README.md`)
- [ ] Every file path mentioned in the rewritten structure blocks exists (`git ls-files | grep <path>` spot-check at least 8)
- [ ] No secret values introduced anywhere
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- README/CLAUDE.md have materially changed since f53bf0e (drift check) — reconcile, don't overwrite.
- You're unsure whether a roadmap item is shipped — verify in code first; if still unsure, leave it unchecked and list it in your report rather than guessing.
- Anything would require you to write an actual pattern/key/secret.

## Maintenance notes

- Ordering with plans/006: if 006 ran first, the deleted components are simply absent from your regenerated trees; if 007 runs first, regenerate from `git ls-files` at your checkout — either order converges.
- CLAUDE.md's structure block will drift again; the durable fix is keeping it directory-level (not file-level) — this plan already writes it that way.
- `NEXT_PUBLIC_DISABLE_AUTH` (in `.env.example:8-9`) controls only a dev UI button (`AuthWrapper.tsx:23`), not auth itself — if you touch its comment, describe it as "shows the dev lock button", don't rename the var (code change, out of scope).
