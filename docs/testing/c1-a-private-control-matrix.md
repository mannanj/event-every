# C1-A private-use control matrix

Baseline: `469bd1de78340b61348613e0ba1404d5770e1283`

Scope: retained local synthetic C1-A closure plus the complete local C1-B private-provider lifecycle,
privacy canary, browser recovery boundary, artifact proof, and causal mutation ledger. This matrix does
not authorize or claim owner Access, deployment, backup/rollback, real keys, real user data, community
access, remote resources, external legacy retirement, publication, or public release.

## Product controls

| Private control | Production seam | Current proof | Retained causal check | Closure result |
| --- | --- | --- | --- | --- |
| Provider routes fail closed before C1-B state | `src/platform/runtime.ts` | runtime unit tests; app-worker workerd tests | C1A-M30 | named RED; exact restore; focused GREEN |
| Private provider routes require the owner key, request HMAC, fixed policy labels, and both Durable Object bindings before delegation | `cloudflare/app-worker.ts`; `wrangler.jsonc` | app-worker workerd tests; exact config assertions | ordinary GREEN | pass in Task 7 gate |
| Emitted private Worker reachability excludes community, waitlist, Redis/Upstash, legacy dispatch, and runtime-selected provider configuration | `scripts/assert-private-worker.ts` | adversarial artifact fixtures; credential-scrubbed OpenNext build scan | ordinary GREEN | pass in Task 7 gate; owned output removed |
| Owner exhaustion/freeze/unavailability waits at most three seconds, then offers one safe path to local events with provider processing disabled; the editable input draft remains browser-local and restorable | `src/components/OwnerBudgetBoundary.tsx`; `src/components/OwnerBudgetScreen.tsx`; `src/components/SmartInput.tsx` | owner-boundary and interruption/reload browser scenarios; C1-A runtime exhaustion scenario | ordinary GREEN | pass in Chromium and WebKit |
| Browser-restored draft is applied only after server-identical first markup | `src/components/SmartInput.tsx` | C1-A hydration scenario captures first DOM plus React errors/warnings before navigation | ordinary GREEN | pass in Chromium and WebKit |
| Caller forwarding headers cannot forge edge identity | `src/platform/identity.ts` | identity unit tests; app-worker workerd tests | C1A-M01 | named RED; exact restore; focused GREEN |
| Same-origin admission rejects cross-site requests | `src/platform/admission.ts` | admission unit tests; admission workerd tests | C1A-M02 | named RED; exact restore; focused GREEN |
| Streamed body size uses received bytes | `src/platform/admission.ts` | admission unit tests; admission workerd tests | C1A-M03 | named RED; exact restore; focused GREEN |
| Scanner validates decoded image structure and size | `src/server/scanner/image.ts` | Scanner image unit tests | C1A-M06 | named RED; exact restore; focused GREEN |
| Abort reaches the provider transport | `src/server/scanner/transport.ts` | dispatch, transport, and scan-route unit tests | C1A-M08 | named RED; exact restore; focused GREEN |
| Provider error bodies stay unread and content-free | `src/lib/llm.ts` | LLM unit tests | C1A-M09 | named RED; exact restore; focused GREEN |
| Resolver manually validates private redirects | `src/platform/resolver/url-policy.ts` | URL-policy/route unit tests; resolver/deny-egress workerd tests | C1A-M16 | named RED; exact restore; focused GREEN |
| Cookie/pattern state cannot select admin mode | `src/lib/llm.ts` | LLM/limit unit tests; Chromium/WebKit exhaustion scenario | C1A-M19 | named RED; exact restore; focused GREEN |
| Corrupt Scanner storage completes recovery | `src/app/page.tsx` | review-storage unit tests; Chromium/WebKit corrupt-storage scenario | C1A-M21 | named RED; exact restore; focused GREEN |
| Resolver day, lease, nonce, concurrency, and rollover stay bounded | resolver Durable Objects | resolver workerd integration tests | ordinary GREEN | pass in nine-step gate |
| Retired keep-alive stays isolated and status-only | public route; private scheduled worker | route unit tests; keep-alive/deny-egress workerd tests | ordinary GREEN | pass in nine-step gate |
| Scanner loop stays raw-free and temporally truthful | Scanner consumer and Event Every E1 seams | `bun run verify:e1:offline` | accepted E1 causal ledger | pass in nine-step gate |
| Closure has no credential, provider, external-network, or deployment effect | offline preload, scrubbed child environments, deny-egress setup | lean full gate and final status/protected hashes | process boundary | pass; owned outputs removed |

`Lunch with Priya` is only the ordinary calendar draft used by the hydration regression. “Priya” is
not a product, provider, project, or brand name.

## C1-B accepted design guarantees

An em dash means that proof layer is not the causal boundary for that guarantee. Every mutation below
is rerun from a fresh committed-HEAD export by `verify:c1:b:mutations`; every row must observe its named
RED assertion and the restored committed source must return GREEN.

| Guarantee | Unit proof | Workerd proof | Route proof | Privacy proof | Browser proof | Artifact proof | Mutation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A lost claim response cannot permit a second provider transport | coordinator lost-response replay | request-authority eviction and nonce replay | — | one synthetic transport across ambiguous retry | original UUID survives reload | — | C1B-M01 |
| Completion compares the supplied nonce with the durable verifier after eviction | permit contract | verifier survives object eviction | — | rejected nonce has no retained private effect | — | — | C1B-M02 |
| Owner-day admission and insertion are one SQLite transaction | fixed binding/accounting cases | two real concurrent requests race for the last slot | budget status stays read-only | final-slot canary | exhaustion screen consumes only status | — | C1B-M03 |
| Committed holds remain outstanding during later admission | coordinator commit ordering | committed-hold admission and alarm ordering | budget status exposes only totals | committed-row inspection | — | — | C1B-M04 |
| An expired committed hold settles the full reservation | settlement result cases | alarm-only expiry after eviction | — | post-expiry authority rows | — | — | C1B-M05 |
| Missing provider cost consumes the full reservation, never zero | exact cost outcome and coordinator settlement | durable missing-cost settlement | fixed provider failures are content-free | missing-cost row inspection | — | — | C1B-M06 |
| Provider cost is classified from the exact decimal lexeme before `Number` conversion | lossless cost parser boundaries | settlement receives the classified outcome | — | response parser canary | — | — | C1B-M07 |
| A response is returned only after minimized replay persistence acknowledges | exact coordinator call order | durable completion/replay acknowledgement | route materializes only completed replay | result appears only after durable completion | recovery delivers acknowledged replay | — | C1B-M08 |
| Alarm and ambiguous terminal replay never call provider transport again | ambiguous completion replay | request authority terminal replay | status route is observation-only | crash/ambiguous retry counts one transport | reload polls status only | — | C1B-M09 |
| Idempotency binds normalized request shape and key version | request-binding HMAC vectors | current/previous-key retry after eviction | provider routes construct one normalized binding | durable row contains digest/version only | same UUID retry | — | C1B-M10 |
| Cross-midnight retry keeps its original UTC authority day | absolute-deadline coordinator cases | midnight rollover with previous key | status reports frozen authority day | rollover authority-row inspection | — | — | C1B-M11 |
| Provider non-success bodies are cancelled without materialization | 302/307/402/429/500 body-cancel cases | — | fixed content-free failures | provider-error marker canary | — | reachable artifact forbids legacy body readers | C1B-M12 |
| Durable Scanner replay removes evidence and provider-authored messages | strict minimized replay schema/materialization | request replay-row inspection | scan route returns only materialized projection | raw/provider markers absent before and after expiry | recovered result contains only minimized fields | emitted artifacts are marker-scanned | C1B-M13 |
| A lost browser response keeps the original UUID and switches to status polling | scan-client ambiguity case | one authority record | scan POST once; status thereafter | one provider transport | reload and recovery in Chromium/WebKit | — | C1B-M14 |
| The private Worker accepts only `OPENROUTER_OWNER_KEY` and has no API-key fallback | source-boundary runtime assertion | app-Worker configuration gate | provider routes receive injected context only | credential-scrubbed synthetic owner key | browser graph contains neither key name | reachable artifact forbids `OPENROUTER_API_KEY` | C1B-M15 |
| `/api/waitlist` is permanently retired with 410 before delegation | route-manifest/admission case | app-Worker retired route | exact fixed 410 | — | — | emitted graph excludes waitlist implementation/copy | C1B-M16 |
| Every provider model is fixed in source | exact four policy request shapes | provider operation uses fixed policy | no request selects a model | synthetic responses cannot alter model | — | emitted graph forbids environment model selectors | C1B-M17 |
| Provider redirects remain `manual` at the fixed origin | exact URL/header/body/redirect assertion | deny-egress boundary | — | exact in-process provider handler only | — | exact origin required in reachable artifact | C1B-M18 |
| Terminal deadline/outbox state never commits before a durable alarm | coordinator terminal sequencing | crash after commit recovers by alarm only | status cannot mutate settlement | alarm/outbox marker inspection | — | — | C1B-M19 |
| Transport timeout derives from the authority absolute deadline, not retry time | exact millisecond boundary cases | frozen durable deadline | status returns the original deadline | delayed retry canary | browser observes at deadline, then once more | — | C1B-M20 |
| Browser polling continues past 750 ms and never creates a replacement UUID | exact capped-backoff sequence | original authority record remains | status polling only | — | reload recovery and saved pending operation | — | C1B-M21 |
| Positive exponent cost is overflow, never ordinary missing accounting | `1e100` lossless classification | full-hold overflow settlement | — | overflow settlement row | — | — | C1B-M22 |
| Concurrent above-reservation completions store one actual amount and one full hold | coordinator concurrent settlement case | primary/secondary breach serialization | — | authority rows and frozen policy | — | — | C1B-M23 |
| Reload polls the saved operation before deletion and status has no mutator path | local operation ordering and scan-client tests | durable status observation | status-route suite forbids transport/mutator/retention calls | seven-field content-free IndexedDB record | Chromium/WebKit reload, delivery, Cancel, and deletion | — | C1B-M24 |
| The offline boundary rejects non-loopback global fetch before the captured native seam | preload fetch/DNS/UDP/socket tests | deny-egress Workerd setup | — | canary scans outputs twice with no external request | browser harness permits loopback only | generated artifacts and child output are bounded/scanned | C1B-M25 |

The reported recoverable React hydration failure is an explicit Chromium and WebKit regression:
the test captures server-identical first markup before restoring the browser-local draft and fails on
React hydration console errors, console warnings, or any `pageerror`. The fixture text is `Lunch with
Priya`; “Priya” has no brand or product meaning.

All C1-B proofs use synthetic inputs and synthetic credentials. Real keys, real user data, Cloudflare
Access changes, remote resources, deployment, publication, and external retirement remain unauthorized.

## Retained mutation results

Each row must show the named assertion RED, exact inverse restoration, original SHA-256, and the
same focused command GREEN. Full logs remain terminal evidence and are not copied here.

| ID | Named RED assertion | Restored SHA-256 | Focused GREEN |
| --- | --- | --- | --- |
| C1A-M01 | `forged forwarding header is ignored` | `3c6f0de31305bcd021e1ea6f4f33fa7575aa3661a6597aa97dd93768a6748c03` | pass |
| C1A-M02 | `cross-site text is rejected before route` | `0ac37aec1b7e1eb7c186fbfb217a104f0916eb983ce8e1bb1c01203a0597ca51` | pass |
| C1A-M03 | `chunked overflow cancels the stream` | `0ac37aec1b7e1eb7c186fbfb217a104f0916eb983ce8e1bb1c01203a0597ca51` | pass |
| C1A-M06 | `truncated image structure is rejected` | `a6eafbd723c2a89746eac01be91741da4d86d7a6db7574b9300bc0759d63b359` | pass |
| C1A-M08 | `exact signal reaches fetch` | `afc5615cc13b9cb8dba285641421856605e8f762134e5d54af3d1b5b60fdf986` | pass |
| C1A-M09 | `provider error body remains unread` | `78f17c2d7eb33cccea276625089ffb9f3df6eda6ce592cb9502711603d2f9125` | pass |
| C1A-M16 | `private redirect is rejected` | `06783c22165fd62021047ce71df9c2cb11123dc892feaf14772b77824e7b27e8` | pass |
| C1A-M19 | `community mode has no cookie admin bypass` | `78f17c2d7eb33cccea276625089ffb9f3df6eda6ce592cb9502711603d2f9125` | pass |
| C1A-M21 | `recovered corrupt storage completes hydration` | `806894fba439c58ad11fa8c6dffdeee13216582c3dcc0613ea9a542c755123f7` | pass |
| C1A-M30 | `shadow fails closed for every legacy port` | `4c1ce47b5d2c3fa6ca87849d344e9b3c9e3d16d6f3ed4dae54fdc2e019399607` | pass |

## Preserved provisional Task 11 artifacts

These remain outside the active gate and lean commit:

| Path | Required SHA-256 | Final observation |
| --- | --- | --- |
| `docs/testing/e1-mutation-ledger.md` | `99880d600585a8dbf1c6286e028d687d517fe9ad4e2cd8b95d1ae147982353b1` | exact match after full gate |
| `scripts/run-c1-a-mutations.ts` | `2013de6d4dcbdddcba4e979cc6e96d20380fce8a99c8e34c1d2f4e431c3c0299` | exact match after full gate |
| `scripts/run-c1-a-mutations.test.ts` | `cdc8dcb045415cee66fe9b7a4517e3e083ce35e468fd8e4063971b30d59583d1` | exact match after full gate |
