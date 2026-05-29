### Task 168: Rebrand Event Every → Summon

**Goal**: Rename the product from "Event Every" to "Summon" across the app UI, metadata, output/identity strings, and documentation — while preserving real external identifiers (live deployment URL, GitHub repo, Vercel resources, auth keys, on-disk folder name), which are separate dashboard/repo operations.

**Naming**: Wordmark reads "Summon it" (imperative, "just do it" energy); the spoken brand name stays "Summon".

**Subtasks**:
- [x] Wordmark `<h1>` → "Summon it"; hero tagline → "Turn any flyer, screenshot, or text into a calendar event."
- [x] Meta `<title>` → "Summon — from anything to your calendar"; `description` → "Snap an image, paste text, or drop a link. Summon it into a calendar event."
- [x] `package.json` name → `summon`
- [x] `.ics` PRODID → `summon/ics` (both event paths in `exporter.ts`)
- [x] Export bundle filename → `summon-export-*.zip`
- [x] OpenRouter `X-Title` → `summon` (`parser.ts`, `detect-urls`, `resolve-timezone`)
- [x] Scraper User-Agent product token → `Summon/1.0`
- [x] Docs sweep: README, CLAUDE.md, MONETIZATION_STRATEGY.md, PATTERN_LOCK_DESIGN.md, docs/, run.sh, and 12 task files
- [x] Preserved real identifiers: `event-every.vercel.app`, GitHub repo links, `event-every-kv` / `mannanjs-projects/event-every` Vercel resources, `event-every-auth*` cookie/localStorage keys, on-disk folder name
- [x] `bun run type-check` passes

- Location: `src/app/`, `src/services/`, `package.json`, `README.md`, `run.sh`, `*.md`

[Task-168]
