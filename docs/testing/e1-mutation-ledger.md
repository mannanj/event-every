# E1 mutation ledger

## E1-T8-CANCEL-STALE-M08-RED

This row covers `canceling a delayed first scan leaves the succeeding second scan as the only
review draft` in `e2e/scanner-product-loop.spec.ts`. The scenario admits both requests through the
shared `ScanRequestSchema`, holds the first response, cancels its submission, completes a second
scan, then releases the first response. It requires exactly one visible and persisted draft, whose
title is `Successful second scan`.

The first mutated run on port 3777 and two port-3779 retries are non-accepting discovery evidence.
Port 3777 was occupied by a preserved Next process, and the 3779 process reused `.next` client bytes
whose mtime preceded `src/app/page.tsx` and which still contained the pristine abort guard. A
delivery diagnostic proved the delayed response itself fulfilled. No red claim is based on those
runs. The accepting red and restored green instead used a parent-owned, credential-free Next server
on port 3781 with the isolated `.next-e1-m08` build directory; Playwright's managed `webServer` was
temporarily disabled so no stale server could be reused. The generated directory was removed after
proof without touching the preserved `.next` tree.

Pristine evidence and hashes:

```text
/private/tmp/e1-m08.IjOMMG/page.tsx.pristine
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f  src/app/page.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
```

E1-M08 forward production patch:

```diff
-    const response = await scan(request, signal);
-    if (signal.aborted) return [];
+    const response = await scan(request, new AbortController().signal);
@@
-    if (!signal.aborted) {
-      setReviewDrafts((previous) => [...previous, ...drafts]);
-    }
+    setReviewDrafts((previous) => [...previous, ...drafts]);
```

The mutated page SHA-256 was
`4d39065eb025b03c04d0de223942eb0e331ecae0a094685830257e40af0824ee`.
The accepting isolated-build prerequisites were literal transient patches:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3781';
@@
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m08',
```

Next added `.next-e1-m08/types/**/*.ts` and reformatted `tsconfig.json` when starting; that complete
mechanical side effect was explicitly inverse-patched after each accepting run. During the red run,
the transient hashes were `1670735b89c697c2e14d5d69bae25cffeac4835ad0fb914038195fe38d5b890e`
for `playwright.config.ts`, `8c442d22bfa6d4847707cb23de61e4d87bd39e2f58caa116d67011a2e1509d1a`
for `next.config.js`, and `75135f45f1c5013d9aa51174d8f3aa1e1ddd68680c9a4c7da9afd5502798390d`
for the generated `tsconfig.json` form.

The credential-free server and focused commands were:

```bash
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin E1_OFFLINE=1 \
  E1_OFFLINE_PRELOAD=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  NODE_OPTIONS=--require=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  node --require=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  node_modules/next/dist/bin/next dev -p 3781

env -i PATH=/opt/homebrew/bin:/usr/bin:/bin E1_OFFLINE=1 \
  E1_OFFLINE_PRELOAD=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  NODE_OPTIONS=--require=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  PLAYWRIGHT_BROWSERS_PATH=/Users/manblack/Library/Caches/ms-playwright \
  node --require=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  node_modules/@playwright/test/cli.js test e2e/scanner-product-loop.spec.ts \
  --project=chromium --grep "canceling a delayed first scan" --reporter=line
```

The repaired causal scenario passed pristine `1/1` in 32.8 seconds. Only after the visible second
draft equaled `Successful second scan` did the test release the first route; it then awaited that
route's settlement and browser `networkidle`. RED exited 1 at the intended persisted stale-draft
assertion in 18.6 seconds: expected `['Successful second scan']`, received
`['Successful second scan', 'Canceled first scan']`. This was the required stale canceled result,
not a setup, compilation, patch, timing, or unrelated assertion failure.

Explicit inverse production patch:

```diff
-    const response = await scan(request, new AbortController().signal);
+    const response = await scan(request, signal);
+    if (signal.aborted) return [];
@@
-    setReviewDrafts((previous) => [...previous, ...drafts]);
+    if (!signal.aborted) {
+      setReviewDrafts((previous) => [...previous, ...drafts]);
+    }
```

Literal transient config inverses:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3781';
+const localUrl = 'http://localhost:3777';
@@
-  webServer: undefined,
+  webServer: isProd
+    ? undefined
+    : {
+        command: devCommand,
+        url: localUrl,
+        reuseExistingServer: !isOffline && !process.env.CI,
+        timeout: 120000,
+      },
--- next.config.js
 const nextConfig = {
-  distDir: '.next-e1-m08',
```

The complete Next-generated `tsconfig.json` forward side effect and explicit inverse were:

```diff
--- forward
-    "lib": ["dom", "dom.iterable", "esnext"],
+    "lib": [
+      "dom",
+      "dom.iterable",
+      "esnext"
+    ],
@@
-      "@/*": ["./src/*"]
+      "@/*": [
+        "./src/*"
+      ]
@@
-  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
-  "exclude": ["node_modules"]
+  "include": [
+    "**/*.ts",
+    "**/*.tsx",
+    ".next/types/**/*.ts",
+    "next-env.d.ts",
+    ".next-e1-m08/types/**/*.ts"
+  ],
+  "exclude": [
+    "node_modules"
+  ]
--- inverse
-    "lib": [
-      "dom",
-      "dom.iterable",
-      "esnext"
-    ],
+    "lib": ["dom", "dom.iterable", "esnext"],
@@
-      "@/*": [
-        "./src/*"
-      ]
+      "@/*": ["./src/*"]
@@
-  "include": [
-    "**/*.ts",
-    "**/*.tsx",
-    ".next/types/**/*.ts",
-    "next-env.d.ts",
-    ".next-e1-m08/types/**/*.ts"
-  ],
-  "exclude": [
-    "node_modules"
-  ]
+  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
+  "exclude": ["node_modules"]
```

Each literal patch/inverse above was applied with `apply_patch`; after stopping the controlled server,
the generated-only directory was removed with:

```bash
rm -rf /Users/manblack/Documents/event-every/.next-e1-m08
```

The exact focused command against the inverse-restored page passed `1/1` in 14.9 seconds. Final
SHA-256 values returned byte-identically to all four pristine hashes above, `git diff` was empty for
those files, and `.next-e1-m08` was absent.

Fresh focused gates and output:

```bash
bun test src/services/__tests__/scanClient.test.ts \
  src/services/__tests__/scannerDraft.test.ts \
  src/services/__tests__/scannerExporter.test.ts --isolate
# 30 pass, 0 fail, 99 expect() calls

node node_modules/typescript/bin/tsc --noEmit --incremental false
# exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts \
  e2e/helpers.ts src/types/scanRequest.ts src/types/scannerHttp.ts
# exit 0

bun run assert:e1-protected
# Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
# E1 path guard accepted 187 changed path(s).

git diff --check
# exit 0
```

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S15 | `--grep "canceling a delayed first scan" --project=chromium` | E1-M08 |

## E1-T8-IMAGE-RAW-FREE-M07-RED

This row covers the browser scenario
`image scan sends a strict data URL, reviews a vision candidate, exports Scanner bytes, and keeps
review storage raw-free` in `e2e/scanner-product-loop.spec.ts`. It uploads the repository's valid
1x1 PNG through the real file input, exact-matches the strict `{ kind: 'image', dataUrl }` request,
returns a real-schema vision candidate with an opaque image handle, verifies the raw-free review DTO
contains neither the complete image data URL nor a serialized `dataUrl` request field, requires the
dedicated request-storage key to remain absent, and downloads the Scanner title/location/start bytes.

All runs used `createE1OfflineEnvironment()`, the offline preload, and a fresh Playwright-owned
server. The preserved occupied port-3777 server was left untouched; before every accepting browser
run, this literal transient config forward patch selected port 3778:

```diff
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3778';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3778`
```

The forward patch command completed successfully. The pristine config SHA-256 was
`fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877`; the transient SHA-256 was
`011f3b4b4dd1cee74cdf6860467ab95b4a3b16e9ed55a7a790cffff588057f2b`. The pristine focused scenario
passed 1/1 in 30.9 seconds.

Pristine evidence copy:

```text
/private/tmp/e1-m07.8v3itc/page.tsx.pristine
/private/tmp/e1-m04-m05.c0Cz9A/playwright.config.ts.pristine
```

Pre-mutation SHA-256:

```text
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f  src/app/page.tsx
```

Forward patch:

```diff
   const runScan = useCallback(async (request: ScanRequest, signal: AbortSignal): Promise<ReviewDraft[]> => {
     const response = await scan(request, signal);
+    localStorage.setItem('event-every:last-scan-source', JSON.stringify(request));
     if (signal.aborted) return [];
```

Focused command:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'image scan sends a strict data URL', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

RED: exit 1 at the intended
`expect(localStorage.getItem('event-every:last-scan-source')).toBeNull()` assertion. The received
value was the serialized `{ "kind":"image", "dataUrl":"data:image/png;base64,..." }` request
including the complete fixture bytes. The explicit inverse patch was:

```diff
   const runScan = useCallback(async (request: ScanRequest, signal: AbortSignal): Promise<ReviewDraft[]> => {
     const response = await scan(request, signal);
-    localStorage.setItem('event-every:last-scan-source', JSON.stringify(request));
     if (signal.aborted) return [];
```

`cmp -s` against the pristine evidence copy exited 0, SHA-256 returned to
`775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f`, and the exact focused
restored-green command passed 1/1 in 46.9 seconds. The mutation failed the intended raw-request
storage assertion, not setup, compilation, patch, or timeout.

After the restored focused run and six-scenario gate, the explicit config inverse was:

```diff
-const localUrl = 'http://localhost:3778';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3778`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
```

The inverse patch command completed successfully.
`cmp -s playwright.config.ts /private/tmp/e1-m04-m05.c0Cz9A/playwright.config.ts.pristine`
exited 0 and SHA-256 returned to
`fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877`. The six accepted Chromium
scenarios passed together 6/6 on the fresh server in 55.1 seconds.

Focused unit proof passed 36 tests / 145 expectations; typecheck, targeted lint, the exact
53,300-record protected inventory, the cumulative 187-path E1 guard, and diff hygiene passed. The
native-controlled Sol/high review initially rejected only the M07 row's non-self-contained config
reference and one overbroad evidence phrase. After this ledger-only repair, rollout
`/Users/manblack/.codex/sessions/2026/07/31/rollout-2026-07-31T18-26-36-019fba49-55e9-7d33-bac6-289709d27765.jsonl`
records effective `gpt-5.6-sol`/high and terminal `VERIFIED:true` with no remaining blockers.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S02 | `--grep "image scan sends a strict data URL" --project=chromium` | E1-M07 |

## E1-T8-MISSING-START-M06-RED

This row covers the browser scenario
`missing Scanner start blocks export until a complete temporal edit supplies it` in
`e2e/scanner-product-loop.spec.ts`. Its fixture is parsed by the real `EventCandidateSchema` with a
null temporal start and otherwise populated provider claims. The scenario requires the exact
`temporal · missing_start: The event start is missing.` blocker, disabled selected export, one
complete floating temporal edit, edit-only temporal provenance reset, byte-identical untouched
claims, enabled export, and downloaded `DTSTART:20260806T091500`.

Two pre-mutation attempts are non-accepting and preserved as discovery evidence. The first expected
the wrong Scanner code `field_not_found`; the fresh browser rendered the real `missing_start` code,
so the run exited before the disabled-export assertion. The second used sequential date/time fills;
moving focus committed the incomplete date-only buffer and React correctly reset the date, so it
failed at `toHaveValue('2026-08-06')`. The accepting scenario sets both controlled input buffers with
the native value setter and bubbling `input` events before one explicit blur. Its fresh offline
port-3778 pristine run passed 1/1 in 46.9 seconds.

Pristine evidence copy:

```text
/private/tmp/e1-m06.uyUv8J/ReviewDraftSection.tsx.pristine
/private/tmp/e1-m04-m05.c0Cz9A/playwright.config.ts.pristine
```

Before every accepting browser run, the preserved occupied port-3777 server was left untouched and
the following literal transient config patch selected a fresh Playwright-owned port 3778 server:

```diff
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3778';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3778`
```

The pristine config SHA-256 was
`fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877`; the transient port-3778
config SHA-256 was `011f3b4b4dd1cee74cdf6860467ab95b4a3b16e9ed55a7a790cffff588057f2b`.

Pre-mutation SHA-256:

```text
5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de  src/components/review/ReviewDraftSection.tsx
```

Forward patch:

```diff
-  const blocked = selectedDrafts.some((draft) => !draft.readiness.canGenerate);
+  const blocked = false;
```

Focused command:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'missing Scanner start blocks export', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

RED: exit 1 at `expect(exportButton).toBeDisabled()` because the mutated review section rendered the
selected blocked draft's export control enabled. The explicit inverse patch was:

```diff
-  const blocked = false;
+  const blocked = selectedDrafts.some((draft) => !draft.readiness.canGenerate);
```

`cmp -s` against the pristine evidence copy exited 0, SHA-256 returned to
`5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de`, and the exact focused
restored-green command passed 1/1 in 47.2 seconds. The mutation failed the intended behavior
assertion, not setup, compilation, patch, or timeout.

After the focused and five-scenario runs, the explicit config inverse was:

```diff
-const localUrl = 'http://localhost:3778';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3778`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
```

`cmp -s playwright.config.ts /private/tmp/e1-m04-m05.c0Cz9A/playwright.config.ts.pristine`
exited 0 and the post-restoration SHA-256 returned to
`fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877`. The five current Task 8
Chromium scenarios then had already passed together 5/5 on the fresh server in 51.9 seconds.

Focused unit proof passed 36 tests / 145 expectations; typecheck, targeted lint, the exact
53,300-record protected inventory, the cumulative 187-path E1 guard, and diff hygiene passed. The
native-controlled Sol/high review initially rejected only the missing durable config patch/inverse
evidence. After this ledger-only repair, the same rollout
`/Users/manblack/.codex/sessions/2026/07/31/rollout-2026-07-31T18-12-34-019fba3c-7f9b-79d0-8ae4-7fdb15919e2f.jsonl`
records effective `gpt-5.6-sol`/high and terminal `VERIFIED:true` with no remaining findings.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S05 | `--grep "missing Scanner start blocks export" --project=chromium` | E1-M06 |

## E1-T8-EDITED-BYTES-M04-M05-RED

This row covers the browser scenario
`edited claims clear only their evidence and export fresh Scanner calendar bytes`
in `e2e/scanner-product-loop.spec.ts`. The scenario constructs the provider candidate with the
real `EventCandidateSchema.parse`, deliberately reaches one pre-edit `generateIcs` call while
interrupting only the browser anchor click, retains the draft, then edits title, start time, and
location. It requires the edited claims to persist with `confidence: null` and `evidence: []`, the
untouched description claim to remain byte-for-byte equal to its provider evidence, the raw
submission/data URL to remain absent from review storage, and the final download to contain only
the edited title/location/time bytes.

All accepting runs used `createE1OfflineEnvironment()`, the offline preload, and a fresh
Playwright-owned Next server on transient port 3778. The port override changed only the two literal
`3777` values in `playwright.config.ts`, was inverse-patched after the proof, and restored SHA-256
`fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877`.

Pristine evidence copies:

```text
/private/tmp/e1-m04-m05.c0Cz9A/scannerDraft.ts.pristine
/private/tmp/e1-m04-m05.c0Cz9A/scannerExporter.ts.pristine
/private/tmp/e1-m04-m05.c0Cz9A/playwright.config.ts.pristine
```

Focused command for every accepting red/restored-green run:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'edited claims clear only their evidence', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

### E1-M04 — edited claims must discard provider confidence/evidence

Pre-mutation SHA-256:

```text
bd173fafb81b10f4327a40fd04a402f68afaa6092875548245227daacd63b23b  src/services/scannerDraft.ts
```

Forward patch:

```diff
     [edit.field]: {
+      ...draft.candidate[edit.field],
       value: edit.value,
-      confidence: null,
-      evidence: [],
     },
```

The focused command exited 1 at the intended stored-title claim assertion. The received edited
title retained provider `confidence: 0.9` and its `Planning lunch at noon` evidence instead of the
required null/empty edit provenance. The explicit inverse patch was:

```diff
     [edit.field]: {
-      ...draft.candidate[edit.field],
       value: edit.value,
+      confidence: null,
+      evidence: [],
     },
```

`cmp -s` against the pristine evidence copy exited 0, SHA-256 returned to
`bd173fafb81b10f4327a40fd04a402f68afaa6092875548245227daacd63b23b`, and the exact focused
restored-green command passed 1/1 in 50.0 seconds.

### E1-M05 — export must regenerate from the edited draft

Pre-mutation SHA-256:

```text
e5615bb7f48a6b077da11251e739923fc51183e30e2940e85cfac979e0fefef2  src/services/scannerExporter.ts
```

Forward patch:

```diff
-  const generateCalendar = dependencies.generateCalendar ?? generatedCalendar;
+  const baseGenerateCalendar = dependencies.generateCalendar ?? generatedCalendar;
+  const cachedCalendars = new Map<string, ScannerCalendar | ScannerGenerationFailure>();
+  const generateCalendar: ScannerGenerator = (draft) => {
+    const cached = cachedCalendars.get(draft.id);
+    if (cached) return cached;
+    const generated = baseGenerateCalendar(draft);
+    cachedCalendars.set(draft.id, generated);
+    return generated;
+  };
```

The scenario's interrupted pre-edit download primed this cache. The focused command exited 1 at
the intended downloaded-byte assertion: received ICS contained `SUMMARY:Team lunch`,
`LOCATION:Cafe Example`, and `DTSTART:20260804T120000` instead of the edited values. The explicit
inverse patch was:

```diff
-  const baseGenerateCalendar = dependencies.generateCalendar ?? generatedCalendar;
-  const cachedCalendars = new Map<string, ScannerCalendar | ScannerGenerationFailure>();
-  const generateCalendar: ScannerGenerator = (draft) => {
-    const cached = cachedCalendars.get(draft.id);
-    if (cached) return cached;
-    const generated = baseGenerateCalendar(draft);
-    cachedCalendars.set(draft.id, generated);
-    return generated;
-  };
+  const generateCalendar = dependencies.generateCalendar ?? generatedCalendar;
```

`cmp -s` against the pristine evidence copy exited 0, SHA-256 returned to
`e5615bb7f48a6b077da11251e739923fc51183e30e2940e85cfac979e0fefef2`, and the exact focused
restored-green command passed 1/1 in 1.8 minutes.

Both mutations failed the scenario's intended behavior assertion, not setup, compilation, patch,
or timeout. Production files and `playwright.config.ts` are byte-identical to their pristine
copies.

After restoration, the four accepted Task 8 Chromium scenarios passed together 4/4 on a fresh
offline port-3778 server with `--workers=1` in 1.6 minutes. A preceding default-parallel run is
non-accepting suite evidence: the other three scenarios passed, but this scenario exceeded the
30-second per-test timeout under four-way local compilation load. The focused mutation runs and
serial four-scenario gate are accepting for this proof-sized unit; default-parallel Chromium and
WebKit remain mandatory before terminal Task 8 acceptance. Focused unit proof passed 36 tests / 145
expectations; typecheck, targeted lint, the exact 53,300-record protected inventory, the cumulative
187-path E1 guard, and diff hygiene passed. Native-controlled Sol/high review rollout
`/Users/manblack/.codex/sessions/2026/07/31/rollout-2026-07-31T17-52-29-019fba2a-1b90-74c3-97c8-dce503e73d86.jsonl`
records effective `gpt-5.6-sol`/high and returned `VERIFIED:true` with no blocking findings.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S04 | `--grep "edited claims clear only their evidence" --project=chromium` | E1-M04, E1-M05 |

## E1-T8-MISSING-TITLE-M02-M03-RED

This row covers the browser scenario
`missing Scanner title stays visible as a warning and exports calendar bytes without SUMMARY`
in `e2e/scanner-product-loop.spec.ts`. It constructs its fixture with the real
`EventCandidateSchema.parse`, a `null` title claim, and a valid floating temporal
start. It requires the visible missing-title state, the `title · field_not_found`
export warning, an enabled export button, and downloaded ICS without `SUMMARY:`.

All runs used `createE1OfflineEnvironment()`, the offline preload, and a fresh
Playwright-owned Next server on transient port 3778. The pristine focused scenario
passed 1/1 in 17.3 seconds.

Pristine evidence copies:

```text
/private/tmp/e1-m02-m03.DyfxJo/scannerDraft.ts.pristine
/private/tmp/e1-m02-m03.DyfxJo/ReviewDraftSection.tsx.pristine
```

### E1-M02 — reject a fabricated fallback title

Pre-mutation SHA-256:

```text
bd173fafb81b10f4327a40fd04a402f68afaa6092875548245227daacd63b23b  src/services/scannerDraft.ts
```

Forward patch:

```diff
-  const parsedCandidate = EventCandidateSchema.parse(candidate);
+  const parsedCandidate = EventCandidateSchema.parse({
+    ...candidate,
+    title: candidate.title.value === null
+      ? { ...candidate.title, value: 'Untitled Event' }
+      : candidate.title,
+  });
```

Focused command:

```bash
node --require scripts/e1-offline-preload.cjs node_modules/@playwright/test/cli.js test e2e/scanner-product-loop.spec.ts --project=chromium --grep "missing Scanner title" --reporter=line
```

RED: exit 1 at `expect(getByLabel('Title is missing')).toBeVisible()` because the
mutated draft displayed the invented fallback. The explicit inverse patch was:

```diff
-  const parsedCandidate = EventCandidateSchema.parse({
-    ...candidate,
-    title: candidate.title.value === null
-      ? { ...candidate.title, value: 'Untitled Event' }
-      : candidate.title,
-  });
+  const parsedCandidate = EventCandidateSchema.parse(candidate);
```

The restored-green command was the exact focused command above. Concise output:

```text
[chromium] › missing Scanner title stays visible as a warning and exports calendar bytes without SUMMARY
1 passed (30.1s)
```

`cmp -s` against the pristine evidence copy exited 0,
the SHA-256 returned to `bd173fafb81b10f4327a40fd04a402f68afaa6092875548245227daacd63b23b`,
and the restored focused scenario passed 1/1.

### E1-M03 — warnings must not block export

Pre-mutation SHA-256:

```text
5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de  src/components/review/ReviewDraftSection.tsx
```

Forward patch:

```diff
-  const blocked = selectedDrafts.some((draft) => !draft.readiness.canGenerate);
+  const blocked = selectedDrafts.some((draft) =>
+    !draft.readiness.canGenerate || draft.readiness.warnings.length > 0,
+  );
```

The same focused command produced the intended RED at
`toBeEnabled()` because the export button was disabled solely by warnings. The
explicit inverse patch was:

```diff
-  const blocked = selectedDrafts.some((draft) =>
-    !draft.readiness.canGenerate || draft.readiness.warnings.length > 0,
-  );
+  const blocked = selectedDrafts.some((draft) => !draft.readiness.canGenerate);
```

The restored-green command was the exact focused command above. Concise output:

```text
[chromium] › missing Scanner title stays visible as a warning and exports calendar bytes without SUMMARY
1 passed (18.9s)
```

`cmp -s` against the
pristine evidence copy exited 0, the SHA-256 returned to
`5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de`, and the
restored focused scenario passed 1/1.

The transient port override was inverse-patched; final `playwright.config.ts`
SHA-256 is `fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877`.
Both E1-M02 and E1-M03 are accepting red/restored-green evidence only for this
scenario.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S03 | `--grep "missing Scanner title" --project=chromium` | E1-M02, E1-M03 |

## E1-T8-MALFORMED-RESPONSE-M01-RED

This row covers the browser scenario
`malformed successful scan response creates no draft and reports a processing error` in
`e2e/scanner-product-loop.spec.ts`. The scenario intercepts `/api/scan` with an
otherwise valid Scanner response plus the unexpected top-level key
`unexpectedTopLevel`, submits text, asserts that no `Scanner review drafts` region is
created, and asserts a visible `Error processing text` notification.

The intended M01 mutation removes only `ScanResponseSchema.parse` from
`src/services/scanClient.ts`; the scenario must fail because a review draft is created
and the processing error is absent.

### Execution record — non-accepting stale-server result

Pristine evidence copy: `/private/tmp/e1-m01.Gbfc9Y/scanClient.ts.pristine`.

Pre-mutation SHA-256:

```text
9a7898f90526174c2a988c45118d065a1b4afa2dfacc1fde66cd4798111f4ef6  src/services/scanClient.ts
```

Forward patch applied with `apply_patch`:

```diff
-  return ScanResponseSchema.parse(body);
+  return body as ScanResponse;
```

Focused command:

```bash
E2E_TARGET='' node node_modules/@playwright/test/cli.js test e2e/scanner-product-loop.spec.ts --project=chromium -g "malformed successful scan response"
```

Result: non-accepting. A pre-existing process was listening on port 3777 and was
preserved as required. Playwright reused it; the command exited 0 and
`test-results/.last-run.json` reported `{"status":"passed","failedTests":[]}` even
while the source mutation was live, which demonstrates the server did not load the
mutated client module. Therefore there is no valid red assertion to record.

Inverse patch applied with `apply_patch`:

```diff
-  return body as ScanResponse;
+  return ScanResponseSchema.parse(body);
```

Post-restore SHA-256 was
`9a7898f90526174c2a988c45118d065a1b4afa2dfacc1fde66cd4798111f4ef6`; `cmp -s
src/services/scanClient.ts /private/tmp/e1-m01.Gbfc9Y/scanClient.ts.pristine` exited
0, proving byte identity. The restored focused command also exited 0, but is likewise
not accepting until it runs against a server started from this working tree.

### Execution record — accepting isolated-server proof

The same forward patch was applied again. `playwright.config.ts` was transiently
inverse-patchable to select port 3778 through `E1_PLAYWRIGHT_PORT`; this avoided the
unrelated port-3777 process while retaining `E1_OFFLINE=1`, the credential-scrubbed
environment, the offline preload, and a fresh Playwright-owned Next server.

Focused command, launched through `createE1OfflineEnvironment()` with
`E1_PLAYWRIGHT_PORT=3778`:

```bash
node --require scripts/e1-offline-preload.cjs node_modules/@playwright/test/cli.js test e2e/scanner-product-loop.spec.ts --project=chromium --grep "malformed successful scan response" --reporter=line
```

RED: exit 1. The intended scenario failed at
`expect(getByTestId('error-notification')).toBeVisible()` because the mutated client
admitted the malformed success, so no processing error was rendered. This is the
required malformed-success rejection behavior, not a compile, setup, patch, or timeout
failure.

The production line was restored with the explicit inverse patch shown above.
`cmp -s src/services/scanClient.ts
/private/tmp/e1-m01.Gbfc9Y/scanClient.ts.pristine` exited 0 and the restored SHA-256
was exactly:

```text
9a7898f90526174c2a988c45118d065a1b4afa2dfacc1fde66cd4798111f4ef6  src/services/scanClient.ts
```

The same fresh isolated-server command then passed 1/1 Chromium scenario in 29.2
seconds. The transient Playwright config change was inverse-patched; final SHA-256 is:

```text
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
```

E1-M01 is accepting red/restored-green evidence for this scenario. It is not credited
to the valid text/download scenario and does not claim any other Task 8 mutation row.

## E1-T8-MULTI-SELECT-M09-RED

This row covers `multiple Scanner candidates export exactly the selected VEVENT subset
in one calendar download` in `e2e/scanner-product-loop.spec.ts`. The intercepted
`/api/scan` response is built through the real `EventCandidateSchema` and contains
three independently valid floating-time candidates: `Omit multi candidate`, `Keep
multi candidate one`, and `Keep multi candidate two`. All three initially render
selected. The scenario clears only the first card's title-and-draft-ID selection
checkbox, requires the two remaining checkboxes to stay selected, and reads the
raw-free persisted drafts only to reproduce Scanner's own per-draft calendars with
their browser-created UID and DTSTAMP policy. It compares the one download byte-for-byte
to one VCALENDAR header, exactly the two selected Scanner-generated VEVENT sections in
their original order, and one footer. It additionally requires two VEVENT markers,
the two selected summaries, and the absence of the unselected summary.

### Pristine evidence and isolated runtime

Before the production mutation, these evidence-only copies were retained under the
unique directory `/private/tmp/e1-m09.yfjvXW`:

```text
/private/tmp/e1-m09.yfjvXW/ReviewDraftSection.tsx.pristine
/private/tmp/e1-m09.yfjvXW/playwright.config.ts.pristine
/private/tmp/e1-m09.yfjvXW/next.config.js.pristine
```

Their matching pre-mutation SHA-256 values were:

```text
5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de  src/components/review/ReviewDraftSection.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
```

The unrelated listener on port 3777 was preserved. For the accepting proof only,
the following literal temporary configuration forward patches selected a fresh local
server on port 3782 and an isolated `.next-e1-m09` build; the second patch disabled
Playwright's server ownership only while the already-created isolated server was used
for the direct focused command:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3782';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3782`

--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m09',
   devIndicators: false,
```

```diff
--- playwright.config.ts
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
```

Two earlier executions are explicitly non-accepting. The sandbox first rejected
isolated-build creation and loopback binding with `EPERM` for
`.next-e1-m09`/`127.0.0.1:3782`; its retained Playwright last-run record was therefore
not evidence. A subsequent managed-server launcher left a short-lived detached server,
so the restored retry failed before product behavior at `page.goto` with
`net::ERR_CONNECTION_REFUSED`. Neither result is used as RED or GREEN evidence.

### E1-M09 — export only the selected draft IDs

Forward production patch, applied with `apply_patch`:

```diff
--- src/components/review/ReviewDraftSection.tsx
-          <button type="button" onClick={() => onExport(selectedDrafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400" aria-label="Export selected review drafts">Export</button>
+          <button type="button" onClick={() => onExport(drafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400" aria-label="Export selected review drafts">Export</button>
```

The accepting focused command used `createE1OfflineEnvironment()` (credential-shaped
variables emptied) and the offline preload against the fresh isolated port-3782 server:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'multiple Scanner candidates export exactly the selected VEVENT subset', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

RED: exit 1 at the intended `expect(calendarText).toBe(expectedCalendar)` assertion.
The received calendar had eight additional lines: the complete first VEVENT with
`SUMMARY:Omit multi candidate` and `LOCATION:Archive room`, ahead of the two selected
VEVENTs. This is the required unselected-VEVENT/download-byte failure, not a setup,
compile, patch, timeout, or selection-control failure.

The explicit inverse production patch was:

```diff
--- src/components/review/ReviewDraftSection.tsx
-          <button type="button" onClick={() => onExport(drafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400" aria-label="Export selected review drafts">Export</button>
+          <button type="button" onClick={() => onExport(selectedDrafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400" aria-label="Export selected review drafts">Export</button>
```

`cmp -s src/components/review/ReviewDraftSection.tsx
/private/tmp/e1-m09.yfjvXW/ReviewDraftSection.tsx.pristine` exited 0, and both file
hashes returned to
`5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de`.

The restored-green proof used one controlled shell so the fresh offline server could
not become detached. It started the port-3782 server with an empty environment except
`PATH`, `E1_OFFLINE`, `E1_OFFLINE_PRELOAD`, and the preload-bearing `NODE_OPTIONS`,
waited only for `http://127.0.0.1:3782`, ran the exact same focused Chromium command,
and stopped the server through an `EXIT` trap. Playwright recorded:

```text
status: passed
failedTests: []
```

The temporary configuration inverses applied with `apply_patch` were:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3782';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3782`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
@@
-  webServer: undefined,
+  webServer: isProd
+    ? undefined
+    : {
+        command: devCommand,
+        url: localUrl,
+        reuseExistingServer: !isOffline && !process.env.CI,
+        timeout: 120000,
+      },

--- next.config.js
 const nextConfig = {
-  distDir: '.next-e1-m09',
   devIndicators: false,
```

Next also reformatted `tsconfig.json` and added `.next-e1-m09/types/**/*.ts` during
the temporary build. The path guard rejected that incidental file, so it was removed
with this explicit inverse patch before accepting gates:

```diff
--- tsconfig.json
-    "lib": [
-      "dom",
-      "dom.iterable",
-      "esnext"
-    ],
+    "lib": ["dom", "dom.iterable", "esnext"],
@@
-      "@/*": [
-        "./src/*"
-      ]
+      "@/*": ["./src/*"]
@@
-  "include": [
-    "**/*.ts",
-    "**/*.tsx",
-    ".next/types/**/*.ts",
-    "next-env.d.ts",
-    ".next-e1-m09/types/**/*.ts"
-  ],
-  "exclude": [
-    "node_modules"
-  ]
+  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
+  "exclude": ["node_modules"]
```

The restored `playwright.config.ts`, `next.config.js`, and `tsconfig.json` hashes
matched the pristine values above. The controlled server had already stopped; only
`.next-e1-m09` and `/private/tmp/e1-m09-server.log` were then removed. Shared `.next`,
the port-3777 server, and all production/config bytes outside the temporary mutations
were left untouched.

Focused local gates after restoration:

```text
bun test src/services/__tests__/scanClient.test.ts src/services/__tests__/scannerDraft.test.ts src/services/__tests__/scannerExporter.test.ts --isolate
30 pass, 0 fail, 99 expect() calls

node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts e2e/helpers.ts src/types/scanRequest.ts src/types/scannerHttp.ts
exit 0

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 187 changed path(s).

git diff --check
exit 0

```

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S09 | `--grep "multiple Scanner candidates export exactly the selected VEVENT subset" --project=chromium` | E1-M09 |

## E1-T8-RELOAD-READINESS-M10-RED

This row covers `reload restores raw-free Scanner drafts with recomputed readiness` in
`e2e/scanner-product-loop.spec.ts`. The scenario submits a real-schema candidate whose start is
absent, proves the live draft has Scanner's exact `missing_start` blocker and disabled export,
waits for the versioned review DTO, and asserts that the DTO has exactly `version`, `id`,
`exportUid`, `createdAt`, `candidate`, `scanIssues`, and opaque `source`. It additionally proves
that cached `readiness` and the unique raw submission are absent. After a real page reload, it
requires the same candidate title, the recomputed blocker, disabled export, and byte-identical
stored DTO.

The first pristine attempt is non-accepting discovery evidence: the shared `setupLocal()` helper
registers `localStorage.clear()` as an init script on every navigation, so it intentionally removed
the stored draft before product hydration. The scenario was repaired to register the same auth,
URL-detection, summary, and scan mocks directly in its isolated Playwright context without that
cross-navigation clear hook. No red claim uses the discovery run.

The unrelated listener on port 3777 was preserved. All accepting runs used credential-scrubbed
`createE1OfflineEnvironment()`, the offline preload, port 3783, and isolated `.next-e1-m10` bytes.
The temporary config patches were:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3783';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3783`

--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m10',
```

Pristine production evidence and pre-mutation hashes:

```text
/private/tmp/e1-m10.YMZWAO/reviewStorage.ts.pristine
7a86a8cafa90c43dc7119d438339ac83d6c792093551776d6e9d0be5c49a03f4  src/services/reviewStorage.ts
15ccc40aaee4d99f20b98082d1e0a30990dd317cd6e3aa7607133bff3260782c  e2e/scanner-product-loop.spec.ts
```

The repaired pristine scenario passed Chromium 1/1 on the fresh offline server. E1-M10 then used
this literal forward production patch:

```diff
--- src/services/reviewStorage.ts
-    const drafts = records.map((record) => createReviewDraft(
-      record.candidate,
-      record.scanIssues,
-      record.source,
-      {
-        id: record.id,
-        exportUid: record.exportUid,
-        createdAt: record.createdAt,
-      },
-    ));
+    const drafts = records.map((record) => ({
+      ...createReviewDraft(
+        record.candidate,
+        record.scanIssues,
+        record.source,
+        {
+          id: record.id,
+          exportUid: record.exportUid,
+          createdAt: record.createdAt,
+        },
+      ),
+      readiness: {
+        canGenerate: true as const,
+        warnings: [],
+        omittedFields: [],
+      },
+    }));
```

The mutated SHA-256 was
`36f5e583ff5e27cef2edb3de3d4465e9fbd3d08dad32e40542c27725eeec9eca`.
The exact focused command for pristine, RED, and restored-green runs was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval \
  "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'reload restores raw-free Scanner drafts with recomputed readiness', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

RED exited 1 at the intended post-reload assertion: the candidate and title restored, but the
`Export blockers for candidate-missing-start-1` region was absent instead of containing
`temporal · missing_start: The event start is missing.` This was the fabricated readiness defect,
not setup, compilation, timeout, pre-reload behavior, or corrupt hydration.

The explicit inverse production patch was:

```diff
--- src/services/reviewStorage.ts
-    const drafts = records.map((record) => ({
-      ...createReviewDraft(
-        record.candidate,
-        record.scanIssues,
-        record.source,
-        {
-          id: record.id,
-          exportUid: record.exportUid,
-          createdAt: record.createdAt,
-        },
-      ),
-      readiness: {
-        canGenerate: true as const,
-        warnings: [],
-        omittedFields: [],
+    const drafts = records.map((record) => createReviewDraft(
+      record.candidate,
+      record.scanIssues,
+      record.source,
+      {
+        id: record.id,
+        exportUid: record.exportUid,
+        createdAt: record.createdAt,
       },
-    }));
+    ));
```

`cmp -s` against the pristine evidence copy exited 0, the production hash returned to
`7a86a8ca...a03f4`, and the exact focused command passed restored Chromium 1/1 in 1.1 minutes.
Temporary config and Next-generated `tsconfig.json` changes were explicitly inverse-patched to
their recorded hashes (`fb2d0475...cc877`, `ffffb7aa...e4f920`, and `83d292a6...a3b9`), and only
the disposable `.next-e1-m10` directory was removed.

Fresh focused gates after restoration:

```text
bun test src/services/__tests__/reviewStorage.test.ts src/services/__tests__/scannerDraft.test.ts --isolate
18 pass, 0 fail, 93 expect() calls

node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts src/services/reviewStorage.ts
exit 0

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 187 changed path(s).

git diff --check
exit 0
```

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S10 | `--grep "reload restores raw-free Scanner drafts with recomputed readiness" --project=chromium` | E1-M10 |

## E1-T8-NARROW-ACCESSIBILITY-M11-RED

This row covers `narrow viewport keeps every Scanner review control keyboard reachable with stable
accessible names` in `e2e/scanner-product-loop.spec.ts`. At a 375×667 Chromium viewport it uses a
real `EventCandidateSchema` fixture, requires the exact accessible name of the review export
button, semantic UUID-bearing accessible names for the selection and dismissal controls, and named
Scan issues, Candidate issues, and Export warnings regions. It verifies the export → selection →
dismissal → every editable Scanner field tab sequence, including Title, Description, Location, URL,
Start date/time, End date/time, Timezone, All day, and Recurrence. The export locator deliberately
uses the exact literal `Export selected review drafts`, so this row catches removal of that name.

Two pristine discovery attempts are non-accepting and are not RED evidence: the first expected the
fixture candidate ID where production correctly uses the browser-created draft UUID; the second
expected `Description` even though a null description adds `Missing value` to the implicit label.
The scenario was narrowed to anchored semantic UUID patterns and a non-null description before any
M11 mutation. The corrected pristine scenario then passed 1/1 on a fresh server.

### Pristine evidence and isolated runtime

Evidence-only copies were created before configuration or production mutation under:

```text
/private/tmp/e1-m11.S3mysB/ReviewDraftSection.tsx.pristine
/private/tmp/e1-m11.S3mysB/playwright.config.ts.pristine
/private/tmp/e1-m11.S3mysB/next.config.js.pristine
/private/tmp/e1-m11.S3mysB/tsconfig.json.pristine
```

The pre-mutation SHA-256 inventory was:

```text
5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de  src/components/review/ReviewDraftSection.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
84c3ab517318ea1055c798e575c16e985fc54c5c5768795db1855aeca1683813  e2e/scanner-product-loop.spec.ts
```

The occupied port-3777 server was preserved. The following literal transient patches selected a
fresh local port-3778 server and disposable `.next-e1-m11` bytes; `webServer: undefined` let one
credential-scrubbed controller own startup, readiness, focused execution, and shutdown.

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3778';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3778`
@@
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,

--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m11',
   devIndicators: false,
```

The transient hashes were `0dcae42ddb9bb538369f564f3a88181d2f798d2526c7f60639c7542d40e551af`
for `playwright.config.ts` and `7fb0ef149399c23e741a4e2f5a12192b518502b45e87b8c620a669ef821d3ddf`
for `next.config.js`. Next reformatted `tsconfig.json` and appended
`.next-e1-m11/types/**/*.ts`; this generated-only change was inverse-patched before every fresh
run and finally restored to its recorded hash.

The exact generated `tsconfig.json` forward patch was:

```diff
--- tsconfig.json
-    "lib": ["dom", "dom.iterable", "esnext"],
+    "lib": [
+      "dom",
+      "dom.iterable",
+      "esnext"
+    ],
@@
-    "paths": {
-      "@/*": ["./src/*"]
-    }
+    "paths": {
+      "@/*": [
+        "./src/*"
+      ]
+    }
@@
-  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
-  "exclude": ["node_modules"]
+  "include": [
+    "**/*.ts",
+    "**/*.tsx",
+    ".next/types/**/*.ts",
+    "next-env.d.ts",
+    ".next-e1-m11/types/**/*.ts"
+  ],
+  "exclude": [
+    "node_modules"
+  ]
 }
```

Every accepting run used `createE1OfflineEnvironment()` (which empties credential-shaped current
and `.env.local` variables), the offline preload, and this focused command inside a controller that
started `node --require=$E1_OFFLINE_PRELOAD node_modules/next/dist/bin/next dev -p 3778`, waited
only on `http://127.0.0.1:3778`, and stopped that PID in its `EXIT` trap:

```bash
node --require=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  node_modules/@playwright/test/cli.js test e2e/scanner-product-loop.spec.ts \
  --project=chromium \
  --grep "narrow viewport keeps every Scanner review control keyboard reachable with stable accessible names" \
  --reporter=line --output /private/tmp/e1-m11.S3mysB/<run>-test-results
```

The corrected pristine command passed Chromium 1/1 (`status: passed`, `failedTests: []`).

### E1-M11 — review export must retain its accessible name

Forward production patch, applied with `apply_patch`:

```diff
--- src/components/review/ReviewDraftSection.tsx
-          <button type="button" onClick={() => onExport(selectedDrafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400" aria-label="Export selected review drafts">Export</button>
+          <button type="button" onClick={() => onExport(selectedDrafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400">Export</button>
```

The mutated production SHA-256 was:

```text
c2d8f6c27cf4efe4f32ec99cce5078977ecda84989aeb845715f2c0cbb4cfccb  src/components/review/ReviewDraftSection.tsx
```

RED exited 1 at the intended first export assertion:

```text
Locator: getByRole('region', { name: 'Scanner review drafts' }).getByRole('button', { name: 'Export selected review drafts', exact: true })
Expected: enabled
Error: element(s) not found
```

Removing the explicit label changed the export control's accessible name to the fallback `Export`,
so the required stable name `Export selected review drafts` was removed and the exact role/name
locator could not resolve it. This is the intended M11 accessibility-contract failure, not a patch,
compile, setup, timeout, or stale-server failure.

The explicit inverse production patch was:

```diff
--- src/components/review/ReviewDraftSection.tsx
-          <button type="button" onClick={() => onExport(selectedDrafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400">Export</button>
+          <button type="button" onClick={() => onExport(selectedDrafts)} disabled={selectedDrafts.length === 0 || blocked} className="border-2 border-black bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400" aria-label="Export selected review drafts">Export</button>
```

`cmp -s src/components/review/ReviewDraftSection.tsx
/private/tmp/e1-m11.S3mysB/ReviewDraftSection.tsx.pristine` exited 0. The restored SHA-256 returned
to `5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de`, and the exact focused
restored-green command passed Chromium 1/1 in 8.5 seconds.

The explicit inverse temporary-config patch was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3778';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3778`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
@@
-  webServer: undefined,
+  webServer: isProd
+    ? undefined
+    : {
+        command: devCommand,
+        url: localUrl,
+        reuseExistingServer: !isOffline && !process.env.CI,
+        timeout: 120000,
+      },

--- next.config.js
 const nextConfig = {
-  distDir: '.next-e1-m11',
   devIndicators: false,
```

The generated TypeScript inverse restored compact `lib`/`paths`, removed
`.next-e1-m11/types/**/*.ts` from `include`, and restored the original include order. `cmp -s`
against all three pristine config copies exited 0; their final SHA-256 values are respectively
`fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877`,
`ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920`, and
`83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9`. The isolated port-3778
server was stopped by the controller; only `.next-e1-m11` and this proof's temporary Playwright/log
artifacts were removed. Shared `.next` and port 3777 were untouched.

The exact generated `tsconfig.json` inverse patch was:

```diff
--- tsconfig.json
-    "lib": [
-      "dom",
-      "dom.iterable",
-      "esnext"
-    ],
+    "lib": ["dom", "dom.iterable", "esnext"],
@@
-    "paths": {
-      "@/*": [
-        "./src/*"
-      ]
-    }
+    "paths": {
+      "@/*": ["./src/*"]
+    }
@@
-  "include": [
-    "**/*.ts",
-    "**/*.tsx",
-    ".next/types/**/*.ts",
-    "next-env.d.ts",
-    ".next-e1-m11/types/**/*.ts"
-  ],
-  "exclude": [
-    "node_modules"
-  ]
+  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
+  "exclude": ["node_modules"]
 }
```

Fresh post-M11 gates run by the parent orchestrator after all restoration passed:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts
exit 0

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 187 changed path(s).

git diff --check
exit 0
```

The exact current `git status --short` inventory after M11 restoration and gates was:

```text
 M docs/superpowers/plans/2026-07-29-event-every-scanner-product-loop.md
 M e2e/helpers.ts
 M scripts/assert-e1-paths.ts
 M src/types/scannerHttp.ts
?? .claude/
?? docs/testing/
?? e2e/scanner-product-loop.spec.ts
?? src/types/scanRequest.ts
?? tasks/task-192.md
?? tasks/task-193.md
```

The cumulative path guard unions committed `4cc32012...HEAD`, cached, and unstaged tracked paths;
it does not enumerate the allowed untracked Task 8 spec and ledger. The exact status inventory plus
Task 8 file-map accounting therefore covers `e2e/scanner-product-loop.spec.ts`,
`docs/testing/e1-mutation-ledger.md`, and `src/types/scanRequest.ts`. The untracked `.claude/**`,
`tasks/task-192.md`, and `tasks/task-193.md` remain protected user paths and were neither staged nor
modified by M11.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S11 | `--grep "narrow viewport keeps every Scanner review control keyboard reachable with stable accessible names" --project=chromium` | E1-M11 |

## E1-T8-DST-FOLD-M12-RED

This row covers `evidence-free DST-fold edit stays blocked until clearing timezone makes it a
floating warning` in `e2e/scanner-product-loop.spec.ts`. The scenario intercepts only `/api/scan`,
validates the request with `ScanRequestSchema`, and returns a real `EventCandidateSchema` candidate.
A human edit makes the start 2026-11-01 01:30 in `America/New_York`, Scanner's autumn DST fold. It
proves persisted `resolution: 'fold'`, two possible offsets, `sourceOffset: null`,
`chosenOffset: null`, and `evidence: []`; then requires the rendered `temporal · dst_fold` blocker
and a disabled Export button. This deliberately distinguishes blocker visibility from the UI
disabled predicate. Clearing timezone must yield an evidence-free floating point, no blocker,
Scanner's `floating_time` warning, enabled Export, and floating `DTSTART:20261101T013000` without
`TZID=America/New_York`.

No discovery failure was accepted. Pristine copies were created under `/private/tmp/e1-m12.FMPdOS`
with `mktemp -d`, then `cmp -s` verified every copy before mutation:

```text
5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de  src/components/review/ReviewDraftSection.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
3a4c0cb35e8cafb81b90763d6adbcaf486d79bae0eaf476be593be41e2592ed9  e2e/scanner-product-loop.spec.ts
```

E1-M12 forward product patch, applied with `apply_patch`:

    - const blocked = selectedDrafts.some((draft) => !draft.readiness.canGenerate);
    + const blocked = selectedDrafts.some((draft) =>
    +   !draft.readiness.canGenerate && draft.readiness.blockers.some(({ code }) => code !== 'dst_fold'),
    + );

This is intentionally narrow: a selected draft whose only blocker is `dst_fold` becomes falsely
exportable, but drafts with another blocker remain blocked. The mutated product SHA-256 was
`0a49c2d9a37100be3a49b49685b01f86c0814b34df277e23d2bf790457ce7add`.

Fresh isolated-server forward patches, also applied with `apply_patch`:

    playwright.config.ts
    - const localUrl = 'http://localhost:3777';
    + const localUrl = 'http://localhost:3782';
    - webServer: isProd
    -   ? undefined
    -   : {
    -       command: devCommand,
    -       url: localUrl,
    -       reuseExistingServer: !isOffline && !process.env.CI,
    -       timeout: 120000,
    -     },
    + webServer: undefined,

    next.config.js
      const nextConfig = {
    +   distDir: '.next-e1-m12',

The controlled Next start generated this exact `tsconfig.json` forward patch:

    -    "lib": ["dom", "dom.iterable", "esnext"],
    +    "lib": [
    +      "dom",
    +      "dom.iterable",
    +      "esnext"
    +    ],
    @@
    -    "paths": {
    -      "@/*": ["./src/*"]
    -    }
    +    "paths": {
    +      "@/*": [
    +        "./src/*"
    +      ]
    +    }
    @@
    -  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    -  "exclude": ["node_modules"]
    +  "include": [
    +    "**/*.ts",
    +    "**/*.tsx",
    +    ".next/types/**/*.ts",
    +    "next-env.d.ts",
    +    ".next-e1-m12/types/**/*.ts"
    +  ],
    +  "exclude": [
    +    "node_modules"
    +  ]

Transient hashes:

```text
0a49c2d9a37100be3a49b49685b01f86c0814b34df277e23d2bf790457ce7add  src/components/review/ReviewDraftSection.tsx
a65543d04879269e6935e5175767f3e5d20f47e6428c66ebd8a38641760634b9  playwright.config.ts
808487503b2c3172ab48621821185a7011e48fe0db01a59541af7d8426310497  next.config.js
fac56cc31786491fe808e55aca25f28a4db88ed7a28832c3213490b5387ab8ee  tsconfig.json
```

Every browser run used this credential-scrubbed, egress-blocked local controller; it owned fresh
port 3782 and `.next-e1-m12`, never port 3777 or shared `.next`:

```bash
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin E1_OFFLINE=1 \
  E1_OFFLINE_PRELOAD=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  NODE_OPTIONS=--require=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  node --require=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  node_modules/next/dist/bin/next dev -p 3782

bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'evidence-free DST-fold edit stays blocked', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

The mutated focused Chromium run exited 1 at the intended fold-stage causal assertion, not at
compile/setup/timeout/floating stage:

```text
expect(locator).toBeDisabled() failed
Locator: getByRole('region', { name: 'Scanner review drafts' }).getByRole('button', { name: 'Export selected review drafts' })
Expected: disabled
Received: enabled
e2e/scanner-product-loop.spec.ts:535:30
```

Explicit product inverse, applied with `apply_patch` (never copied over the repository file):

    - const blocked = selectedDrafts.some((draft) =>
    -   !draft.readiness.canGenerate && draft.readiness.blockers.some(({ code }) => code !== 'dst_fold'),
    - );
    + const blocked = selectedDrafts.some((draft) => !draft.readiness.canGenerate);

`cmp -s src/components/review/ReviewDraftSection.tsx
/private/tmp/e1-m12.FMPdOS/ReviewDraftSection.tsx.pristine` exited 0; restored product SHA-256 was
`5382f9ecfd2251ca1937cdeceb86ed4e6ddd28a8e33e1b39f8b039c276f272de`. The same exact focused
controller command then passed restored green:

```text
1 passed (38.5s)
```

After stopping only port 3782, these literal config inverses were applied with `apply_patch`:

    playwright.config.ts
    - const localUrl = 'http://localhost:3782';
    + const localUrl = 'http://localhost:3777';
    - webServer: undefined,
    + webServer: isProd
    +   ? undefined
    +   : {
    +       command: devCommand,
    +       url: localUrl,
    +       reuseExistingServer: !isOffline && !process.env.CI,
    +       timeout: 120000,
    +     },

    next.config.js
    -   distDir: '.next-e1-m12',

The exact generated TypeScript inverse was:

    -    "lib": [
    -      "dom",
    -      "dom.iterable",
    -      "esnext"
    -    ],
    +    "lib": ["dom", "dom.iterable", "esnext"],
    @@
    -    "paths": {
    -      "@/*": [
    -        "./src/*"
    -      ]
    -    }
    +    "paths": {
    +      "@/*": ["./src/*"]
    +    }
    @@
    -  "include": [
    -    "**/*.ts",
    -    "**/*.tsx",
    -    ".next/types/**/*.ts",
    -    "next-env.d.ts",
    -    ".next-e1-m12/types/**/*.ts"
    -  ],
    -  "exclude": [
    -    "node_modules"
    -  ]
    +  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    +  "exclude": ["node_modules"]

`cmp -s` against all three pristine configuration copies exited 0, restoring the three pristine
configuration hashes. Only `.next-e1-m12` and this proof-copy directory were then removed; shared
`.next` was not touched.

Focused restored gates passed in the sanitized offline environment:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts src/components/review/ReviewDraftSection.tsx
exit 0

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 187 changed path(s).

git diff --check
exit 0
```

At the proof boundary, no product/config mutation remains. Exact status accounting is:

```text
 M docs/superpowers/plans/2026-07-29-event-every-scanner-product-loop.md
 M e2e/helpers.ts
 M scripts/assert-e1-paths.ts
 M src/types/scannerHttp.ts
?? .claude/
?? docs/testing/
?? e2e/scanner-product-loop.spec.ts
?? src/types/scanRequest.ts
?? tasks/task-192.md
?? tasks/task-193.md
```

The protected `.claude/**`, `tasks/task-192.md`, and `tasks/task-193.md` were not staged or
modified. The cumulative path guard excludes allowed untracked Task 8 artifacts, so this status
accounts separately for the spec, ledger, and scan-request type.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S12 | `--grep "evidence-free DST-fold edit stays blocked" --project=chromium` | E1-M12 |

## E1-T8-MIXED-INPUT-M13-RED

This row covers `mixed text and image input stays drafted, reports the deferral, and makes no scan
request` in `e2e/scanner-product-loop.spec.ts`. It submits non-whitespace SmartInput text together
with a valid 1x1 PNG through the real file input. An intercepted `/api/scan` route counts every
request and locally returns 500 if one is made. The pristine scenario requires the original text,
then hovers the preserved preview and requires its exact rendered filename `mixed-flyer.png`. It
locates the deferral via `role=alert` containing the exact text `Scan text and images separately for
now.`, and waits 500ms before requiring zero intercepted scan requests. It does not load a provider
transport or credential.

Pristine evidence copies were created under `/private/tmp/e1-m13-sanitized.BviRbc` before mutation:

```text
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f  src/app/page.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
7f533f636a1fd133a47d2203578cd5a72fd91a4219faadb6de4cdcd25cd0fc3b  e2e/scanner-product-loop.spec.ts
```

For the fresh, credential-scrubbed, egress-blocked proof, literal transient patches selected port
3783, disabled Playwright's managed server, and isolated build output:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3783';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3783`
@@
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m13',
```

The controlled Next start generated this literal TypeScript patch:

```diff
-    "lib": ["dom", "dom.iterable", "esnext"],
+    "lib": [
+      "dom",
+      "dom.iterable",
+      "esnext"
+    ],
@@
-    "paths": {
-      "@/*": ["./src/*"]
-    }
+    "paths": {
+      "@/*": [
+        "./src/*"
+      ]
+    }
@@
-  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
-  "exclude": ["node_modules"]
+  "include": [
+    "**/*.ts",
+    "**/*.tsx",
+    ".next/types/**/*.ts",
+    "next-env.d.ts",
+    ".next-e1-m13/types/**/*.ts"
+  ],
+  "exclude": [
+    "node_modules"
+  ]
```

Transient config SHA-256 values were
`5d2e14d7c474117d28ca761654a8223e1520cacaaedd35ace4d964ec3424b495`
(`playwright.config.ts`),
`f714c33d9aef3b3719f3edeb43f157ee8f2d27b3c902516af555300dee5301f5`
(`next.config.js`), and
`eecd21958092c93460800117341975ca017e67c5f881e6c0e1b4ac1cc1e7bff`
(`tsconfig.json`). The exact credential-scrubbed, egress-blocked server launch was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/next/dist/bin/next', 'dev', '-p', '3783'], { env, stdout: 'inherit', stderr: 'inherit' }); const stop = () => child.kill(); process.on('SIGINT', stop); process.on('SIGTERM', stop); await child.exited;"
```

`createE1OfflineEnvironment()` supplied the child environment; it predeclares discovered sensitive
names as empty and supplies the offline preload. No environment values were printed.

It produced the following relevant ready output before Playwright ran:

```text
▲ Next.js 15.5.9
- Local:        http://localhost:3783
- Network:      http://192.168.1.61:3783
- Environments: .env.local
✓ Starting...

We detected TypeScript in your project and reconfigured your tsconfig.json file for you.
The following suggested values were added to your tsconfig.json. These values can be changed to fit your project's needs:

  - include was updated to add '.next-e1-m13/types/**/*.ts'

✓ Ready in 5.4s
```

The pristine focused command was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'mixed text and image input stays drafted', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
# 1 passed (32.8s)
```

E1-M13 forward production patch, applied with `apply_patch`:

```diff
-    if (text.trim().length > 0 && images.length > 0) {
-      const id = `error-${Date.now()}`;
-      setProcessingEvents((previous) => [...previous, {
-        id,
-        type: 'text',
-        status: 'error',
-        error: 'Scan text and images separately for now.',
-      }]);
-      setTimeout(() => setProcessingEvents((previous) => previous.filter((item) => item.id !== id)), 5000);
-      return;
-    }
-
```

The mutated page SHA-256 was
`47b91f3eab23371c9f45d654087b2c0b87526abec4fc6ced61472e529de20c36`.
The same focused command exited 1 at the intended draft-preservation assertion—not setup,
compilation, timing, or an unrelated assertion:

```text
expect(locator).toHaveText(expected) failed
Locator: getByTestId('smart-input-textarea')
Expected: "Keep this mixed draft ready for separate scans."
Received: ""
e2e/scanner-product-loop.spec.ts:374:26
```

Without the guard, the image path proceeds and SmartInput clears both drafts. The scenario's
intercepted-network assertion waits 500ms and then requires `scanRequestCount` to equal zero, so the
pristine path proves neither source reaches `/api/scan` during a meaningful quiet window.

Explicit E1-M13 inverse production patch, applied with `apply_patch`:

```diff
   const handleSmartInputSubmit = async (data: { text: string; images: File[]; calendarFiles: File[] }) => {
     const { text, images, calendarFiles } = data;

+    if (text.trim().length > 0 && images.length > 0) {
+      const id = `error-${Date.now()}`;
+      setProcessingEvents((previous) => [...previous, {
+        id,
+        type: 'text',
+        status: 'error',
+        error: 'Scan text and images separately for now.',
+      }]);
+      setTimeout(() => setProcessingEvents((previous) => previous.filter((item) => item.id !== id)), 5000);
+      return;
+    }
+
```

`cmp -s src/app/page.tsx /private/tmp/e1-m13-sanitized.BviRbc/page.tsx.pristine` exited 0; the restored
page SHA-256 returned to
`775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f`.
The same command then passed restored green: `1 passed (7.2s)`.

After stopping only the controlled port-3783 server, these literal config inverses were applied:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3783';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3783`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
@@
-  webServer: undefined,
+  webServer: isProd
+    ? undefined
+    : {
+        command: devCommand,
+        url: localUrl,
+        reuseExistingServer: !isOffline && !process.env.CI,
+        timeout: 120000,
+      },
--- next.config.js
-  distDir: '.next-e1-m13',
```

The exact TypeScript inverse was:

```diff
-    "lib": [
-      "dom",
-      "dom.iterable",
-      "esnext"
-    ],
+    "lib": ["dom", "dom.iterable", "esnext"],
@@
-    "paths": {
-      "@/*": [
-        "./src/*"
-      ]
-    }
+    "paths": {
+      "@/*": ["./src/*"]
+    }
@@
-  "include": [
-    "**/*.ts",
-    "**/*.tsx",
-    ".next/types/**/*.ts",
-    "next-env.d.ts",
-    ".next-e1-m13/types/**/*.ts"
-  ],
-  "exclude": [
-    "node_modules"
-  ]
+  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
+  "exclude": ["node_modules"]
```

All three config copies compared byte-identically (each `cmp -s` exit 0), their SHA-256 values
returned to the pristine values above, and only `.next-e1-m13` was removed. Shared `.next` and
port 3777 were not touched.

Focused post-restoration gates:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts
exit 0

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 187 changed path(s).

git diff --check
exit 0
```

Only this scenario maps to E1-M13; no other Task 8 scenario was changed.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S13 | `--grep "mixed text and image input stays drafted" --project=chromium` | E1-M13 |

## E1-T8-MULTI-IMAGE-M14-RED

This row covers the two multi-image scenarios in `e2e/scanner-product-loop.spec.ts`:
`two named images scan strictly in order and retain both distinct Scanner candidates` and
`canceling after a held first image scan prevents the second request and creates no Scanner draft`.
Both fixtures are built with the authoritative `EventCandidateSchema`, and every intercepted body
is parsed by the authoritative `ScanRequestSchema`.

The ordered scenario uploads and proves the two distinct names `sequential-first.png` and
`sequential-second.png`, then holds the first `/api/scan` response. It waits a real 500 ms before
releasing it and requires `requestCount === 1`; only then does it release the response, observe
request two, and require the ordered persisted candidate IDs
`candidate-image-sequential-first`, `candidate-image-sequential-second`. The cancellation scenario
holds response one, cancels while it is held, releases it, waits for route settlement, and requires
exactly one request, no review region, and no persisted draft. Thus the request-order/release and
cancel-before-second behavior are independently visible even though the causal M14 RED below is
the ordered scenario.

Pristine, mutated, and restored page hashes:

```text
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f  src/app/page.tsx  (pristine/restored)
be647430fc111d9458540cca63665498f0d3a7bb75630ae954dffc960ba6100f  src/app/page.tsx  (E1-M14)
```

E1-M14 forward production patch (the smallest literal sequential-loop replacement; callback
`return`s are the syntax-preserving equivalents of the loop's three `break`s):

```diff
-        for (let index = 0; index < imageFiles.length; index += 1) {
-          if (controller.signal.aborted) break;
+        await Promise.all(imageFiles.map(async (_, index) => {
+          if (controller.signal.aborted) return;
           const status = statuses[index];
           setImageProcessingStatuses((previous) => previous.map((item) =>
             item.id === status.id ? { ...item, status: 'processing' as const } : item,
@@
           updateProgress(queueItem.id, Math.round((index / imageFiles.length) * 100));
           const dataUrl = await fileToDataUrl(imageFiles[index]);
-          if (controller.signal.aborted || activeSubmissionRef.current !== batchId) break;
+          if (controller.signal.aborted || activeSubmissionRef.current !== batchId) return;
           const drafts = await runScan({ kind: 'image', dataUrl }, controller.signal);
-          if (controller.signal.aborted || activeSubmissionRef.current !== batchId) break;
+          if (controller.signal.aborted || activeSubmissionRef.current !== batchId) return;
           titles.push(...drafts.map((draft) => draft.candidate.title.value).filter((title): title is string => title !== null));
           setImageProcessingStatuses((previous) => previous.map((item) =>
             item.id === status.id ? { ...item, status: 'complete' as const, eventCount: drafts.length } : item,
           ));
-        }
+        }));
```

The literal inverse replaced `await Promise.all(imageFiles.map(async (_, index) => {` with the
original `for (let index = 0; index < imageFiles.length; index += 1) {`, restored each of the
three `return`s to its original `break`, and replaced `}));` with `}`. The restored SHA-256 exactly
matches the pre-mutation SHA-256 above, establishing restored byte identity for the production file.

A fresh credential-scrubbed, egress-blocked server was started through
`createE1OfflineEnvironment()` on isolated port 3784 and isolated `.next-e1-m14`; port 3777 and
its shared `.next` were never stopped or modified. The exact launch command was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node', '--require', env.E1_OFFLINE_PRELOAD, 'node_modules/next/dist/bin/next', 'dev', '-p', '3784'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(await child.exited);"
```

The isolated launch reported `Local: http://localhost:3784` and `Ready in 4s`. For the two focused
green runs and the causal red, the exact test command was the same sanitized launcher, with the
grep varied only as noted:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/scanner-product-loop.spec.ts', '--project=chromium', '--grep', 'two named images|canceling after a held first image scan', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

Pristine output was `2 passed (9.3s)`. With E1-M14 applied, the single ordered scenario used
`--grep 'two named images scan strictly in order'` and exited 1 at the intended assertion:

```text
e2e/scanner-product-loop.spec.ts:414
Expected: 1
Received: 2
```

This assertion runs after response one is still deliberately held for 500 ms, so the red proves
that request two began early; it is neither a compile, setup, nor timeout failure. After the
literal inverse, the two-scenario restored command above exited 0 with `2 passed (9.4s)`.

Independent Sol/high acceptance review replayed the exact mutation in the credential-free copy
`/private/tmp/e1-m14-independent-review.LvfPjk/repo`, excluding `.git`, `.claude`, `.env*`,
`node_modules`, `.next*`, and prior report/result directories; the copy symlinked only the accepted
candidate's `node_modules`. The review used isolated port 3785 and `.next-e1-m14-review` through
`createE1OfflineEnvironment()` and ran both mapped scenarios together with this exact command:

```bash
bun --preload=/private/tmp/e1-m14-independent-review.LvfPjk/repo/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node','--require',env.E1_OFFLINE_PRELOAD,'node_modules/@playwright/test/cli.js','test','e2e/scanner-product-loop.spec.ts','--project=chromium','--grep','two named images|canceling after a held first image scan','--reporter=line'], { env, stdout:'inherit', stderr:'inherit' }); process.exit(result.exitCode ?? 1);"
```

The pristine review-copy run passed `2 passed (36.9s)`. The exact `Promise.all` patch reproduced
mutated page hash `be647430fc111d9458540cca63665498f0d3a7bb75630ae954dffc960ba6100f`
and made both mapped scenarios fail for their intended behavior:

```text
e2e/scanner-product-loop.spec.ts:414
Expected: 1
Received: 2

e2e/scanner-product-loop.spec.ts:450
Error: Canceled image batch unexpectedly started request 2

2 failed
```

The literal inverse restored page hash
`775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f`, compared byte-identically
to the pristine review copy, and the same two-scenario command returned `2 passed (50.8s)`.

Transient isolation was literal and byte-restored: `playwright.config.ts` temporarily used
`localhost:3784`, port `3784`, and `webServer: undefined`; `next.config.js` temporarily added
`distDir: '.next-e1-m14'`; Next's generated `tsconfig.json` formatting/include change was
inverse-patched. Their restored hashes were:

```text
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
```

Only the controlled port-3784 server was stopped; `.next-e1-m14`, `test-results`, and
`playwright-report` were removed. Port 3784 was closed afterward, while the pre-existing port-3777
server remained listening. Focused post-restoration gates:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts
exit 0

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 187 changed path(s).

git diff --check
exit 0
```

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S14 | `--grep "two named images scan strictly in order" --project=chromium` | E1-M14 |
| E1-T8-S15 | `--grep "canceling after a held first image scan" --project=chromium` | E1-M14 |

## E1-T8-COMMUNITY-LIMIT-M15-RED

This row migrates only `a mid-session community 402 flips the app to the limit screen`
in `e2e/community-limit.spec.ts`. The old `/api/parse` fixture was replaced with an
`/api/scan` interception. It parses the actual browser body with the authoritative
`ScanRequestSchema`, exact-matches `{ kind: 'text', text: 'Dinner with Sam tomorrow at
7pm' }`, fulfills an exact HTTP `402` / `community_limit` / `RESET_AT` body, then
asserts that same intercepted response's status and JSON before asserting the visible
community-limit screen and localized reset time. This is a downstream browser contract:
Playwright interception does **not** execute or prove `src/app/api/scan/route.ts`.

The independent production-route contract is the existing real-adapter route unit table
in `src/app/api/scan/__tests__/route.test.ts`, specifically `/api/scan > maps a provider
HTTP 402 without upstream details`. Its mocked transport returns the upstream HTTP
failure through the real scanner adapter; it asserts the route's HTTP `402`,
`community_limit`, and reset-field response contract. It is therefore the honest catching
test for E1-M15, while the browser scenario proves only the client handling of that
contract.

Pristine and restored hashes:

```text
dd44e98fa792d1e77826f561de69fad1734a33cc2b02cca28e6897f6257ec517  e2e/community-limit.spec.ts (before durable migration)
38027263eca39a49aca12da35a6f2baf7a3df3347da476679e1d5085c16ccd02  e2e/community-limit.spec.ts (durable migration)
68335293324fd6c5a5e2397e31992792009431f9689d7be1363a9cb52b6ee025  src/app/api/scan/route.ts (pristine/restored)
b230387a21a438f88fd7d8f9849ce11d0f8bd9f224836a6f341d42f8ff4c8a83  src/app/api/scan/route.ts (E1-M15)
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts (pristine/restored)
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js (pristine/restored)
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json (pristine/restored)
```

E1-M15 forward production patch:

```diff
-      if (mode === 'community' && error.status === 402) {
+      if (mode === 'community' && error.status === 403) {
```

This literal change makes a community-mode upstream `402` bypass
`communityLimitResponse` and take the generic `scan_provider_failed` `502` branch.
The focused credential-scrubbed/offline route command exited 1 at the intended assertion,
not setup or transport:

```text
/api/scan > maps a provider HTTP 402 without upstream details
src/app/api/scan/__tests__/route.test.ts:194:29
Expected: 402
Received: 502
15 pass
1 fail
60 expect() calls
```

The exact inverse was:

```diff
-      if (mode === 'community' && error.status === 403) {
+      if (mode === 'community' && error.status === 402) {
```

After the inverse, the route SHA-256 returned exactly to `68335293324fd6c5a5e2397e31992792009431f9689d7be1363a9cb52b6ee025`.
The restored focused route run passed `16 pass`, `0 fail`, `67 expect() calls`, including
the community upstream-402 row, and emitted `E1_M15_ROUTE_RESTORED_EXIT=0`.

The browser was fresh, credential-scrubbed, and egress-blocked through
`createE1OfflineEnvironment()` and `scripts/e1-offline-preload.cjs`. Its only server was
the controlled port `3786` Next process and its only build directory was `.next-e1-m15`;
the preserved port `3777` server and shared `.next` were not touched. The exact server
launcher was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node', '--require', env.E1_OFFLINE_PRELOAD, 'node_modules/next/dist/bin/next', 'dev', '-p', '3786'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(await child.exited);"
```

Both the pristine durable scenario and the post-route-inverse rerun invoked only:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/community-limit.spec.ts', '--project=chromium', '--grep', 'a mid-session community 402 flips the app to the limit screen', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); const exitCode = result.exitCode ?? 1; console.log('E1_M15_BROWSER_RESTORED_EXIT=' + exitCode); process.exit(exitCode);"
```

Each run discovered the one named Chromium scenario. Playwright line-reporter control
output did not preserve the terminal `E1_M15_BROWSER_RESTORED_EXIT` marker in the captured
transcript; the outer run completed successfully, and before cleanup its
`test-results/.last-run.json` recorded exactly `{ "status": "passed", "failedTests": [] }`.
That is the browser green evidence, and it remains deliberately limited to the intercepted
downstream screen/reset contract; no browser claim is made about server-route execution.

The transient isolation forward patch was literal:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3786';
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3786`
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m15',
```

Next mechanically reformatted `tsconfig.json` and added `.next-e1-m15/types/**/*.ts` to
`include`; its transient SHA-256 was
`74600308c35672b53cb39e3fd048de6fe39983c7f9e7bf7b171c516e0cee2adc`.
The complete inverse restored port `3777`, the original Playwright `webServer` block,
removed the `distDir`, collapsed the reformatted `lib`, `paths`, and `exclude` arrays,
and restored `include` exactly to
`["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`.
All three config files returned byte-identically to the pristine hashes above.
Only the controlled port-3786 process was stopped; `.next-e1-m15` and `test-results` were
removed, `lsof` found no listener on 3786, and no provider request or credential use occurred.

Focused final gates:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/community-limit.spec.ts src/app/api/scan/route.ts src/app/api/scan/__tests__/route.test.ts
exit 0

bun test src/app/api/scan/__tests__/route.test.ts --isolate
16 pass, 0 fail, 67 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 187 changed path(s).

git diff --check
exit 0
```

Only this migrated scenario maps to E1-M15.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S16 | `e2e/community-limit.spec.ts --grep "a mid-session community 402" --project=chromium` | E1-M15 |

## E1-T8-URL-ENRICHMENT-M16-RED

This row migrates only the stale URL scrape scenario in e2e/url-scrape.spec.ts:
the scrape branch sends host-enriched text to Scanner and renders its review candidate.
The prior legacy mockParseAPI fixture and event-card assertion were removed. The durable
test now intercepts only /api/scan, parses its actual browser request through the
authoritative ScanRequestSchema, and exact-matches the host-enriched text:

~~~text
See

Original Event: https://example.com/my-event
Join us June 30 2026 at 6pm at HQ

for details.
~~~

The intercepted response is built through the real EventCandidateSchema with every
claim-evidence source ID equal to source-url-enriched-1. It then proves the real Scanner
review UI by requiring the Scanner review region and the review Title textbox value
Launch Party scanner candidate. It records exactly one scan request. The text is the
actual production buildEnrichedUrlText result for the typed URL context and successful
scrape result; it is not duplicated helper logic in the test.

The durable spec SHA-256 after this migration is:

~~~text
f41118e605fb19eb4fab2177fb443a36d187cde9a85c00b0056e893d3564f9a7  e2e/url-scrape.spec.ts
~~~

E1-M16's literal forward production patch was:

~~~diff
-          combinedText = buildEnrichedUrlText(inputText, detection.urls, detection.remainingText, scraped.results);
+          combinedText = buildEnrichedUrlText(inputText, detection.urls, detection.remainingText, scraped.results.map((result) => result.status === 'success' ? { ...result, text: '' } : result));
~~~

It omits only successful scraped URL text at the page's host-enriched scan-request
callsite; the original URL, source prose, unsuccessful results, detection, scraping, and
all other submission behavior remain unchanged. The pristine/restored page SHA-256 was
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f.
The mutated page SHA-256 was
06a8433a4b665b7898a4de431e3dc671ea8877fc9ca143554a4f33f7a61f88cf.

The focused browser command for the pristine, mutated, and post-inverse runs was:

~~~bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/url-scrape.spec.ts', '--project=chromium', '--grep', 'the scrape branch sends host-enriched text to Scanner and renders its review candidate', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
~~~

The controlled server launcher was:

~~~bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node', '--require', env.E1_OFFLINE_PRELOAD, 'node_modules/next/dist/bin/next', 'dev', '-p', '3787'], { env, stdout: 'inherit', stderr: 'inherit' }); const stop = () => child.kill(); process.on('SIGINT', stop); process.on('SIGTERM', stop); process.exit(await child.exited);"
~~~

Every accepting browser proof run used createE1OfflineEnvironment(), the offline preload, a fresh
credential-scrubbed and egress-blocked controlled Next server on port 3787, and the
isolated .next-e1-m16 build directory. The server was ready in 3.6 seconds. Port 3777
and the shared .next directory were not used by those proof runs.

The mutation run made exactly the intended request-enrichment assertion red. The
mutation run's test-results status was failed, and its extracted test.trace reports:

~~~text
e2e/url-scrape.spec.ts:91:23
Expected request text line: Join us June 30 2026 at 6pm at HQ
Received: an empty line after Original Event: https://example.com/my-event
~~~

The later missing Scanner review region is downstream of the rejected intercepted request,
so it is not counted as the RED. This was neither a compile failure nor unrelated setup
failure: the exact E1-M16 omission removed the successful scrape text required by the
strict request assertion.

The literal inverse was:

~~~diff
-          combinedText = buildEnrichedUrlText(inputText, detection.urls, detection.remainingText, scraped.results.map((result) => result.status === 'success' ? { ...result, text: '' } : result));
+          combinedText = buildEnrichedUrlText(inputText, detection.urls, detection.remainingText, scraped.results);
~~~

After that inverse, the page returned byte-identically to
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f.
The pristine and restored focused Chromium runs each discovered the one named scenario
and completed without failure. The line reporter obscured its terminal summary in the
captured transcript, so this ledger does not invent a pass-count or an exit-marker
transcript that was not retained.

The transient isolation forward patch changed localhost/port 3777 to 3787, set the
Playwright webServer field to undefined, and added next.config.js distDir
.next-e1-m16. Next's normal tsconfig.json generated change was observed and inverse-patched
after the run. All transient config bytes were restored exactly:

~~~text
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
~~~

The controlled port-3787 server was stopped; the isolated build/output artifacts were
absent afterward, while port 3777 remained listening. No provider request or credentials
were used.

After that accepted cleanup, one non-accepting attempt to obtain a JSON reporter transcript
mistakenly launched port 3787 after the isolated config had already been restored. It produced no
JSON result or test artifacts and was stopped immediately; source and config hashes remained
unchanged. Because that diagnostic could have consulted the shared `.next`, it is excluded from
the M16 proof and this ledger does not claim the shared cache was untouched by that later attempt.
The pre-existing port-3777 server remained listening throughout.

Focused final gates:

~~~text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/url-scrape.spec.ts src/app/page.tsx
exit 0

bun test src/services/__tests__/urlServices.test.ts --isolate
7 pass, 0 fail, 8 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 188 changed path(s).

git diff --check
exit 0
~~~

Only this newly migrated scenario maps to E1-M16.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S17 | `e2e/url-scrape.spec.ts --grep "the scrape branch sends host-enriched text to Scanner" --project=chromium` | E1-M16 |

<!-- E1-M16-END -->

## E1-T8-TIMEZONE-M17-RED

This row replaces the four legacy `e2e/timezone-resolution.spec.ts` EventCard tests. Those tests
exercised the removed `/api/parse` then `/api/resolve-timezone` inference path; the replacements
strict-intercept only `/api/scan`, parse every request with `ScanRequestSchema`, and construct
every fixture through `EventCandidateSchema.parse`.

| Removed legacy test | Named Scanner replacement | Rationale |
|---|---|---|
| `stays 10:30 AM when the resolver returns a non-IANA zone (the reported bug)` | E1-T8-S17A, `zoned provider point stays zoned in review and exports its explicit TZID` | The Scanner provider contract supplies a validated zoned point, so no post-parse resolver may invent or replace its zone. |
| `stays 10:30 AM when the resolver returns a valid IANA zone` | E1-T8-S17A | The provider zone itself is authoritative; an asynchronous inferred IANA replacement is no longer product behavior. |
| `low-confidence resolution leaves the time alone and the spinner terminates` | E1-T8-S17B, `floating provider point remains a truthful floating-time warning without TZID` | Resolver confidence and spinner state are gone. Scanner instead presents the explicit floating-time warning and readiness. |
| `a valid resolved zone re-converts: 10:30 ET renders as 7:30 AM PT` | E1-T8-S17A | With an America/Los_Angeles reviewer, the review fields preserve the provider-local 10:30 and `America/New_York`; they do not post-parse re-stamp a 7:30 viewer conversion. |

E1-T8-S17A supplies one exact zoned provider point and requires its persisted temporal point to
remain zoned, review Start date `2026-06-15`, Start time `10:30`, Timezone
`America/New_York`, enabled export, no `floating_time` warning, and
`DTSTART;TZID=America/New_York:20260615T103000` without a floating or UTC DTSTART form.

E1-T8-S17B supplies one strict scan response containing a floating primary and a zoned control.
It requires exactly one request, card-scoped fields and warnings, persisted starts in the order
`[floating, zoned]`, enabled export, and one two-VEVENT download. The floating VEVENT contains
`DTSTART:20260615T103000` without TZID or `Z`; the zoned control VEVENT contains
`DTSTART;TZID=America/New_York:20260615T103000` without floating or UTC DTSTART. This strengthens
the floating behavior proof by requiring it to remain distinct from a zoned sibling.

An earlier pre-strengthening cold parallel floating-only attempt timed out before a review draft
appeared. Its later standalone floating pass (1/1, 18.7 seconds) and the earlier warmed run are
superseded/non-accepting for E1-M17 because the then-floating-only scenario could not catch a
zoned-to-floating mutation. No claim below relies on those runs.

The durable spec and production file hashes before mutation were:

```text
1a689f9dd1dffe56763ea96977b77361c4d4cceab0a14c5fb4d391f0829afe4f  e2e/timezone-resolution.spec.ts
bd173fafb81b10f4327a40fd04a402f68afaa6092875548245227daacd63b23b  src/services/scannerDraft.ts
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
```

The exact focused browser command used the credential-scrubbed offline environment and the
parent-controlled isolated port-3784 server. It used Playwright's default two-worker setting:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const result = Bun.spawnSync(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', 'e2e/timezone-resolution.spec.ts', '--project=chromium', '--reporter=line'], { env, stdout: 'inherit', stderr: 'inherit' }); process.exit(result.exitCode ?? 1);"
```

The strengthened pristine run returned status `passed` for both named scenarios. Under the forward
mutation below, the same run returned status `failed` for both, with the intended card-scoped
timezone assertions:

```text
E1-T8-S17A: e2e/timezone-resolution.spec.ts:169:69
Expected: "America/New_York"
Received: ""

E1-T8-S17B: e2e/timezone-resolution.spec.ts:199:69
Expected: "America/New_York"
Received: ""
```

These are accepting REDs: the mutation made the zoned provider point, and the zoned control that
distinguishes the floating scenario, become floating. They are not compile, setup, route, timeout,
or unrelated failures.

### E1-M17 — zoned provider points must not be downgraded to floating

Forward production patch, applied only to `src/services/scannerDraft.ts`:

```diff
-  const parsedCandidate = EventCandidateSchema.parse(candidate);
+  const temporal = candidate.temporal.value;
+  const parsedCandidate = EventCandidateSchema.parse({
+    ...candidate,
+    temporal: temporal === null
+      ? candidate.temporal
+      : {
+        ...candidate.temporal,
+        value: {
+          ...temporal,
+          start: temporal.start?.kind === 'zoned'
+            ? { kind: 'floating', date: temporal.start.date, time: temporal.start.time }
+            : temporal.start,
+          end: temporal.end?.kind === 'zoned'
+            ? { kind: 'floating', date: temporal.end.date, time: temporal.end.time }
+            : temporal.end,
+        },
+      },
+  });
```

The mutated `scannerDraft.ts` SHA-256 was:

```text
4dabf0950583aaf404a293bdbc5cd5a8efb90a45bf31692d2c02de5d44519d29  src/services/scannerDraft.ts
```

Literal inverse production patch:

```diff
-  const temporal = candidate.temporal.value;
-  const parsedCandidate = EventCandidateSchema.parse({
-    ...candidate,
-    temporal: temporal === null
-      ? candidate.temporal
-      : {
-        ...candidate.temporal,
-        value: {
-          ...temporal,
-          start: temporal.start?.kind === 'zoned'
-            ? { kind: 'floating', date: temporal.start.date, time: temporal.start.time }
-            : temporal.start,
-          end: temporal.end?.kind === 'zoned'
-            ? { kind: 'floating', date: temporal.end.date, time: temporal.end.time }
-            : temporal.end,
-        },
-      },
-  });
+  const parsedCandidate = EventCandidateSchema.parse(candidate);
```

After the inverse, `scannerDraft.ts` returned exactly to
`bd173fafb81b10f4327a40fd04a402f68afaa6092875548245227daacd63b23b`. The same focused command
then restored green with both scenarios passed (2/2) in 12.6 seconds.

The literal transient isolation forward patch was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3784';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3784`
@@
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m17',
```

The exact credential-scrubbed, egress-blocked server launcher was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node', '--require', env.E1_OFFLINE_PRELOAD, 'node_modules/next/dist/bin/next', 'dev', '-p', '3784'], { env, stdout: 'inherit', stderr: 'inherit' }); const stop = () => child.kill(); process.on('SIGINT', stop); process.on('SIGTERM', stop); await child.exited;"
```

It reported isolated `.next-e1-m17` TypeScript generation and `Ready in 3.5s`. After restored green,
the controlled server received SIGINT. The literal config inverse restored port 3777 and the
original conditional `webServer` block, and removed `distDir: '.next-e1-m17'`. Next's generated
`tsconfig.json` formatting was inverse-patched, including removal of
`.next-e1-m17/types/**/*.ts`; all three files returned to the pristine hashes above. Parent then
removed only `/Users/manblack/Documents/event-every/.next-e1-m17` and
`/Users/manblack/Documents/event-every/test-results`. Port 3784 and those artifacts were absent;
the pre-existing port-3777 server remained listening and shared `.next` was not used by the M17
proof. No provider request or credential was used.

Focused post-restoration gates:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/timezone-resolution.spec.ts src/services/scannerDraft.ts
exit 0

bun test src/services/__tests__/scannerDraft.test.ts --isolate
12 pass, 0 fail, 47 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 188 changed path(s).

git diff --check
exit 0

git diff --no-index --check /dev/null docs/testing/e1-mutation-ledger.md
exit 1 only because the complete untracked ledger is an added file; no whitespace errors reported
```

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S17A | `e2e/timezone-resolution.spec.ts --grep "zoned provider point stays zoned" --project=chromium` | E1-M17 |
| E1-T8-S17B | `e2e/timezone-resolution.spec.ts --grep "floating provider point remains" --project=chromium` | E1-M17 |

<!-- E1-M17-END -->

## E1-T8-ALL-DAY-M18-RED

This row replaces five legacy all-day checks with two authoritative Scanner review scenarios. Both
strict-intercept one `/api/scan` request, parse the exact `{ kind: 'text', text }` body through
`ScanRequestSchema`, and construct the response candidate through `EventCandidateSchema.parse`.

| Removed legacy test | Named Scanner replacement | Rationale |
|---|---|---|
| `event-extraction.spec.ts` — `Scenario 2: All-day event (no times mentioned)` | E1-T8-S18A and S18B, `Scanner all-day provider date` | Title, location, and provider date now appear in the Scanner review surface rather than an EventCard fed by `/api/parse`. |
| `export-ics.spec.ts` — `all-day event produces a DATE-valued DTSTART with no time` | E1-T8-S18A and S18B | The Scanner-owned export must contain exactly `DTSTART;VALUE=DATE:20260321`. |
| `export-ics.spec.ts` — `Bug 2 (all-day)` editor toggle | E1-T8-S18A and S18B | The current review editor starts from a provider all-day point, edits its date, and must preserve the date-point/all-day discriminants. |
| Task-194 Asia/Tokyo block | E1-T8-S18A — Asia/Tokyo viewer | The provider calendar date remains stable east of UTC through review and export. |
| Task-194 America/Los_Angeles block | E1-T8-S18B — America/Los_Angeles viewer | The same provider calendar date remains stable west of UTC through review and export. |

Each scenario asserts title `Company offsite`, location `Napa Valley`, Start date `2026-03-20`,
All day `true`, no Start time control, and an empty Timezone field. It edits Start date to
`2026-03-21`, then requires persisted temporal value
`{ start: { kind: 'date', year: 2026, month: 3, day: 21 }, end: null, duration: null, allDay: true }`.
The one-VEVENT download has exactly one DTSTART line, `DTSTART;VALUE=DATE:20260321`; its value is
eight digits with no `T` or `Z`, and the calendar contains no `TZID=`.

Durable and pristine production/config hashes before mutation:

```text
db38664c09748b4a8264342791120a9c686c7a7e99db20f4c6a12a9311909b7d  e2e/scanner-product-loop.spec.ts
276e87b59b02d60c8f13b8faa8673a9336ad789e6e05c6f3e3877162fa3e4c76  src/components/review/ReviewDraftFields.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
```

The first cold two-worker attempt is non-accepting: S18A reached export but the test incorrectly
searched the entire property name `DTSTART` for absence of `T`; S18B did not submit during cold
parallel hydration. The assertion was narrowed to the property value and the established serial
proof mode was used. The warmed pristine run then passed both exact scenarios (2/2 in 10.2s).
Independent review subsequently required the route to throw on request 2 and a final post-download
`requestCount === 1` assertion, closing the whole scenario rather than only its scan phase. After
that durable repair, a fresh pristine replay passed 2/2 in 33.9s.

### E1-M18 — editing an all-day date must not convert it to timed floating

Transient forward production patch, only in `src/components/review/ReviewDraftFields.tsx`:

```diff
-      if (allDay === true) return { kind: 'date', ...date };
+      if (allDay === true) return { kind: 'floating', date, time: { hour: 0, minute: 0, second: 0 } };
@@
-    onEdit({ field: 'temporal', value: { start: point(start, startDate, startTime), end: point(end, endDate, endTime), duration: temporal?.duration ?? null, allDay } });
+    onEdit({ field: 'temporal', value: { start: point(start, startDate, startTime), end: point(end, endDate, endTime), duration: temporal?.duration ?? null, allDay: allDay === true ? false : allDay } });
```

The mutated file hash was
`7d7e263c7bbdbb64076b98a052c2facee1a7883de99aa0268701476970c05c3d`. In the final replay, the
exact serial focused run failed both S18A and S18B at
`e2e/scanner-product-loop.spec.ts:1105`: the visible All day combobox expected `true` and received
`false` after the date edit. These are causal all-day-display REDs, not setup, route, compile, or
timeout failures.

Literal inverse production patch:

```diff
-      if (allDay === true) return { kind: 'floating', date, time: { hour: 0, minute: 0, second: 0 } };
+      if (allDay === true) return { kind: 'date', ...date };
@@
-    onEdit({ field: 'temporal', value: { start: point(start, startDate, startTime), end: point(end, endDate, endTime), duration: temporal?.duration ?? null, allDay: allDay === true ? false : allDay } });
+    onEdit({ field: 'temporal', value: { start: point(start, startDate, startTime), end: point(end, endDate, endTime), duration: temporal?.duration ?? null, allDay } });
```

The inverse restored hash `276e87b5...`; the final same-command replay passed 2/2 in 11.0s.

Focused browser command:

```bash
E1_OFFLINE=1 E1_OFFLINE_PRELOAD=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs bunx playwright test e2e/scanner-product-loop.spec.ts --project=chromium --grep "Scanner all-day provider date" --workers=1 --reporter=line
```

Before launching a server, the transient isolation config changed port 3777 to 3785 in both
`localUrl` and `devCommand`, set `webServer: undefined`, and added
`distDir: '.next-e1-m18'`. The exact credential-scrubbed launcher was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval "import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node','--require',env.E1_OFFLINE_PRELOAD,'node_modules/next/dist/bin/next','dev','-p','3785'], {env,stdout:'inherit',stderr:'inherit'}); const stop=()=>child.kill(); process.on('SIGINT',stop); process.on('SIGTERM',stop); await child.exited;"
```

The initial lifecycle reported `Ready in 3.9s`; the final review-repair replay reported `Ready in
4s`. After each restored green, the server received SIGINT before the literal
config inverse. The inverse restored the three config hashes above, including removal of Next's
generated `.next-e1-m18/types/**/*.ts` entry and formatting from `tsconfig.json`. Parent removed
only `.next-e1-m18` and `test-results`; port 3785 and both paths are absent, port 3777 remains
listening, and shared `.next` was untouched. No provider request or credential was used.

Post-restoration gates:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts e2e/export-ics.spec.ts e2e/event-extraction.spec.ts src/components/review/ReviewDraftFields.tsx
exit 0

bun test src/services/__tests__/scannerDraft.test.ts --isolate
12 pass, 0 fail, 47 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 190 changed path(s).

git diff --check
exit 0

Manual untracked-path audit (`git status --porcelain=v1 --untracked-files=normal`) matched exactly
`.claude/`, `docs/testing/`, `e2e/scanner-product-loop.spec.ts`, `src/types/scanRequest.ts`,
`tasks/task-192.md`, and `tasks/task-193.md`. The three E1 untracked paths are literal entries in
`scripts/assert-e1-paths.ts`; the other three are the protected inventory. No unexpected untracked
path was present.

git diff --no-index --check /dev/null e2e/scanner-product-loop.spec.ts
git diff --no-index --check /dev/null docs/testing/e1-mutation-ledger.md
Each exited 1 only because the complete untracked file is added; neither printed a whitespace
diagnostic.
```

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S18A | `scanner-product-loop.spec.ts --grep "Scanner all-day provider date" --workers=1 --project=chromium` (Asia/Tokyo) | E1-M18 |
| E1-T8-S18B | same focused command (America/Los_Angeles) | E1-M18 |

<!-- E1-M18-END -->

## E1-T8-BUFFERED-EDIT-M19-RED

This row replaces `e2e/export-ics.spec.ts` test `Bug 1 (lost keystroke): a time typed in the editor
then immediately Saved survives into the .ics` with E1-T8-S19, `Scanner ReviewDraftFields buffers
start-time edits until commit and exports the committed value`. The replacement strict-intercepts
exactly one `/api/scan`, parses its exact text body with `ScanRequestSchema`, and constructs a real
`EventCandidateSchema` floating event from 19:00 to 20:00. It fills Start time with `19:45` without
blur, proves the input buffer changed while persisted start remains 19:00 with provider evidence,
presses Enter, proves persisted start 19:45 with temporal confidence null/evidence empty, and exports
`DTSTART:20260313T194500` without the old `190000` value. The request count remains one through export.

Pristine hashes were:

```text
820f3d8bb9eb88272bbc469fb79907feaa0322925d072913e71337845058ecf9  e2e/scanner-product-loop.spec.ts
276e87b59b02d60c8f13b8faa8673a9336ad789e6e05c6f3e3877162fa3e4c76  src/components/review/ReviewDraftFields.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
```

Pristine serial Chromium passed 1/1 in 37.5s. E1-M19 transiently changed only the Start time input:

```diff
-onChange={(e) => markDirty(setStartTime)(e.target.value)}
+onChange={(e) => { markDirty(setStartTime)(e.target.value); const input = e.currentTarget; queueMicrotask(() => input.blur()); }}
```

The mutated production hash was
`46b442cb51a95f74decdb3c33e80e1abbc1ea7dc54dcd667a97522c61ad9008e`. The exact scenario failed
at `scanner-product-loop.spec.ts:373`: before explicit commit, expected minute `0` and received `45`.
The literal inverse was:

```diff
-onChange={(e) => { markDirty(setStartTime)(e.target.value); const input = e.currentTarget; queueMicrotask(() => input.blur()); }}
+onChange={(e) => markDirty(setStartTime)(e.target.value)}
```

It restored production hash `276e87b5...`; restored Chromium passed 1/1 in 13.7s. The focused command
was `E1_OFFLINE=1 E1_OFFLINE_PRELOAD=... bunx playwright test e2e/scanner-product-loop.spec.ts
--project=chromium --grep "buffers start-time edits" --workers=1 --reporter=line`.

Before launch, isolation moved Playwright from port 3777 to 3788, disabled its webServer, and set
Next `distDir: '.next-e1-m19'`. The credential-scrubbed `createE1OfflineEnvironment()` launcher
reported Ready in 4.4s. After restored green the server received SIGINT; literal config/tsconfig
inverses restored the hashes above, and only `.next-e1-m19`/`test-results` were removed. Port 3788
and those artifacts are absent; port 3777 remains listening and shared `.next` was untouched.

Post-restoration: nonincremental TypeScript and targeted ESLint exited 0; Scanner draft units passed
12/12 with 47 expectations; protected inventory is 53,300; cumulative path guard is 190; tracked
diff whitespace passes. The accepted exact-untracked inventory and separate no-index whitespace
checks from E1-M18 remain unchanged and cover the complete untracked Scanner spec/ledger.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S19 | `scanner-product-loop.spec.ts --grep "buffers start-time edits" --workers=1 --project=chromium` | E1-M19 |

<!-- E1-M19-END -->

## E1-T8-MULTIPLE-CANDIDATES-M20-RED

This row replaces `e2e/event-extraction.spec.ts` — `Scenario 4: Schedule with multiple distinct
events`, the final legacy `/api/parse` event-count assertion. Its named Scanner replacement is
E1-T8-S20, `one strict Scanner response keeps every candidate as an ordered selectable review
draft`. The removed assertion only counted legacy `EventCard` titles from an SSE parse fixture; it
could not prove strict Scanner response validation, claim ownership, review-draft order, or that
the candidates reach the Scanner selection/export boundary.

S20 constructs one valid three-candidate `ScanResponse` through `EventCandidateSchema.parse` and
intercepts only `/api/scan` through `mockScanAPI`, which parses the outgoing request with
`ScanRequestSchema`. It makes the exact text submission once, requires exactly three ordered
review-draft articles, and for each candidate requires its candidate ID, selected checkbox, title,
location, Start date, and Start time:

| Order | Candidate ID | Title | Location | Start |
|---|---|---|---|---|
| 1 | `candidate-m20-standup` | `Standup` | `Daily room` | `2026-03-09 09:00` |
| 2 | `candidate-m20-design-review` | `Design Review` | `Design room` | `2026-03-10 14:00` |
| 3 | `candidate-m20-retro` | `Retro` | `Retrospective room` | `2026-03-11 11:00` |

It then deselects only Standup and requires both later candidate controls to remain selected. This
is the handoff to the existing E1-T8-MULTI-SELECT-M09-RED selection/export-byte proof, which owns
the selected-VEVENT download assertion; S20 owns the preceding all-candidates extraction/count and
per-candidate-claims contract. No legacy parse assertion was silently retained or weakened.

Pristine evidence copies were made under the unique evidence-only directory
`/private/tmp/e1-m20.4sDMyW` before the forward patches. Their SHA-256 hashes were:

```text
c2e735c9ebc3c6f8314941c42c5cbc6b717dfbf6062c3b4f38983870333e456d  e2e/event-extraction.spec.ts
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f  src/app/page.tsx
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
```

The fresh pristine Chromium run used an isolated credential-scrubbed, egress-blocked offline
server on port 3790 and returned `1 passed` in 4.6 seconds:

```bash
E1_OFFLINE=1 E1_OFFLINE_PRELOAD=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \\
  bunx playwright test e2e/event-extraction.spec.ts --project=chromium \\
  --grep "one strict Scanner response" --workers=1 --reporter=line
```

The literal transient isolation forward patch was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3790';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3790`
@@
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m20',
```

The offline launcher was:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval \\
"import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/next/dist/bin/next', 'dev', '-p', '3790'], { env, stdout: 'inherit', stderr: 'inherit' }); const stop = () => child.kill(); process.on('SIGINT', stop); process.on('SIGTERM', stop); await child.exited;"
```

It reported `Ready in 834ms`. It ran with `createE1OfflineEnvironment()` and the preload only; no
credential, provider request, shared port-3777 server, or shared `.next` was used. Next generated
only the temporary `.next-e1-m20/types/**/*.ts` include/config formatting change.

### E1-M20 — all valid Scanner candidates must become review drafts

The literal forward production patch was applied only to `src/app/page.tsx`:

```diff
-    const drafts = response.candidates.map((candidate) => createReviewDraft(
+    const drafts = response.candidates.slice(0, 1).map((candidate) => createReviewDraft(
```

The mutated production hash was:

```text
53cdc701b9df99e7e3d70bdc1118c00987cd2fa41b09c12c76d00728e0d2a495  src/app/page.tsx
```

Under the same focused browser command, S20 failed at
`e2e/event-extraction.spec.ts:260` with the intended multiple-candidate extraction/count
assertion:

```text
Locator:  getByRole('region', { name: 'Scanner review drafts' }).locator('article')
Expected: 3
Received: 1
```

This is accepting RED evidence: the strict valid response supplied three candidates and only the
drop-after-first mutation caused the exact new review-draft count assertion to receive one. It was
not a compile, fixture, route, timeout, setup, or unrelated assertion failure.

The literal inverse production patch was:

```diff
-    const drafts = response.candidates.slice(0, 1).map((candidate) => createReviewDraft(
+    const drafts = response.candidates.map((candidate) => createReviewDraft(
```

After the inverse, `cmp -s src/app/page.tsx
/private/tmp/e1-m20.4sDMyW/page.tsx.pristine` exited 0 and the production SHA-256 returned exactly
to `775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f`. The same focused command
then restored green with `1 passed` in 1.7 seconds.

After SIGINT stopped only the controlled port-3790 server, the literal isolation inverse restored
port 3777, the original conditional `webServer` block, and removed
`distDir: '.next-e1-m20'`. The generated `tsconfig.json` include/formatting was inverse-patched to
its original bytes. `cmp -s` against each pristine evidence copy passed; the hashes again were
`fb2d0475...` for `playwright.config.ts`, `ffffb7aa...` for `next.config.js`, and `83d292a6...`
for `tsconfig.json`. The literal configuration inverse patch was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3790';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3790`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
@@
-  webServer: undefined,
+  webServer: isProd
+    ? undefined
+    : {
+        command: devCommand,
+        url: localUrl,
+        reuseExistingServer: !isOffline && !process.env.CI,
+        timeout: 120000,
+      },
--- next.config.js
-  distDir: '.next-e1-m20',
--- tsconfig.json
-    "lib": [
-      "dom",
-      "dom.iterable",
-      "esnext"
-    ],
+    "lib": ["dom", "dom.iterable", "esnext"],
@@
-    "paths": {
-      "@/*": [
-        "./src/*"
-      ]
-    }
+    "paths": {
+      "@/*": ["./src/*"]
+    }
@@
-  "include": [
-    "**/*.ts",
-    "**/*.tsx",
-    ".next/types/**/*.ts",
-    "next-env.d.ts",
-    ".next-e1-m20/types/**/*.ts"
-  ],
-  "exclude": [
-    "node_modules"
-  ]
+  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
+  "exclude": ["node_modules"]
```

This complete inverse records the generated lib, paths, include-order, M20 build include, and
exclude formatting reversals exactly as applied. It was checked by the pristine-byte comparisons
above. Only `.next-e1-m20` and the proof's `test-results`
were removed after scope inspection; both are absent and port 3790 is closed. The existing port-3777
server and shared `.next` were not touched.

Focused post-restoration checks all passed:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/event-extraction.spec.ts e2e/scanner-product-loop.spec.ts
exit 0

bun test src/services/__tests__/scannerDraft.test.ts --isolate
12 pass, 0 fail, 47 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 190 changed path(s).

git diff --check
exit 0
```

The exact protected and untracked user paths remained outside this unit: `.claude/**`,
`tasks/task-192.md`, and `tasks/task-193.md` were neither edited, staged, nor mutated. Existing
E1-M01–E1-M19 ledger bytes and evidence remain unchanged.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S20 | `event-extraction.spec.ts --grep "one strict Scanner response" --workers=1 --project=chromium` | E1-M20 |


### Post-review fixture-boundary and ledger-exactness repair

Independent review found that S20's initial evidence fixture hardcoded `endOffset: 69` for the
67-character submitted excerpt. A pre-repair boundary check returned:

```text
{ length: 67, endOffset: 69, inRange: false }
exit 1
```

The durable fixture repair defines the submitted excerpt once and derives the evidence boundary
from the same value:

```diff
+const MULTIPLE_CANDIDATES_EXCERPT =
+  'Monday 9am standup, Tuesday 2pm design review, Wednesday 11am retro';
+
 const scannerClaim = <Value,>(value: Value, sourceId = 'source-m20-multiple-candidates') => ({
@@
-    excerpt: 'Monday 9am standup, Tuesday 2pm design review, Wednesday 11am retro',
+    excerpt: MULTIPLE_CANDIDATES_EXCERPT,
     startOffset: 0,
-    endOffset: 69,
+    endOffset: MULTIPLE_CANDIDATES_EXCERPT.length,
@@
-    await submitScannerText(page, 'Monday 9am standup, Tuesday 2pm design review, Wednesday 11am retro');
+    await submitScannerText(page, MULTIPLE_CANDIDATES_EXCERPT);
```

The repaired `e2e/event-extraction.spec.ts` SHA-256 is
`6b5c68192a029615f5efcb5f99e0ddd4497614f9263c0f57a81741e2d7021e49`. The M20 production
mutation and inverse hashes remain unchanged; this repair changes fixture evidence bytes only.

Fresh browser reproof used a new credential-scrubbed offline server on port 3791 with isolated
`distDir: '.next-e1-m20-review'`. The first cold run is non-accepting lifecycle evidence: S20
received zero review articles within five seconds before reaching its schema/claim assertions.
The identical warmed replay then passed 1/1 in 1.7 seconds. No acceptance claim relies on the cold
failure.

After the warmed pass, SIGINT stopped only the port-3791 server. Literal inverse patches restored
`playwright.config.ts`, `next.config.js`, and the complete Next-generated `tsconfig.json`
format/include changes. `cmp -s` against the review-cycle pristine copies passed, restoring hashes
`fb2d0475...`, `ffffb7aa...`, and `83d292a6...`. The inspected
`.next-e1-m20-review` and `test-results` paths were removed; both are absent, port 3791 is
closed, and port 3777/shared `.next` were untouched. No credential, external network, or provider
request was used.

The reviewer also identified two documentation-only patch-exactness defects above. The forward
Playwright diff now records literal `${offlinePreload}` source text without an artificial escape,
and the M20 configuration inverse now enumerates the actual lib, paths, include ordering/build
entry, exclude, and formatting reversals instead of abbreviating them.

Fresh post-repair gates:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/event-extraction.spec.ts e2e/scanner-product-loop.spec.ts
exit 0

bun test src/services/__tests__/scannerDraft.test.ts --isolate
12 pass, 0 fail, 47 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 190 changed path(s).

git diff --check
exit 0
```

<!-- E1-M20-END -->

<!-- E1-M21-START -->

### E1-M21 — partial Scanner export retains only the unselected draft across reload

`e2e/scanner-product-loop.spec.ts` now adds `E1-T8-S21`, a strict two-candidate Scanner
response. `candidate-partial-exported-1` is complete (`Exported partial candidate` / `Export
pier`) and `candidate-partial-retained-1` is schema-valid but deliberately has `temporal.start:
null` (`Retained partial candidate` / `Keep room`). The browser test proves both initial candidate
IDs, claims, generated identities, and default selection; it unselects only the retained draft,
exports exactly the selected draft, and compares the downloaded bytes to `generateIcs` using that
draft's actual `exportUid` and `createdAt`. It then reloads and requires exactly the retained ID,
identity, title, location, candidate-derived `missing_start` blocker, and disabled export control.
The post-review repair below explicitly selects the restored draft before asserting the disabled
export control. The re-persisted record is also required to omit `readiness`, so the
observed locked state after reload is derived by `createReviewDraft` from the retained candidate,
not accepted as a stored readiness value.

Fresh evidence used a unique pristine snapshot directory
`/private/tmp/e1-m21.7j0lSm`; before temporary isolation, SHA-256 values were:

```text
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f  src/app/page.tsx
```

The exact temporary isolation forward patch was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3792';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3792`
@@
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m21',
```

The isolated launcher was credential-scrubbed by `createE1OfflineEnvironment()` and used only the
egress-blocking preload:

```bash
bun --preload=/Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs --eval \
"import { createE1OfflineEnvironment } from './scripts/run-e1-offline.ts'; const env = createE1OfflineEnvironment(); const child = Bun.spawn(['node', '--require', env.E1_OFFLINE_PRELOAD!, 'node_modules/next/dist/bin/next', 'dev', '-p', '3792'], { env, stdout: 'inherit', stderr: 'inherit' }); const stop = () => child.kill(); process.on('SIGINT', stop); process.on('SIGTERM', stop); await child.exited;"
```

It served `HTTP/1.1 200 OK` at `127.0.0.1:3792`. No credential, provider request, external
egress, shared port-3777 server, or shared `.next` was used. The focused pristine command passed:

```text
node --require /Users/manblack/Documents/event-every/scripts/e1-offline-preload.cjs \
  node_modules/@playwright/test/cli.js test e2e/scanner-product-loop.spec.ts \
  --grep "partial Scanner export removes only" --workers=1 --project=chromium

1 passed (3.3s)
```

Two non-accepting attempts are retained for causality. The first used `setupLocal`; that helper's
`addInitScript(() => localStorage.clear())` correctly runs again at reload, so the browser received
zero review articles at the reload assertion. This was test setup, not a production or mutation
failure. S21 was repaired to use the same explicit mocked navigation as the existing reload test.
The next over-broad experimental replacement of the persistence save with `reviewStorage.clear()`
cleared the initial two-draft persistence and failed at line 733 before export; it is not RED
evidence. A first inverse without distinguishing the two `clear()` calls was immediately detected
by the changed control-flow shape; a contextual literal inverse restored the pristine page hash
before the accepting mutation below. Neither attempt is used for acceptance.

The following initial mutation was later rejected by independent review because draft-count alone
does not scope the mutation to a partial-export transition. It remains non-accepting evidence:

```diff
@@
     if (reviewDrafts.length === 0) {
       reviewStorage.clear();
     } else {
-      reviewStorage.save(reviewDrafts);
+      reviewDrafts.length === 1 ? reviewStorage.clear() : reviewStorage.save(reviewDrafts);
     }
```

The mutated `src/app/page.tsx` SHA-256 was:

```text
46e390720e76d9ccb777ff6f88f803aa7a6b378c8f5215449302eef0cbc6a927
```

Under the same focused command, S21 completed setup, strict response validation, selection, exact
download, and in-memory partial export. It then failed only at the reload-retention assertion:

```text
Locator:  getByRole('region', { name: 'Scanner review drafts' }).getByRole('article')
Expected: 1
Received: 0
at e2e/scanner-product-loop.spec.ts:772
```

This produced the intended visible failure, but is not accepting E1-M21 RED because an unrelated
initial one-draft persistence path would also be cleared. The post-review lifecycle below replaces
it with an exact successful-partial-export transition flag and an unrelated one-draft control.

The literal inverse production patch was:

```diff
@@
     if (reviewDrafts.length === 0) {
       reviewStorage.clear();
     } else {
-      reviewDrafts.length === 1 ? reviewStorage.clear() : reviewStorage.save(reviewDrafts);
+      reviewStorage.save(reviewDrafts);
     }
```

`cmp -s src/app/page.tsx /private/tmp/e1-m21.7j0lSm/page.tsx` exited 0; the page returned exactly
to `775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f`, and the same focused
browser command restored green with `1 passed (3.5s)`.

After stopping only the controlled listener PID on port 3792, the literal isolation inverse
restored port 3777, the conditional `webServer`, and removed the isolated `distDir`. Next's
generated `tsconfig.json` lib/paths/include/exclude reformatting and
`.next-e1-m21/types/**/*.ts` include entry were inverse-patched to the pristine bytes. All four
`cmp -s` checks (Playwright config, Next config, tsconfig, and page) passed with the four hashes
above; `.next-e1-m21` and `test-results` were scope-inspected and removed, port 3792 is closed, and
the shared server/.next remain untouched.

The literal configuration inverse patch was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3792';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3792`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
@@
-  webServer: undefined,
+  webServer: isProd
+    ? undefined
+    : {
+        command: devCommand,
+        url: localUrl,
+        reuseExistingServer: !isOffline && !process.env.CI,
+        timeout: 120000,
+      },
--- next.config.js
-  distDir: '.next-e1-m21',
--- tsconfig.json
-    "lib": [
-      "dom",
-      "dom.iterable",
-      "esnext"
-    ],
+    "lib": ["dom", "dom.iterable", "esnext"],
@@
-    "paths": {
-      "@/*": [
-        "./src/*"
-      ]
-    }
+    "paths": {
+      "@/*": ["./src/*"]
+    }
@@
-  "include": [
-    "**/*.ts",
-    "**/*.tsx",
-    ".next/types/**/*.ts",
-    "next-env.d.ts",
-    ".next-e1-m21/types/**/*.ts"
-  ],
-  "exclude": [
-    "node_modules"
-  ]
+  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
+  "exclude": ["node_modules"]
```

Focused restored checks passed:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts
exit 0

bun test src/services/__tests__/scannerDraft.test.ts --isolate
12 pass, 0 fail, 47 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 190 changed path(s).

git diff --check
exit 0
```

The cumulative tracked/untracked audit preserved every existing accepted/user path, including
`.claude/**`, `tasks/task-192.md`, and `tasks/task-193.md`; this unit durably changed only
`e2e/scanner-product-loop.spec.ts` and this ledger. No files were staged or committed.

| Scenario ID | Focused command | Catching rows |
|---|---|---|
| E1-T8-S21 | `scanner-product-loop.spec.ts --grep "partial Scanner export removes only" --workers=1 --project=chromium` | E1-M21 |

<!-- E1-M21-END -->

## Terminal live-inventory reconciliation — blocking, non-accepting

The pre-revision Task 8 terminal contract required every remaining `test()` in the
eight named files to have a causal E1-M01…E1-M21 red transcript. A fresh static
inventory on 2026-08-01 found 67 live Chromium scenarios (134 when Playwright
lists both browsers), while accepted evidence names only the Scanner cases listed
below. This remains a blocking audit, not mutation credit. The later
`E1-T8-LIVE-SCENARIO-DISPOSITION` entry is authoritative: only Scanner-path cases
require causal E1-M RED evidence; preserved community, input-shell, and
Recent-input contracts still run in the full offline gate and are explicitly not
credited to Scanner mutations. Every legacy Scanner-path entry is instead
migrated with causal reproof or deleted with its named Scanner replacement before
Task 8 terminal acceptance.

The command column is the exact **Playwright argv tail**, not a naked executable command. Every
tail uses a unique unanchored-start pattern ending in `$`, so Playwright can match the describe
prefix and exactly one leaf title. Before executing a tail, invoke the canonical isolated launcher
in the authoritative Task 8 plan with that tail plus `--list`; it must print exactly one Chromium
test. Reinvoke the same launcher without `--list` only after that static preflight. These are
inventory commands, not claims of a successful offline re-run.

| Stable scenario ID | Live test | Exact focused command | Causal evidence status |
|---|---|---|---|
| E1-T8-C01 | community-limit — shows the community-sponsored message with reset time in the local timezone | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "shows the community-sponsored message with reset time in the local timezone$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C02 | community-limit — waitlist signup shows the on-screen confirmation | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "waitlist signup shows the on-screen confirmation$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C03 | community-limit — already-joined emails get the already-on-the-list message | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "already-joined emails get the already-on-the-list message$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C04 | community-limit — Enter pattern lock switches to the pattern screen as it looks today | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "\"Enter pattern lock\" switches to the pattern screen as it looks today$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C05 | community-limit — app stays open (no pattern lock) when the budget is not exhausted | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "app stays open \(no pattern lock\) when the budget is not exhausted$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C06 | community-limit — admins with a valid pattern session bypass the limit screen | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "admins with a valid pattern session bypass the limit screen$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C07 | community-limit — /spent previews the limit screen without the budget being exhausted | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "/spent previews the limit screen without the budget being exhausted$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C08 | community-limit — Enter pattern lock on /spent opens the pattern screen via /?unlock | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "\"Enter pattern lock\" on /spent opens the pattern screen via /\?unlock$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-C09 | community-limit — a mid-session community 402 flips the app to the limit screen | `e2e/community-limit.spec.ts --project=chromium --workers=1 --grep "a mid-session community 402 flips the app to the limit screen$"` | E1-M15 |
| E1-T8-X01 | event-extraction — renders the exact wall-clock time and date | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "renders the exact wall-clock time and date$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-X02 | event-extraction — Scenario 3: Conference poster extracts as 1 event | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Scenario 3: Conference poster extracts as 1 event$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-X03 | event-extraction — Scenario 4: one strict Scanner response keeps every candidate as an ordered selectable review draft | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Scenario 4: one strict Scanner response keeps every candidate as an ordered selectable review draft$"` | E1-M20 |
| E1-T8-X04 | event-extraction — Scenario 5: No events found shows error | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Scenario 5: No events found shows error$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-X05 | event-extraction — Scenario 6: Multi-person meeting = 1 event | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Scenario 6: Multi-person meeting = 1 event$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-X06 | event-extraction — renders the visible timezone chip | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "renders the visible timezone chip$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-X07 | event-extraction — Scenario 8: renders an extracted event | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Scenario 8: renders an extracted event$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-X08 | event-extraction — Submit button is disabled with empty input | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Submit button is disabled with empty input$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-X09 | event-extraction — Submit button enables with 3+ chars | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Submit button enables with 3\+ chars$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-X10 | event-extraction — Event card expands to reveal the description | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Event card expands to reveal the description$"` | UNPROVEN — legacy EventCard scenario |
| E1-T8-X11 | event-extraction — Error notification can be dismissed | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Error notification can be dismissed$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-X12 | event-extraction — Cmd+Enter submits from textarea | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Cmd\+Enter submits from textarea$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-X13 | event-extraction — Non-batch request returns 400 | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Non-batch request returns 400$"` | UNPROVEN — obsolete `/api/parse` route scenario |
| E1-T8-X14 | event-extraction — Missing input returns 400 | `e2e/event-extraction.spec.ts --project=chromium --workers=1 --grep "Missing input returns 400$"` | UNPROVEN — obsolete `/api/parse` route scenario |
| E1-T8-E01 | export-ics — timed single event produces a UTC DTSTART and one VEVENT | `e2e/export-ics.spec.ts --project=chromium --workers=1 --grep "timed single event produces a UTC DTSTART and one VEVENT$"` | UNPROVEN — legacy EventCard/`ics` scenario |
| E1-T8-E02 | export-ics — multi-event export writes all VEVENTs and the batch-events-N filename | `e2e/export-ics.spec.ts --project=chromium --workers=1 --grep "multi-event export writes all VEVENTs and the batch-events-N filename$"` | UNPROVEN — legacy EventCard/`ics` scenario |
| E1-T8-E03 | export-ics — deselecting one event exports only the remaining selected events | `e2e/export-ics.spec.ts --project=chromium --workers=1 --grep "deselecting one event exports only the remaining selected events$"` | UNPROVEN — legacy EventCard/`ics` scenario |
| E1-T8-D01 | draft-and-history — text draft survives a page reload | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "text draft survives a page reload$"` | UNPROVEN — separate pre-existing Recent-input contract |
| E1-T8-D02 | draft-and-history — an attached image survives a page reload | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "an attached image survives a page reload$"` | UNPROVEN — separate pre-existing Recent-input contract |
| E1-T8-D03 | draft-and-history — a stored image renders (valid src, not empty) when loaded back from history | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "a stored image renders \(valid src, not empty\) when loaded back from history$"` | UNPROVEN — separate pre-existing Recent-input contract |
| E1-T8-D04 | draft-and-history — the history button is hidden until there is history | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "the history button is hidden until there is history$"` | UNPROVEN — separate pre-existing Recent-input contract |
| E1-T8-D05 | draft-and-history — transforming saves the input to history | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "transforming saves the input to history$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-D06 | draft-and-history — loading an entry (without changing it) never duplicates it in history | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "loading an entry \(without changing it\) never duplicates it in history$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-D07 | draft-and-history — loading an entry, modifying it, then transforming saves a new entry | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "loading an entry, modifying it, then transforming saves a new entry$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-D08 | draft-and-history — clicking a history entry loads it back into the input | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "clicking a history entry loads it back into the input$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-D09 | draft-and-history — applying history with an unsaved draft auto-saves the draft first | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "applying history with an unsaved draft auto-saves the draft first$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-D10 | draft-and-history — the history modal locks background page scroll while open | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "the history modal locks background page scroll while open$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-D11 | draft-and-history — history groups entries into day sections | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "history groups entries into day sections$"` | UNPROVEN — legacy `/api/parse` scenario |
| E1-T8-D12 | draft-and-history — cancel aborts an in-flight parse and clears the processing card | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "cancel aborts an in-flight parse and clears the processing card$"` | UNPROVEN — replaced in intent by E1-T8-S15, but still live |
| E1-T8-D13 | draft-and-history — events that stream in do not reset the user's manual selection | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "events that stream in do not reset the user's manual selection$"` | UNPROVEN — legacy SSE selection scenario |
| E1-T8-D14 | draft-and-history — a 2-3 word summary appears on the card after transform | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "a 2-3 word summary appears on the card after transform$"` | UNPROVEN — separate legacy summary feature |
| E1-T8-D15 | draft-and-history — a shimmer shows while the summary is generating, then it resolves to the label | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "a shimmer shows while the summary is generating, then it resolves to the label$"` | UNPROVEN — separate legacy summary feature |
| E1-T8-D16 | draft-and-history — search filters entries and clearing restores all | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "search filters entries and clearing restores all$"` | UNPROVEN — separate pre-existing Recent-input contract |
| E1-T8-D17 | draft-and-history — search matches on the generated summary, not just the input text | `e2e/draft-and-history.spec.ts --project=chromium --workers=1 --grep "search matches on the generated summary, not just the input text$"` | UNPROVEN — separate legacy summary feature |
| E1-T8-I01 | inline-edit-timezone — an edited start time survives a later timezone change (not reverted to the parsed time) | `e2e/inline-edit-timezone.spec.ts --project=chromium --workers=1 --grep "an edited start time survives a later timezone change \(not reverted to the parsed time\)$"` | UNPROVEN — legacy EventCard scenario |
| E1-T8-I02 | inline-edit-timezone — moving the start past the end preserves duration and keeps start <= end | `e2e/inline-edit-timezone.spec.ts --project=chromium --workers=1 --grep "moving the start past the end preserves duration and keeps start <= end$"` | UNPROVEN — legacy EventCard scenario |
| E1-T8-T01 | timezone-resolution — zoned provider point stays zoned in review and exports its explicit TZID | `e2e/timezone-resolution.spec.ts --project=chromium --workers=1 --grep "zoned provider point stays zoned in review and exports its explicit TZID$"` | E1-M17 |
| E1-T8-T02 | timezone-resolution — floating provider point remains a truthful floating-time warning without TZID | `e2e/timezone-resolution.spec.ts --project=chromium --workers=1 --grep "floating provider point remains a truthful floating-time warning without TZID$"` | E1-M17 |
| E1-T8-U01 | url-scrape — a URL pill renders from the typed text alone | `e2e/url-scrape.spec.ts --project=chromium --workers=1 --grep "a URL pill renders from the typed text alone$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-U02 | url-scrape — the scrape branch sends host-enriched text to Scanner and renders its review candidate | `e2e/url-scrape.spec.ts --project=chromium --workers=1 --grep "the scrape branch sends host-enriched text to Scanner and renders its review candidate$"` | E1-M16 |
| E1-T8-S01 | scanner loop — text scan shows reviewed claims and downloads Scanner calendar bytes | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "text scan shows reviewed claims and downloads Scanner calendar bytes$"` | UNPROVEN — no E1 mutation transcript |
| E1-T8-S02 | scanner loop — Scanner ReviewDraftFields buffers start-time edits until commit and exports the committed value | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "Scanner ReviewDraftFields buffers start-time edits until commit and exports the committed value$"` | E1-M19 |
| E1-T8-S03 | scanner loop — image scan sends a strict data URL, reviews a vision candidate, exports Scanner bytes, and keeps review storage raw-free | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "image scan sends a strict data URL, reviews a vision candidate, exports Scanner bytes, and keeps review storage raw-free$"` | E1-M07 |
| E1-T8-S04 | scanner loop — two named images scan strictly in order and retain both distinct Scanner candidates | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "two named images scan strictly in order and retain both distinct Scanner candidates$"` | E1-M14 |
| E1-T8-S05 | scanner loop — canceling after a held first image scan prevents the second request and creates no Scanner draft | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "canceling after a held first image scan prevents the second request and creates no Scanner draft$"` | E1-M14 |
| E1-T8-S06 | scanner loop — mixed text and image input stays drafted, reports the deferral, and makes no scan request | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "mixed text and image input stays drafted, reports the deferral, and makes no scan request$"` | E1-M13 |
| E1-T8-S07 | scanner loop — multiple Scanner candidates export exactly the selected VEVENT subset in one calendar download | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "multiple Scanner candidates export exactly the selected VEVENT subset in one calendar download$"` | E1-M09 |
| E1-T8-S21 | scanner loop — partial Scanner export removes only the selected draft and reload recomputes retained readiness | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "partial Scanner export removes only the selected draft and reload recomputes retained readiness$"` | E1-M21 |
| E1-T8-S09 | scanner loop — missing Scanner title stays visible as a warning and exports calendar bytes without SUMMARY | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "missing Scanner title stays visible as a warning and exports calendar bytes without SUMMARY$"` | E1-M02, E1-M03 |
| E1-T8-S10 | scanner loop — missing Scanner start blocks export until a complete temporal edit supplies it | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "missing Scanner start blocks export until a complete temporal edit supplies it$"` | E1-M06 |
| E1-T8-S11 | scanner loop — evidence-free DST-fold edit stays blocked until clearing timezone makes it a floating warning | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "evidence-free DST-fold edit stays blocked until clearing timezone makes it a floating warning$"` | E1-M12 |
| E1-T8-S12 | scanner loop — narrow viewport keeps every Scanner review control keyboard reachable with stable accessible names | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "narrow viewport keeps every Scanner review control keyboard reachable with stable accessible names$"` | E1-M11 |
| E1-T8-S13 | scanner loop — reload restores raw-free Scanner drafts with recomputed readiness | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "reload restores raw-free Scanner drafts with recomputed readiness$"` | E1-M10 |
| E1-T8-S14 | scanner loop — edited claims clear only their evidence and export fresh Scanner calendar bytes | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "edited claims clear only their evidence and export fresh Scanner calendar bytes$"` | E1-M04, E1-M05 |
| E1-T8-S15 | scanner loop — canceling a delayed first scan leaves the succeeding second scan as the only review draft | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "canceling a delayed first scan leaves the succeeding second scan as the only review draft$"` | E1-M08 |
| E1-T8-S16 | scanner loop — malformed successful scan response creates no draft and reports a processing error | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "malformed successful scan response creates no draft and reports a processing error$"` | E1-M01 |
| E1-T8-S17 | scanner loop — Scanner all-day provider date / Asia-Tokyo preserves the calendar date through review editing and DATE export | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "Scanner all-day provider date — Asia/Tokyo viewer preserves the calendar date through review editing and DATE export$"` | E1-M18 |
| E1-T8-S18 | scanner loop — Scanner all-day provider date / America-Los_Angeles preserves the calendar date through review editing and DATE export | `e2e/scanner-product-loop.spec.ts --project=chromium --workers=1 --grep "Scanner all-day provider date — America/Los_Angeles viewer preserves the calendar date through review editing and DATE export$"` | E1-M18 |

Inventory command and result:

```bash
node node_modules/@playwright/test/cli.js test \
  e2e/community-limit.spec.ts e2e/event-extraction.spec.ts \
  e2e/export-ics.spec.ts e2e/draft-and-history.spec.ts \
  e2e/inline-edit-timezone.spec.ts e2e/timezone-resolution.spec.ts \
  e2e/url-scrape.spec.ts e2e/scanner-product-loop.spec.ts --list
# Total: 134 tests in 8 files (67 test definitions × Chromium and WebKit)
```

The live files still containing legacy SSE/parser mechanics are
`e2e/helpers.ts`, `e2e/draft-and-history.spec.ts`, `e2e/export-ics.spec.ts`,
`e2e/inline-edit-timezone.spec.ts`, and `e2e/event-extraction.spec.ts`.

### E1-M21 post-review causality and mutation-scope repair

Independent review rejected three aspects of the first S21 proof: a restored draft could not leave
export disabled only because it had zero selection; the stored-record comparison was partial; and
the `reviewDrafts.length === 1` mutation also broke unrelated initial one-draft persistence. The
durable S21 repair now preserves the pre-export unselection assertion, deep-compares the complete
retained stored record (`version`, `id`, `exportUid`, `createdAt`, complete candidate and claims,
`scanIssues`, and source) before export versus after reload, and proves `readiness` is absent from
both stored values. After reload it explicitly checks the exact retained draft and then requires the
visible candidate-derived `missing_start` blocker and disabled export button, proving the disabled
state is not caused by zero selection.

A fresh initial attempt to assert that the restored checkbox selected itself was non-accepting. On
the isolated development server, the checkbox remained unchecked for the full five-second
Playwright assertion timeout. `ReviewDraftSection` mutates `seenIds.current` from inside its
`setSelectedIds` updater; React StrictMode's double updater invocation lets the discarded call mark
the restored ID seen before the committed call. Because `ReviewDraftSection.tsx` is protected from
this proof unit, S21 makes no selection-persistence claim and explicitly selects the restored draft
for the readiness causality assertion.

Fresh repair evidence used `/private/tmp/e1-m21-review.Da0pXa`. Its pristine hashes were:

```text
fb2d04758c291173098ec8a191b619212c15e269d57e086ed409c2bbda8cc877  playwright.config.ts
ffffb7aa4f281bd54c51e55c8f375dd3a86d3e98c32bebcf4d1845ce49e4f920  next.config.js
83d292a6930a317ea31ef48e220097d2ca10c6c505f41d5954795acef48ca3b9  tsconfig.json
775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f  src/app/page.tsx
2821608722c3b5eaf77540be02ee99708841766902bef1008595a03a07004598  e2e/scanner-product-loop.spec.ts
```

The literal repair isolation forward patch was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3777';
+const localUrl = 'http://localhost:3793';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3793`
@@
-  webServer: isProd
-    ? undefined
-    : {
-        command: devCommand,
-        url: localUrl,
-        reuseExistingServer: !isOffline && !process.env.CI,
-        timeout: 120000,
-      },
+  webServer: undefined,
--- next.config.js
 const nextConfig = {
+  distDir: '.next-e1-m21-review',
```

The server used `createE1OfflineEnvironment()` plus the egress-blocking preload on unused port
3793 and isolated `.next-e1-m21-review`; no credential, provider request, external egress, shared
3777 server, or shared `.next` was used. After the explicit-selection repair, the focused pristine
S21 command passed `1 passed (3.4s)`.

The exact successful-partial-export mutation used a transient ref that is set only after a
successful export result leaves at least one draft. The persistence effect consumes and resets that
flag once; unrelated initial one-draft persistence never sets it:

```diff
@@
   const abortRef = useRef<AbortController | null>(null);
+  const clearReviewStorageAfterPartialExportRef = useRef(false);
   const activeSubmissionRef = useRef<string | null>(null);
@@
     if (reviewDrafts.length === 0) {
       reviewStorage.clear();
+    } else if (clearReviewStorageAfterPartialExportRef.current) {
+      clearReviewStorageAfterPartialExportRef.current = false;
+      reviewStorage.clear();
     } else {
       reviewStorage.save(reviewDrafts);
@@
     if (result.ok) {
       const exportedIds = new Set(drafts.map(({ id }) => id));
-      setReviewDrafts((previous) => previous.filter(({ id }) => !exportedIds.has(id)));
+      setReviewDrafts((previous) => {
+        const remaining = previous.filter(({ id }) => !exportedIds.has(id));
+        clearReviewStorageAfterPartialExportRef.current = remaining.length > 0;
+        return remaining;
+      });
     }
```

The mutated page hash was:

```text
f4de4967e59d425bf7cfcf27b4df1cdbbb345ea94cca295cff099a0b580fa341  src/app/page.tsx
```

The mutation command ran S21 together with the unrelated initial one-draft reload control:

```text
--grep "partial Scanner export removes only|reload restores raw-free" --workers=1 --project=chromium

S21: Expected retained article count 1, Received 0
at e2e/scanner-product-loop.spec.ts:784
reload restores raw-free Scanner drafts with recomputed readiness: passed
1 failed, 1 passed (11.4s)
```

S21 reached the post-reload count only after strict fixture validation, complete pre-export storage
capture, exact selection/unselection, byte-exact download, and in-memory one-draft retention. The
control's pass proves the mutation does not break unrelated initial one-draft persistence. This is
the accepting E1-M21 RED.

The literal inverse was:

```diff
@@
   const abortRef = useRef<AbortController | null>(null);
-  const clearReviewStorageAfterPartialExportRef = useRef(false);
   const activeSubmissionRef = useRef<string | null>(null);
@@
     if (reviewDrafts.length === 0) {
       reviewStorage.clear();
-    } else if (clearReviewStorageAfterPartialExportRef.current) {
-      clearReviewStorageAfterPartialExportRef.current = false;
-      reviewStorage.clear();
     } else {
       reviewStorage.save(reviewDrafts);
@@
     if (result.ok) {
       const exportedIds = new Set(drafts.map(({ id }) => id));
-      setReviewDrafts((previous) => {
-        const remaining = previous.filter(({ id }) => !exportedIds.has(id));
-        clearReviewStorageAfterPartialExportRef.current = remaining.length > 0;
-        return remaining;
-      });
+      setReviewDrafts((previous) => previous.filter(({ id }) => !exportedIds.has(id)));
     }
```

`cmp -s src/app/page.tsx /private/tmp/e1-m21-review.Da0pXa/page.tsx` exited 0 and restored
`775bb5de331afdb30102a4bcc4487a67e21b60aafdf74bdfe6ec542bb2f7b59f`. The same two-test
command then passed `2 passed (5.1s)`.

The literal configuration inverse restored 3793 to 3777, restored the conditional `webServer`,
removed `distDir: '.next-e1-m21-review'`, and exactly reversed Next's generated tsconfig lib,
paths, include order/entry, exclude, and formatting changes. All configuration and page
`cmp -s` checks returned 0 with the pristine hashes above. Only the inspected
`.next-e1-m21-review` and `test-results` outputs were removed; port 3793 is closed.

The exact repair configuration inverse was:

```diff
--- playwright.config.ts
-const localUrl = 'http://localhost:3793';
+const localUrl = 'http://localhost:3777';
@@
-  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3793`
+  ? `node --require=${offlinePreload} node_modules/next/dist/bin/next dev -p 3777`
@@
-  webServer: undefined,
+  webServer: isProd
+    ? undefined
+    : {
+        command: devCommand,
+        url: localUrl,
+        reuseExistingServer: !isOffline && !process.env.CI,
+        timeout: 120000,
+      },
--- next.config.js
-  distDir: '.next-e1-m21-review',
--- tsconfig.json
-    "lib": [
-      "dom",
-      "dom.iterable",
-      "esnext"
-    ],
+    "lib": ["dom", "dom.iterable", "esnext"],
@@
-    "paths": {
-      "@/*": [
-        "./src/*"
-      ]
-    }
+    "paths": {
+      "@/*": ["./src/*"]
+    }
@@
-  "include": [
-    "**/*.ts",
-    "**/*.tsx",
-    ".next/types/**/*.ts",
-    "next-env.d.ts",
-    ".next-e1-m21-review/types/**/*.ts"
-  ],
-  "exclude": [
-    "node_modules"
-  ]
+  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
+  "exclude": ["node_modules"]
```

Fresh post-repair guards passed:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
exit 0

node node_modules/eslint/bin/eslint.js e2e/scanner-product-loop.spec.ts
exit 0

bun test src/services/__tests__/scannerDraft.test.ts --isolate
12 pass, 0 fail, 47 expect() calls

bun run assert:e1-protected
Protected inventory verified: 53300 records.

bun run assert:e1-paths 4cc32012ca510006ab672e8699f3e07c7c7b11a6 HEAD
E1 path guard accepted 190 changed path(s).

git diff --check
exit 0

git diff --no-index --check /dev/null e2e/scanner-product-loop.spec.ts
no whitespace output; raw exit 1 (expected because the untracked file differs from /dev/null)

git diff --no-index --check /dev/null docs/testing/e1-mutation-ledger.md
no whitespace output; raw exit 1 (expected because the untracked file differs from /dev/null)
```

The final repaired spec hash is
`bbed085579ef1f314ce4ded770583db8dc1df6e55ecb1a9f4b2bdb15412dd10e`. The cumulative
tracked/untracked inventory is otherwise unchanged; protected `.claude/**`,
`tasks/task-192.md`, and `tasks/task-193.md` were not read, edited, staged, or committed.

## E1-T8-LIVE-SCENARIO-DISPOSITION — blocking plan handoff, non-accepting

This is the durable ledger counterpart to the authoritative Task 8 plan revision. It accounts
for all 67 live definitions in the exact-name table above: `C:9 + X:14 + E:3 + D:17 + I:2 + T:2 +
U:2 + S:18 = 67`. It changes no accepted mutation result. `UNPROVEN` means either “delete or
migrate as specified” for Scanner-path legacy coverage, or “preserve as non-Scanner coverage” for
the explicitly listed unrelated behavior; it never becomes mutation evidence by being relabelled.

| Exact inventory IDs | Terminal disposition | Final ledger value |
|---|---|---|
| C01–C08 | Preserve in `e2e/community-limit.spec.ts`. | `non-Scanner coverage` |
| C09 | Preserve strict `/api/scan` 402 coverage. | E1-M15 |
| X01, X02, X04–X07, X10, X13, X14 | Delete legacy parse/SSE/EventCard/route cases. | Replacements: T01/M17 (X01,X06); X03/M20 (X02,X05,X07); S16/M01 (X04,X13,X14); S14/M04,M05 (X10). |
| X03 | Preserve Scanner ordered-candidate coverage. | E1-M20 |
| X08, X09 | Preserve input-shell affordances. | `non-Scanner coverage` |
| X11 | Migrate error-dismissal assertion to malformed successful `/api/scan`. | E1-M01 |
| X12 | Migrate Cmd+Enter assertion to strict Scanner request plus raw-free storage assertion. | E1-M07 |
| E01–E03 | Delete legacy EventCard/`ics` export cases. | T01/M17 (E01); S07/M09 (E02,E03). |
| D01–D11, D14–D17 | Move preserved Recent-input behavior to `e2e/recent-input.spec.ts`; replace only fixture seam as needed. | `non-Scanner coverage` |
| D12, D13 | Delete obsolete parse-stream/SSE cases. | S15/M08 (D12); S07/M09 and S15/M08 (D13). |
| I01, I02 | Delete legacy EventCard inline-timezone cases. | S02/M19 and T01/M17 (I01); S02/M19 (I02). |
| T01, T02 | Preserve Scanner temporal authority. | E1-M17 |
| U01 | Preserve URL-pill input-shell behavior. | `non-Scanner coverage` |
| U02 | Preserve host-enriched Scanner request. | E1-M16 |
| S01 | Delete redundant non-causal Scanner happy path. | S14/M04,M05 |
| S02–S07, S09–S18, S21 | Preserve Scanner product-loop cases. | M19; M07; M14; M14; M13; M09; M02/M03; M06; M12; M11; M10; M04/M05; M08; M01; M18; M18; M21, in stable-ID order. |

`E1-T8-S21` is the stable ID for the current partial-retention test. The earlier inventory row
mislabelled it `S08`; that row is corrected above, and `S08` remains intentionally unused. Before
implementation, run the recorded eight-suite `--list` command and compare both the exact titles
and 67-definition count. After the dispositions are implemented, re-list the actual retained suites
and record every resulting title: Scanner-path titles must name accepted E1-M evidence; preserved
community, input-shell, and Recent-input titles must say `non-Scanner coverage` and still be run by
`bun run verify:e1:offline` in Chromium and WebKit. Add only `e2e/recent-input.spec.ts` to the
path allowlist; retaining deleted legacy test paths is required until their base-to-HEAD deletion
diff is no longer audited.

## E1-T8-LIVE-SCENARIO-DISPOSITION-R2 — independent-review repair, blocking

This entry supersedes conflicting instructions in the preceding disposition handoff. It does not
alter historical RED/restored-green evidence. The 67-row focused-command column above is now an
argv tail: every selector has an unanchored start and a `$` end anchor. It must be preflighted by
the planned isolated launcher with `--list`, and acceptance requires exactly one Chromium listing
before the matching test runs. A command tail is not evidence by itself.

| Checkpoint | Definition count | Required accounting |
|---|---:|---|
| Initial | 67 in 8 files | Preserve every current title and stable ID. C04 is separately marked discovery-only pattern-unlock coverage, not Scanner mutation acceptance. |
| Transitional | 67 in 9 files | Move D01–D11 and D14–D17 to `e2e/recent-input.spec.ts`; keep all titles and behavior. Legacy fixture helpers remain until no consumer remains. |
| Post-disposition | 50 classified original-ID entries plus C04 discovery-only | Retire exactly X01, X02, X05, X06, X07, X10, X13, X14, E01, E02, E03, D12, D13, I01, I02, and S01 as parser-driven leaf definitions. X04 is migrated to the valid-zero Scanner contract. The retained behavior for X01/X06/X10/E01–E03/I01/I02 is consolidated separately below, not discarded. |

The separate non-Scanner `e2e/calendar-event-regression.spec.ts` must preserve the consolidated
CalendarEvent behavior in Chromium and WebKit using no `/api/parse` fixture: seed
`event_every_temp_unsaved` before navigation for page.tsx → `getTempUnsavedEvents` →
`UnsavedEventsSection`/`EventCardList`, seed `event_every_history` for saved
`useHistory`/`EventFields`, and upload an `.ics` fixture through SmartInput for the imported
`handleCalendarFilesSubmit` path. It asserts wall-clock/date, timezone chip, collapsed/expanded
description, edit/timezone persistence, duration preservation, UTC bytes, batch filename, and
selected-subset export. These assertions are explicitly `non-Scanner coverage`.

X04 migrates to a valid-zero Scanner browser/unit contract: a strict response with zero candidates
means truthfully no review claims, not a fabricated legacy parser error. Its non-mutation proof
produces zero drafts/articles and no invented processing error. X12 keeps
Cmd+Enter only with the exact post-scan assertion
`localStorage.getItem('event-every:last-scan-source') === null`; E1-M07 RED must fail there.
X13/X14 become request-edge unit proof in `src/app/api/scan/__tests__/route.test.ts` and
`src/services/__tests__/scanClient.test.ts`, never browser/S16/M01 evidence.

The future `scripts/run-e1-focused.ts` is mandatory for all focused browser work. It creates its
environment with `createE1OfflineEnvironment()`, checks unused loopback port 3794, snapshots and
literally forward-patches Playwright/Next configuration to 3794 plus `.next-e1-t8-focus-3794`,
launches the server and Playwright under the scrubbed egress preload, then inverse-patches,
hash-compares, closes the recorded child PID/port, and removes only inspected isolated output.
The smallest additional allowlist entries are `e2e/calendar-event-regression.spec.ts` and
`scripts/run-e1-focused.ts`, in addition to the already-required `e2e/recent-input.spec.ts`.

## E1-T8-LIVE-SCENARIO-DISPOSITION-R3 — count and retained-product repair, blocking

R3 supersedes the earlier three-definition CalendarEvent consolidation. Exactly 16 original
definitions retire; 51 originals remain as 50 classified rows plus C04 discovery-only. Eight fresh
non-Scanner CalendarEvent definitions replace the eight retired retained-product leaves, making the
exact final Task 8 discovery total 59 per browser:
`C9 + X6 + D15 + T2 + U2 + S17 + CE8`. The complete discovery list must additionally show C04’s
full pattern-unlock title even though C04 is not a mutation-matrix row.

| Stable ID | Exact title | Exact focused Chromium argv tail | Status |
|---|---|---|---|
| E1-T8-CE01 | legacy CalendarEvent renders exact America/New_York wall-clock date | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent renders exact America/New_York wall-clock date$"` | non-Scanner coverage; X01; fresh America/New_York temp-unsaved seed |
| E1-T8-CE02 | legacy CalendarEvent renders UTC timezone chip | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent renders UTC timezone chip$"` | non-Scanner coverage; X06; fresh UTC temp-unsaved seed |
| E1-T8-CE03 | legacy CalendarEvent reveals description only after expansion | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent reveals description only after expansion$"` | non-Scanner coverage; X10; fresh UTC temp-unsaved seed |
| E1-T8-CE04 | legacy CalendarEvent single export writes one timed UTC VEVENT | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent single export writes one timed UTC VEVENT$"` | non-Scanner coverage; E01; fresh one-event seed |
| E1-T8-CE05 | legacy CalendarEvent batch export writes three VEVENTs and batch-events-3.ics | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent batch export writes three VEVENTs and batch-events-3.ics$"` | non-Scanner coverage; E02; fresh three-event seed |
| E1-T8-CE06 | legacy CalendarEvent batch export omits the deselected event | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent batch export omits the deselected event$"` | non-Scanner coverage; E03; independent fresh three-event seed |
| E1-T8-CE07 | legacy CalendarEvent edited start survives timezone change | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent edited start survives timezone change$"` | non-Scanner coverage; I01; fresh UTC raw-temporal seed |
| E1-T8-CE08 | legacy CalendarEvent moving start past end preserves duration | `e2e/calendar-event-regression.spec.ts --project=chromium --workers=1 --grep "legacy CalendarEvent moving start past end preserves duration$"` | non-Scanner coverage; I02; independent fresh UTC raw-temporal seed |

Every CE test uses a fresh page and one seed-before-navigation init script. CE01/CE02/CE03 use
only `event_every_temp_unsaved`; CE04–CE06 also independently exercise saved
`event_every_history` and the SmartInput calendar-file-import route. No new E2E destination beyond
`e2e/calendar-event-regression.spec.ts` is permitted. The existing R2 launcher is refined as
follows: focused mode requires exactly one end-anchored grep and passes an exactly-one Chromium
`--list` preflight; discovery mode forbids grep and requires the seven final suite paths, 59 titles
per selected Chromium/WebKit project, and C04’s full title before running that project. Both modes
establish signal handlers and `try/finally` before any patch, use unique absent invocation output
paths, record/await only the launched Next child PID, inverse-restore/hash-verify configuration,
and remove only invocation-created paths.

X04 is a retained classified valid-zero case: observe exactly one strict expected `/api/scan`
request, await its schema-valid empty response and the vanished cancel control, then assert zero
review articles and zero error notifications. Its matching empty-response unit proof is
non-mutation; M01 is not cited.

## E1-T8-LIVE-SCENARIO-DISPOSITION-R4 — complete-discovery and owned-output repair, blocking

R4 distinguishes the Task 8 subset from final verification. The seven Task 8 retained paths have
59 definitions per browser. Complete non-production discovery additionally includes existing
`e2e/pattern-unlock.spec.ts`: 60 definitions per browser and 120 across Chromium plus WebKit.
Record the 59 subset list for the Task 8 checkpoint, but require the latter 60/120 result from the
complete final verification; neither count replaces the other.

The future isolated launcher must own all transient output. Its forward `playwright.config.ts`
patch sets a unique `outputDir` of `test-results-e1-t8-focus-<suffix>` and HTML reporter folder of
`playwright-report-e1-t8-focus-<suffix>` with `open: 'never'`, while the Next patch sets unique
`.next-e1-t8-focus-<suffix>`. Before patching the exact `mktemp -d` result must exist and be empty;
only those three derived output paths must be absent. After execution it literal-inverse-restores
and hash-verifies configuration and removes only those invocation-created paths.

It records both child handles/PIDs. On every normal, failing, or signal path it terminates and
awaits Playwright first, then Next, then restores/verifies config, confirms port 3794 closed, and
cleans owned paths. No port/process-name kill, shared output deletion, or cleanup before child
await is accepting evidence.

## E1-T8-FOCUSED-RUNNER-SEAM — implementation proof, non-browser

On 2026-08-01, `scripts/run-e1-focused.test.ts` was written before its runner existed. The first
`bun test scripts/run-e1-focused.test.ts` invocation failed with `Cannot find module
'./run-e1-focused'` (0 pass, 1 fail). The implemented pure seam then passed 7 tests / 22
expectations: focused argument shape; invalid-tail rejection; explicit Task 8 (59) versus complete
(60 per selected browser, 120 dual-browser) discovery accounting; C04; owned path derivation; and
Playwright-before-Next termination/await order. Targeted ESLint and `bunx tsc --noEmit` passed.

The implementation has not launched Playwright, Next, a browser, a provider, or an external
service. It is therefore only lifecycle/unit evidence, not a replacement for the R4 59/60/120
discovery records, mutation RED/restored-green evidence, or browser acceptance. The runner/test
and the two already-approved future spec destinations are added to `E1_PATHS`; no other allowlist
expansion is recorded.

## E1-T8-FOCUSED-RUNNER-SEAM-R5 — review repair, non-browser

The preceding 7-test implementation claim is rejected and provides no acceptance credit. The
independent review found focused-argument injection, unsafe output ownership, insufficient child
settlement semantics, snapshot overwrite instead of literal inverse restoration, and rejected-promise
signal handling. The repair test was written first and failed because `inverseConfigPatches` was not
exported (0 pass, 1 fail). The repaired pure suite then passed **15 tests / 63 expectations**.

The repair proves exact five-token focused grammar and injection rejection; WebKit and dual-project
discovery parsing plus 60-title-per-browser validation; environment credential scrubbing/preload
shape; literal forward/inverse/hash behavior and injected-config detection; output collision byte
preservation; recorded-child TERM/SIGKILL/await order including kill and exit failure; resolving
signals at pre-patch, Next-wait, list, and run; and independent cleanup-failure aggregation. The
runner uses only its recorded child handles and does not restore or remove owned paths while one is
unsettled. Incremental-disabled typecheck and targeted lint passed. No E2E/browser/server/network,
provider, credential, staging, or commit action occurred, so R4's live proof remains blocking.

## E1-T8-FOCUSED-RUNNER-SEAM-R6 — bounded cleanup repair, non-browser

R5 is rejected and non-accepting because it did not literally reverse the observed generated
tsconfig include shape, locally blank auth-pattern values, or aggregate independent removal errors.
The R6 test-first attempt failed with a missing `inverseTsconfigMutation` export (0 pass, 1 fail).
The repaired pure suite passed **18 tests / 70 expectations**.

R6 proves byte-identical literal inverse/hash restoration of a synthetic observed Next-generated
multi-line `distDir/types/**/*.ts` include; runner-local inherited and supplied-dotenv auth-pattern
scrubbing with no value output; and deterministic dist/results/report/temp removal despite earlier
failures, including full nested aggregate-cause rendering. `run-e1-offline.ts` remains unchanged.
Typecheck and targeted lint passed; no E2E/browser/server/network/provider/credential/staging or
commit action occurred. This remains non-browser proof and does not unblock R4's live gates.

## E1-T8-FOCUSED-RUNNER-SEAM-R7 — full Next tsconfig repair, non-browser

R6 is rejected and non-accepting because its tsconfig inverse used a reduced fixture. R7 derives
the exact installed-Next form from the complete current pristine repository JSON: all arrays and
paths serialize in full, original `.next/types/**/*.ts` remains, existing includes sort, and the
invocation-specific generated type include appends. The runtime checks byte equality with that one
full form before restoring pristine bytes; a mismatch preserves the current concurrent edit and
fails rather than overwriting it.

The actual-full-byte test initially failed (17 pass, 1 fail) against the prior reduced inverse,
then passed **18 tests / 72 expectations** with hash equality and mismatch preservation. Typecheck
and targeted lint passed. No browser/server/network/provider/credential/staging/commit action
occurred. R4 live discovery, mutation, and browser gates remain blocking.

## E1-T8-RECENT-INPUT-MOVE — transitional acceptance

Exactly D01–D11 and D14–D17 moved to `e2e/recent-input.spec.ts`; all 15 titles and
user-visible assertions remain exactly once. Successful transformations now use candidates built
through `EventCandidateSchema.parse` and synchronize on the exact `Scanner review drafts` article
count. D12/D13 and all legacy helper exports remain for the next batch. Every moved row remains
`non-Scanner coverage`.

The transitional inventory is exactly 67 definitions across nine files:
`C9 + X14 + E3 + D2 + I2 + T2 + U2 + S18 + Recent15 = 67`. Each moved title passed an isolated
one-title Chromium `--list` preflight and focused run through `scripts/run-e1-focused.ts` (15/15
reported `1 passed`). Bun's run-mode shell form used `-- --` so the runner received its required
literal separator and exact five-token Playwright tail. Configuration hashes restored, port 3794
closed, and no invocation-owned output remained.

Fresh parent typecheck, targeted lint, cumulative path guard 191, protected inventory 53,300,
tracked/untracked whitespace, exact-title, and diff gates passed. Independent native-controlled
Sol/high rollout
`/Users/manblack/.codex/sessions/2026/08/01/rollout-2026-08-01T19-18-24-019fbf9f-1fb7-7083-b2ca-4ae388313286.jsonl`
records effective `gpt-5.6-sol`/high and returned `VERIFIED:true` with no findings. No provider,
credential, external network, staging, Event Every commit, or deployment action occurred.

## E1-T8-POST-DISPOSITION — terminal Task 8 acceptance (2026-08-02)

The final seven-suite Task 8 inventory is exactly **59 definitions per browser**:
`C9 + X6 + D15 + T2 + U2 + S17 + CE8`. Adding the separately-accounted existing C04
`pattern-unlock` definition yields **60 per browser / 120 total**. Exactly X01, X02, X05, X06,
X07, X10, X13, X14, E01, E02, E03, D12, D13, I01, I02, and S01 retired. CE01–CE08 independently
retain the eight CalendarEvent behaviors as `non-Scanner coverage`. Focused Chromium runs passed
for CE01–CE08, X04, X11, and X12. X04 observed one exact text `/api/scan` request, awaited a strict
empty response, and produced no review draft or processing error. Its matching unit now projects
the same schema-valid response to `[]` and proves no identity allocation. X12 continues to prove
the exact raw-free `event-every:last-scan-source` assertion.

The focused launcher unit suite passed **19 tests / 76 expectations** after the final settlement
repair; combined with `scannerDraft.test.ts`, the direct repaired seam passed **32 tests / 125
expectations**. A rejected child-exit promise now marks teardown unsettled, and lifecycle proof
shows inverse, hash, port, and owned-path removal do not run without confirmed termination. The
live parser accepts Playwright testDir-relative paths and its actual describe separator. The
existing narrow-viewport keyboard test uses the platform-appropriate forward traversal while
retaining the same ordered accessible-control assertions.

The first broad post-review replay is rejected and receives no acceptance credit: Bun 1.3.13
segfaulted while entering `scanClient.test.ts`. The crash-point file immediately passed **5/5** in
an isolated offline replay. A wholly fresh `bun run verify:e1:offline` then passed **246 unit tests,
0 failures, 949 expectations**, lint with **0 errors / 18 existing warnings**, typecheck, production
build, and the complete **120/120** Chromium/WebKit matrix. The focused X04 browser replay passed.
The cumulative path guard accepted 192 paths, protected inventory verified 53,300 records,
`git diff --check` passed, ports 3777/3794 were closed, and no invocation-owned outputs remained.

Controlled Sol/high review initially returned `VERIFIED:false` with two Important findings: the
missing X04 projection unit and rejected child exit being treated as cleanup-safe. Both were
repaired and the same reviewer was resumed against the new fixed point. Rereview returned
**`VERIFIED:true`**, with no Critical, Important, or Minor findings. Effective route metadata:
`provider=openai`, `model=gpt-5.6-sol`, `reasoning_effort=high`; report:
`/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260802T153028Z-66377-e1-t8-post-disposition-acceptance-rereview/report.json`.
No credential, provider request, external network, deployment, publication, staging, or commit was
used for this proof. Task 8 is ready for its exact-path commit; Task 9 removal-assertion RED remains
the next dependency-ready gate.

## E1-T9-LEGACY-PARSE-REMOVAL-RED (2026-08-02)

At clean accepted baseline `ab872d0`, the terminal path guard was extended before production
deletion. Its first run is rejected because it falsely classified `e2e/helpers.ts` as a browser
production `/api/scan` call site. After restricting that check to production `src/**`, the guard
failed only on the intended legacy state:

- `/api/parse` remains in `src/services/__tests__/parser.test.ts`;
- `parseEventsBatch` remains in `src/app/api/parse/route.ts` and `src/services/parser.ts`;
- executable `ParsedEvent` use remains in `src/services/parser.ts` and its test; and
- `src/app/api/parse/route.ts`, `src/services/parser.ts`, and
  `src/services/__tests__/parser.test.ts` all still exist.

The ReviewDraft exporter/`ics`, browser OpenRouter, single production `/api/scan`, `buildSSE`, and
`mockParseAPI` assertions produced no violation. Typecheck, targeted lint, and whitespace checks
passed. Only the guard/plan/ledger are modified alongside the protected untracked paths; no
production deletion, browser, server, network, provider, credential, staging, commit, publication,
or deployment occurred. This is the accepting RED for Task 9 GREEN.

## E1-T9-LEGACY-PARSE-REMOVAL-GREEN (2026-08-02)

The accepted RED became green by deleting exactly the parse route, parser service, and parser unit
test. The README/environment boundary now records Scanner commit/package provenance, fixed
DeepSeek text-link and Mistral vision roles, host versus package ownership, request-lifetime raw
source handling, raw-free Scanner review storage, the separate unchanged Recent-input IndexedDB
feature, offline verification, and deferred Cloudflare/E1 exclusions. `OPENROUTER_MODEL` remains
for host URL detection. `ics` stays because `src/services/exporter.ts` still imports it for the
untouched saved-history CalendarEvent path.

The first post-deletion guard errored on the ignored stale Next validator rather than the product
boundary. Removing only `.next/types/validator.ts` allowed normal regeneration and typecheck; no
tracked byte or guard condition was weakened. The terminal guard passed with 203 changed paths,
units passed **241/241 / 943 expectations**, typecheck and targeted lint passed, protected
inventory remained 53,300, and whitespace was clean. This is focused GREEN only; terminal offline
matrix, commit, committed replay, and independent Sol/high acceptance remain required.

## E1-T9-TERMINAL-LOCAL-PROOF (2026-08-02)

Frozen installation passed without dependency or lockfile change. The fresh offline gate passed
**241 units / 943 expectations**, zero lint errors (18 existing warnings), typecheck, production
build with no `/api/parse` route, and **120/120** Chromium/WebKit scenarios. The terminal path guard
accepted 203 cumulative paths; protected inventory verified 53,300; whitespace and closed-port
checks passed. Status contains only `.env.example`, README, plan/ledger, the terminal guard, the
three parser deletions, and protected `.claude/`/task files. Exact-path commit and independent
post-commit acceptance remain blocking. No provider, credential, external network, staging,
publication, or deployment action occurred.

## E1-T9-PLAN-PIN-RECONCILIATION (2026-08-02)

The first terminal Sol/high review accepted every inspected runtime and proof boundary but
returned `VERIFIED:false` on one Important documentation-authority mismatch. The original E1 plan
still described historical Scanner baseline `98aec60` as the final package pin, while accepted
RPKG-1 through RPKG-4 evidence and all live vendor/provenance seams bind Scanner `c03cf1a`. The
implementation plan now explicitly records that accepted supersession, including provenance
schema 2, the 138-entry canonical pack digest, and the projected artifact digest. No production,
test, dependency, lockfile, browser, provider, network, credential, or protected-path byte changed
in this repair. Report:
`/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260802T155801Z-83291-e1-terminal-acceptance-review/report.json`.
Static proof, docs-only commit, and independent rereview remain blocking; no mutation row changes
because this is an authority-document correction rather than a product behavior change.
