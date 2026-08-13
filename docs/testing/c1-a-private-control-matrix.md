# C1-A private-use control matrix

Baseline: `469bd1de78340b61348613e0ba1404d5770e1283`

Scope: retained local synthetic C1-A closure plus C1-B Task 7's authoritative private Worker graph
and browser boundary. This matrix does not claim the full C1-B provider lifecycle, owner Access,
deployment, backup/rollback, owner data, community access, or public release.

## Product controls

| Private control | Production seam | Current proof | Retained causal check | Closure result |
| --- | --- | --- | --- | --- |
| Provider routes fail closed before C1-B state | `src/platform/runtime.ts` | runtime unit tests; app-worker workerd tests | C1A-M30 | named RED; exact restore; focused GREEN |
| Private provider routes require the owner key, request HMAC, fixed policy labels, and both Durable Object bindings before delegation | `cloudflare/app-worker.ts`; `wrangler.jsonc` | app-worker workerd tests; exact config assertions | ordinary GREEN | pass in Task 7 gate |
| Emitted private Worker reachability excludes community, waitlist, Redis/Upstash, legacy dispatch, and runtime-selected provider configuration | `scripts/assert-private-worker.ts` | adversarial artifact fixtures; credential-scrubbed OpenNext build scan | ordinary GREEN | pass in Task 7 gate; owned output removed |
| Owner exhaustion/freeze/unavailability has one fixed local UI and no retired pattern, waitlist, or `/spent` action | `src/components/OwnerBudgetBoundary.tsx`; `src/components/OwnerBudgetScreen.tsx` | owner-boundary browser scenarios; C1-A runtime exhaustion scenario | ordinary GREEN | pass in Chromium and WebKit |
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
