# Event Every Cloudflare C1-A Runtime and Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan one task at a time, and verification-before-completion before accepting each task.

**Goal:** Establish Event Every’s local OpenNext/Cloudflare runtime and prove the complete edge-admission boundary, trusted identity, bounded link resolution, pattern-auth retirement, abort propagation, exact Scanner input boundaries, and corrupt-review recovery without claiming C1-B provider-state acceptance.

**Architecture:** cloudflare/app-worker.ts is the only public Worker entry. It scrubs caller identity headers, runs a closed route manifest through src/platform/admission.ts, and delegates one rebuilt request to OpenNext. Host routes use platform ports rather than Cloudflare globals. C1-A implements only the state needed by edge identity and bounded link resolution: IdentityDayPolicy, ResolverRequestAuthority, and the resolver policy of DailyCounter. Provider request/budget/quota state remains fail-closed in Cloudflare-authoritative mode until C1-B. The public pattern credential disappears immediately, all requests are community mode until C1-C verified-email auth lands, and legacy Upstash keep-alive becomes a private scheduled compatibility port.

**Tech Stack:** Next.js 15.5.9, React 19, TypeScript 5, Bun 1.3.x, @opennextjs/cloudflare 1.20.2, Wrangler 4.118.0, Vitest 4.1.10, @cloudflare/vitest-pool-workers 0.20.1, MSW 2.15.0, Cloudflare workerd, SQLite Durable Objects, Playwright Chromium/WebKit, Zod 4.4.3, vendored @event-every/scanner pinned to accepted Scanner commit c03cf1a79d0d1f2151ee602d67aa0a2eede673e4.

---

## Reconciled baseline and locked scope

- Start from Event Every main@c04e6f28c29d6d50bf714b7a3e453d645c6635e1.
- Governing design: docs/superpowers/specs/2026-08-02-event-every-cloudflare-migration-design.md. Its controlled Sol/high acceptance report is /Users/manblack/Documents/codex-agent-routing/.routed-runs/20260802T173306Z-39653-c1-cloudflare-design-repair6-rereview/report.json and returned VERIFIED:true.
- Preserve accepted E1 commits ab872d0, 195e9b4, cdae13d, and ae0e44c and Scanner provenance. Preserve 56 unaffected E1 definitions per browser; four pattern/admin definitions per browser retire explicitly in Task 8, and three mutation-owned C1-A definitions produce the accepted final 59/browser and 118 total.
- Never edit, stage, delete, traverse through, or normalize .claude/**, tasks/task-192.md, or tasks/task-193.md. bun run assert:e1-protected must keep reporting exactly 53,300 records.
- C1-A is local and synthetic. Do not authenticate to Cloudflare/npm, publish, deploy, create remote resources, use remote bindings, send email, call OpenRouter/Resend/Upstash/D1 HTTP, read credential values, or touch production data.
- Public registry metadata lookup selected exact dependency versions; installation is a later local implementation action after this plan is accepted. Every add or frozen install runs only through `scripts/install-c1-a-dependencies.ts`; ordinary `bun install` is forbidden.
- C1-A owns BE-02, BE-03, BE-04, BE-07, BE-08, and CF-01. It does not claim BE-01, BE-09, CF-02, verified-email/capture CF-03, D1 catalog migrations, provider budget settlement, cutover, deployment, or rollback acceptance.
- STATE_AUTHORITY_MODE=cloudflare must refuse provider routes with fixed 503 c1_state_not_ready until C1-B supplies provider request/budget/quota ports. Resolver-specific DO state is implemented here because bounded URL resolution is a C1-A product contract.

## File map

Create:

- docs/superpowers/plans/2026-08-02-event-every-cloudflare-c1-a-runtime-admission.md, already authored/reviewed and committed unchanged with Task 1
- open-next.config.ts
- cloudflare/app-worker.ts
- cloudflare/legacy-keepalive-worker.ts
- cloudflare/legacy-keepalive-wrangler.jsonc
- cloudflare/legacy-keepalive-configuration.d.ts, generated and never hand-edited
- wrangler.jsonc
- worker-configuration.d.ts, generated and never hand-edited
- vitest.config.workers.ts
- vitest.config.keepalive-workers.ts
- test/worker/app-worker.test.ts
- test/worker/admission.integration.test.ts
- test/worker/resolver.integration.test.ts
- test/worker/legacy-keepalive.integration.test.ts
- test/worker/deny-egress.setup.ts
- test/worker/deny-egress.integration.test.ts
- src/platform/contracts.ts
- src/platform/runtime.ts
- src/platform/cloudflare-context.ts
- src/platform/identity.ts
- src/platform/admission.ts
- src/platform/route-manifest.ts
- src/platform/logger.ts
- src/platform/cloudflare/identity-day-policy.ts
- src/platform/cloudflare/resolver-request-authority.ts
- src/platform/cloudflare/daily-counter.ts
- src/platform/legacy/provider.ts
- src/platform/legacy/usage.ts
- src/platform/legacy/waitlist.ts
- src/platform/legacy/dispatch.ts
- src/platform/legacy/__tests__/dispatch.test.ts
- src/platform/legacy/index.ts
- src/platform/resolver/capability.ts
- src/platform/resolver/url-policy.ts
- src/platform/resolver/html-to-text.ts
- src/platform/__tests__/identity.test.ts
- src/platform/__tests__/admission.test.ts
- src/platform/__tests__/route-manifest.test.ts
- src/platform/__tests__/runtime.test.ts
- src/platform/resolver/__tests__/capability.test.ts
- src/platform/resolver/__tests__/url-policy.test.ts
- src/platform/resolver/__tests__/html-to-text.test.ts
- src/app/api/scrape-url/__tests__/route.test.ts
- src/app/api/resolve-timezone/__tests__/route.test.ts
- src/app/api/summarize/__tests__/route.test.ts
- src/app/api/usage/__tests__/route.test.ts
- src/app/api/waitlist/__tests__/route.test.ts
- src/app/api/keep-alive/__tests__/route.test.ts
- src/services/__tests__/summarizer.test.ts
- src/services/requestId.ts
- scripts/assert-c1-a-paths.ts
- scripts/assert-c1-a-config.ts
- scripts/assert-c1-a-config.test.ts
- scripts/install-c1-a-dependencies.ts
- scripts/run-c1-a-offline.ts
- scripts/run-c1-a-mutations.ts
- scripts/c1-a-offline-preload.cjs
- scripts/run-c1-a-worker-e2e.ts
- scripts/run-c1-a-worker-e2e.test.ts
- scripts/run-with-open-next.ts
- scripts/run-with-open-next.test.ts
- scripts/run-c1-a-cloudflare.ts
- scripts/run-c1-a-cloudflare.test.ts
- scripts/assert-c1-a-e2e-inventory.ts
- scripts/assert-c1-a-e2e-inventory.test.ts
- scripts/validate-c1-a-evidence.ts
- scripts/validate-c1-a-evidence.test.ts
- scripts/install-c1-a-dependencies.test.ts
- scripts/c1-a-offline-preload.test.ts
- scripts/run-c1-a-offline.test.ts
- scripts/assert-c1-a-paths.test.ts
- scripts/run-c1-a-mutations.test.ts
- scripts/c1-a-task-paths/task-01.txt through task-11.txt
- docs/testing/c1-a-mutation-ledger.md
- docs/testing/c1-a-terminal-evidence.schema.json
- docs/testing/c1-a-terminal-evidence.json
- e2e/c1-a-runtime-admission.spec.ts
- playwright.c1-a.config.ts

Modify:

- package.json, bun.lock, .gitignore, eslint.config.mjs, tsconfig.json, next.config.js, playwright.config.ts
- scripts/assert-e1-paths.ts, scripts/run-e1-offline.ts, scripts/run-e1-focused.ts, scripts/run-e1-focused.test.ts
- src/lib/clientIp.ts, src/lib/llm.ts, src/lib/limits.ts and their tests
- every current src/app/api/**/route.ts plus scan/scrape route tests
- src/server/scanner/image.ts, job.ts, transport.ts and their tests
- src/services/urlDetector.ts, webScraper.ts, reviewStorage.ts and their tests
- src/app/page.tsx, src/app/layout.tsx
- src/components/AuthWrapper.tsx, src/components/CommunityLimitScreen.tsx
- e2e/helpers.ts, community-limit.spec.ts, url-scrape.spec.ts, scanner-product-loop.spec.ts
- docs/testing/e1-mutation-ledger.md, README.md, .env.example

Delete only in Task 8, after a source-scan RED:

- src/components/PatternLock.tsx
- src/components/SideDrawerLockButton.tsx
- src/hooks/useAuth.ts
- src/app/api/auth/shared.ts
- e2e/pattern-unlock.spec.ts
- e2e/prod.spec.ts

## Required command conventions

- Focused Bun commands name every test file explicitly in the owning task and end with --isolate.
- App Worker commands use `bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts` and name every file explicitly, including the egress canary. Private Worker commands use their separate config directly. Typecheck uses the same OpenNext owner around local `tsc`; lint is `bun run lint`.
- Existing acceptance: bun run verify:e1:offline.
- New acceptance: bun run verify:c1:a.
- Every mutation runs through scripts/run-c1-a-mutations.ts. It hashes the production file, applies one exact replacement, runs the ledger command expecting nonzero, restores in finally, verifies the original SHA-256, reruns green, and rejects concurrent edits.
- Every commit runs `bun run assert:c1:a-paths c04e6f28c29d6d50bf714b7a3e453d645c6635e1 HEAD --task=NN`, `bun run assert:e1-protected`, and `git diff --check` after staging exact Task NN paths.
- A live-tool incompatibility discovered after a task commit may be repaired before the active
  downstream task only after mutation-led proof and independent rereview. Such a prerequisite
  repair stages exactly the affected prior-task manifest paths plus this plan when its executable
  contract changes, proves that exact cached path set directly, and uses a dedicated repair commit;
  it does not stage the active downstream task or rerun that task's manifest assertion until the
  downstream task is ready. This is the sole exception to manifest-only task commits and exists so
  an already committed wrapper cannot make a required downstream gate impossible.

## Repair 1 literal execution contracts

These contracts are binding implementation detail for every task below. A task summary cannot weaken them.

### Exact package scripts and checked-in configurations

Task 1 writes these package.json script values exactly:

    "build:cloudflare": "opennextjs-cloudflare build",
    "cf:types": "bun scripts/run-c1-a-cloudflare.ts app-types",
    "cf:types:keepalive": "bun scripts/run-c1-a-cloudflare.ts keepalive-types",
    "test:workers": "bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts",
    "assert:c1:a-config": "bun scripts/assert-c1-a-config.ts",
    "assert:c1:a-paths": "bun scripts/assert-c1-a-paths.ts",
    "test:c1:a-mutations": "bun scripts/run-c1-a-mutations.ts --verify-ledger --all",
    "validate:c1:a-evidence": "bun scripts/validate-c1-a-evidence.ts docs/testing/c1-a-terminal-evidence.json",
    "test:e2e:c1:a": "playwright test --config playwright.c1-a.config.ts",
    "verify:c1:a": "bun scripts/run-c1-a-offline.ts"

open-next.config.ts is exactly:

    import { defineCloudflareConfig } from '@opennextjs/cloudflare';

    export default defineCloudflareConfig();

`cloudflare/app-worker.ts` reaches this exact final public shape in Task 6:

    import handler from '../.open-next/worker.js';
    import { admitEdgeRequest } from '../src/platform/admission';
    export { DailyCounter } from '../src/platform/cloudflare/daily-counter';
    export { IdentityDayPolicy } from '../src/platform/cloudflare/identity-day-policy';
    export { ResolverRequestAuthority } from '../src/platform/cloudflare/resolver-request-authority';

    export default {
      async fetch(request, env, ctx) {
        const admitted = await admitEdgeRequest(request, env, ctx);
        return admitted.ok
          ? handler.fetch(admitted.request, env, ctx)
          : admitted.response;
      },
    } satisfies ExportedHandler<CloudflareEnv>;

`wrangler.jsonc` reaches this complete C1-A app shape in Task 6. JSON comments explain that the UUID and disable flag are deliberately nondeployable local values, not future resource identifiers:

    {
      "$schema": "node_modules/wrangler/config-schema.json",
      "name": "event-every",
      "main": "cloudflare/app-worker.ts",
      "compatibility_date": "2026-08-02",
      "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
      "workers_dev": false,
      "preview_urls": false,
      "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
      "services": [
        { "binding": "WORKER_SELF_REFERENCE", "service": "event-every" }
      ],
      "d1_databases": [
        {
          "binding": "EVENT_EVERY_DB",
          "database_name": "event-every-local-disabled",
          "database_id": "11111111-1111-4111-8111-111111111111"
        }
      ],
      "durable_objects": {
        "bindings": [
          { "name": "IDENTITY_DAY_POLICY", "class_name": "IdentityDayPolicy" },
          { "name": "RESOLVER_REQUEST_AUTHORITY", "class_name": "ResolverRequestAuthority" },
          { "name": "RESOLVER_DAILY_COUNTER", "class_name": "DailyCounter" }
        ]
      },
      "migrations": [
        {
          "tag": "c1-a-v1",
          "new_sqlite_classes": [
            "IdentityDayPolicy",
            "ResolverRequestAuthority",
            "DailyCounter"
          ]
        }
      ],
      "vars": {
        "C1_DEPLOYMENT_DISABLED": "1",
        "STATE_AUTHORITY_MODE": "legacy",
        "IDENTITY_KEY_CURRENT_VERSION": "local-v1",
        "IDENTITY_KEY_NEXT_VERSION": "",
        "IDENTITY_KEY_ACTIVATES_AT": "",
        "IDENTITY_KEY_SCHEDULE_DIGEST": "local-v1-no-rotation",
        "IDENTITY_HMAC_CURRENT": "",
        "IDENTITY_HMAC_NEXT": "",
        "RESOLVER_CAPABILITY_HMAC": ""
      }
    }

Task 2's buildable, nondeployable scaffold uses the same final config minus `durable_objects` and `migrations`, and its Worker imports OpenNext and delegates directly. Task 4 replaces only the Worker fetch with the admission wrapper, still without DO exports. Task 6 adds the three exports plus the exact DO binding/migration blocks above and regenerates types. At no intermediate commit may `C1_DEPLOYMENT_DISABLED` be absent or empty. The three empty secret-shaped values exist only so generated types contain the bindings. `assert-c1-a-config` evolves with these stages, requires them empty, and rejects deploy/upload commands, remote bindings, active triggers, real-looking database UUIDs, or a missing disable flag.

The installed `@cloudflare/vitest-pool-workers@0.20.1` exposes the Vitest 4 plugin API at its
package root; it does not export the former `/config` entrypoint. Because Event Every remains a
CommonJS package, Vite cannot externalize a static import of that ESM-only package from a `.ts`
config. Both Worker configs therefore load the plugin through an async dynamic import. This is an
executable module-system requirement, not a lazy network import. vitest.config.workers.ts is exactly:

    import { defineConfig } from 'vitest/config';

    export default defineConfig(async () => {
      const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');
      return {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: {
                IDENTITY_HMAC_CURRENT: 'synthetic-c1-a-identity-key',
                RESOLVER_CAPABILITY_HMAC: 'synthetic-c1-a-capability-key'
              }
            }
          })
        ],
        test: {
          include: [
            'test/worker/app-worker.test.ts',
            'test/worker/admission.integration.test.ts',
            'test/worker/resolver.integration.test.ts',
            'test/worker/deny-egress.integration.test.ts'
          ],
          setupFiles: ['./test/worker/deny-egress.setup.ts']
        }
      };
    });

The generated-type idempotence proof does not use git diff on an untracked file:

    bun run cf:types
    cp worker-configuration.d.ts /private/tmp/event-every-c1-a-worker-types.first
    bun run cf:types
    cmp worker-configuration.d.ts /private/tmp/event-every-c1-a-worker-types.first
    rm /private/tmp/event-every-c1-a-worker-types.first

The invoking task verifies the fixed temporary path is absent first and removes it in finally; collision is a hard failure.

### Exhaustive route, task, and mode ownership

| Route | C1-A owner | legacy | shadow before C1-B | cloudflare before C1-B |
| --- | --- | --- | --- | --- |
| POST /api/scan | Tasks 3–5 | LegacyProviderPort | 503 before limits/key/transport | 503 before limits/key/transport |
| POST /api/resolve-timezone | Tasks 3 and 5 | LegacyProviderPort | 503 before limits/key/transport | 503 before limits/key/transport |
| POST /api/summarize | Tasks 3 and 5 | LegacyProviderPort | 503 before limits/key/transport | 503 before limits/key/transport |
| POST /api/detect-urls | Task 6 | deterministic, no provider | deterministic, no state comparison | deterministic, no provider |
| POST /api/scrape-url | Tasks 6–7 | exact resolver DO ports | exact resolver DO ports | exact resolver DO ports |
| GET /api/usage | Task 3 | LegacyUsagePort | 503 before legacy read | 503 before legacy read |
| POST /api/waitlist | Task 3 | LegacyWaitlistPort | 503 before Upstash/D1/mail | 503 before Upstash/D1/mail |
| GET /api/keep-alive | Task 9 | fixed 410 | fixed 410 | fixed 410 |
| GET /api/auth/check | Task 8 | authenticated:false | same | same |
| POST /api/auth/logout | Task 8 | fixed 200, no cookie | same | same |
| POST /api/auth/verify | Task 8 | fixed 410, unread body | same | same |
| auth challenge/redeem reserved paths | Task 8 | fixed 404 auth_not_available | same | same |

Task 3 creates src/platform/legacy/provider.ts, usage.ts, waitlist.ts, and index.ts. They are the only modules importing the existing llm/limits, Upstash/D1 proxy, or Resend seams. `src/platform/contracts.ts` defines these closed types and exact ports:

    export type EdgeIdentity = Readonly<{
      kind: 'known' | 'unknown';
      keyVersion: string;
      hmac: string;
    }>;

    export type ProviderRoute = 'scan' | 'resolve-timezone' | 'summarize';

    export type LegacyChargeResult =
      | { status: 'charged' }
      | { status: 'rejected' | 'unavailable'; code: 'legacy_charge_rejected' };

    export type LegacyProviderResult<T> =
      | { status: 'success'; value: T }
      | {
          status: 'failed';
          code: 'community_limit' | 'upstream_timeout' | 'upstream_unavailable' | 'outcome_unknown';
        };

    export type LegacyProviderInput<T> = Readonly<{
      route: ProviderRoute;
      requestId: string;
      identity: EdgeIdentity;
      signal: AbortSignal;
      charge(): Promise<LegacyChargeResult> | LegacyChargeResult;
      provider(signal: AbortSignal): Promise<LegacyProviderResult<T>> | LegacyProviderResult<T>;
    }>;

    export type RawFreeUsageResult =
      | {
          status: 'available';
          value: {
            isAdmin: boolean;
            exhausted: boolean;
            resetAt: string;
            limitUsd: number;
            spentUsd: number;
            remainingUsd: number;
            allowed: boolean;
            reason: 'community-budget' | 'ip-rate' | null;
            budget: {
              limitUsd: number;
              spentUsd: number;
              remainingUsd: number;
              exhausted: boolean;
              resetAt: string;
            } | null;
            ipRate: { limit: number; remaining: number; exhausted: boolean; resetAt: string };
          };
        }
      | { status: 'unavailable'; code: 'legacy_usage_unavailable' };

    export type AdmittedWaitlistInput = Readonly<{
      identity: EdgeIdentity;
      email: string;
      honeypot: string;
      userAgent: string | null;
    }>;

    export type WaitlistResult =
      | { status: 'accepted'; alreadyJoined: boolean; emailSent: boolean }
      | { status: 'invalid'; code: 'invalid_email' }
      | { status: 'rate-limited'; code: 'waitlist_rate_limited' }
      | { status: 'unavailable'; code: 'legacy_waitlist_unavailable' };

    export interface LegacyProviderPort {
      dispatch<T>(input: LegacyProviderInput<T>): LegacyDispatchStart<T>;
    }

    export interface LegacyUsagePort {
      read(input: { identity: EdgeIdentity }): Promise<RawFreeUsageResult>;
    }

    export interface LegacyWaitlistPort {
      submit(input: AdmittedWaitlistInput): Promise<WaitlistResult>;
    }

runtime.ts exposes getProviderPort, getUsagePort, and getWaitlistPort. Each returns the legacy adapter only in legacy mode; shadow and cloudflare return a closed not-ready result. No empty shadow implementation is permitted. Task 3 focused route tests inject spies and prove not-ready happens before state, key lookup, mail, or transport. Waitlist errors never read Resend response text and never log native errors or submitted email.

`src/platform/cloudflare-context.ts` is stateless and exactly owns deferred work:

    import { getCloudflareContext } from '@opennextjs/cloudflare';

    export function deferPlatformWork(work: Promise<void>): void {
      const observed = work.catch(() => {
        recordClosedEvent('deferred_work_failed');
      });
      try {
        getCloudflareContext().ctx.waitUntil(observed);
      } catch {
        void observed;
      }
    }

`recordClosedEvent` accepts only its content-free union. The OpenNext call is the supported synchronous route-handler context API; there is no AsyncLocalStorage, module-level request variable, wrapper installation, or context mutation. Outside OpenNext (pure legacy/unit execution), the already-bounded and rejection-observed promise is process-owned. Task 5 workerd proof creates an execution context, dispatches a route whose charge settles after its response, calls `waitOnExecutionContext(ctx)`, and observes the closed charge event; a concurrent two-request test proves no cross-request state.

Client provider request IDs use src/services/requestId.ts:

    export function createProviderRequestId(): string {
      return crypto.randomUUID();
    }

The public signature is exactly `scan(request: ScanRequest, signal?: AbortSignal, options?: { requestId?: string }): Promise<ScanResponse>`, preserving every existing second-position signal caller. It uses `options?.requestId` unchanged or creates one once. `summarizeInput` creates one UUID per call. The server/test-only timezone route requires `X-Event-Every-Request-Id`; missing/malformed is fixed 400. All three send the strict UUID in that header. Waitlist idempotency remains normalized lowercase email and never gains a request UUID. C1-A validates and forwards provider UUIDs but does not claim cross-retry provider idempotency until C1-B.

### Exact legacy dispatch transition for BE-08

Task 3 creates `src/platform/legacy/dispatch.ts` with the start primitive used by its legacy provider adapter. Task 5 adds bounded settlement and its dedicated tests. Both effect invocations occur synchronously after the final abort check, but normalization helpers catch synchronous throws so one effect can never suppress invocation of the other:

    export type LegacyDispatchStart<T> =
      | { status: 'aborted-before-dispatch' }
      | {
          status: 'started';
          charge: Promise<LegacyChargeResult>;
          provider: Promise<LegacyProviderResult<T>>;
        };

    function invokeCharge(
      charge: () => Promise<LegacyChargeResult> | LegacyChargeResult
    ): Promise<LegacyChargeResult> {
      try {
        return Promise.resolve(charge()).catch<LegacyChargeResult>(() => ({
          status: 'unavailable',
          code: 'legacy_charge_rejected'
        }));
      } catch {
        return Promise.resolve<LegacyChargeResult>({ status: 'unavailable', code: 'legacy_charge_rejected' });
      }
    }

    function invokeProvider<T>(
      provider: (signal: AbortSignal) => Promise<LegacyProviderResult<T>> | LegacyProviderResult<T>,
      signal: AbortSignal
    ): Promise<LegacyProviderResult<T>> {
      try {
        return Promise.resolve(provider(signal)).catch<LegacyProviderResult<T>>(() => ({
          status: 'failed',
          code: signal.aborted ? 'outcome_unknown' : 'upstream_unavailable'
        }));
      } catch {
        return Promise.resolve<LegacyProviderResult<T>>({ status: 'failed', code: 'upstream_unavailable' });
      }
    }

    export function startLegacyDispatch<T>(input: {
      signal: AbortSignal;
      charge(): Promise<LegacyChargeResult> | LegacyChargeResult;
      provider(signal: AbortSignal): Promise<LegacyProviderResult<T>> | LegacyProviderResult<T>;
    }): LegacyDispatchStart<T> {
      if (input.signal.aborted) return { status: 'aborted-before-dispatch' };
      const charge = invokeCharge(input.charge);
      const provider = invokeProvider(input.provider, input.signal);
      return { status: 'started', charge, provider };
    }

    const LEGACY_CHARGE_OBSERVE_MS = 1_000;

    function observeLegacyCharge(
      charge: Promise<LegacyChargeResult>,
      defer: (work: Promise<void>) => void
    ): void {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<LegacyChargeResult>((resolve) => {
        timer = setTimeout(
          () => resolve({ status: 'unavailable', code: 'legacy_charge_rejected' }),
          LEGACY_CHARGE_OBSERVE_MS
        );
      });
      defer(
        Promise.race([charge, timeout]).then((result) => {
          if (timer !== undefined) clearTimeout(timer);
          if (result.status !== 'charged') recordClosedEvent('legacy_charge_unavailable');
        })
      );
    }

    export async function settleLegacyDispatch<T>(
      start: Extract<LegacyDispatchStart<T>, { status: 'started' }>,
      signal: AbortSignal,
      defer: (work: Promise<void>) => void
    ): Promise<LegacyProviderResult<T>> {
      let abortedAfterStart = signal.aborted;
      let resolveAbort!: () => void;
      const abort = new Promise<{ kind: 'aborted' }>((resolve) => {
        resolveAbort = () => resolve({ kind: 'aborted' });
      });
      const markAborted = () => {
        abortedAfterStart = true;
        resolveAbort();
      };
      signal.addEventListener('abort', markAborted, { once: true });
      if (signal.aborted) markAborted();
      observeLegacyCharge(start.charge, defer);
      const settled = await Promise.race([
        start.provider.then((provider) => ({ kind: 'provider' as const, provider })),
        abort
      ]);
      signal.removeEventListener('abort', markAborted);
      if (abortedAfterStart || settled.kind === 'aborted') {
        return { status: 'failed', code: 'outcome_unknown' };
      }
      return settled.provider;
    }

`LegacyDispatchStart<T>` is defined in `src/platform/contracts.ts` in Task 3; Task 5's dispatch module imports it and implements the helpers above. `recordClosedEvent` accepts only the content-free code `legacy_charge_unavailable`. Both stored promises are non-rejecting. The route calls `settleLegacyDispatch(start, request.signal, deferPlatformWork)` immediately after a `started` result. `deferPlatformWork` maps to the captured Worker `ctx.waitUntil` and to a caught, process-owned bounded promise in legacy tests; it never exposes the promise to response latency. Charge observation ends within one second even if charge never settles. The abort race returns unknown without awaiting a provider that ignores cancellation; the already-normalized provider promise remains rejection-observed. Tests cover charge/provider synchronous throw independently and together, call order, asynchronous rejection, never-settling charge/provider, abort before start, abort during provider wait, late provider success after abort mapping to unknown, success despite charge rejection, and no retry. A failed charge cannot alter a successful provider result under deferred BE-01, and every failed provider maps to one fixed code. C1-B replaces this transition atomically.

### Exact identity and resolver APIs/state ordering

Identity key selection is pure and shared by every artifact:

    export type IdentitySchedule = Readonly<{
      currentVersion: string;
      nextVersion: string | null;
      activatesAtMs: number | null;
      digest: string;
    }>;

    export function proposedIdentityVersion(
      schedule: IdentitySchedule,
      nowMs: number
    ): string;

The deployment-A configuration validator, run when staging a new schedule, requires any non-null activation to be a whole-second UTC timestamp at least 24 hours after the validator's trusted clock and requires a different next version. The runtime selector does not require activation to remain in the future: it validates shape and returns current before activation and next at/after activation. No next version requires null activation.

All implementations import these literal constants from `src/platform/contracts.ts`:

    export const RESOLVER_DAILY_LIMIT = 50;
    export const RESOLVER_MAX_CONCURRENT = 2;
    export const RESOLVER_LEASE_MS = 10_000;
    export const RESOLVER_TOMBSTONE_MS = 172_800_000;
    export const RESOLVER_BLACKOUT_MS = 15_000;
    export const RESOLVER_URL_MAX_BYTES = 2_048;
    export const REQUEST_NAME_DOMAIN = 'event-every/resolver-request/v1\0';
    export const URL_HMAC_DOMAIN = 'event-every/resolver-url/v1\0';

The request Durable Object name is lowercase hex SHA-256 of the UTF-8 bytes `REQUEST_NAME_DOMAIN + requestId`; no raw UUID is used as an object name. `canonicalUrlHmac` is lowercase hex Web Crypto HMAC-SHA-256 of UTF-8 bytes `URL_HMAC_DOMAIN + canonicalUrl` using the resolver capability key. IdentityDayPolicy exposes:

    freeze(input: {
      scheduleDigest: string;
      proposedVersion: string;
      nowMs: number;
    }): Promise<
      | { status: 'frozen'; version: string }
      | { status: 'conflict' }
    >;

It derives `utcDay` only from its trusted `nowMs`. The RPC implementation recomputes `utcDay(nowMs)` before any SQL statement, so a caller cannot supply a stale day. It stores one SQLite row keyed literal UTC day. First insert wins; later exact calls return it; different digest/version conflicts. Missing returned key binding fails before identity derivation.

ResolverRequestAuthority exposes:

    begin(input: {
      requestId: string;
      authorityDay: string;
      identityVersion: string;
      identityHmac: string;
      canonicalUrlHmac: string;
      capabilityDigest: string;
      permitDeadlineMs: number;
      nowMs: number;
    }): Promise<
      | { status: 'begun'; executionId: string }
      | { status: 'conflict' | 'expired' | 'day-mismatch' }
    >;

    claim(input: {
      executionId: string;
      nowMs: number;
      currentUtcDay: string;
    }): Promise<
      | { status: 'permit'; nonce: string }
      | { status: 'inflight' | 'complete' | 'unknown' | 'expired' | 'day-mismatch' }
    >;

    complete(input: {
      executionId: string;
      outcome: 'success' | 'failed' | 'unknown';
      nowMs: number;
    }): Promise<{ status: 'stored' | 'conflict' }>;

DailyCounter exposes:

    admitResolver(input: {
      executionId: string;
      requestAuthorityName: string;
      identityHmac: string;
      authorityDay: string;
      currentUtcDay: string;
      nowMs: number;
    }): Promise<
      | { status: 'admitted'; leaseId: string; expiresAtMs: number }
      | { status: 'busy'; retryAfterSeconds: number }
      | { status: 'daily-limit'; resetAt: string }
      | { status: 'day-rollover' | 'day-mismatch' }
    >;

    releaseResolver(input: {
      executionId: string;
      leaseId: string;
      phase: 'before-outbound' | 'after-outbound';
      nowMs: number;
    }): Promise<{ status: 'released' | 'consumed' | 'conflict' }>;

Ordering is fixed: reject a canonical URL over 2,048 UTF-8 bytes; validate capability/current day; `begin` stores `permitDeadlineMs = min(capabilityExpiryMs, blackoutStartMs)`; admitResolver; if admission rejects, complete failed and never claim; claim; if permit is lost/non-permit, release/consume by stored phase and never fetch; fetch; release after-outbound; complete. A transient busy rejection still completes failed. A later identical `begin` using the same request UUID may atomically reopen only that pre-claim failed row when its nonce remains null, every stored binding matches exactly, and the trusted day and stored permit deadline remain valid; post-claim failures, mismatches, expired requests, and day mismatches remain terminal or conflict. `claim` transactionally compares stored/supplied/trusted day, then rejects and tombstones when `nowMs >= permit_deadline_ms`, all before nonce read/creation. Abort before first outbound releases concurrency but retains daily count. After outbound consumes the slot. DailyCounter reconciliation cannot claim or fetch.

Each Durable Object creates these literal SQLite tables in its constructor inside `blockConcurrencyWhile`; schema text is asserted byte-for-byte in tests:

    CREATE TABLE IF NOT EXISTS identity_day_policy (
      utc_day TEXT PRIMARY KEY,
      schedule_digest TEXT NOT NULL,
      version TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resolver_request (
      execution_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      authority_day TEXT NOT NULL,
      identity_version TEXT NOT NULL,
      identity_hmac TEXT NOT NULL,
      canonical_url_hmac TEXT NOT NULL,
      capability_digest TEXT NOT NULL,
      permit_deadline_ms INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('begun','claimed','complete','unknown')),
      nonce TEXT,
      outcome TEXT CHECK(outcome IN ('success','failed','unknown')),
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      tombstone_until_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resolver_daily_count (
      authority_day TEXT NOT NULL,
      identity_hmac TEXT NOT NULL,
      consumed INTEGER NOT NULL CHECK(consumed >= 0),
      PRIMARY KEY (authority_day, identity_hmac)
    );

    CREATE TABLE IF NOT EXISTS resolver_lease (
      lease_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL UNIQUE,
      request_authority_name TEXT NOT NULL CHECK(length(request_authority_name) = 64),
      authority_day TEXT NOT NULL,
      identity_hmac TEXT NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('before-outbound','after-outbound')),
      expires_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS resolver_reconcile_outbox (
      execution_id TEXT PRIMARY KEY,
      request_authority_name TEXT NOT NULL CHECK(length(request_authority_name) = 64),
      outcome TEXT NOT NULL CHECK(outcome = 'unknown'),
      created_at_ms INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

`begin`, `claim`, `complete`, `admitResolver`, and `releaseResolver` compare every supplied/stored day with trusted day before mutation. `admitResolver` validates the authority name and atomically calls `moveExpiredLeaseToOutbox(lease)` before deleting each expired lease; deletion without the durable outbox row is forbidden. It then checks blackout/concurrency/daily count, inserts the lease, and only then calls the defined `incrementDailyCountSql(sql, authorityDay, identityHmac)` helper. Its alarm first moves expirations, then processes each outbox row by calling unknown completion; only `stored` or already-unknown deletes the outbox row. Failure increments attempts and schedules a bounded retry, so admission cleanup cannot lose reconciliation. Busy is fixed HTTP 429 `{ "code": "resolver_busy", "retryAfterSeconds": n }`, where `n = max(1, min(10, ceil((earliestLeaseExpiryMs - nowMs) / 1000)))`. Daily limit is fixed HTTP 429 `{ "code": "resolver_daily_limit", "resetAt": nextUtcMidnightIso }`. Both stale day and final-15-second issuance/claim use fixed HTTP 409 `{ "code": "resolver_day_rollover" }`. Client retry obeys busy delay, retries at most twice with the same UUID, and never retries daily-limit, day-rollover, conflict, expired, or unknown. Constants remain 2,048-byte URL, 50/day, 2 concurrent, 10-second lease, 15-second blackout, and two-day tombstone; no override exists.

### Private legacy keep-alive capability

Task 9 creates `cloudflare/legacy-keepalive-worker.ts`, its Wrangler configuration, generated type file, dedicated Vitest configuration, and integration test. This is a separate private Worker with workers_dev:false, preview_urls:false, no routes, no service binding from the app Worker, and the only KV_REST_API_URL/KV_REST_API_TOKEN bindings. It exports scheduled only. The app wrangler file contains no Upstash binding and cloudflare/app-worker.ts exports no scheduled handler. The private config contains no active trigger in C1-A; a comment records the future P1 cron. The integration test runs the private Worker with synthetic loopback Upstash fetch and proves one bounded set, status-only failures, and no public fetch export.

The private config is exactly:

    {
      "$schema": "node_modules/wrangler/config-schema.json",
      "name": "event-every-legacy-keepalive-private",
      "main": "cloudflare/legacy-keepalive-worker.ts",
      "compatibility_date": "2026-08-02",
      "compatibility_flags": ["nodejs_compat"],
      "workers_dev": false,
      "preview_urls": false,
      "vars": {
        "KEEPALIVE_DEPLOYMENT_DISABLED": "1",
        "STATE_AUTHORITY_MODE": "legacy",
        "KV_REST_API_URL": "",
        "KV_REST_API_TOKEN": ""
      }
    }

It deliberately has no routes or triggers. The empty KV values exist only for generated typing and are required empty while deployment is disabled; tests override them with synthetic loopback values. `cloudflare/legacy-keepalive-worker.ts` has exactly one public handler:

    export default {
      scheduled(controller, env, ctx) {
        ctx.waitUntil(runLegacyKeepAlive(env, controller.scheduledTime));
      }
    } satisfies ExportedHandler<LegacyKeepAliveEnv>;

`vitest.config.keepalive-workers.ts` uses the same installed Vitest 4 plugin API and is exactly:

    import { defineConfig } from 'vitest/config';

    export default defineConfig(async () => {
      const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');
      return {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './cloudflare/legacy-keepalive-wrangler.jsonc' },
            miniflare: {
              bindings: {
                KV_REST_API_URL: 'http://127.0.0.1:8799',
                KV_REST_API_TOKEN: 'synthetic-c1-a-token'
              }
            }
          })
        ],
        test: {
          include: [
            'test/worker/legacy-keepalive.integration.test.ts',
            'test/worker/deny-egress.integration.test.ts'
          ],
          setupFiles: ['./test/worker/deny-egress.setup.ts']
        }
      };
    });

The generated private type command and exact private test command are:

    bun run cf:types:keepalive
    bun scripts/run-c1-a-cloudflare.ts keepalive-tests

`test/worker/deny-egress.setup.ts` captures the original workerd `fetch`, installs a Vitest global mock, parses every target URL, delegates only literal loopback hosts (`127.0.0.1`, `[::1]`, `::1`, `localhost`), and throws `C1_A_WORKER_EGRESS_BLOCKED` before delegation for everything else. It neither inspects nor logs headers/bodies. `deny-egress.integration.test.ts` runs in both pools, calls a non-loopback canary, proves the captured runtime fetch spy was not called, and proves the private synthetic loopback endpoint remains reachable. The two explicit Worker command lists always include this canary file.

`playwright.c1-a.config.ts` is exactly:

    import { defineConfig, devices } from '@playwright/test';

    const suffix = process.env.C1_A_OUTPUT_SUFFIX;
    if (!suffix || !/^[a-f0-9]{12}$/.test(suffix)) {
      throw new Error('C1_A_OUTPUT_SUFFIX must be 12 lowercase hex characters');
    }

    export default defineConfig({
      testDir: './e2e',
      testMatch: /c1-a-runtime-admission\.spec\.ts/,
      outputDir: `test-results-c1-a-${suffix}`,
      reporter: [['html', { outputFolder: `playwright-report-c1-a-${suffix}`, open: 'never' }]],
      use: { baseURL: 'http://127.0.0.1:8788' },
      webServer: undefined,
      projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } }
      ]
    });

The ordinary `playwright.config.ts` adds `testIgnore: /c1-a-runtime-admission\.spec\.ts/`; its existing local web server and 56-definition E1 suite otherwise remain byte-for-byte. The C1-A config discovers only the three Worker-only definitions.


### Truthful E1 browser accounting

At c04e6f2 there are 60 definitions per browser. Four pattern/admin definitions retire with no mutation credit: the sole pattern-unlock definition and three community-limit pattern/admin definitions. Exactly 56 unaffected definitions remain per browser. C1-A adds exactly three new definitions per browser:

- C1A-E2E-01: `community exhaustion exposes no pattern or admin bypass`
- C1A-E2E-02: `corrupt Scanner review storage recovers and persists the next scan`
- C1A-E2E-03: `URL-only scan waits through resolver rollover and busy responses then succeeds`

The exact four retired titles are:

- `"Enter pattern lock" switches to the pattern screen as it looks today`
- `admins with a valid pattern session bypass the limit screen`
- `"Enter pattern lock" on /spent opens the pattern screen via /?unlock`
- `drawing a valid pattern unlocks the app`

Final discovery is 59 definitions per browser, 118 total. Existing URL and abort scenarios among the 56 are strengthened but not double-counted as new definitions. Every discovery assertion and ledger count uses 56 preserved + 3 new = 59 per browser.

### Strict-offline Worker browser runner

Dependency installation is a separate one-time credential-scrubbed registry action. It does not use the offline preload. `install-c1-a-dependencies.ts` removes every credential-shaped environment variable, sets `BUN_CONFIG_NO_LOAD_DOTENV=1`, uses `bun --no-env-file`, and passes `--registry https://registry.npmjs.org` literally. It creates an invocation-owned directory with mode `0700`, an empty `.npmrc`, and a `.bunfig.toml` containing only `[install]\nregistry = "https://registry.npmjs.org"\n`; child `NPM_CONFIG_USERCONFIG` and `npm_config_userconfig` point to the owned npmrc, inherited `XDG_CONFIG_HOME` is removed, and child `XDG_CONFIG_HOME` points to that owned directory. `BUN_CONFIG_FILE` is absent and no `--config` locator is used. Live Bun 1.3.13 proof showed that the documented subcommand-positioned `--config` fails before resolution with `failed to load bunfig.toml`, while moving it before the subcommand exits zero without performing the requested install. The owned XDG boundary isolates global Bun configuration without that defective locator; the literal `--registry` remains authoritative over npmrc, bunfig, and registry environment values. The script rejects any repository `.npmrc` and any auth/token/registry entry in a repository `bunfig.toml`, deletes the owned directory in `finally`, and refuses a collision. It rejects lifecycle scripts with `--ignore-scripts`, validates every non-vendored `bun.lock` entry as an exact npm-name plus exact SemVer registry resolution with empty source field and SHA-512 integrity, validates the five exact resolved versions, permits only the exact committed vendored Scanner file entry, and requires `package.json.trustedDependencies` byte-identical before/after. If OpenNext requires an install script, stop and repair the plan rather than enabling it.

All later commands use checked-in local binaries, never bunx:

    bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/admission.integration.test.ts test/worker/resolver.integration.test.ts test/worker/deny-egress.integration.test.ts
    bun scripts/run-c1-a-cloudflare.ts keepalive-tests

`scripts/run-c1-a-worker-e2e.ts` first requires fixed `.open-next` and `.wrangler` absent, then owns and removes them in `finally`. Only Playwright paths are suffix-specific. It calls `installCloudflareProcessBoundary(root)` before dynamically importing `createTestHarness` from the pinned local Wrangler package, imports `setupServer` from `msw/node` plus `http` and `passthrough` from `msw`, and builds OpenNext under `createCloudflareChildEnvironment`. Before creating or starting the harness it starts one current-process MSW server as follows; `requireLiteralLoopback` reparses `request.url` and throws unless the hostname is exactly `127.0.0.1`, `[::1]`, `::1`, or `localhost`:

    const loopbackHttp = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/;
    const egressGuard = setupServer(
      http.all(loopbackHttp, ({ request }) => {
        requireLiteralLoopback(request.url);
        return passthrough();
      })
    );
    egressGuard.listen({ onUnhandledRequest: 'error' });

Every other HTTP(S) request therefore fails before a network socket, while the preload independently guards fetch/http/https/net/tls/dns/Bun APIs. It then creates exactly:

    const harness = createTestHarness({
      workers: [{
        configPath: './wrangler.jsonc',
        vars: {
          IDENTITY_HMAC_CURRENT: 'synthetic-c1-a-identity-key',
          RESOLVER_CAPABILITY_HMAC: 'synthetic-c1-a-capability-key',
          OPENROUTER_COMMUNITY_KEY: 'synthetic-c1-a-never-sent'
        }
      }]
    });
    await harness.listen();

The synthetic values are fixed non-secret test data and override the deliberately empty nondeployable authored bindings without changing `wrangler.jsonc`. After Task 8, the runner invokes `harness.fetch('http://127.0.0.1:8788/api/scan', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:8788', 'cf-connecting-ip': '203.0.113.10', 'X-Event-Every-Request-Id': '018f47a0-7b5c-7cc4-9a34-123456789abc' }, body: JSON.stringify({ kind: 'text', text: 'C1-A outbound canary' }) })`. That fixed UUID is syntactically valid and stable through the exact community request; the absolute request URL and Origin are identical origins, so admission reaches the OpenRouter transport using the synthetic community value. MSW must record exactly one unhandled target with origin `https://openrouter.ai` before the runner accepts the fixed HTTP 502 `scan_provider_failed`; the proof also requires zero Node socket attempts and absence of the synthetic value in output. Before Task 8 this real canary is not an acceptance command; the Task 2 runner test uses fakes and the Task 8+ browser/terminal commands exercise it. An owned Node HTTP server binds only `127.0.0.1:8788`, converts each inbound request to a Fetch `Request`, calls `harness.fetch(request)`, and streams the bounded response back. It does not use `wrangler dev`.

After loopback readiness, the runner invokes local Playwright with `playwright.c1-a.config.ts`. The runner records the Playwright child plus harness/server/MSW handles, closes Playwright TERM/KILL, then HTTP server, then awaits `harness.close()`, then calls `egressGuard.close()`, verifies port closure, hashes authored configs, and deletes only owned output. Browser acceptance therefore exercises the actual OpenNext bundle in workerd through Wrangler's test harness, never Next dev or an unconstrained Worker subprocess.

### Exact mutation mechanism

`scripts/run-c1-a-mutations.ts` implements named deterministic TypeScript text mutators. Production code must contain the exact old anchor once; the runner requires it once, replaces it with the exact new anchor, requires the new anchor once, runs the named command expecting nonzero and the named assertion text, and restores in `finally`.

| ID | Production target | Exact old literal → exact new literal | Command | Required red assertion |
| --- | --- | --- | --- | --- |
| C1A-M01 | `src/platform/identity.ts` | `request.headers.get('cf-connecting-ip')` → `request.headers.get('x-forwarded-for')` | MUT-A | `forged forwarding header is ignored` |
| C1A-M02 | `src/platform/admission.ts` | `return isAllowedOrigin(request, policy);` → `return true;` | MUT-A | `cross-site text is rejected before route` |
| C1A-M03 | `src/platform/admission.ts` | `totalBytes += chunk.byteLength;` → `totalBytes = Number(request.headers.get('content-length') ?? 0);` | MUT-A | `chunked overflow cancels the stream` |
| C1A-M04 | `src/platform/admission.ts` | `if (totalBytes > policy.maxBodyBytes) {` → `if (totalBytes >= policy.maxBodyBytes) {` | MUT-A | `exact byte ceiling is accepted` |
| C1A-M05 | `src/platform/admission.ts` | `await cancelAndReject(reader, 'body_too_large');` → `return rejectAdmission('body_too_large');` | MUT-A | `chunked overflow cancels the stream` |
| C1A-M06 | `src/server/scanner/image.ts` | `validateStructuredImage(decoded, mediaType)` → `decoded.byteLength >= 4` | MUT-B | `truncated image structure is rejected` |
| C1A-M07 | `src/server/scanner/image.ts` | `decoded.byteLength > MAX_IMAGE_BYTES` → `encoded.length > MAX_IMAGE_BYTES` | MUT-B | `decoded image byte ceiling is enforced` |
| C1A-M08 | `src/server/scanner/transport.ts` | `signal: input.signal,` → `signal: undefined,` | MUT-C | `exact signal reaches fetch` |
| C1A-M09 | `src/lib/llm.ts` | `await response.body?.cancel();` → `await response.json();` | MUT-D | `provider error body remains unread` |
| C1A-M10 | `src/app/api/detect-urls/route.ts` | `detectUrlsDeterministically(input.text)` → `await fetch('/api/summarize', { method: 'POST' }).then(() => detectUrlsDeterministically(input.text))` | MUT-E | `deterministic detector performs no provider call` |
| C1A-M11 | `src/platform/resolver/capability.ts` | `Math.min(nowMs + 120_000, blackoutStartMs)` → `nowMs + 120_000` | MUT-F | `capability expires before blackout` |
| C1A-M12A | `src/platform/cloudflare/resolver-request-authority.ts` | `if (!isTrustedUtcDay(input.authorityDay, input.nowMs)) {` → `if (false) {` | MUT-G | `begin rejects day mismatch before mutation` |
| C1A-M12B | `src/platform/cloudflare/resolver-request-authority.ts` | `if (!isTrustedUtcDay(input.currentUtcDay, input.nowMs)) {` → `if (false) {` | MUT-G | `claim rejects day mismatch before mutation` |
| C1A-M12C | `src/platform/cloudflare/daily-counter.ts` | `if (!isTrustedUtcDay(input.currentUtcDay, input.nowMs)) {` → `if (false) {` | MUT-G | `admission rejects day mismatch before mutation` |
| C1A-M13 | `src/platform/cloudflare/daily-counter.ts` | `if (activeLeases >= RESOLVER_MAX_CONCURRENT) return busyResult(nowMs);` → `if (activeLeases >= RESOLVER_MAX_CONCURRENT) { incrementDailyCountSql(this.ctx.storage.sql, input.authorityDay, input.identityHmac); return busyResult(nowMs); }` | MUT-G | `busy admission does not increment` |
| C1A-M14 | `src/platform/cloudflare/resolver-request-authority.ts` | `return { status: stored.state };` → `return { status: 'permit', nonce: stored.nonce ?? '' };` | MUT-G | `non-permit result exposes no nonce` |
| C1A-M15 | `src/services/webScraper.ts` | `mapWithConcurrency(urls, 2, resolveOne)` → `Promise.all(urls.map(resolveOne))` | MUT-H | `resolver concurrency is bounded at two` |
| C1A-M16 | `src/platform/resolver/url-policy.ts` | `redirect: 'manual',` → `redirect: 'follow',` | MUT-I | `private redirect is rejected` |
| C1A-M17 | `src/platform/resolver/url-policy.ts` | `assertAllowedResolverUrl(nextUrl);` → `assertAllowedScheme(nextUrl);` | MUT-I | `every redirect hop is fully revalidated` |
| C1A-M18 | `src/app/api/scrape-url/route.ts` | `readCappedBody(response.body, RESOLVER_BODY_LIMIT, signal)` → `response.text()` | MUT-I | `512 KiB plus one cancels upstream` |
| C1A-M19 | `src/lib/llm.ts` | `return 'community';` → `return 'admin';` | MUT-J | `community mode has no cookie admin bypass` |
| C1A-M20 | `cloudflare/legacy-keepalive-worker.ts` | `return mapKeepAliveFailure(error);` → `throw error;` | MUT-K | `native failure is status-only` |
| C1A-M21 | `src/app/page.tsx` | `case 'recovered-corrupt': return { hydrationComplete: true };` → `case 'recovered-corrupt': return { hydrationComplete: false };` | MUT-L | `recovered corrupt storage completes hydration` |
| C1A-M22 | `src/services/reviewStorage.ts` | `storage.removeItem(REVIEW_STORAGE_KEY);` → `void REVIEW_STORAGE_KEY;` | MUT-L | `corrupt Scanner key is removed` |
| C1A-M23 | `src/services/reviewStorage.ts` | `storage.removeItem(REVIEW_STORAGE_KEY);` → `storage.clear();` | MUT-L | `unrelated storage remains untouched` |
| C1A-M24 | `cloudflare/app-worker.ts` | `return handler.fetch(admitted.request, env, ctx)` → `return handler.fetch(request, env, ctx)` | MUT-M | `wrapper forwards only rebuilt admitted request` |
| C1A-M25 | `src/platform/legacy/dispatch.ts` | `const provider = invokeProvider(input.provider, input.signal);` → `const provider = charge.then(() => invokeProvider(input.provider, input.signal)).then((result) => result);` | MUT-C | `charge settlement cannot delay provider invocation` |
| C1A-M26 | `src/platform/legacy/dispatch.ts` | `if (abortedAfterStart || settled.kind === 'aborted') {` → `if (abortedAfterStart && settled.kind === 'aborted') {` | MUT-C | `late provider success after abort is unknown` |
| C1A-M27 | `src/services/scanClient.ts` | `'X-Event-Every-Request-Id': requestId` → `'X-Event-Every-Request-Id': createProviderRequestId()` | MUT-N | `scan retry preserves one request UUID` |
| C1A-M28 | `src/services/summarizer.ts` | `'X-Event-Every-Request-Id': requestId` → `'X-Event-Every-Request-Id': createProviderRequestId()` | MUT-O | `summarizer forwards its created request UUID` |
| C1A-M29 | `src/platform/identity.ts` | `nowMs < schedule.activatesAtMs` → `nowMs <= schedule.activatesAtMs` | MUT-P | `identity switches exactly at activation` |
| C1A-M30 | `src/platform/runtime.ts` | `return notReadyProviderPort;` → `return legacyProviderPort;` | MUT-Q | `shadow and cloudflare fail before legacy provider` |
| C1A-M31 | `src/app/api/keep-alive/route.ts` | `return new Response(null, { status: 410 });` → `return fetch('http://127.0.0.1:8799/legacy-keepalive');` | MUT-R | `public keep-alive performs zero outbound state calls` |
| C1A-M32 | `cloudflare/legacy-keepalive-worker.ts` | `if (env.STATE_AUTHORITY_MODE === 'cloudflare') return;` → `if (false) return;` | MUT-K | `cloudflare mode performs no keep-alive state call` |
| C1A-M33 | `src/platform/resolver/url-policy.ts` | `return isPublicAddress(parsedAddress);` → `return true;` | MUT-I | `private literal address is rejected` |
| C1A-M34 | `src/platform/resolver/url-policy.ts` | `if (totalBytes > RESOLVER_BODY_LIMIT) {` → `if (totalBytes > Number.MAX_SAFE_INTEGER) {` | MUT-I | `512 KiB plus one cancels upstream` |
| C1A-M35 | `src/platform/resolver/html-to-text.ts` | `truncateUtf8(text, RESOLVER_TEXT_MAX_BYTES)` → `text` | MUT-S | `sanitized text is capped at 100000 UTF-8 bytes` |
| C1A-M36 | `src/platform/cloudflare/resolver-request-authority.ts` | `stored.authorityDay !== trustedDay` → `false` | MUT-G | `claim rejects stored pre-midnight authority day` |
| C1A-M37 | `src/platform/resolver/url-policy.ts` | `canonicalBytes > RESOLVER_URL_MAX_BYTES` → `canonicalBytes > Number.MAX_SAFE_INTEGER` | MUT-I | `canonical URL is capped at 2048 bytes` |
| C1A-M38 | `src/platform/route-manifest.ts` | `'/api/scrape-url': SCRAPE_URL_POLICY,` → `'/api/not-scrape-url': SCRAPE_URL_POLICY,` | MUT-E | `every API route has one manifest entry` |
| C1A-M39 | `src/app/api/resolve-timezone/route.ts` | `request.headers.get('x-event-every-request-id')` → `crypto.randomUUID()` | MUT-T | `timezone route forwards the caller request UUID` |
| C1A-M40 | `src/lib/llm.ts` | `if (!process.env.OPENROUTER_COMMUNITY_KEY) throw new Error('community_key_unavailable');` → `if (!process.env.OPENROUTER_COMMUNITY_KEY) return process.env.OPENROUTER_API_KEY!;` | MUT-J | `community request never falls back to admin key` |
| C1A-M41 | `src/platform/resolver/html-to-text.ts` | `truncateUtf8(title, RESOLVER_TITLE_MAX_BYTES)` → `title` | MUT-S | `sanitized title is capped at 512 UTF-8 bytes` |
| C1A-M42 | `src/platform/cloudflare/resolver-request-authority.ts` | `if (input.nowMs >= stored.permitDeadlineMs) {` → `if (false) {` | MUT-G | `claim in blackout tombstones without nonce` |
| C1A-M43 | `src/platform/cloudflare/daily-counter.ts` | `moveExpiredLeaseToOutbox(lease);` → `void lease;` | MUT-G | `expired lease is durable before deletion` |

The exact command aliases above expand to these shell-free child argument arrays:

- MUT-A: `bun test src/platform/__tests__/identity.test.ts src/platform/__tests__/admission.test.ts src/app/api/scan/__tests__/route.test.ts --isolate`
- MUT-B: `bun test src/server/scanner/__tests__/image.test.ts --isolate`
- MUT-C: `bun test src/platform/legacy/__tests__/dispatch.test.ts src/server/scanner/__tests__/transport.test.ts src/app/api/scan/__tests__/route.test.ts --isolate`
- MUT-D: `bun test src/lib/__tests__/llm.test.ts --isolate`
- MUT-E: `bun test src/platform/__tests__/route-manifest.test.ts src/services/__tests__/urlServices.test.ts --isolate`
- MUT-F: `bun test src/platform/resolver/__tests__/capability.test.ts --isolate`
- MUT-G: `bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/resolver.integration.test.ts test/worker/deny-egress.integration.test.ts`
- MUT-H: `bun test src/services/__tests__/urlServices.test.ts --isolate`
- MUT-I: `bun test src/platform/resolver/__tests__/url-policy.test.ts src/app/api/scrape-url/__tests__/route.test.ts --isolate`
- MUT-J: `bun test src/lib/__tests__/llm.test.ts src/lib/__tests__/limits.test.ts --isolate`
- MUT-K: `bun scripts/run-c1-a-cloudflare.ts keepalive-tests`
- MUT-L: `bun test src/services/__tests__/reviewStorage.test.ts --isolate`
- MUT-M: `bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/deny-egress.integration.test.ts`
- MUT-N: `bun test src/services/__tests__/scanClient.test.ts --isolate`
- MUT-O: `bun test src/services/__tests__/summarizer.test.ts --isolate`
- MUT-P: `bun test src/platform/__tests__/identity.test.ts --isolate`
- MUT-Q: `bun test src/platform/__tests__/runtime.test.ts --isolate`
- MUT-R: `bun test src/app/api/keep-alive/__tests__/route.test.ts --isolate`
- MUT-S: `bun test src/platform/resolver/__tests__/html-to-text.test.ts --isolate`
- MUT-T: `bun test src/app/api/resolve-timezone/__tests__/route.test.ts --isolate`

Before each named behavioral command, the mutation runner invokes `run-with-open-next` around local `tsc --noEmit` and requires exit 0; a compile failure is a rejected mutation, never causal RED evidence. No mutation is accepted until observed named red, exact inverse, original SHA-256, and restored green are recorded. M22 and M23 run separately from the same restored old anchor.

### Exact security gate-script contracts

These scripts are security boundaries, not implementation-choice placeholders. They use `spawnSync`/`spawn` with argument arrays and `shell: false`; no script uses `exec`, `bunx`, a shell string, inherited stdio containing environment values, or a deploy-capable command.

The shared credential-name expression is exactly:

    const CREDENTIAL_NAME = /(OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV_REST|D1|R2|AUTH_PATTERN)/i;

`scripts/run-c1-a-cloudflare.ts` defines `NEXT_PRODUCTION_DOTENV_FILES = ['.env.production.local', '.env.local', '.env.production', '.env'] as const` and the pinned-Next-compatible key-prefix expression `NEXT_DOTENV_KEY = /^\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*|:\s+)/`. This is the key/delimiter prefix of Next 15.5.9's bundled dotenv grammar: optional `export` plus whitespace, a nonempty word/dot/hyphen key, then either optional-space `=` or `:` followed by required whitespace. `collectNextProductionDotenvNames(root)` normalizes CRLF, applies this expression once per physical line, ignores blank/comment/nonmatching lines, retains group 1 only when `CREDENTIAL_NAME` matches it, and never slices, retains, returns, or logs the remainder of the line. It exports that collector plus `assertNoWranglerLocalFiles(root)`, `createCloudflareChildEnvironment(sourceEnv, root)`, and `installCloudflareProcessBoundary(root)`. The collector visits only those four fixed repository-root paths. The absence guard calls `readdirSync(root, { withFileTypes: true })` only on the repository root and rejects any entry whose name is `.dev.vars` or starts `.dev.vars.` with `c1-a Cloudflare boundary: local vars file present`; it never opens, stats, hashes, or logs that entry. Both environment builders use the union of process-environment names and all four collected Next-production key-name sets, blank every matching key before any Next/OpenNext/Wrangler import, then set these exact strings:

    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false
    CLOUDFLARE_INCLUDE_PROCESS_ENV=false
    BUN_CONFIG_NO_LOAD_DOTENV=1
    WRANGLER_WRITE_LOGS=false
    WRANGLER_SEND_METRICS=false

The child builder also installs the repository-local preload through `NODE_OPTIONS`. The process builder blanks matching keys in `process.env`, sets the five controls before any dynamic import of Wrangler, and never restores credential values. `WRANGLER_WRITE_LOGS=false` prevents writes outside invocation-owned repository outputs and `WRANGLER_SEND_METRICS=false` prevents telemetry egress. Wrangler 4.118 fetches runtime types by default, so both type-generation commands explicitly disable that optional network-backed surface and generate only configuration binding types. The generated declarations are deliberately binding snapshots, not standalone runtime libraries: root `tsconfig.json` excludes them, while the Workers Vitest plugin supplies platform globals when it compiles the Worker. Task 2 proves their repeatable config-derived bytes and the real Worker-pool compilation; it does not claim that the binding snapshot compiles in isolation. The CLI accepts exactly `app-types`, `keepalive-types`, or `keepalive-tests`; after the boundary, it spawns with `shell:false` one of these exact local arrays:

    node node_modules/wrangler/bin/wrangler.js types --include-runtime=false --env-interface CloudflareEnv
    node node_modules/wrangler/bin/wrangler.js types cloudflare/legacy-keepalive-configuration.d.ts --config cloudflare/legacy-keepalive-wrangler.jsonc --include-runtime=false --env-interface LegacyKeepAliveEnv
    node node_modules/vitest/vitest.mjs run --config vitest.config.keepalive-workers.ts test/worker/legacy-keepalive.integration.test.ts test/worker/deny-egress.integration.test.ts

No raw `wrangler types`, private Worker Vitest, or harness command exists elsewhere. Tests create an isolated synthetic root, place distinct credential canaries in `.env.production.local`, `.env.local`, `.env.production`, `.env`, and parent environment, plus unread canaries in `.dev.vars` and `.dev.vars.test`. Grammar cases include `export OPENROUTER_TOKEN=value`, `API_KEY: value`, `OPENROUTER-TOKEN=value`, `CLOUDFLARE.SECRET = value`, leading whitespace, CRLF, inline comments and quoted values, plus rejected blank/comment lines, `KEY:value` without colon whitespace, and missing delimiters. They prove every accepted matching name is blank before a fake child or dynamically imported fake Wrangler module, `.dev.vars*` rejects without a file read, and no value/name reaches bounded output. Tests also prove the exact non-recursive Vitest argv for `keepalive-tests`, exact type modes/argv, unknown-mode rejection, inherited Cloudflare-control override, child failure, and no names/values logged. `.gitignore` includes `.dev.vars` and `.dev.vars.*`, but the runtime absence guard remains authoritative even for ignored files.

`scripts/install-c1-a-dependencies.ts` exports:

    export type InstallMode = 'add' | 'frozen';
    export function buildInstallInvocation(
      mode: InstallMode,
      sourceEnv: NodeJS.ProcessEnv,
      dotenvNames: readonly string[],
      ownedDirectory: string
    ): { argv: readonly string[]; env: NodeJS.ProcessEnv };

Algorithm: reject argument count other than one and either unknown mode with `c1-a installer: expected add|frozen`; require the owned directory was just returned by `mkdtempSync(join(tmpdir(), 'event-every-c1-a-install-'))`; write the exact empty `.npmrc` and exact `.bunfig.toml` described above with modes `0600`; copy string environment entries, set every matching name from the union of environment and `.env.local` key names to empty, delete all case-insensitive `npm_*auth*`, `npm_*token*`, `BUN_AUTH_TOKEN`, `NODE_AUTH_TOKEN`, registry override variables, `BUN_CONFIG_FILE`, and inherited `XDG_CONFIG_HOME`, then set the two owned npm userconfig variables, invocation-owned `XDG_CONFIG_HOME`, and `BUN_CONFIG_NO_LOAD_DOTENV=1`. No `--config` locator is present. Assert every matching child value is empty. Spawn the literal mode argv. Capture at most 64 KiB per stream, reject output matching `/postinstall|preinstall|prepare|lifecycle/i` with `c1-a installer: lifecycle output observed`, and print only mode/package/version/exit status. In `finally`, compare `trustedDependencies`, validate every non-vendored lock entry's exact npm-name/SemVer resolution, empty source field, and integrity plus the five exact additions, overwrite both owned files with zeros, unlink them, remove the now-empty owned directory, and aggregate cleanup errors without masking child failure. Tests inject a shell-free child spawn and assert exact argv, cwd, complete child environment, pipe/shell options, both userconfig mappings, owned file bytes/modes, inherited/project auth rejection, output truncation, child nonzero, direct/transitive source and forged-resolution mismatch, collision rejection, inode/mode attacks, successful cleanup, and attempted cleanup of each unaffected owned file after a sibling-file failure.

`scripts/c1-a-offline-preload.cjs` exports no data. On load it replaces global `fetch`, `http.request/get`, `https.request/get`, `net.connect/createConnection`, `tls.connect`, `dns.lookup/resolve/resolve4/resolve6`, and `Bun.connect` when present. It parses the destination before dispatch and permits only literal `127.0.0.1`, `[::1]`, `::1`, or `localhost`; any other hostname, Unix socket, proxy, malformed target, or missing hostname throws `C1_A_EGRESS_BLOCKED`. Null/undefined placeholder routing fields are inert and ignored, while populated routing fields reject. A loopback HTTP(S) request may carry `createConnection` only when its headers are an exact WebSocket upgrade. The preload never mutates or trusts the caller object: it copies request options into a fresh object, replaces even a non-writable caller hook, rebuilds a minimal literal-loopback host/validated-port socket option object, and invokes its own patched `net.connect` or `tls.connect`. Node's request-option hooks therefore cannot cross into the socket layer and the Vitest/Miniflare control channel works without granting a custom-transport bypass; all other custom connection hooks still reject before dispatch. It blanks every matching environment name without logging names or values, then deliberately assigns the two non-secret Wrangler controls `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` and `CLOUDFLARE_INCLUDE_PROCESS_ENV=false`; these fixed control values are the only `CLOUDFLARE`-matching exception. `scripts/run-c1-a-offline.ts` derives the absolute repository root from `import.meta.dir`, requires the preload there, calls the shared four-file Next-production dotenv-name collector, blanks the process/all-four-file union before every child, reapplies those two fixed controls after the scrub, and runs the terminal command arrays in the exact listed order with `shell:false`; it stops at the first nonzero with `c1-a offline step N failed` and forwards only child exit code plus bounded stdout/stderr. Tests start a loopback server (allowed), attempt one request through every patched API to a documentation-only non-loopback address (blocked before socket creation), prove null placeholders remain inert and a non-writable WebSocket hook is replaced by the guarded minimal loopback transport, and assert the two controls remain exactly false through preload while distinct parent and four-dotenv credential canaries are absent from every child and bounded output.

`scripts/run-with-open-next.ts` is the sole owner of generated `.open-next` and `.wrangler` for source/type/Worker commands outside the browser runner. Its CLI is written as `--` followed by a nonempty child argv vector; Bun consumes that launcher separator, so the parser accepts the resulting nonempty post-separator vector and also tolerates one leading separator for direct invocation compatibility. It requires both paths absent, hashes the authored wrapper/config, calls `assertNoWranglerLocalFiles(root)`, and builds one child environment through `createCloudflareChildEnvironment`; every matching process/all-four-dotenv name is present with the empty string, the five literal Bun/Cloudflare/Wrangler controls are fixed, `NODE_OPTIONS=--require=<repository-local preload>`, and no value or name is logged. It runs the local OpenNext build under that environment and preload, requires `.open-next/worker.js`, runs the child with the same environment and `shell:false`, then removes both fixed outputs and compares hashes in `finally`. Empty values are deliberately present before Next/OpenNext loads, so its production loader cannot replace them from any of the four candidates; the preload blanks matching process variables again before application modules load. It refuses a deploy/upload/preview child or nested `run-with-open-next`, and exact failures begin `c1-a OpenNext owner:`. Its test uses distinct credential canaries in parent environment and each of `.env.production.local`, `.env.local`, `.env.production`, and `.env`, plus synthetic `.dev.vars*` unread rejection, proves no canary reaches the fake build/child or bounded output, and also proves single-token, Bun-forwarded, and direct-invocation argv forms, build-before-child, missing bundle, child failure, collision, signal, cleanup aggregation, and no child starts after failed build. Every task command containing TypeScript source-checking or the app Worker Vitest pool is executed through this owner. The browser runner is the only alternative owner and has the same absent/build/scrub/preload/Cloudflare-controls/finally contract.

`scripts/assert-c1-a-paths.ts` exports:

    export function readTaskManifest(task: number): readonly string[];
    export function assertAuthorizedPaths(
      baseline: string,
      head: string,
      task: number,
      committed: readonly string[],
      staged: readonly string[]
    ): void;

It accepts baseline, head, and exactly `--task=01..11` or `--terminal`; reads the checked-in manifests through the selected task; rejects blank/absolute/backslash/glob/duplicate paths, `..`, protected prefixes, `.env`, every `.env.*`, every `.dev.vars*`, generated output, reviewer reports, and credential-shaped filenames. The sole dotenv-name exception is exact repository-root `.env.example`, which is valid only as the one entry in `task-08.txt`; task mode can stage it only for Task 8, later task modes may see it only in the committed prior-manifest union, and terminal mode may see it only through that same Task-8 ownership. Any other manifest/observed ownership of `.env.example` rejects before subset comparison. Task mode requires staged paths equal the active manifest and committed `baseline...head` paths be a subset of prior manifests. Terminal mode requires an empty index/worktree outside protected paths and committed `baseline...head` paths equal the union of all manifests. Exact failures are `c1-a paths: protected path`, `c1-a paths: invalid manifest`, and `c1-a paths: observed path mismatch`. Tests prove Task-8 `.env.example` staging and later committed ownership pass, `.env.example` in any other manifest/staged task fails, all four runtime dotenv candidates and arbitrary `.env.*`/`.dev.vars*` fail, plus rename/delete records, newline filenames, protected precedence, and extra/missing paths.

By Task 9, `scripts/assert-c1-a-config.ts` parses JSONC through Wrangler's installed parser, imports the two Vitest and both Playwright configs in a scrubbed child, and reads package scripts/ignores as text. Task 1 implements the package/offline subset, Task 2 adds the app subset, and Task 9 adds the private subset with RED first at each step. Its final form requires every literal config field and empty secret-shaped binding in this plan; rejects `remote:true`, routes, active triggers, public preview/worker URL, non-sentinel D1 UUID, app Upstash variables, service binding to the private Worker, deploy/upload/publish command text, ordinary Playwright discovery of the C1-A file, or private Vitest discovery in app config. Exact failures begin `c1-a config:` and include the field path. Its test creates one isolated fixture per forbidden condition plus one complete valid fixture; no test imports the live config before Task 2 GREEN.

`scripts/run-c1-a-worker-e2e.ts` implements these states exactly: `preflight → process-boundary-installed → build → egress-guard-started → harness-created → harness-listening → http-ready → playwright-started → playwright-settled → playwright-stopped → server-closed → harness-closed → egress-guard-closed → outputs-removed`. Preflight uses an exclusive loopback bind to prove port 8788 free, requires `.open-next`/`.wrangler` absent, calls the root-only `.dev.vars*` absence guard, creates a random 12-hex suffix with `crypto.randomBytes(6)`, and requires its two output paths absent. It hashes authored configs, installs the Cloudflare process boundary before dynamically importing Wrangler, creates the Cloudflare child environment for OpenNext/Playwright, runs the local OpenNext CLI under that environment, starts the MSW guard in the current harness process, creates the local Wrangler test harness with the literal synthetic `vars` above, awaits `harness.listen()`, starts the owned Node HTTP bridge, polls `/api/auth/check` for at most 30 seconds, then starts local Playwright with `C1_A_OUTPUT_SUFFIX` added to that same environment. `finally` TERM/KILLs only Playwright, closes/awaits the HTTP server, awaits `harness.close()`, closes MSW, proves port closure, compares authored hashes, and removes only the four preflight-owned paths. Signal handlers set one abort reason and enter the same `finally`; cleanup errors aggregate. Exact failures begin `c1-a worker e2e:`. Its closed parser accepts no arguments, or one `--project=chromium|webkit` plus one `--grep` whose following value equals one of the three literal C1-A titles; duplicates, unknown projects/titles, missing values, and any other flag fail before build. Tests use parent plus distinct `.env.production.local`, `.env.local`, `.env.production`, and `.env` credential canaries, `.dev.vars*` unread rejection, inherited Cloudflare-control overrides, fake every state, exact harness vars, dynamic-import ordering, `listen()`/`close()`, MSW `onUnhandledRequest: 'error'`, exact absolute canary URL/UUID/observed OpenRouter origin, argument case, collision, timeout, signal, TERM/KILL, hash mismatch, and partial cleanup; they require no canary in fake children or bounded output. The acceptance run separately exercises real workerd and the outbound canary.

`scripts/assert-c1-a-e2e-inventory.ts` invokes local Playwright twice with `--list`: ordinary config and C1-A config. For the latter it sets synthetic `C1_A_OUTPUT_SUFFIX=000000000000`, first requires both corresponding output paths absent, and removes them in `finally` if Playwright list unexpectedly creates them. It parses only canonical `[project] › path:line:column › title` lines, requires Chromium/WebKit, compares ordinary titles against the checked-in 56-title array, requires four retired titles absent, and requires each three-title C1-A item once/project. Its sole argument is `57`, `58`, or `59`; any other fails `c1-a inventory: expected 57|58|59`. It reports configs separately and never treats C1-A as ordinary E1.

`scripts/validate-c1-a-evidence.ts` uses existing Zod. It exports `EvidenceSchema` and `validateEvidence(value, expectedImplementationCommit)`. The CLI accepts exactly the terminal JSON path, derives expected implementation commit as `HEAD` while evidence differs from HEAD and `HEAD^` once HEAD contains evidence, compares IDs against the literal 45-ID list, rejects absolute path/username/credential content, and prints only `c1-a evidence: valid`. Its test covers every field/type/extra-key/digest/count/commit/ID rejection, both commit selections, and a valid object. RED is missing script; GREEN is:

    bun test scripts/validate-c1-a-evidence.test.ts --isolate
    bun run validate:c1:a-evidence

`scripts/run-c1-a-mutations.ts` contains a closed readonly array of the 45 rows above. It accepts exactly `--write-ledger --all`, `--verify-ledger --all`, or one mode plus one ID. Both modes run compile-first/red/restore/green proof; write mode atomically creates the ledger only in Task 11, while verify mode compares recomputed rows byte-for-byte and never writes it. It atomically opens stable `/private/tmp/event-every-c1-a-mutation.lock` with `wx`; the file contains repository digest, PID, and start epoch. An existing lock is recoverable only when older than ten minutes and `kill(pid, 0)` reports no process; recovery unlinks/retries once. `finally` unlinks only the owned inode. Tests cover both modes, stable-lock contention/stale/live/wrong-inode cases, false-green, wrong-red, assertion/anchor/concurrent edit/signal/restore/cleanup cases.

`scripts/run-c1-a-offline.ts` defines `collectCoreEvidence()`, whose command list excludes evidence validation and always invokes mutation `--verify-ledger`. `--write-evidence` runs core, constructs Task-10-bound schema-1 evidence, atomically writes it once, then validates. Ordinary `bun run verify:c1:a` runs core, compares existing evidence byte-for-byte, then validates; it never writes evidence or ledger. Second write, missing verified ledger, dirty production target, credential, or absolute path fails closed.

### Exact staging, evidence, and cross-repository sequence

Task 1 creates task-01.txt through task-11.txt with one repository-relative path per line matching each task’s Files declaration. The path guard proves each manifest is duplicate-free, contains no glob/protected/generated path, and exactly matches staged paths. The exact staging/commit mapping is:

| Task | Path manifest | Commit message |
| --- | --- | --- |
| 1 | scripts/c1-a-task-paths/task-01.txt | build(event-every): lock c1-a offline boundary |
| 2 | scripts/c1-a-task-paths/task-02.txt | build(event-every): add open-next worker scaffold |
| 3 | scripts/c1-a-task-paths/task-03.txt | feat(event-every): define cloudflare platform contracts |
| 4 | scripts/c1-a-task-paths/task-04.txt | feat(event-every): enforce edge admission |
| 5 | scripts/c1-a-task-paths/task-05.txt | fix(event-every): bound scanner input and abort transport |
| 6 | scripts/c1-a-task-paths/task-06.txt | feat(event-every): add deterministic bounded resolver state |
| 7 | scripts/c1-a-task-paths/task-07.txt | feat(event-every): bound url resolution |
| 8 | scripts/c1-a-task-paths/task-08.txt | refactor(event-every): retire pattern admin bypass |
| 9 | scripts/c1-a-task-paths/task-09.txt | refactor(event-every): privatize legacy keep-alive |
| 10 | scripts/c1-a-task-paths/task-10.txt | fix(event-every): recover corrupt scanner review storage |
| 11 | scripts/c1-a-task-paths/task-11.txt | test(event-every): prove c1-a runtime admission |

For task 1 the exact command is `git add --pathspec-from-file=scripts/c1-a-task-paths/task-01.txt`; tasks 2–11 substitute the literal manifest shown in this table. Then run with matching two-digit `NN`:

    bun run assert:c1:a-paths c04e6f28c29d6d50bf714b7a3e453d645c6635e1 HEAD --task=NN
    bun run assert:e1-protected
    git diff --cached --check

Commit with the literal message in the table. No free-form staging is permitted.

The manifest file contents are literal below. Task 1 also creates all eleven manifests and owns this reviewed implementation-plan path, so its manifest owns those twelve coordination paths. The accepted plan remains untracked and byte-frozen from final review through Task 1 staging; there is no separate Event Every plan commit. Any byte change after the accepted review invalidates acceptance and requires rereview. Later tasks do not normally restage the already committed plan or manifest files. Task 7 has one bounded exception required by its busy-retry proof: before staging Task 7, independently rereview and commit exactly this plan path plus the prior Task 6-owned `src/platform/cloudflare/resolver-request-authority.ts` as a prerequisite repair. The Task 7 path gate then observes those two committed paths only as prior-manifest ownership and still requires the staged set to equal the unchanged nine-path Task 7 manifest; terminal mode still requires the unchanged eleven-manifest union. No manifest or accepted manifest hash changes.

Task 8 has one bounded ownership prerequisite required by its first GREEN command: before any Task
8 product edit, move `scripts/assert-c1-a-e2e-inventory.ts` and its test from `task-11.txt` to
`task-08.txt`, update only those two accepted manifest hashes, the causal path-guard test, this
plan's two literal manifests, and the Task 8/11 Files declarations. Independently rereview and
commit exactly those five governance paths. The terminal union must remain the same 149 paths with
sorted UTF-8 digest `86d9cafd0d18bd1c19126d19c9a7b3069322185c2625c762bba049b2a81d7131`.
Task 8 then creates the guard/test under its own manifest and implements the already specified
closed `57|58|59` contract; Task 11 reuses them without restaging. No Task 8 product path may change
in the prerequisite commit.

`task-01.txt`:

    .gitignore
    bun.lock
    docs/superpowers/plans/2026-08-02-event-every-cloudflare-c1-a-runtime-admission.md
    eslint.config.mjs
    package.json
    scripts/assert-c1-a-config.test.ts
    scripts/assert-c1-a-config.ts
    scripts/assert-c1-a-paths.test.ts
    scripts/assert-c1-a-paths.ts
    scripts/c1-a-offline-preload.test.ts
    scripts/c1-a-offline-preload.cjs
    scripts/c1-a-task-paths/task-01.txt
    scripts/c1-a-task-paths/task-02.txt
    scripts/c1-a-task-paths/task-03.txt
    scripts/c1-a-task-paths/task-04.txt
    scripts/c1-a-task-paths/task-05.txt
    scripts/c1-a-task-paths/task-06.txt
    scripts/c1-a-task-paths/task-07.txt
    scripts/c1-a-task-paths/task-08.txt
    scripts/c1-a-task-paths/task-09.txt
    scripts/c1-a-task-paths/task-10.txt
    scripts/c1-a-task-paths/task-11.txt
    scripts/install-c1-a-dependencies.test.ts
    scripts/install-c1-a-dependencies.ts
    scripts/run-c1-a-offline.test.ts
    scripts/run-c1-a-offline.ts
    scripts/run-c1-a-cloudflare.test.ts
    scripts/run-c1-a-cloudflare.ts
    scripts/run-with-open-next.test.ts
    scripts/run-with-open-next.ts
    scripts/assert-e1-paths.ts
    scripts/run-e1-offline.ts

`task-02.txt`:

    .gitignore
    cloudflare/app-worker.ts
    next.config.js
    open-next.config.ts
    playwright.c1-a.config.ts
    playwright.config.ts
    scripts/assert-c1-a-config.test.ts
    scripts/assert-c1-a-config.ts
    scripts/run-c1-a-worker-e2e.ts
    scripts/run-c1-a-worker-e2e.test.ts
    test/worker/app-worker.test.ts
    test/worker/deny-egress.integration.test.ts
    test/worker/deny-egress.setup.ts
    tsconfig.json
    vitest.config.workers.ts
    worker-configuration.d.ts
    wrangler.jsonc

`task-03.txt`:

    src/app/api/resolve-timezone/__tests__/route.test.ts
    src/app/api/resolve-timezone/route.ts
    src/app/api/scan/__tests__/route.test.ts
    src/app/api/scan/route.ts
    src/app/api/summarize/__tests__/route.test.ts
    src/app/api/summarize/route.ts
    src/app/api/usage/__tests__/route.test.ts
    src/app/api/usage/route.ts
    src/app/api/waitlist/__tests__/route.test.ts
    src/app/api/waitlist/route.ts
    src/app/api/__tests__/limit-gating.test.ts
    src/platform/__tests__/route-manifest.test.ts
    src/platform/__tests__/runtime.test.ts
    src/platform/cloudflare-context.ts
    src/platform/contracts.ts
    src/platform/legacy/index.ts
    src/platform/legacy/dispatch.ts
    src/platform/legacy/provider.ts
    src/platform/legacy/usage.ts
    src/platform/legacy/waitlist.ts
    src/platform/logger.ts
    src/platform/route-manifest.ts
    src/platform/runtime.ts
    src/services/__tests__/scanClient.test.ts
    src/services/__tests__/summarizer.test.ts
    src/services/requestId.ts
    src/services/scanClient.ts
    src/services/summarizer.ts

`task-04.txt`:

    cloudflare/app-worker.ts
    src/app/api/scan/__tests__/route.test.ts
    src/lib/clientIp.ts
    src/platform/__tests__/admission.test.ts
    src/platform/__tests__/identity.test.ts
    src/platform/admission.ts
    src/platform/identity.ts
    test/worker/app-worker.test.ts
    test/worker/admission.integration.test.ts

`task-05.txt`:

    src/app/api/scan/__tests__/route.test.ts
    src/app/api/scan/route.ts
    src/lib/__tests__/llm.test.ts
    src/lib/llm.ts
    src/platform/legacy/__tests__/dispatch.test.ts
    src/platform/legacy/dispatch.ts
    src/platform/legacy/provider.ts
    src/server/scanner/__tests__/image.test.ts
    src/server/scanner/__tests__/scan.test.ts
    src/server/scanner/__tests__/transport.test.ts
    src/server/scanner/image.ts
    src/server/scanner/job.ts
    src/server/scanner/transport.ts
    test/worker/app-worker.test.ts

`task-06.txt`:

    cloudflare/app-worker.ts
    src/app/api/detect-urls/route.ts
    src/platform/cloudflare/daily-counter.ts
    src/platform/cloudflare/identity-day-policy.ts
    src/platform/cloudflare/resolver-request-authority.ts
    src/platform/__tests__/identity.test.ts
    src/platform/identity.ts
    src/platform/resolver/__tests__/capability.test.ts
    src/platform/resolver/capability.ts
    src/services/__tests__/urlServices.test.ts
    src/services/urlDetector.ts
    src/services/webScraper.ts
    scripts/assert-c1-a-config.test.ts
    scripts/assert-c1-a-config.ts
    test/worker/app-worker.test.ts
    test/worker/resolver.integration.test.ts
    worker-configuration.d.ts
    wrangler.jsonc

`task-07.txt`:

    src/app/api/scrape-url/__tests__/route.test.ts
    src/app/api/scrape-url/route.ts
    src/platform/resolver/__tests__/html-to-text.test.ts
    src/platform/resolver/__tests__/url-policy.test.ts
    src/platform/resolver/html-to-text.ts
    src/platform/resolver/url-policy.ts
    src/services/__tests__/urlServices.test.ts
    src/services/webScraper.ts
    test/worker/resolver.integration.test.ts

`task-08.txt`:

    .env.example
    README.md
    e2e/c1-a-runtime-admission.spec.ts
    e2e/community-limit.spec.ts
    e2e/helpers.ts
    e2e/pattern-unlock.spec.ts
    e2e/prod.spec.ts
    playwright.config.ts
    scripts/assert-c1-a-e2e-inventory.ts
    scripts/assert-c1-a-e2e-inventory.test.ts
    scripts/run-e1-focused.test.ts
    scripts/run-e1-focused.ts
    src/app/api/auth/check/route.ts
    src/app/api/auth/logout/route.ts
    src/app/api/auth/shared.ts
    src/app/api/auth/verify/route.ts
    src/app/api/__tests__/limit-gating.test.ts
    src/app/layout.tsx
    src/app/page.tsx
    src/app/spent/page.tsx
    src/components/AuthWrapper.tsx
    src/components/CommunityLimitScreen.tsx
    src/components/PatternLock.tsx
    src/components/SideDrawerLockButton.tsx
    src/hooks/useAuth.ts
    src/lib/__tests__/limits.test.ts
    src/lib/__tests__/llm.test.ts
    src/lib/limits.ts
    src/lib/llm.ts

`task-09.txt`:

    cloudflare/legacy-keepalive-configuration.d.ts
    cloudflare/legacy-keepalive-worker.ts
    cloudflare/legacy-keepalive-wrangler.jsonc
    scripts/assert-c1-a-config.test.ts
    scripts/assert-c1-a-config.ts
    src/app/api/keep-alive/route.ts
    src/app/api/keep-alive/__tests__/route.test.ts
    src/platform/__tests__/runtime.test.ts
    test/worker/legacy-keepalive.integration.test.ts
    vitest.config.keepalive-workers.ts

`task-10.txt`:

    e2e/c1-a-runtime-admission.spec.ts
    e2e/scanner-product-loop.spec.ts
    src/app/page.tsx
    src/services/__tests__/reviewStorage.test.ts
    src/services/reviewStorage.ts

`task-11.txt`:

    docs/testing/c1-a-mutation-ledger.md
    docs/testing/c1-a-terminal-evidence.json
    docs/testing/c1-a-terminal-evidence.schema.json
    docs/testing/e1-mutation-ledger.md
    e2e/c1-a-runtime-admission.spec.ts
    e2e/url-scrape.spec.ts
    scripts/run-c1-a-mutations.ts
    scripts/run-c1-a-mutations.test.ts
    scripts/run-c1-a-offline.ts
    scripts/run-c1-a-offline.test.ts
    scripts/validate-c1-a-evidence.test.ts
    scripts/validate-c1-a-evidence.ts
    scripts/run-e1-focused.test.ts
    scripts/run-e1-focused.ts

Task 11 creates `docs/testing/c1-a-terminal-evidence.schema.json` with this literal content and validates `docs/testing/c1-a-terminal-evidence.json` against it:

    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "additionalProperties": false,
      "required": ["schema", "baselineCommit", "implementationCommit", "unit", "worker", "browser", "mutations", "digests", "protected", "offline"],
      "properties": {
        "schema": { "const": 1 },
        "baselineCommit": { "const": "c04e6f28c29d6d50bf714b7a3e453d645c6635e1" },
        "implementationCommit": { "type": "string", "pattern": "^[a-f0-9]{40}$" },
        "unit": {
          "type": "object",
          "additionalProperties": false,
          "required": ["files", "tests", "expectations"],
          "properties": {
            "files": { "type": "integer", "minimum": 1 },
            "tests": { "type": "integer", "minimum": 1 },
            "expectations": { "type": "integer", "minimum": 1 }
          }
        },
        "worker": {
          "type": "object",
          "additionalProperties": false,
          "required": ["files", "tests"],
          "properties": {
            "files": { "const": 5 },
            "tests": { "type": "integer", "minimum": 1 }
          }
        },
        "browser": {
          "type": "object",
          "additionalProperties": false,
          "required": ["ordinaryPerProject", "c1aPerProject", "totalPerProject", "total"],
          "properties": {
            "ordinaryPerProject": { "const": 56 },
            "c1aPerProject": { "const": 3 },
            "totalPerProject": { "const": 59 },
            "total": { "const": 118 }
          }
        },
        "mutations": {
          "type": "array",
          "minItems": 45,
          "maxItems": 45,
          "uniqueItems": true,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["id", "redExit", "greenExit"],
            "properties": {
              "id": {
                "enum": ["C1A-M01", "C1A-M02", "C1A-M03", "C1A-M04", "C1A-M05", "C1A-M06", "C1A-M07", "C1A-M08", "C1A-M09", "C1A-M10", "C1A-M11", "C1A-M12A", "C1A-M12B", "C1A-M12C", "C1A-M13", "C1A-M14", "C1A-M15", "C1A-M16", "C1A-M17", "C1A-M18", "C1A-M19", "C1A-M20", "C1A-M21", "C1A-M22", "C1A-M23", "C1A-M24", "C1A-M25", "C1A-M26", "C1A-M27", "C1A-M28", "C1A-M29", "C1A-M30", "C1A-M31", "C1A-M32", "C1A-M33", "C1A-M34", "C1A-M35", "C1A-M36", "C1A-M37", "C1A-M38", "C1A-M39", "C1A-M40", "C1A-M41", "C1A-M42", "C1A-M43"]
              },
              "redExit": { "type": "integer", "minimum": 1 },
              "greenExit": { "const": 0 }
            }
          }
        },
        "digests": {
          "type": "object",
          "additionalProperties": false,
          "required": ["openNextBundle", "workerTypes", "appConfig", "keepaliveConfig"],
          "properties": {
            "openNextBundle": { "$ref": "#/$defs/sha256" },
            "workerTypes": { "$ref": "#/$defs/sha256" },
            "appConfig": { "$ref": "#/$defs/sha256" },
            "keepaliveConfig": { "$ref": "#/$defs/sha256" }
          }
        },
        "protected": {
          "type": "object",
          "additionalProperties": false,
          "required": ["records", "digest"],
          "properties": {
            "records": { "const": 53300 },
            "digest": { "const": "b942bbc69387c45f23708c70c4aa96c99e6a91666fee4a089e318412f7c6e2d5" }
          }
        },
        "offline": {
          "type": "object",
          "additionalProperties": false,
          "required": ["egressBlocked", "credentialValuesEmpty"],
          "properties": {
            "egressBlocked": { "const": true },
            "credentialValuesEmpty": { "const": true }
          }
        }
      },
      "$defs": {
        "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
      }
    }

The evidence writer additionally compares sorted IDs to the literal 45-ID list, enforcing every ID exactly once even if two otherwise different objects repeat an ID; JSON Schema alone does not claim that cross-item property constraint. It forbids evidence-commit SHA, reviewer path/verdict, timestamps, usernames, absolute paths, secrets, raw fixtures, and provider bodies. `implementationCommit` is the Task 10 commit, so Task 11 can write and commit stable evidence without circular self-reference. After Task 11 is committed and all committed-head commands pass, an independent reviewer examines that commit; only the Calendar trackers record the terminal implementation report and verdict.

There are exactly two distinct Calendar checkpoint commits in C1-A. The first is the pre-Task-1 accepted-plan digest checkpoint below; it does not mark implementation proven. The second is terminal implementation acceptance after Task 11. Event Every commits implementation/evidence before that second checkpoint. Only after committed-head rerun and terminal independent acceptance may the terminal edit begin. Before editing, run from Calendar and require both commands exit zero:

    test -z "$(git diff --cached --name-only)"
    git diff --quiet -- docs/superpowers/orchestration/2026-07-23-event-scanner-event-every-cloudflare/work-plan.md task-26.md

The first rejects any pre-staged path; the second rejects pre-existing unstaged changes in either target tracker while permitting unrelated unstaged user paths. The orchestrator then makes the terminal edit to both Calendar files in one working-tree operation:

- /Users/manblack/Documents/calendar/docs/superpowers/orchestration/2026-07-23-event-scanner-event-every-cloudflare/work-plan.md
- /Users/manblack/Documents/calendar/task-26.md

The terminal work-plan edit increments its revision, records C1-A `PROVEN`, the Event Every implementation/evidence commits, actual test/mutation/browser/digest evidence and independent report, and selects `C1-B-IMPLEMENTATION-PLAN`. `task-26.md` appends the same terminal checkpoint without changing RPKG's proven state. Then run:

    /usr/bin/env PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/bun run verify
    test -z "$(git diff --cached --name-only)"
    git add docs/superpowers/orchestration/2026-07-23-event-scanner-event-every-cloudflare/work-plan.md task-26.md
    c1a_calendar_expected=$(printf '%s\n' docs/superpowers/orchestration/2026-07-23-event-scanner-event-every-cloudflare/work-plan.md task-26.md)
    test "$(git diff --cached --name-only)" = "$c1a_calendar_expected"
    git diff --cached --check
    git commit -m "docs(program): accept event every c1-a"
    test -z "$(git diff --cached --name-only)"
    git status --short

The current Calendar baseline expectation is 307/307 tests, zero lint errors, and 41 existing warnings; if live counts differ, reconcile and record actual output before commit. That terminal step is two repository commits with synchronized evidence, not an atomic cross-repository transaction.

### Pre-Task-1 accepted-plan digest checkpoint

The final plan reviewer computes `shasum -a 256 docs/superpowers/plans/2026-08-02-event-every-cloudflare-c1-a-runtime-admission.md` from the reviewed working tree and ends its accepted response with exactly two machine-readable lines: `VERIFIED:true` and `PLAN_SHA256:<64 lowercase hex>`. The monitored report JSON is the authoritative digest source. After the report returns, the orchestrator assigns `c1a_review_report` to the literal absolute `report.json` path printed by routed execution and runs from Event Every:

    c1a_plan_path=docs/superpowers/plans/2026-08-02-event-every-cloudflare-c1-a-runtime-admission.md
    test -f "$c1a_review_report"
    c1a_review_sha=$(jq -er 'def trim_trailing_blanks: if length > 0 and (.[-1] | test("^[ \t]*$")) then .[0:-1] | trim_trailing_blanks else . end; . as $report | ($report.final_message | gsub("\r\n?"; "\n") | split("\n") | trim_trailing_blanks) as $lines | ([$lines[] | select(startswith("VERIFIED:") or startswith("PLAN_SHA256:"))]) as $markers | if $report.verified == true and ($markers | length) == 2 and $markers[0] == "VERIFIED:true" and ($markers[1] | test("^PLAN_SHA256:[a-f0-9]{64}$")) and ($lines | length) >= 2 and $lines[-2] == "VERIFIED:true" and ($lines[-1] | test("^PLAN_SHA256:[a-f0-9]{64}$")) then ($lines[-1] | capture("^PLAN_SHA256:(?<sha>[a-f0-9]{64})$").sha) else error("c1-a plan report invalid") end' "$c1a_review_report")
    c1a_live_sha=$(shasum -a 256 "$c1a_plan_path" | awk '{print $1}')
    test "$c1a_live_sha" = "$c1a_review_sha"
    git diff --check
    bun run assert:e1-protected
    git status --short

Status must contain only the protected paths plus this untracked plan. Before the preliminary Calendar edit, run from Calendar:

    test -z "$(git diff --cached --name-only)"
    git diff --quiet -- docs/superpowers/orchestration/2026-07-23-event-scanner-event-every-cloudflare/work-plan.md task-26.md

Only then does the orchestrator edit the two absolute Calendar tracker paths in one working-tree operation. The work plan increments its revision, records `C1-A-IMPLEMENTATION-PLAN` `PROVEN`, the literal report path, `c1a_review_sha`, and exact next gate `C1-A-TASK-1`; task-26 appends the same pre-Task-1 checkpoint without changing RPKG/E1. From Calendar run:

    /usr/bin/env PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/bun run verify
    test -z "$(git diff --cached --name-only)"
    git add docs/superpowers/orchestration/2026-07-23-event-scanner-event-every-cloudflare/work-plan.md task-26.md
    c1a_calendar_expected=$(printf '%s\n' docs/superpowers/orchestration/2026-07-23-event-scanner-event-every-cloudflare/work-plan.md task-26.md)
    test "$(git diff --cached --name-only)" = "$c1a_calendar_expected"
    git diff --cached --check
    git commit -m "docs(program): accept c1-a implementation plan"
    test -z "$(git diff --cached --name-only)"
    git status --short

Immediately before Task-1 staging, reassign `c1a_review_report` to that same literal report path and repeat the four report/digest commands above through `test "$c1a_live_sha" = "$c1a_review_sha"`. Then run the literal Task-1 `git add --pathspec-from-file`, path guard, protected guard, and cached diff check. The single `jq -er` read requires Boolean `.verified`, uses actual jq `"\r"`/`"\n"` strings to normalize CRLF and ordinary LF, splits once, recursively removes only trailing blank/whitespace-only array entries, collects every complete line beginning `VERIFIED:` or `PLAN_SHA256:`, requires one valid verdict followed by one valid digest, compares `$lines[-2]`/`$lines[-1]` exactly, and only then returns the digest captured from `$lines[-1]`. Any validation failure raises the fixed jq error and leaves the shell assignment nonzero. Any prefixed/suffixed penultimate text, extra, missing, duplicate, or malformed marker-prefixed line, digest mismatch, plan byte edit, separate Event Every plan commit, or status outside protected paths plus Task-1 ownership fails closed and returns to plan review. Each Calendar sequence requires an empty initial index, both target trackers unchanged before edit, exact two-path staged set, and empty post-commit index; unrelated pre-staged or target-path worktree changes hard-stop without modification, while unrelated unstaged user paths remain untouched. This preliminary Calendar commit is the sole authorized exception to the terminal-only Calendar update rule; it records plan acceptance only, not implementation acceptance.


## Task 1: Lock the path, dependency, and offline boundary

**Files:** commit this already-authored independently accepted plan without changing its reviewed bytes; create the C1-A guard/runner scripts, Cloudflare local-variable boundary, dependency installer, and config test; modify package.json, bun.lock, .gitignore, eslint.config.mjs, E1 guards.

- [ ] Write `scripts/assert-c1-a-config.test.ts` first. Task 1 RED reports missing package scripts/dependencies/offline guards. Task 1 GREEN asserts exact dependency versions, required scripts, generated ignores, no deploy-capable script, no registry auth config, and no credential-shaped evidence; it does not pretend the Task 2/9 configs exist yet. Task 2 extends the same guard/test with the app config literals, and Task 9 extends it with the private Worker literals, each through its own manifest.
- [ ] Complete and commit the exact pre-Task-1 Calendar digest checkpoint above before any Task 1 edit. Immediately before Task 1 staging, repeat its report/digest comparison and require identical bytes; stage the plan through `task-01.txt` with the implementation files. The path-guard test proves an untracked reviewed plan is authorized only as exact Task-1 staged ownership, then becomes valid prior-manifest ownership for Tasks 2-11 and terminal mode. A separately precommitted, modified, missing, or extra plan path fails.
- [ ] Extend the E1 guard only with accepted C1 plan/spec and C1-A paths. Preserve its parser-removal, one /api/scan call-site, browser OpenRouter, protected staging, and Scanner provenance assertions.
- [ ] Implement assert-c1-a-paths.ts as a closed union of committed, unstaged, staged, and untracked task paths. Reject protected paths first; reject `.env`, every `.env.*`, every `.dev.vars*`, generated output, reports, and credential-shaped filenames, with the sole exact Task-8-manifest ownership exception for `.env.example`.
- [ ] Copy the proven E1 preload mechanics to c1-a-offline-preload.cjs, additionally blocking Cloudflare, npm, OpenRouter, Resend, Upstash, and all non-loopback sockets. Empty every env name matching OPENROUTER, ANTHROPIC, API_KEY, TOKEN, SECRET, CLOUDFLARE, RESEND, KV_REST, D1, or R2 without printing values.
- [ ] Implement the closed `run-c1-a-cloudflare.ts` modes and root-only `.dev.vars*` absence guard before any dependency action. Add `.dev.vars` and `.dev.vars.*` to `.gitignore`; the guard still rejects either ignored entry without reading it. Fix the two Wrangler loading controls false in all Cloudflare child/current processes and prove synthetic `.env*`/process canaries are not loaded.
- [ ] Add exact scripts build:cloudflare, cf:types, test:workers, assert:c1:a-config, assert:c1:a-paths, test:c1:a-mutations, and verify:c1:a while preserving existing scripts.
- [ ] `install-c1-a-dependencies.ts` accepts exactly `add` or `frozen` and builds a registry-only child environment without the offline preload. It copies ordinary process variables but empties every current or `.env.local` name matching the credential expression, sets `BUN_CONFIG_NO_LOAD_DOTENV=1`, replaces inherited `XDG_CONFIG_HOME` with the invocation-owned 0700 directory containing an authenticated 0600 `.bunfig.toml`, clears npm registry/auth overrides, pins `https://registry.npmjs.org`, and asserts every credential-shaped child value is empty. It spawns without a shell, records package names/versions and exit code only, rejects lifecycle-script output, and never prints environment values.
- [ ] After plan acceptance, first run the scrubbed frozen wrapper against the intentionally stale
  pre-Task-1 lock:

    bun scripts/install-c1-a-dependencies.ts frozen

  This first frozen command is a required negative discriminator, not an acceptance command: it
  must exit nonzero because the five exact package entries are absent, leave `package.json` and
  `bun.lock` byte-identical, clean its owned directory, and include the fixed structural-validation
  failure for a missing pinned direct package plus the bounded child category `lock-state`. Any success, mutation, raw child output, unrelated
  failure category, or cleanup failure returns to installer repair. Then install exactly through
  that same scrubbed wrapper:

    bun scripts/install-c1-a-dependencies.ts add

  After add passes structural validation, rerun `bun scripts/install-c1-a-dependencies.ts frozen`;
  this second frozen command must exit zero and leave `package.json` and `bun.lock` byte-identical.

  `add` child argv is exactly `bun --no-env-file add --registry https://registry.npmjs.org --ignore-scripts --dev --exact @opennextjs/cloudflare@1.20.2 wrangler@4.118.0 vitest@4.1.10 @cloudflare/vitest-pool-workers@0.20.1 msw@2.15.0`. `frozen` child argv is exactly `bun --no-env-file install --registry https://registry.npmjs.org --frozen-lockfile --ignore-scripts`. The absolute invocation-owned directory is asserted before spawn, supplied as `XDG_CONFIG_HOME`, and contains the only global `.bunfig.toml` plus the empty npm user config; both files are inode/type/mode/size authenticated before cleanup. Bun's package-manager documentation makes `--config` a subcommand option and makes `--registry` override `.npmrc`, bunfig, and registry environment values. Live Bun 1.3.13 proof showed that the documented subcommand form fails loading this invocation-owned file, while placing the same flag before the subcommand exits zero without performing the requested install. The owned XDG configuration boundary therefore isolates the global bunfig without the defective CLI locator, while the literal `--registry` remains authoritative and the repository bunfig is separately rejected if it contains auth or registry configuration. After either mode the wrapper rejects any `trustedDependencies` byte change, validates every non-vendored `bun.lock` package as an exact npm-name/SemVer resolution with empty source field and valid SHA-512 integrity, permits only the exact committed vendored Scanner file entry, and validates the five exact direct versions. There is intentionally no offline preload during the registry install; every subsequent proof command is strict-offline.

- [ ] RED/GREEN:

    bun test scripts/assert-c1-a-config.test.ts scripts/assert-c1-a-paths.test.ts scripts/install-c1-a-dependencies.test.ts scripts/c1-a-offline-preload.test.ts scripts/run-c1-a-offline.test.ts scripts/run-c1-a-cloudflare.test.ts scripts/run-with-open-next.test.ts --isolate
    bun scripts/install-c1-a-dependencies.ts frozen
    bun scripts/install-c1-a-dependencies.ts add
    bun scripts/install-c1-a-dependencies.ts frozen
    bun test scripts/assert-c1-a-config.test.ts scripts/assert-c1-a-paths.test.ts scripts/install-c1-a-dependencies.test.ts scripts/c1-a-offline-preload.test.ts scripts/run-c1-a-offline.test.ts scripts/run-c1-a-cloudflare.test.ts scripts/run-with-open-next.test.ts --isolate
    bun run assert:e1-protected
    git diff --check

- [ ] Commit exact Task 1 paths: build(event-every): lock c1-a offline boundary.

## Task 2: Add exact OpenNext and workerd scaffold

**Files:** create OpenNext/app Worker/Wrangler/generated types, app Worker Vitest config/test, C1-A Playwright config, and Worker E2E runner; modify ignores, TypeScript, Next/ordinary Playwright config, and extend the config guard/test with exact app literals.

- [ ] Write app-worker and static config RED first: missing OpenNext config, buildable direct OpenNext scaffold, generated env types, flags, local D1 sentinel, self-reference, and disabled public endpoints. DO bindings/exports are intentionally absent until Task 6.
- [ ] open-next.config.ts imports defineCloudflareConfig from @opennextjs/cloudflare and exports defineCloudflareConfig() with no cache override.
- [ ] next.config.js invokes `import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());`, matching the installed OpenNext migration contract, while preserving the existing exported Next config.
- [ ] `cloudflare/app-worker.ts` imports handler from `../.open-next/worker.js` and exposes one explicit fetch that delegates to `handler.fetch(request, env, ctx)`; deployment remains impossible. Task 4 replaces this line with admission, and Task 6 adds DO exports.
- [ ] `wrangler.jsonc` pins main/name/date/flags/assets/self-reference, disables public endpoints, uses the local D1 sentinel, empty generated-type bindings, `C1_DEPLOYMENT_DISABLED=1`, and `STATE_AUTHORITY_MODE=legacy`; it omits DO bindings/migrations until Task 6. Config proof rejects deployment while sentinel/disable remains.
- [ ] vitest.config.workers.ts dynamically imports the installed ESM-only Vitest 4 `cloudflareTest` plugin from the CommonJS package's `.ts` config and uses local bindings only. No remote:true.
- [ ] Generate the app type surface and require byte-identical repeat output. The fixed temporary path must be absent first and is removed in `finally`:

    bun run cf:types
    cp worker-configuration.d.ts /private/tmp/event-every-c1-a-worker-types.first
    bun run cf:types
    cmp worker-configuration.d.ts /private/tmp/event-every-c1-a-worker-types.first
    rm /private/tmp/event-every-c1-a-worker-types.first

- [ ] Add .open-next/, .wrangler/, dist-c1-a-*, test-results-c1-a-*, and playwright-report-c1-a-* to ignores without ignoring authored Worker/platform tests.
- [ ] GREEN commands:

    bun run assert:c1:a-config
    bun test scripts/run-c1-a-worker-e2e.test.ts --isolate
    bun scripts/run-with-open-next.ts -- node node_modules/typescript/bin/tsc --noEmit
    bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/deny-egress.integration.test.ts

  Inspect generated bundle for no /api/parse; clean only invocation-owned outputs.
- [ ] Commit: build(event-every): add open-next worker scaffold.

## Task 3: Define platform contracts, runtime, logger, and route manifest

**Files:** create contracts/runtime/context/logger/manifest, legacy provider/usage/waitlist/index ports, `src/services/requestId.ts`, and focused tests; modify scan, resolve-timezone, summarize, usage, and waitlist routes and `src/services/scanClient.ts`/test; modify `src/services/summarizer.ts` and create its test.

- [ ] RED enumerates every src/app/api/**/route.ts and requires one exact manifest method. A new/unclassified route fails.
- [ ] Use discriminated AdmissionResult success/request/identity vs failure/response and StateAuthorityMode legacy/shadow/cloudflare. No boolean flag bags.
- [ ] Manifest exact ceilings: scan 12 MiB; detect 128 KiB; resolver 4 KiB request and 512 KiB upstream; timezone/summary 16 KiB; waitlist 4 KiB; auth challenge/redeem 2 KiB; check/logout/usage zero-body; pattern verify and public keep-alive fixed 410; wrong method fixed 405 and closed Allow.
- [ ] runtime.ts selects injected/legacy/shadow/cloudflare once and rejects unknown configuration. Provider, usage, and waitlist work only in legacy; both shadow and cloudflare return fixed 503 c1_state_not_ready before legacy state, key, provider, D1 proxy, Upstash, or mail. Routes never read bindings directly.
- [ ] Move current provider composition behind LegacyProviderPort, usage behind LegacyUsagePort, and all waitlist Upstash/D1/Resend behavior behind LegacyWaitlistPort. Non-success mail is status-only and cancels its body unread. Add X-Event-Every-Request-Id validation/forwarding for scan, timezone, and summary and use createProviderRequestId in scanClient/summarizer.
- [ ] logger.ts accepts only closed event code, opaque ID, route, phase, status class, retryable, duration bucket, and outcome. Type/API tests reject arbitrary strings, headers, bodies, Error, and objects.
- [ ] RED then GREEN command:

    bun test src/platform/__tests__/route-manifest.test.ts src/platform/__tests__/runtime.test.ts src/app/api/__tests__/limit-gating.test.ts src/app/api/scan/__tests__/route.test.ts src/app/api/resolve-timezone/__tests__/route.test.ts src/app/api/summarize/__tests__/route.test.ts src/app/api/usage/__tests__/route.test.ts src/app/api/waitlist/__tests__/route.test.ts --isolate
    bun scripts/run-with-open-next.ts -- node node_modules/typescript/bin/tsc --noEmit
    bun run lint
- [ ] Run causal mutations C1A-M27, M28, M30, M38, and M39 for provider UUID forwarding, fail-closed runtime modes, and exhaustive route inventory.
- [ ] Commit: feat(event-every): define cloudflare platform contracts.

## Task 4: Trusted identity and streaming admission (BE-03, BE-04, CF-01)

**Files:** create identity/admission tests and workerd integration; modify Worker, client IP, scan tests.

- [ ] RED covers forged x-forwarded-for, x-real-ip, and internal headers; valid/missing/malformed/conflicting CF-Connecting-IP; same/wrong/no Origin; resolver no-Origin; JSON media; content encoding; chunked bodies; false Content-Length; exact byte ceilings; one-byte overflow; abort during stream.
- [ ] Parse one canonical IPv4/IPv6 and derive only a versioned domain-separated Web Crypto HMAC reference. Missing/malformed production identity maps to one stable unknown shard and never a forwarding fallback.
- [ ] admitEdgeRequest validates method/origin/media/encoding before read, counts real stream chunks, cancels on overflow/abort, and constructs one replacement Request. Fixed JSON errors contain no submitted value.
- [ ] clientIp.ts consumes only the server-injected identity. Forged forwarding headers cannot select a limiter shard.
- [ ] Workerd uses custom streams for misleading lengths, gzip rejection, and exact/over 12 MiB.
- [ ] Replace Task 2's direct delegation with the exact admission wrapper shown above, without adding DO exports before Task 6.
- [ ] RED is the same exact command before implementation and must fail named assertions forged forwarding header is ignored, cross-site text is rejected before route, and chunked overflow cancels the stream. GREEN:

    bun test src/platform/__tests__/identity.test.ts src/platform/__tests__/admission.test.ts src/app/api/scan/__tests__/route.test.ts --isolate
    bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/admission.integration.test.ts test/worker/deny-egress.integration.test.ts
    bun scripts/run-with-open-next.ts -- node node_modules/typescript/bin/tsc --noEmit
- [ ] Run causal mutations C1A-M01–M05 and M24 for trusted identity, origin, streamed bytes, exact ceiling, cancel, and rebuilt Worker request.
- [ ] Commit: feat(event-every): enforce edge admission.

## Task 5: Exact Scanner structure and abort transport (BE-07, BE-08)

**Files:** create dispatch implementation/test; modify the legacy provider adapter, image/job/transport/LLM/scan route and tests.

- [ ] RED: 100,000 vs 100,001 UTF-8 text bytes; structurally valid synthetic PNG/JPEG/WebP at 8 MiB vs 8 MiB+1; header-only/truncated formats; abort before dispatch; exact signal reaches fetch; abort after dispatch cancels and never retries.
- [ ] Replace magic-byte admission with bounded PNG IHDR/IEND walk, JPEG SOI/marker/EOI walk, and WebP RIFF plus VP8/VP8L/VP8X bounds. Reject trailing/short structure without pixel decode.
- [ ] Thread request.signal through route, createScanJob, scanner transport, and openRouterChat. Use startLegacyDispatch exactly as specified above: before its synchronous transition, abort means zero charge/transport and fixed HTTP 408; after it starts, charge/provider each start once, later abort cancels fetch, returns fixed unknown outcome, and never retries. Explicitly retain BE-01 as deferred.
- [ ] Make provider errors status-only. Cancel bodies unread; map 402/408/429/5xx to fixed codes; forbid upstream text in exceptions/logs. Do not claim BE-09 accounting.
- [ ] Focused command:

    bun test src/platform/legacy/__tests__/dispatch.test.ts src/server/scanner/__tests__/image.test.ts src/server/scanner/__tests__/transport.test.ts src/server/scanner/__tests__/scan.test.ts src/app/api/scan/__tests__/route.test.ts src/lib/__tests__/llm.test.ts --isolate
    bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/deny-egress.integration.test.ts

- [ ] Run causal mutations C1A-M06–M09, M25, and M26 for image structure/decoded length, exact signal, unread error body, dispatch ordering, and post-start abort outcome.
- [ ] Commit: fix(event-every): bound scanner input and abort transport.

## Task 6: Deterministic URL detection and day-safe resolver state

**Files:** create capability and three DO modules/tests; modify detect route, browser URL services, Worker exports/types.

- [ ] RED locks source order, punctuation, canonicalization, maximum ten, 128 KiB, blackout 409, expiry min(now+120 seconds, blackout start), HMAC binding, changed identity/list rejection, and old-capability/fresh-UUID post-midnight zero effects.
- [ ] Delete every OpenRouter dependency/model/prompt from detect route. Return urls, remainingText, hasUrls, resolverCapability from the single deterministic tokenizer.
- [ ] Implement proposedIdentityVersion plus the exact IdentityDayPolicy, ResolverRequestAuthority, and DailyCounter RPC signatures/state ordering above. Test first-deployment no-next, staged current/next before/after activation, conflicting schedule, missing returned key, every day mismatch, failed-admission completion, lost permit, abort phases, timeout alarm, and retry.
- [ ] Add the three Worker DO exports, exact Wrangler DO bindings/migration, and final config-guard fixtures; regenerate `worker-configuration.d.ts` twice with the idempotence sequence.
- [ ] webScraper uses a two-worker queue, stable UUID per URL attempt, and capability+UUID.
- [ ] RED uses the following command and must fail named assertions deterministic detector performs no provider call, identity schedule freezes once, old capability after midnight has zero effects, and busy admission does not increment. Run the same command GREEN:

    bun test src/platform/__tests__/identity.test.ts src/platform/resolver/__tests__/capability.test.ts src/services/__tests__/urlServices.test.ts --isolate
    bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/resolver.integration.test.ts test/worker/deny-egress.integration.test.ts
    bun run cf:types
- [ ] Run causal mutations C1A-M10–M15, M29, M36, M42, and M43 for deterministic detection, issuance/claim deadline, every day guard including stored day, concurrency accounting, nonce isolation, bounded queue, activation boundary, and durable expired-lease reconciliation.
- [ ] Commit: feat(event-every): add deterministic bounded resolver state.

## Task 7: Replace arbitrary URL fetch with bounded resolution

**Files:** create URL policy/sanitizer/route tests; modify scrape route/services/workerd integration.

- [ ] RED covers credentials, fragments, localhost/single-label, private/reserved literal IP, non-default ports, public HTTP/HTTPS, relative redirects, every-hop predicate, loop/missing Location/fourth redirect, five-second deadline, caller abort, content type, decoded 512 KiB boundary, chunk overflow, malformed HTML, 100,000-byte text, 512-byte title, and upstream error canaries.
- [ ] Require canonical Origin, identity, UUID, and capability membership before state. Fetch redirect:manual with shared timeout/incoming signal, fixed user agent, and no cookie/auth/referrer/client headers. Reapply full URL predicate each hop under global_fetch_strictly_public.
- [ ] Accept only HTML/plain streams; cancel over 512 KiB; deterministic sanitizer; final canonical URL plus bounded title/text; cancel non-success body unread.
- [ ] `truncateUtf8(value, maxBytes)` uses `TextEncoder`, returns unchanged when within limit, otherwise binary-searches `Array.from(value)` code-point prefixes until encoded bytes fit. Apply it independently at 100,000 text bytes and 512 title bytes; tests include ASCII boundary, two-/three-/four-byte code points, combining marks, and no split surrogate.
- [ ] Workerd mock emulates DNS rebinding/private rejection. No production test uses internet.
- [ ] RED uses the following command and must fail named assertions private redirect is rejected, 512 KiB+1 cancels, error-body canary is unread, and abort reaches fetch. Run it GREEN after implementation:

    bun test src/platform/resolver/__tests__/url-policy.test.ts src/platform/resolver/__tests__/html-to-text.test.ts src/app/api/scrape-url/__tests__/route.test.ts src/services/__tests__/urlServices.test.ts --isolate
    bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/resolver.integration.test.ts test/worker/deny-egress.integration.test.ts
- [ ] Run causal mutations C1A-M16–M18, M33–M35, M37, and M41 for redirects, every-hop/private-address validation, capped streaming, and URL/text/title UTF-8 byte ceilings.
- [ ] Commit: feat(event-every): bound url resolution.

## Task 8: Retire pattern auth and all admin bypass

**Files:** create the closed browser-inventory guard/test; delete the five application pattern files plus obsolete `e2e/prod.spec.ts`; modify layout/auth/UI/LLM/limits/tests, `/spent`, ordinary Playwright config, E1 focused runner/tests, README, `.env.example`, and E2E discovery.

- [ ] RED source guard rejects VALID_L_PATTERNS, AUTH_COOKIE_NAME, AUTH_SECRET, generateAuthToken, verifyAuthToken, PatternLock, ?unlock, NEXT_PUBLIC_DISABLE_AUTH, and pattern mocks outside historical docs. Inventory the four retiring definitions by exact title before deletion.
- [ ] Remove pattern UI/hook/shared secret and layout wrapper. Keep community-limit screen without “Enter pattern.” All LLM modes are community until C1-C; isAdmin is false.
- [ ] `getLlmKey('community')` reads only `OPENROUTER_COMMUNITY_KEY`; absence returns fixed `community_key_unavailable` before transport. It never reads or falls back to `OPENROUTER_API_KEY`. Source/test guards reject the admin key identifier inside the community branch, and `.env.example` documents the fail-closed separation.
- [ ] /api/auth/verify returns fixed 410 unread; /check returns authenticated:false; /logout fixed 200 without cookie. Reserved challenge/redeem paths return fixed 404 auth_not_available at the edge until C1-C creates and reclassifies them.
- [ ] Retire exactly the four titles listed in “Truthful E1 browser accounting” with no mutation credit. Delete the obsolete credential-dependent `e2e/prod.spec.ts` outside E1 accounting, remove `/spent` unlock navigation, remove Playwright dotenv pattern setup, and remove pattern variables/copy from README and `.env.example`. Preserve exactly 56 unaffected E1 definitions/browser. Add only C1A-E2E-01 in this task; Tasks 10 and 11 add C1A-E2E-02/03, producing 59/browser and 118 total.
- [ ] RED source scan and GREEN regression commands:

    bun test src/lib/__tests__/llm.test.ts src/lib/__tests__/limits.test.ts src/app/api/__tests__/limit-gating.test.ts scripts/run-e1-focused.test.ts --isolate
    bun scripts/assert-c1-a-e2e-inventory.ts 57
    bun scripts/run-with-open-next.ts -- node node_modules/typescript/bin/tsc --noEmit
    bun run lint
    bun run verify:e1:offline
- [ ] Run causal mutations C1A-M19 and M40; the source guard separately injects each forbidden pattern token into an allowed Task 8 fixture and must RED without changing production.
- [ ] Commit: refactor(event-every): retire pattern admin bypass.

## Task 9: Privatize legacy keep-alive

**Files:** create the private keep-alive Worker, Wrangler config, generated environment type, dedicated Vitest config, and integration test; modify public keep-alive route and extend the existing config guard/test with the private literals.

- [ ] RED: public GET returns fixed 410 and zero state calls; scheduled compatibility runs only legacy/shadow, never cloudflare; failure is status-only and cannot affect app response.
- [ ] The separate private compatibility Worker, never the app Worker, exports scheduled() and owns the only Upstash bindings. It has no fetch export, routes, workers.dev URL, preview URL, or app service binding. Local fake records one bounded set; native errors become fixed status-only evidence.
- [ ] Its separate Wrangler config records schedule as a disabled P1 comment. App config contains no Upstash binding or scheduled handler. Config proof rejects an active trigger while deployment disabled.
- [ ] Generate the private type surface twice. First require `/private/tmp/event-every-c1-a-keepalive-types.first` absent; run `bun run cf:types:keepalive`, copy the generated file to that path, rerun, `cmp` the generated file, and remove the temporary file in `finally`.
- [ ] RED uses the command below and must fail named assertions app has no Upstash/scheduled capability, private module has no fetch, and native failure is status-only. Run GREEN after implementation:

    bun test src/platform/__tests__/runtime.test.ts src/app/api/keep-alive/__tests__/route.test.ts --isolate
    bun scripts/run-c1-a-cloudflare.ts keepalive-tests
    bun run assert:c1:a-config
- [ ] Run causal mutations C1A-M20, M31, and M32 for status-only scheduled failure, public-route isolation, and Cloudflare-mode isolation.
- [ ] Commit: refactor(event-every): privatize legacy keep-alive.

## Task 10: Recover corrupt review hydration (BE-02)

**Files:** modify review storage/tests, page, scanner E2E and C1-A E2E.

- [ ] RED seeds malformed JSON, wrong schema, and corrupt DTO. Require removal/quarantine of only event-every:review-drafts:v1, hydration completion, no partial drafts, and untouched Recent-input keys.
- [ ] Replace load flags with discriminated loaded, empty, recovered-corrupt, unavailable. recovered-corrupt completes hydration and shows one safe notice; unavailable does not claim durability.
- [ ] Browser: corrupt Scanner key, reload/no partial; synthetic intercepted scan; persist; reload/exact draft/readiness; legacy key unchanged.
- [ ] RED unit command must fail recovered-corrupt hydration completion and exact-key cleanup. GREEN unit/browser/inventory commands:

    bun test src/services/__tests__/reviewStorage.test.ts --isolate
    bun scripts/run-c1-a-worker-e2e.ts --project=chromium --grep "corrupt Scanner review storage recovers and persists the next scan"
    bun scripts/assert-c1-a-e2e-inventory.ts 58
- [ ] Run causal mutations C1A-M21–M23 for hydration completion, exact-key removal, and unrelated-storage preservation.
- [ ] Commit: fix(event-every): recover corrupt scanner review storage.

## Task 11: Causal mutation and terminal C1-A proof

**Files:** create mutation runner/ledger/E2E; modify Playwright/offline runners and E1 ledger/docs; reuse the Task 8-owned browser-inventory guard/test without restaging them.

- [ ] Ledger row per new unit/workerd/E2E: stable ID, owner task, production file, exact replacement/mutator, focused command, observed red assertion, inverse, restored SHA-256, restored green. No inferred coverage credit.
- [ ] RED then GREEN the owned gates with `bun test scripts/run-c1-a-mutations.test.ts scripts/run-c1-a-offline.test.ts scripts/assert-c1-a-e2e-inventory.test.ts scripts/validate-c1-a-evidence.test.ts --isolate`.
- [ ] Runner accepts only ledger IDs, refuses dirty target/concurrent edits, owns temp/output paths, scrubs credentials, blocks egress, records no fixture raw value, and restores in finally.
- [ ] Browser file contains exactly C1A-E2E-01/02/03 from the accounting section. Existing preserved URL/abort E1 definitions are strengthened in place and not counted again. Header/byte/private-network cases stay in workerd.
- [ ] Before the full gate, bun scripts/assert-c1-a-e2e-inventory.ts 59 must report exactly 59 Chromium and 59 WebKit definitions, the exact four retired titles absent, all 56 preserved titles present, and C1A-E2E-01/02/03 present once each.
- [ ] verify:c1:a stops on first failure and runs:

    bun --preload=/Users/manblack/Documents/event-every/scripts/c1-a-offline-preload.cjs test src scripts --isolate
    bun scripts/run-with-open-next.ts -- node node_modules/typescript/bin/tsc --noEmit
    node --require=/Users/manblack/Documents/event-every/scripts/c1-a-offline-preload.cjs node_modules/eslint/bin/eslint.js . --ignore-pattern .claude/**
    bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts test/worker/app-worker.test.ts test/worker/admission.integration.test.ts test/worker/resolver.integration.test.ts test/worker/deny-egress.integration.test.ts
    bun scripts/run-c1-a-cloudflare.ts keepalive-tests
    bun scripts/run-c1-a-worker-e2e.ts
    bun scripts/run-c1-a-mutations.ts --verify-ledger --all
    bun scripts/assert-e1-protected.ts
    bun scripts/assert-c1-a-config.ts
    bun scripts/validate-c1-a-evidence.ts docs/testing/c1-a-terminal-evidence.json

  The checked-in runner derives the same absolute preload path from import.meta.dir and asserts it equals the repository-local path before spawning children.

- [ ] After initial unit/workerd/E2E GREEN, run `bun scripts/run-c1-a-mutations.ts --write-ledger --all` exactly once, then `bun scripts/run-c1-a-offline.ts --write-evidence` exactly once. Confirm evidence names Task 10 HEAD, stage exact Task 11 paths, validate, and commit `test(event-every): prove c1-a runtime admission`.
- [ ] Fresh proof immediately before that commit with staged evidence:

    bun scripts/install-c1-a-dependencies.ts frozen
    bun run verify:c1:a
    bun run verify:e1:offline
    bun run assert:c1:a-paths c04e6f28c29d6d50bf714b7a3e453d645c6635e1 HEAD --task=11
    bun run assert:e1-protected
    git diff --check
    git status --short

- [ ] After committing Task 11, repeat the first three commands, then run:

    bun run assert:c1:a-paths c04e6f28c29d6d50bf714b7a3e453d645c6635e1 HEAD --terminal
    bun run assert:e1-protected
    git diff --check
    git status --short

- [ ] Inspect production bundle: flags present; /api/parse, pattern constants, raw fixtures, credential values, and arbitrary provider-error strings absent; route inventory exact.
- [ ] Obtain independent Sol/high architecture/security review of the committed Task 11 head, complete diff, evidence, and mutations. Critical/Important returns to owner task. After acceptance, update the two absolute Calendar tracker paths and make the separate Calendar commit described above. Advance only to `C1-B-IMPLEMENTATION-PLAN`.

## Non-goals and hard stops

- Do not add provider RequestAuthority, ScanBudgetAuthority, provider quota admission, lossless cost settlement, D1 catalog, verified-email sessions, capture R2, cutover, deployment, or rollback.
- Do not make cloudflare provider mode usable through Redis, D1 REST, or in-memory fallback. Fixed fail-closed until C1-B.
- Do not weaken E1 tests. Retired pattern/public keep-alive/LLM detection behavior must be removed from discovery arithmetic and ledger credit explicitly.
- If installed package APIs differ from pinned commands, stop implementation, repair this plan, and independently rereview it.
- Cloudflare/npm login, remote IDs beyond local sentinel, credentials/private data, paid provider, remote binding, deployment, DNS/billing, or external communication is a hard stop.

## Plan acceptance gate

Accept only when this plan is the sole non-protected Event Every change; protected and diff checks pass; no unresolved instruction token remains; every C1-A design obligation and BE/CF owner maps to an exact task/command/mutation; C1-B+ is deferred; and independent Sol/high returns the exact accepted two-line verdict/digest with no Critical or Important. Complete the pre-Task-1 Calendar digest checkpoint and commit before dependency installation; that checkpoint advances only to `C1-A-TASK-1`, while C1 remains active. Acceptance authorizes the listed local dependency installation and proof-sized C1-A implementation only. It does not authorize credentials, private data, external providers, remote bindings, deployment, or production mutation.
