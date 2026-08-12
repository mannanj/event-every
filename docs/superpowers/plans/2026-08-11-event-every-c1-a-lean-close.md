# Event Every C1-A private-use lean closure plan

Status: accepted after independent review; gate-discovered prerequisites recorded before final review

Accepted review:
`/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T032452Z-17863-c1-a-private-lean-plan-final-rereview/report.json`

Date: 2026-08-11

Baseline: Event Every `469bd1de78340b61348613e0ba1404d5770e1283`

Design authority: Calendar Casa
`docs/superpowers/specs/2026-08-11-private-use-process-redesign.md`

## Goal

Close C1-A against the accepted private-use threat model using the product tests already delivered
by Tasks 1-10, ten focused causal mutations, credential-free local OpenNext/workerd and Chromium /
WebKit proof, and one fixed-rubric review. Remove the provisional Task 11 evidence platform from the
active gate without deleting or modifying its preserved files.

This plan closes only `C1-A-LEAN`. It does not claim atomic provider budget reservation,
idempotent effects, durable ambiguous outcomes, owner Access, deployment, backup/rollback, or owner
data. Those remain gates in `C1-B-PRIVATE`, `EE-PRIVATE-ARTIFACT`, and
`EE-PRIVATE-DEPLOYED`.

## Working boundary

- Work locally with synthetic data and the installed dependency tree.
- Do not read or use credential values. Do not call providers or non-loopback network targets.
- Do not authenticate, deploy, publish, mutate DNS/billing, stage unrelated paths, or commit
  protected work.
- Preserve `.claude/**`, `tasks/task-192.md`, and `tasks/task-193.md`.
- Do not invoke `run-c1-a-mutations.ts`, `--write-ledger`, `--verify-ledger`,
  `--write-evidence`, or `validate-c1-a-evidence.ts`.
- A focused mutation may change one clean production file at a time. Restore it with the exact
  inverse `apply_patch`, prove its SHA-256, and rerun GREEN before touching another target.
- Same-owner attacks on a local proof tool, signed evidence publication, immutable snapshots,
  process supervision, and exhaustive mutation ledgers are `PUBLIC-READY` work, not C1-A blockers.

## File ownership

The lean closure commit owns exactly these paths:

- `docs/superpowers/plans/2026-08-11-event-every-c1-a-lean-close.md`
- `docs/testing/c1-a-private-control-matrix.md`
- `package.json`
- `scripts/assert-c1-a-config.ts`
- `scripts/assert-c1-a-config.test.ts`
- `scripts/run-c1-a-offline.ts`
- `scripts/run-c1-a-offline.test.ts`

Production files named by the mutation table are temporary RED targets only and must be clean in
the final tree. No other path may be staged.

## Preserve and salvage the provisional Task 11 work

At the start and end, require these exact SHA-256 values:

| Preserved path | SHA-256 | Rule |
| --- | --- | --- |
| `docs/testing/e1-mutation-ledger.md` | `99880d600585a8dbf1c6286e028d687d517fe9ad4e2cd8b95d1ae147982353b1` | Keep the current unstaged append byte-for-byte; do not consume or stage it. |
| `scripts/run-c1-a-mutations.ts` | `2013de6d4dcbdddcba4e979cc6e96d20380fce8a99c8e34c1d2f4e431c3c0299` | Keep untracked and byte-identical; never execute it. |
| `scripts/run-c1-a-mutations.test.ts` | `cdc8dcb045415cee66fe9b7a4517e3e083ce35e468fd8e4063971b30d59583d1` | Keep untracked and byte-identical; never execute it. |

Salvage only the human-readable production mapping: the 45 IDs, targets, exact anchors, focused
commands, and named assertions inform the compact control matrix below. Do not import provisional
code, copy its lifecycle/publication machinery, create `docs/testing/c1-a-mutation-ledger.md`, or
create terminal evidence JSON. The provisional runner, its tests, the unstaged ledger narrative,
and the five latest review findings remain release-hardening evidence. They are not part of the
lean commit.

## Gate-discovered prerequisite commits

Two failures found while exercising the accepted gate were repaired and committed separately so
the lean closure commit remains the exact seven-path change reviewed above:

- `0a510e2` prevents Smart Input from becoming editable before React hydration. A delayed-JavaScript
  WebKit test reproduced the user-reported recoverable hydration error and input loss; the ordinary
  Chromium/Firefox/WebKit matrix passed after the repair.
- `055f87e` makes the existing community-exhaustion Worker E2E issue its three auth requests from the
  already-open browser page. Playwright's Node request fixture installs a custom HTTP agent that the
  C1-A offline preload correctly rejects; the repair preserves that guard and keeps every request on
  the loopback Worker bridge.

The official nine-step gate was rerun after both repairs and exited zero. Neither commit consumes or
changes the provisional Task 11 artifacts, and neither path belongs to the seven-path lean commit.

Run from Event Every before any edit and again after the final review:

```bash
shasum -a 256 \
  docs/testing/e1-mutation-ledger.md \
  scripts/run-c1-a-mutations.ts \
  scripts/run-c1-a-mutations.test.ts
git status --short
```

Stop if a hash differs. Do not repair or restore the preserved file without reconciling the exact
last session that changed it.

## Private control-to-proof matrix

Create `docs/testing/c1-a-private-control-matrix.md` with one row per control below. The document is
an index, not generated evidence: it names the committed production seam, current GREEN tests,
retained mutation ID when applicable, and the final observed result. It contains no raw fixture,
credential, username, absolute local path, full command output, or copied review narrative.

| Private control | Current proof |
| --- | --- |
| Runtime and route topology fail closed before C1-B provider state | `src/platform/__tests__/runtime.test.ts`; `test/worker/app-worker.test.ts`; retained M30 |
| Trusted edge identity ignores caller forwarding headers | `src/platform/__tests__/identity.test.ts`; `test/worker/app-worker.test.ts`; retained M01 |
| Same-origin, media, method, streamed byte cap, cancel, and rebuilt request | `src/platform/__tests__/admission.test.ts`; `test/worker/admission.integration.test.ts`; retained M02 and M03 |
| Scanner image structure and decoded size | `src/server/scanner/__tests__/image.test.ts`; retained M06 |
| Abort reaches provider transport and provider failures expose no body | `src/server/scanner/__tests__/transport.test.ts`; `src/lib/__tests__/llm.test.ts`; retained M08 and M09 |
| Resolver rejects private literals/redirects, caps response/text/title/URL, and blocks egress | `src/platform/resolver/__tests__/url-policy.test.ts`; `test/worker/resolver.integration.test.ts`; `test/worker/deny-egress.integration.test.ts`; retained M16 |
| Resolver day, lease, concurrency, nonce, and rollover behavior | `test/worker/resolver.integration.test.ts`; ordinary GREEN only at this gate |
| Pattern/cookie admin bypass remains disabled | `src/lib/__tests__/llm.test.ts`; `src/lib/__tests__/limits.test.ts`; Chromium/WebKit community-exhaustion scenario; retained M19 |
| Public keep-alive stays retired and private keep-alive is status-only and isolated | `src/app/api/keep-alive/__tests__/route.test.ts`; `test/worker/legacy-keepalive.integration.test.ts`; `test/worker/deny-egress.integration.test.ts` |
| Corrupt Scanner storage recovers without clearing unrelated state | `src/services/__tests__/reviewStorage.test.ts`; Chromium/WebKit corrupt-storage scenario; retained M21 |
| Scanner product loop remains raw-free and temporally correct | `bun run verify:e1:offline`; the accepted E1 tests and ledger at committed HEAD |
| No credential, provider, external-network, or deployment effect occurs during closure | C1-A scrubbed environment, offline preload, workerd deny-egress tests, protected-path/status inspection |

## Mutation selection and complete Task 11 classification

The ten retained mutations exercise one representative high-risk branch in each current private
control class. They are run once during closure, not in every full gate and not through the
provisional runner.

| ID | Target | Exact temporary replacement | Focus | Required RED assertion |
| --- | --- | --- | --- | --- |
| C1A-M01 | `src/platform/identity.ts` | `request.headers.get('cf-connecting-ip')` -> `request.headers.get('x-forwarded-for')` | A | `forged forwarding header is ignored` |
| C1A-M02 | `src/platform/admission.ts` | `return isAllowedOrigin(request, policy);` -> `return true;` | A | `cross-site text is rejected before route` |
| C1A-M03 | `src/platform/admission.ts` | `totalBytes += chunk.byteLength;` -> `totalBytes = Number(request.headers.get('content-length') ?? 0);` | A | `chunked overflow cancels the stream` |
| C1A-M06 | `src/server/scanner/image.ts` | `validateStructuredImage(decoded, mimeType)` -> `decoded.byteLength >= 4` | B | `truncated image structure is rejected` |
| C1A-M08 | `src/server/scanner/transport.ts` | `signal: input.signal,` -> `signal: undefined,` | C | `exact signal reaches fetch` |
| C1A-M09 | `src/lib/llm.ts` | `await response.body?.cancel();` -> `await response.json();` | D | `provider error body remains unread` |
| C1A-M16 | `src/platform/resolver/url-policy.ts` | `redirect: 'manual',` -> `redirect: 'follow',` | I | `private redirect is rejected` |
| C1A-M19 | `src/lib/llm.ts` | `return 'community';` -> `return 'admin';` | J | `community mode has no cookie admin bypass` |
| C1A-M21 | `src/app/page.tsx` | `case 'recovered-corrupt': return { hydrationComplete: true };` -> `case 'recovered-corrupt': return { hydrationComplete: false };` | L | `recovered corrupt storage completes hydration` |
| C1A-M30 | `src/platform/runtime.ts` | `return notReadyProviderPort;` -> `return legacyProviderPort;` | Q | `shadow fails closed for every legacy port` |

The remaining 35 rows are classified explicitly:

| Classification | IDs | Reason |
| --- | --- | --- |
| Duplicate current proof: admission variants | C1A-M04, M05, M24 | Exact ceiling, cancellation, and rebuilt-request branches remain in unit/workerd GREEN; M02/M03 provide the retained admission mutations. |
| Duplicate current proof: image bound | C1A-M07 | The decoded-byte boundary remains in the image suite; M06 supplies the image mutation. |
| Duplicate current proof: deterministic/bounded resolver | C1A-M10, M11, M15, M17, M18, M33, M34, M35, M37, M41 | Existing unit/workerd suites cover no-provider detection, every-hop validation, private literals, concurrency, and byte caps; M16 supplies the retained resolver mutation. |
| Duplicate current proof: resolver state | C1A-M12A, M12B, M12C, M13, M14, M29, M36, M42, M43 | The combined workerd suite covers day, nonce, busy, blackout, activation, and durable expiry branches. C1-B reopens provider-budget state separately. |
| Duplicate current proof: legacy dispatch and UUID forwarding | C1A-M25, M26, M27, M28, M39 | Focused unit tests remain GREEN. Atomic provider idempotency and ambiguous outcomes are not claimed until C1-B. |
| Duplicate current proof: keep-alive isolation | C1A-M20, M31, M32 | Route and dedicated-worker tests remain GREEN; the active app artifact has no public keep-alive state call. |
| Duplicate current proof: storage cleanup variants | C1A-M22, M23 | The review-storage suite checks exact-key removal and preservation of unrelated state; M21 supplies the retained recovery mutation. |
| Duplicate current proof: route inventory | C1A-M38 | The route-manifest and config guards remain in the full gate. |
| Public-only deferred surface | C1A-M40 | Community-key-to-admin-key fallback belongs to the disabled community surface. C1-B must remove or keep that surface unreachable before `EE-PRIVATE-ARTIFACT`; activating community access pulls this mutation back into `PUBLIC-READY`. |

No production mutation row is classified as evidence-tool hardening because all 45 target product
files. Evidence-tool hardening instead comprises the provisional runner's locks, descriptor and Git
seals, process topology, interruption/publication protocol, proof provenance, generated ledger,
terminal JSON, and the five latest reviewer findings. All of that is deferred to `PUBLIC-READY`.

## Exact focused commands

`scripts/run-c1-a-offline.ts --focus <ID>` owns only credential scrubbing, offline preload, a closed
ten-ID-to-command map, bounded redacted output, and child exit propagation. It must not edit files,
inspect Git, infer RED, restore targets, write evidence, or accept arbitrary commands.

| Focus | Exact child argv |
| --- | --- |
| A | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/platform/__tests__/identity.test.ts src/platform/__tests__/admission.test.ts src/app/api/scan/__tests__/route.test.ts --isolate` |
| B | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/server/scanner/__tests__/image.test.ts --isolate` |
| C | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/platform/legacy/__tests__/dispatch.test.ts src/server/scanner/__tests__/transport.test.ts src/app/api/scan/__tests__/route.test.ts --isolate` |
| D | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/lib/__tests__/llm.test.ts --isolate` |
| I | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/platform/resolver/__tests__/url-policy.test.ts src/app/api/scrape-url/__tests__/route.test.ts --isolate` |
| J | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/lib/__tests__/llm.test.ts src/lib/__tests__/limits.test.ts --isolate` |
| L | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/services/__tests__/reviewStorage.test.ts --isolate` |
| Q | `bun --preload=<repo>/scripts/c1-a-offline-preload.cjs test src/platform/__tests__/runtime.test.ts --isolate` |

`<repo>` is derived at runtime from `import.meta.dir`; it is not a user argument or evidence value.

## Task 1: RED/GREEN the lean active gate

### Step 1: Make obsolete Task 11 commands fail the config test

Change `scripts/assert-c1-a-config.test.ts` first so a valid package fixture must omit
`test:c1:a-mutations` and `validate:c1:a-evidence`, and so any active package or offline-runner
reference to `run-c1-a-mutations`, `validate-c1-a-evidence`, `c1-a-terminal-evidence`,
`--write-ledger`, `--verify-ledger`, or `--write-evidence` rejects.

Run:

```bash
bun test scripts/assert-c1-a-config.test.ts --isolate
```

Expected RED: the live required-script fixture still contains the obsolete Task 11 commands.

### Step 2: Remove Task 11 from the active package boundary

- Remove `test:c1:a-mutations` and `validate:c1:a-evidence` from `package.json`.
- Remove those required entries from `scripts/assert-c1-a-config.ts` and its valid fixture.
- Add the source/package absence guard described above.
- Keep `verify:c1:a` as `bun scripts/run-c1-a-offline.ts`.

Run the same focused config test. Expected: GREEN.

### Step 3: RED/GREEN the focused and full runner contracts

Replace the Task-1-only command plan in `scripts/run-c1-a-offline.ts` with:

1. a no-argument lean full gate;
2. exact `--focus C1A-M01|M02|M03|M06|M08|M09|M16|M19|M21|M30` parsing;
3. the closed Focus A/B/C/D/I/J/L/Q commands above;
4. existing credential/dotenv scrubbing, local-vars rejection, bounded output, `shell:false`, and
   fail-fast behavior.

The full gate runs these exact children in order:

```text
bun test scripts/assert-c1-a-config.test.ts scripts/assert-c1-a-e2e-inventory.test.ts scripts/install-c1-a-dependencies.test.ts scripts/c1-a-offline-preload.test.ts scripts/run-c1-a-cloudflare.test.ts scripts/run-c1-a-offline.test.ts scripts/run-c1-a-worker-e2e.test.ts scripts/run-e1-focused.test.ts scripts/run-with-open-next.test.ts --isolate
bun scripts/run-e1-offline.ts
bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/admission.integration.test.ts test/worker/resolver.integration.test.ts test/worker/deny-egress.integration.test.ts
bun scripts/run-c1-a-cloudflare.ts keepalive-tests
bun scripts/assert-c1-a-e2e-inventory.ts 58
bun scripts/run-c1-a-worker-e2e.ts
bun scripts/assert-e1-protected.ts
bun scripts/assert-c1-a-config.ts
git diff --check
```

The second child is the existing E1 full offline gate: recursively inventoried source unit tests,
typecheck, lint excluding protected nested worktrees, Next build, and ordinary Chromium/WebKit
Playwright. The OpenNext child covers app/admission/resolver/deny-egress under workerd. The C1-A
worker E2E default covers the two checked-in C1-A scenarios in Chromium and WebKit. Inventory is
truthfully 58 per browser: 56 preserved E1 definitions plus the two current C1-A definitions. Do
not add the unimplemented third scenario merely to reach the old planned count of 59.

Update `scripts/run-c1-a-offline.test.ts` first and observe focused RED for the old Task-1 command
list/parser. Then implement and run:

```bash
bun test scripts/run-c1-a-offline.test.ts scripts/assert-c1-a-config.test.ts --isolate
```

Expected GREEN: exact command/parser tests, credential canaries, bounded redaction, local-vars
rejection, fail-fast, and forbidden Task 11 string absence all pass.

## Task 2: Run the ten plain causal checks

For each retained ID in table order:

1. Require both `git diff --quiet -- <target>` and `git diff --cached --quiet -- <target>`.
2. Record `shasum -a 256 <target>` in the compact matrix. The accepted baseline hashes are:

   - identity `3c6f0de31305bcd021e1ea6f4f33fa7575aa3661a6597aa97dd93768a6748c03`
   - admission `0ac37aec1b7e1eb7c186fbfb217a104f0916eb983ce8e1bb1c01203a0597ca51`
   - image `a6eafbd723c2a89746eac01be91741da4d86d7a6db7574b9300bc0759d63b359`
   - transport `afc5615cc13b9cb8dba285641421856605e8f762134e5d54af3d1b5b60fdf986`
   - llm `78f17c2d7eb33cccea276625089ffb9f3df6eda6ce592cb9502711603d2f9125`
   - URL policy `06783c22165fd62021047ce71df9c2cb11123dc892feaf14772b77824e7b27e8`
   - page `806894fba439c58ad11fa8c6dffdeee13216582c3dcc0613ea9a542c755123f7`
   - runtime `4c1ce47b5d2c3fa6ca87849d344e9b3c9e3d16d6f3ed4dae54fdc2e019399607`

3. Use `apply_patch` for the exact forward replacement. Require the old anchor once before and the
   new anchor once after.
4. Run `bun scripts/run-c1-a-offline.ts --focus <ID>`. Accept RED only when exit is nonzero and the
   named assertion appears in bounded output. A compile, setup, timeout, unrelated test, or runtime
   crash is not causal RED.
5. Immediately use the exact inverse `apply_patch`. Require the new anchor once before and the old
   anchor once after.
6. Require the original SHA-256 and both Git diff checks again.
7. Rerun the same focus command and require exit 0.
8. Add one compact result to the matrix: ID, RED assertion observed, restored GREEN, restored
   SHA-256. Do not copy logs.

If the turn is interrupted, the next turn inspects only the current target first. A non-baseline
hash is a restoration cursor, not permission to start another mutation. Stop after two causal
mutations fail to exercise the named assertion and redesign the test instead of expanding a proof
runner.

## Task 3: Run the uncommitted full gate once and commit exact paths

Run:

```bash
bun run verify:c1:a
shasum -a 256 docs/testing/e1-mutation-ledger.md scripts/run-c1-a-mutations.ts scripts/run-c1-a-mutations.test.ts
git diff --quiet -- src cloudflare
git diff --cached --quiet -- src cloudflare
bun run assert:e1-protected
git diff --check
git status --short
```

Expected: the full gate exits 0; production paths are clean; preserved hashes match; status contains
only the seven lean paths plus the six pre-existing preserved/protected entries.

Stage only the seven file-ownership paths with explicit `git add -- <path...>`. Then require:

```bash
git diff --cached --name-only
git diff --cached --check
bun run assert:e1-protected
```

The staged-name output must equal the seven-path list exactly. Commit:

```bash
git commit -m "test(event-every): close c1-a for private use"
```

Do not stage the provisional Task 11 files or protected paths.

## Task 4: Run the committed-head phase proof and one fixed-rubric review

Against the new commit, rerun only the milestone integration/browser boundary, not the entire
pre-commit gate:

```bash
bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/admission.integration.test.ts test/worker/resolver.integration.test.ts test/worker/deny-egress.integration.test.ts
bun scripts/run-c1-a-cloudflare.ts keepalive-tests
bun scripts/assert-c1-a-e2e-inventory.ts 58
bun scripts/run-c1-a-worker-e2e.ts
shasum -a 256 docs/testing/e1-mutation-ledger.md scripts/run-c1-a-mutations.ts scripts/run-c1-a-mutations.test.ts
git diff --quiet -- src cloudflare
git diff --cached --quiet -- src cloudflare
bun run assert:e1-protected
git diff --check
git status --short
```

Obtain one independent OpenAI `gpt-5.6-sol` / `high` review after verifying that exact route. Give
the reviewer the accepted private-use redesign, this plan, `469bd1d..HEAD`, the compact matrix,
command results, current status, and preserved hashes. The fixed blocking rubric is only:

1. regression or missing proof in a C1-A private control named by the matrix;
2. public/admin bypass, trusted-identity, origin/admission, private-network, abort, corrupt-state,
   raw-data, or fail-closed runtime defect relevant before C1-B;
3. a retained mutation that did not cause its named RED or did not restore exact production bytes;
4. credential/private-data/provider/external-network/deployment effect;
5. active gate dependence on Task 11 one-shots or generated evidence; or
6. staged/committed protected or unrelated work.

Same-owner local harness attacks, signed publication, immutable snapshots, exhaustive mutation
coverage, the deferred third browser scenario, community/multi-user hardening, and C1-B provider
state are explicitly non-blocking unless they demonstrate one of the six current failures above.
The review returns `VERIFIED:true` only with no Critical or Important finding inside this rubric.
Outside-rubric findings go to `PUBLIC-READY` or the named downstream gate. After two rejecting
cycles, stop repairing the proof surface and redesign the task boundary.

## Task 5: Advance the sole Calendar cursor after acceptance

Only after `VERIFIED:true`:

- append one metadata row for the accepted C1-A lean review to Calendar's `review-index.md`;
- increment Calendar `work-plan.md` by one revision;
- mark `C1-A-LEAN` `PROVEN` with the Event Every commit and review-report link;
- select `C1-B-PRIVATE-PLAN` as the sole current task;
- retain `EE-DATA-FAQ` as a required task after C1-B behavior is fixed and before
  `EE-PRIVATE-ARTIFACT` acceptance;
- keep `task-26.md`, the archived 270-revision plan, and other evidence archives frozen;
- run Calendar `env PATH=/opt/homebrew/bin:$PATH bun run verify` and commit only the cursor/index
  update as `docs(program): accept private c1-a closure`.

The next plan owns atomic owner-budget reservation, idempotent effects, durable pending/settled/
ambiguous outcomes, failure recovery, and the removal or hard disabling of the community-key path.
It must also create the prerequisite task `EE-PRIVATE-PRIVACY-CANARY` with the exact package command
`bun run verify:private:privacy`. That command uses synthetic input and injected local transports to
prove its marker stays absent from responses, fixed errors, logs, durable state, caches, and retry
metadata without a provider or non-loopback network call. It must remain local and synthetic until
the separate deployment authority gate.

## Queued Event Every task: truthful user-data FAQ

Task ID: `EE-DATA-FAQ`

Dependencies: complete after C1-B fixes the private artifact's actual durable data and retention
behavior and after `EE-PRIVATE-PRIVACY-CANARY` implements and passes
`bun run verify:private:privacy`. Blocking gate: `EE-PRIVATE-ARTIFACT` cannot pass until this task
is accepted. `EE-PRIVATE-DEPLOYED` must revalidate the answer against the real Cloudflare Access,
logging, processor, and retention configuration before owner data is allowed.

The landing page already asks “Where does my data go?” in
`src/components/landing/LandingSections.tsx`, but its answer says both “Nowhere” and “Anonymized
data is sent to processors.” The nearby trust point says “We collect no data.” Those claims are
internally inconsistent and do not disclose that raw scan input is processed during the request or
that Recent input intentionally stores text/files in browser IndexedDB.

Before writing copy, create a source-backed inventory of every active user-data path. It must cover:

- browser storage: `summon-input` IndexedDB draft/history text and file bytes;
  `event_every_history` and `event_every_temp_unsaved` CalendarEvents, including any
  `originalInput` and raw attachments; `event-every:review-drafts:v1` raw-free Scanner review data;
  and the local `event-sort-option` preference and `exportAllTimestamps` usage metadata;
- the exact deletion behavior for every store: the in-app clear/delete operation where one is
  reachable, automatic expiry/clear behavior where present, and an explicit statement that the
  user must clear this site's browser data where no in-app control exists; do not imply that one
  clear action removes a different store;
- every active processor-bound route: scan extraction, Recent-input summarization, and timezone
  resolution, including the exact user-derived fields each sends; and
- every other external recipient: Cloudflare hosting/Access/logging, the AI router and selected
  model providers, and the destination site contacted for a user-submitted URL. Confirm that
  disabled community/waitlist/capture paths are actually unreachable rather than describing them
  as active.

Then create one plain-language answer that states, in this order:

1. what Event Every sends externally: scan text/images/resolved link content, Recent-summary text
   and event titles, timezone text/dates/title/location, and the destination URL contacted for link
   resolution, with the purpose of each transfer;
2. what remains in the browser, including all IndexedDB/localStorage records in the inventory and
   the fact that saved/temporary legacy CalendarEvents may include original input or attachments;
3. what Event Every retains server-side: raw input and provider bodies last only for request
   processing, while the private artifact may durably retain only the exact raw-free request,
   result, status, cost, and retry metadata implemented by C1-B, with its truthful retention period;
4. how a user removes browser-held data and what server-side deletion channel exists, if any;
5. which hosting and AI processors receive user-derived content, which destination host receives a
   submitted URL request, and direct links to the current first-party privacy and retention terms
   that govern each processor; and
6. what Event Every does not do—sell data, use it for advertising, or train its own models—only if
   those statements are technically and contractually true at implementation time.

Do not say “anonymous,” “never leaves your device,” “nowhere,” “zero retention,” or “we collect no
data” unless a test and the deployed processor configuration make the literal statement true.
Distinguish Event Every's behavior from a processor's behavior. Verify Cloudflare, OpenRouter,
selected model-provider names, routing, logging/data-collection flags, and current retention terms
from primary sources when implementing the task; do not copy a marketing promise from an old README
or plan.

**Owned product changes:**

- modify `src/components/landing/LandingSections.tsx` to replace the existing FAQ answer and align
  the contradictory trust point;
- add `e2e/data-use-faq.spec.ts` to expand the answer and assert the key disclosures are visible and
  keyboard reachable in Chromium and WebKit; and
- update the ordinary Playwright inventory intentionally so the new disclosure scenario is
  counted without receiving unrelated Scanner mutation credit.

Use one focused causal copy mutation: replace the processor/request-lifetime disclosure with the
old “Nowhere” claim, run only the new E2E in Chromium and WebKit, observe its disclosure assertion
RED, restore exact bytes, and rerun GREEN. Then run `bun run verify:e1:offline` and
`bun run verify:private:privacy`. Obtain copy/privacy review against the implemented data flow, not
against aspirational architecture. Commit the task separately as
`docs(event-every): explain user data handling`.

## Acceptance

`C1-A-LEAN` is accepted only when all ten retained mutations have named RED/restored GREEN records,
the full uncommitted gate and committed-head integration/browser gate pass, inventory is exactly
58 per browser, the seven-path commit contains no provisional/protected work, all three preserved
Task 11 hashes remain exact, production paths are clean, and the fixed-rubric independent review
returns `VERIFIED:true`.
