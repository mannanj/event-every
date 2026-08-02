# Event Every Cloudflare Migration Design

Status: proposed under Autonomous Stewardship; independent architecture/security review required

Date: 2026-08-02

Target repository: `/Users/manblack/Documents/event-every`

## Goal

Produce a Cloudflare release candidate for the proven Event Every Scanner loop without weakening
its offline, privacy, accounting, identity, or reusable-package boundaries. C1 ends only after the
OpenNext Worker, exact state authorities, direct D1 access, private R2 capabilities, admin/capture
trust adapters, and local workerd/browser proof pass with mutation evidence. Deployment, DNS,
production data, credentials, and paid calls remain later gates.

## Reconciled baseline

- Event Every E1 is proven through Task 9 implementation `195e9b4`, Scanner-pin correction
  `cdae13d`, and terminal evidence `ae0e44c`.
- The app is Next.js 15.5.9 App Router on Bun with no OpenNext/Wrangler configuration.
- `@upstash/redis` currently owns daily IP counts and community spend. The read-then-charge scan
  path can admit a losing request, missing provider cost records zero, and failures fail open.
- Waitlist writes use a D1 REST/proxy helper with an Upstash fallback; the keep-alive route exists
  only for that legacy service.
- Pattern authentication uses a signed cookie but an isolate-local lockout map. It proves an admin
  role, not a verified email identity.
- `getClientIP()` trusts caller-controlled forwarding headers. Cloudflare must become the trust
  boundary before those values can affect state.
- The accepted Scanner capture policy requires an authoritative verified-email claim, D1 lifecycle
  CAS, application-encrypted private R2 objects, separated storage capabilities, and exact
  `test@mannan.is` eligibility. Event Every has not implemented those host responsibilities.
- The recorded topology is binding: OpenNext Workers rather than Pages; SQLite Durable Objects for
  exact coordination; direct D1 for relational records; private R2 for content artifacts; no KV
  correctness authority; Upstash remains sole authority during shadow and Cloudflare becomes sole
  authority only at one declared UTC-day cutover.

## Sources of current platform truth

Implementation must recheck these primary sources before selecting dependency versions or config
fields:

- Cloudflare Next.js/OpenNext guide:
  `https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/`
- OpenNext Cloudflare bindings and custom Worker guidance:
  `https://opennext.js.org/cloudflare/bindings` and
  `https://opennext.js.org/cloudflare/howtos/custom-worker`
- Wrangler configuration and generated binding types:
  `https://developers.cloudflare.com/workers/wrangler/configuration/`
- SQLite Durable Object rules and storage:
  `https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/`
- D1 Worker bindings and local migrations:
  `https://developers.cloudflare.com/d1/worker-api/` and
  `https://developers.cloudflare.com/d1/best-practices/local-development/`
- Workers Vitest and integration testing:
  `https://developers.cloudflare.com/workers/testing/`
- Cloudflare visitor-IP headers:
  `https://developers.cloudflare.com/fundamentals/reference/http-headers/`
- R2 Worker API and security:
  `https://developers.cloudflare.com/r2/api/workers/workers-api-reference/` and
  `https://developers.cloudflare.com/r2/reference/data-security/`

The current documentation supports latest-minor Next.js 15, requires `nodejs_compat`, recommends
SQLite for new Durable Objects, provides local D1/R2/DO simulation, and recommends Workers Vitest
plus the multi-Worker integration harness. Local tests must not set any binding to `remote: true`.

## Approaches considered

### 1. Selected: port-first OpenNext app Worker plus private capability Workers

Create a custom OpenNext entrypoint that reuses the generated fetch handler, performs the narrow
edge admission checks, and exports the app's SQLite Durable Object classes. Route code resolves
typed platform ports rather than importing Upstash or Cloudflare SDKs directly. D1 is bound
directly to the app Worker. Private R2 operations are exposed by separate non-public service
Workers whose bindings and RPC surfaces match the accepted Packet 4 least-privilege capabilities.

This preserves one application artifact and avoids a public state API while retaining actual
capability separation for raw objects and keys.

### 2. Rejected: one all-powerful OpenNext Worker

Putting every D1, R2, encryption, review, deletion, and promotion capability in the app Worker
reduces configuration, but any route compromise gains every private-object operation and every
key. Function boundaries inside one module are not platform capabilities. This contradicts the
accepted Packet 4 design.

### 3. Rejected: D1-only coordination or a full state microservice rewrite

D1-only counters serialize unrelated identities or reintroduce read/write races and do not match
the recorded sharded authority decision. Moving all state into a separate public or service Worker
adds an unnecessary second application protocol and deployment unit. Durable Objects are used only
for the exact atoms they own; D1 remains the relational catalog.

## Runtime topology

```text
browser
  -> eventevery.com OpenNext app Worker
       -> edge admission: route/media/origin/wire-byte policy
       -> Next route handlers and Scanner host boundary
       -> RequestAuthority DO (one stable SHA-256 name per request ID; 48-hour result authority)
       -> ResolverRequestAuthority DO (one stable SHA-256 name per resolver request ID)
       -> IdentityDayPolicy DO (one name per UTC day; sole identity-key-version authority)
       -> ScanBudgetAuthority DO (one name per UTC day; reservation/settlement only)
       -> DailyCounter DO namespaces (HMAC identity/day shards)
       -> AuthLockout DO (HMAC identity shard)
       -> direct EVENT_EVERY_DB D1 binding
       -> private service bindings only
            -> capture orchestration -> crypto + ciphertext-only gateways
            -> capture-reader Worker -> capture read gateway + crypto service
            -> promotion Worker -> D1 + capture read + crypto + golden write gateway
            -> artifact-deleter Worker -> ciphertext delete gateways
            -> key-rotation Worker -> read/crypto/write/delete gateways
            -> report orchestration -> crypto + report write gateway
            -> crypto Worker -> versioned encryption/MAC secrets, no D1/R2
```

None of the private service Workers has a route, workers.dev endpoint, or preview URL. The app
Worker and plaintext orchestrators have no R2 binding or application-encryption key. Crypto has no
storage binding. Ciphertext gateways have no crypto secret. Writer RPCs offer create-if-absent and
metadata verification only; readers cannot mutate; deleters cannot decrypt. Production
configuration uses separate capture, golden, and report buckets. Local tests use separate
simulated bindings with synthetic bytes.

The app does not use ISR or on-demand revalidation today, so C1 does not add OpenNext R2 cache,
tag-cache, or cache-queue infrastructure. Static assets use the generated `ASSETS` binding. This
keeps private R2 buckets unrelated to framework caching.

## Code boundaries

Create `src/platform/` as the host-owned boundary:

- `contracts.ts`: closed application types for identity/day-key policy, atomic admission, budget reservation,
  waitlist persistence, auth lockout, D1 catalog, capture capabilities, clock, and logger.
- `runtime.ts`: selects injected test ports, legacy ports, shadow ports, or Cloudflare bindings.
- `cloudflare-context.ts`: the only Next-side `getCloudflareContext()` adapter and generated-env
  type seam.
- `identity.ts`: validates the edge-derived address and produces domain-separated HMAC references;
  no raw address is used as a DO name or durable field.
- `admission.ts`: content type, origin, request ID, abort, and scan wire-body policy.
- `legacy/`: existing Upstash and D1 REST/proxy behavior during shadow only.
- `cloudflare/`: DO/D1/service-binding adapters; no React or Scanner policy.
- `shadow/`: calls the legacy authority for the decision, records Cloudflare comparison evidence,
  and never lets shadow state affect the response.

Next route handlers call one `admitProviderRequest()` transaction facade and one matching
`settleProviderRequest()` method. They do not compose a read gate and a later increment. Provider
transport accepts the request abort signal and the admission receipt. Browser components do not
import platform code.

## Edge admission and trusted identity

The custom Worker intercepts only methods/routes requiring strict admission. It deletes any
caller-supplied internal identity header and never trusts `x-forwarded-for` or `x-real-ip`.
Production identity comes from Cloudflare's inbound `CF-Connecting-IP`/request context, is parsed as
one canonical IP address, and is converted immediately to a versioned HMAC reference using a
secret binding. Missing, malformed, conflicting, or non-Cloudflare test context maps to one stable
`unknown` shard rather than a caller-selected value. Unit tests inject an explicit trusted-edge
port; production code has no header fallback.

Identity HMAC rotation is a day-bound protocol, not an arbitrary secret change.
`IdentityDayPolicy` is one SQLite Durable Object named from the literal UTC date and is the sole
authority for that day's identity-key version across quota, waitlist, lockout, challenge, session,
and role paths. Its `freeze(scheduleDigest, proposedVersion)` RPC transactionally inserts once and
thereafter returns the stored version; a conflicting digest/version fails closed. Every identity-
derived operation reads this object before deriving a state identifier. `ScanBudgetAuthority`
does not own or infer this choice.

First deployment has exactly one declared current version, no previous version, and no activation
timestamp. Rotation uses deployment A at least 24 hours before a recorded future UTC boundary:
all artifacts receive current+next bindings and the identical activation timestamp/schedule
digest, and an offline inventory proves every artifact has both. Every deployment-A artifact uses
the same pure selector—before activation propose current; at or after activation propose next—so
the boundary requires no rolling deployment and all callers present the same proposal to the day
object. Deployment B is cleanup only, after every prior-version window/role inventory below passes;
it relabels next as current and removes the retired binding/schedule. Scheduling or staging another
rotation while any older previous version, live window, or unmigrated role remains is forbidden.
A rolling artifact missing the returned key or carrying a different schedule refuses the request before state or transport.
A new version activates only at that boundary, never mid-day. IP quota/lockout admission derives
both current and previous references: it checks live windows under both, uses the frozen day
version for a new counter, and treats either live lockout as authoritative. The previous key
remains until every counter, challenge, lockout, and session window it can address has expired.

Email challenge/role lookup also derives current and previous references. Successful redemption
transactionally rewrites a matching previous-version role/challenge/session subject to current,
preserving role and audit identity; conflicts fail closed. Active sessions carry the key version
and remain verifiable through their 30-minute lifetime. Previous email keys cannot be removed
until a D1 inventory shows zero previous-version challenges/sessions and every durable role has
been reverified/migrated or explicitly revoked. Rotation tests cross midnight during scan quota,
waitlist quota, resolver quota/lease, lockout, challenge, session, and role windows; mutations that switch mid-day, skip
the day-policy RPC, omit a binding during rolling deployment, skip previous lookup, or reset a
shard must fail.

For `/api/scan`, `/api/detect-urls`, `/api/scrape-url`, `/api/resolve-timezone`, `/api/summarize`,
auth verification, and waitlist submission:

- require the documented method and `application/json` media type before reading the body;
- allow the canonical same origin and, except for `/api/scrape-url`, the explicit no-`Origin`
  server/test case; the resolver requires canonical Origin in every environment. Reject every
  other origin before state or provider access;
- reject non-identity `Content-Encoding` and never trust `Content-Length`;
- count bytes from the actual request stream, cancel once the route-specific wire ceiling is
  exceeded, and rebuild a single-use request for OpenNext;
- retain exact inner schema/decoded-byte limits, including 100,000/100,001 text and 8 MiB/8 MiB+1
  image boundaries and structurally decodable PNG/JPEG/WebP;
- return fixed `400`, `403`, `413`, or `415` bodies containing no submitted value; and
- prove chunked, misleading-length, compressed, abort, and exact-boundary cases in workerd.

The browser generates a strict UUID request ID for each intentional provider operation and keeps it
stable across transport retries. A changed body under the same ID is an idempotency conflict.

## Exact scan quota, budget, idempotency, and transport permit

`RequestAuthority` is one SQLite Durable Object named from the domain-separated SHA-256 digest of
the browser's random UUID request ID. A request UUID is an opaque 122-bit-random protocol nonce,
not identity or user data, so this stable name needs no rotating secret; IP/email identifiers keep
their separate rotating HMAC domains. On first use it freezes the UTC authority day, policy version, route, identity, request-shape
binding, random execution ID, and 48-hour result-retention expiry. Every retry, including one
crossing midnight, resolves the same object and original day. Its state and optional completed
response are raw-free. After 48 hours the result is erased but a minimal `(request digest,
execution ID, expired)` tombstone is retained indefinitely; an expired ID is always rejected and
can never become a new operation.
The digest algorithm/domain is a versioned protocol constant that cannot change while any request
ID may be retried; changing it requires an explicit all-request tombstone migration and an
independent at-most-once proof. Tests cross deployments and key rotations elsewhere in the system
and prove one UUID always resolves to the same authority.

`ScanBudgetAuthority` is one SQLite Durable Object per frozen UTC day. It owns community budget
reservation/settlement only; it never independently authorizes eligible-capture transport. Its
rows contain request ID, execution ID, HMAC identity, route kind, reserved/settled integer cost,
timestamps, expiry, and status. Neither DO contains source, image, URL, prompt, provider body, key,
native error, or stack.

The request sequence is fixed:

1. validate admission, derive trusted identity, and `begin` the per-request authority;
2. reserve the route's frozen maximum community cost; admin reservations are zero;
3. idempotently admit `(request ID, execution ID)` in the identity/day `DailyCounter` shard;
4. if the counter rejects, cancel the budget reservation; a failed cancel remains a conservative
   lease until reconciliation and never admits transport;
5. for an ineligible ordinary request, the winning live `RequestAuthority.claimDirect()` response
   is the sole transport permit; for an eligible capture, the Packet 4 D1
   `prepared -> provider_inflight` CAS is the sole transport permit and RequestAuthority records
   the returned capture ID/execution ID without issuing a second claim;
6. call the provider at most once, only in the request that received that permit, with the abort
   signal and the same execution ID;
7. store the validated raw-free result and settle actual finite non-negative cost;
8. if cost is absent/invalid or the post-dispatch outcome is unknowable, consume the full
   reservation; never coerce it to zero;
9. a same-ID completed retry returns the stored raw-free result; an inflight, unknown, lost-claim,
   or expired-permit retry never calls the provider and returns the fixed pending/unknown contract.

The winning request receives an unguessable permit nonce that is never returned by status reads.
A lost claim response therefore cannot be converted into transport by a retry. Before permit,
crash/abort cancels reservation; after permit, crash/abort/timeout becomes outcome-unknown and
consumes the full reservation. For eligible capture, D1 reconciliation owns capture state while the
budget DO mirrors only the bound accounting outcome; neither side retries transport. A failed
counter compensation leaves one conservative daily slot consumed. Alarms reconcile leases but
never issue transport. Availability may be reduced, but duplicate provider access is impossible.

The execution ID created by RequestAuthority is copied byte-for-byte into reservation, counter,
capture intent/claim, transport context, capture outcome, settlement, and completion rows. Recovery
is closed by phase:

| Last durable phase | Direct request recovery | Eligible-capture recovery |
| --- | --- | --- |
| request begun, no reservation | alarm expires request; retry may continue before expiry | same |
| reservation, no counter | release on abort/alarm; retry may continue with the same execution | same |
| counter admitted, no capture/permit | reservation releases; daily slot remains conservatively consumed | capture prepare may continue only in the winning request; otherwise expire without transport |
| capture prepared, no permit | not applicable | same request may claim; lost/expired request reconciles capture without transport |
| permit RPC response lost | status exposes inflight without nonce; no retry transport | D1 read exposes inflight without permit nonce; no retry transport |
| permit returned, before/during transport | lease becomes outcome-unknown; full reservation consumed | D1 becomes `scan_outcome_unknown`; full reservation consumed |
| validated provider result, before durable outcome | outcome remains unknown; no reconstructed success and no retry | captured raw snapshot remains; D1 becomes outcome-unknown and no result is invented |
| capture outcome stored, before budget settlement | budget alarm consumes full reservation unless exact signed settlement already exists | same; capture remains reviewable |
| settlement stored, before request completion | retry returns fixed outcome-unknown, never calls provider | D1 outcome remains reviewable; client result is not invented |
| raw-free completion stored | exact stored response replay | exact stored response replay and matching capture outcome |

Reconciliation may release, settle conservatively, attach an already durable known outcome, or
tombstone; it can never create a permit, invoke transport, or reconstruct a missing provider result.

`DailyCounter` backs separate closed policies: at most `1_000` provider operations per trusted
HMAC identity per frozen UTC day for both community and admin sessions, and at most `5` waitlist
submissions per trusted HMAC identity per UTC day. Its separate resolver namespace admits at most
`50` link-resolution operations per trusted HMAC identity per frozen UTC day and at most `2`
simultaneous live ten-second resolver leases.

`ResolverRequestAuthority` is a distinct SQLite DO named from the same domain-separated stable
SHA-256 UUID rule as provider requests. Its first `begin` freezes the capability issuance UTC day,
identity/key version, domain-separated canonical-URL HMAC, flow-capability digest, random execution ID, and a
48-hour raw-free tombstone. Changed inputs conflict. It is the sole issuer of one unguessable
resolver transport permit; replay, lost permit, inflight, unknown outcome, completion, or retry
across midnight never fetches again. Raw URL/text is never stored in the authority.

After `begin`, the identity/day resolver `DailyCounter` performs one SQLite transaction: reject
concurrency first without incrementing the daily count; otherwise create the ten-second lease and
increment the daily count together. Daily exhaustion is fixed `429 resolver_daily_limit` with the
frozen next-midnight reset; concurrency exhaustion is fixed `429 resolver_busy` with integer
`Retry-After` capped at ten seconds and no daily charge. The final fifteen seconds of every UTC day
are a fixed `409 resolver_day_rollover` admission blackout. Because leases last at most ten seconds,
the old identity/day object has no live lease when the next day opens; alarms release expired leases
but never issue transport. A pre-blackout request that has not received its permit by blackout is
tombstoned without fetch. `ResolverRequestAuthority.begin`, its permit claim, and the resolver
`DailyCounter` transaction each compare the frozen authority day with the trusted current UTC day
and reject a mismatch before counter, lease, permit, or fetch. Thus old/new day and old/new
identity-key concurrency cannot overlap.

An abort before the first outbound byte releases the lease but conservatively keeps the daily slot,
while any later abort/timeout/unknown outcome consumes the slot. Lease expiry releases concurrency
only and never permits transport. The browser queue resolves at most two URLs concurrently. Admin
sessions do not bypass resolver limits. Admin sessions bypass only the community USD
budget: they do not bypass request idempotency, the daily scan count, admission, audit, or provider
permit rules. Duplicate waitlist email submissions are idempotent but still consume the IP/day
attempt admitted for that request. `AuthLockout` owns attempt windows and lockouts. SQLite transactions and RPC
methods are tested under concurrency barriers, object eviction, replay, UTC boundaries, and
injected failures.

## Authority modes and cutover

One checked `STATE_AUTHORITY_MODE` value selects exactly one mode for the Upstash/D1-proxy axes
(provider request accounting, rate limits, and waitlist). C1 authentication has no safe legacy
authority: every C1 artifact uses verified-email sessions, and the old pattern is rejected.

- `legacy`: Upstash is authoritative; Cloudflare state is untouched.
- `shadow`: Upstash is authoritative; after each decision, a content-free comparison event is
  written to Cloudflare state. Any mismatch is observable but cannot change the response.
- `cloudflare`: Durable Objects/D1 are authoritative. Upstash is read-only comparison evidence and
  receives no counter, budget, lockout, waitlist, or fallback write.

Unknown or contradictory mode configuration refuses startup. Shadow evidence contains UTC day,
route, HMAC identity, legacy decision, Cloudflare hypothetical decision, bounded numeric totals,
and a closed mismatch code—never raw IP, email, source, prompt, or credential.

P1 may change `shadow` to `cloudflare` only at a recorded future UTC-day boundary after a clean
shadow window. After that epoch Cloudflare's zone keeps `/api/*` and private admin action routes on
the Cloudflare app Worker even during rollback; the retained Vercel artifact is a stateless UI/SSR
origin for all other paths and contains no provider/state implementation. Browser API requests
remain same-origin and reach Cloudflare directly, so Vercel cannot regain or split authority. P2
proves this exact route-level rollback and a UTC rollover. Upstash, keep-alive, proxy, and obsolete
secrets are removed only after P2 and the retirement observation gate.

## D1 relational state

The direct `EVENT_EVERY_DB` binding replaces REST/proxy calls in Cloudflare mode. Ordered SQL
migrations create or reconcile:

- waitlist rows with unique normalized email and explicit confirmation status;
- hashed one-time verified-email challenges and revocable sessions;
- capture/golden catalogs, leases, generations, state versions, and idempotency bindings;
- append-only content-free audit events;
- report/catalog metadata and shadow comparison records; and
- cutover epochs and migration/reconciliation checkpoints.

All queries use prepared bindings. Each state CAS uses one D1 batch containing: the conditional
update; an insert into a `cas_assertions` table whose `CHECK(ok = 1)` consumes the immediately prior
`changes()` value and deliberately aborts the batch unless exactly one row changed; the unique
content-free audit insert; and assertion-row deletion. D1 rolls the entire batch back on the guard
constraint or unique-idempotency failure. The loser then reads and validates the winner's stored
result; it never repeats an effect. Read and denied audit inserts complete before plaintext or
denial returns. Local real-D1 tests mutation-prove zero-row, two-row, duplicate-operation, audit-
failure, and crash/replay behavior. D1 never stores raw scan content,
plaintext digest, raw IP, verified email beyond the minimum waitlist/auth record, provider body,
prompt, key, or stack. R2 listing never creates catalog authority.

Waitlist confirmation uses an injected mail port. Local tests use a fake. Production Resend calls
remain P1 credential/network evidence. There is no Redis fallback in Cloudflare-authoritative
mode; a D1 failure returns a sanitized retryable failure rather than creating split authority.

## Verified-email capture and admin authorization

The source-visible pattern credential, route, and pattern UI are retired in C1. Admin authority and
capture-tester identity both require the verified-email flow below, but roles are independent D1
records. A verified capture-tester session grants capture eligibility only. It grants admin actions
only when the same subject also has a separate active `admin_roles` row. There is no source-known
admin secret or production fallback identity.

To satisfy Scanner Packet 4, C1 adds a narrow verified-email challenge flow:

1. issuance always returns the same fixed `202` body; capture-tester mail is sent only for the
   literal target address, and admin mail only for an active server-side admin-role record;
2. HMAC-IP and HMAC-email counters allow one issuance per ten minutes and five per UTC day; one
   outstanding challenge per purpose invalidates the previous one;
3. it creates a random 32-byte one-time token, stores only its keyed hash with issuer/audience,
   purpose, ten-minute expiry, and session nonce in D1, and sends a link whose token is in the URL
   fragment; browser startup removes the fragment with `history.replaceState` and POSTs the token,
   so invocation URLs and referrers never contain it;
4. redemption is atomic/single-use and issues a 30-minute HttpOnly, Secure, SameSite=Strict signed
   session containing the authoritative subject/session references and exact verified email;
5. every scan revalidates signature, issuer, audience, expiry, revocation, subject, and session;
6. request body/query/header email claims are discarded before constructing Scanner's
   `CaptureEligibilityInput`; and
7. near-miss, expired, replayed, revoked, request-supplied, and unsigned identities
   never call capture storage.

The first admin is provisioned only by a recorded two-phase P1 ceremony after explicit
deployment/credential/private-data authority. A checked-in local control-plane command generates a
32-byte random bootstrap capability, stores only its SHA-256 digest plus a 30-minute expiry and
random operation ID in D1, and displays the capability only on the controlling TTY. A 256-bit
random value needs no runtime MAC secret for preimage resistance.

The exact initializer is `scripts/cloudflare/bootstrap-admin.ts`, run only at P1. It reads a
Cloudflare API token from a non-echoing TTY prompt, requires that token's independently checked
provenance to be the named P1 operator with account-scoped D1 Edit permission, and sends one
authenticated `POST /accounts/{account}/d1/database/{database}/query` JSON body capped at 4 KiB.
The parameterized D1 batch conditionally inserts `(operation_id, capability_sha256, expires_at)`,
asserts `bootstrap_open = 1` and zero active admins through `cas_assertions`, and appends
`bootstrap_capability_created`; all statements commit or roll back together. Account/database
identifiers come from the reviewed non-secret manifest, and the command refuses any database ID
other than the pinned `EVENT_EVERY_DB` ID. Cloudflare does not provide database-specific API-token
resource scope, so the ceremony explicitly records the token's account-wide D1 blast radius. P1
creates a ceremony-specific short-lived token, verifies the account audit-log operator/event, then
revokes the token immediately after the content-free committed/not-committed status is reconciled
and verifies a subsequent authenticated probe is denied. Any unrelated D1 mutation in that audit
window rejects the ceremony and triggers incident handling. Token and capability never enter source,
argv, environment, shell history, logs, or evidence. A repeated operation ID returns the stored
content-free status and never creates a second capability. On an ambiguous HTTP result the command
queries by operation ID before retrying; if committed it reuses the still-local capability, and if
not committed it retries the same batch. Losing the displayed capability requires an explicitly
audited `--replace-operation` transaction that revokes the old digest before inserting a new one,
still only while bootstrap is open and admin count is zero. Local tests use a fake D1 control API;
no real initializer runs in C1.

The operator presents the capability in a URL fragment to the
bootstrap UI, which strips the fragment before submitting the capability and the intended email in
a canonical same-origin POST. The trusted Worker—not the command—normalizes the email as Unicode
NFKC, ASCII-lowercases the domain, rejects non-ASCII domain output and control/space characters,
enforces the existing 254-byte UTF-8 ceiling, and derives the versioned subject HMAC with its bound
secret. While `bootstrap_open = 1` and active-admin count is zero, a valid capability may replace
the one pending normalized-email/HMAC record and send the ordinary ten-minute verified-email
challenge; it creates no role and does not close bootstrap.

Only redemption of that challenge by the exact pending normalized email can run the guarded D1
batch that inserts the first `admin_roles` row, appends `admin_bootstrapped`, consumes the bootstrap
capability/pending record, and permanently flips `bootstrap_open` to zero. Wrong secret version,
normalization mismatch, typo, expired link, partial batch, zero-row update, replay, or second-admin
attempt cannot activate or close bootstrap; before capability expiry, its holder may correct a typo
by replacing the still-pending email and challenge. Later role changes require an existing recently
reauthenticated admin and the ordinary audited admin capability. Local C1 proof uses synthetic
values, a fake mail port, and a fake control-plane adapter; the real ceremony is prepared but not
run.

Local tests never send email. P1 requires explicit authority and credentials for bootstrap and the
one real challenge. Any authenticated admin may review/promote through centralized action capabilities;
capture-tester identity alone grants no admin access.

All redemption and privileged routes require canonical `Origin`; privileged mutations additionally
require a session-bound double-submit `X-CSRF-Token`, constant-time validation, and admin
reauthentication within ten minutes. Denied attempts are audited before response. Tokens never
enter a request URL, route parameter, query, redirect location, or referrer; invocation logs may
therefore contain only the fixed route path. Every native error is caught and mapped before it can
become an uncaught Worker exception. The allowlisted structured logger records no URL query or
fragment, body, token, email, cookie, header, or arbitrary exception.

## Private capture, R2, and reports

The host imports policy only from `@event-every/scanner/capture` and implements the already accepted
frozen-snapshot, HMAC binding, prepare-before-provider, D1 lease/CAS, application AES-256-GCM,
random key, immutable object, read-back verification, outcome, reconciliation, retention,
deletion, re-encryption, manual promotion, and golden-retirement contracts without alteration.

Private service bindings enforce the Packet 4 action split. All content-bearing objects are
encrypted before R2. R2 platform encryption is defense in depth. Metadata is closed to random IDs,
object class, schema/key version, ciphertext length, and ciphertext digest. Raw values, plaintext
digests, snapshot bindings, identity, URL, prompt, provider body, and keys are forbidden.

The review inbox is server-mediated. List responses are content-free. Each decrypt/open is
authorized and audited before plaintext is returned. Promotion starts with an empty independently
authored expected observation; captured model output is never prefilled into it. Retention and
deletion follow the exact accepted Packet 4 deadlines and generation fences.

Reports, screenshots, and Markdown evidence use the separate private report capability and 90-day
retention. Ordinary automated C1 proof writes only synthetic artifacts to isolated local bindings.

## Frozen accounting policy

All money is unsigned integer USD nanodollars (`1 USD = 1_000_000_000`). Provider success bodies
are read through one bounded lossless JSON-token parser, not `Response.json()`: the complete body
is capped at 2 MiB, `usage.cost` retains its original JSON numeric lexeme, and all other validated
fields are decoded normally. The only accepted cost grammar is
`(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,18})?` USD—no sign, exponent, leading zero, whitespace, NaN, or
Infinity. Conversion uses decimal digit/BigInt arithmetic: take nine fractional digits padded with
zeros and add one nanodollar when any remaining fractional digit is nonzero. It never passes
through binary floating-point. Missing, duplicate, out-of-range, or nonconforming cost is
accounting-unknown and consumes the full reservation; an otherwise valid converted value above the
reservation records the full value and triggers the policy-breach freeze below. Mutations replace
the parser with `Response.json()`, truncate the tenth fractional digit, accept an exponent, and
round down; every mutation must make the cost tests fail. The daily community limit is
`5_000_000_000` nanodollars. The first request of each UTC day freezes this policy row in the day's
budget DO; a different policy version cannot join that day.

Provider non-success responses are status-only. The transport maps the allowlisted `402`, `408`,
`429`, and `5xx` status classes to fixed internal codes, immediately cancels/discards the response
stream without calling `json()`, `text()`, or copying an upstream header, and maps every other
non-success to one fixed upstream-failure code. Provider error text can never enter an exception,
response, log, trace, retry decision, or evidence artifact. Oversized/chunked 402, 429, and 503
canary bodies are mutation-proven unread; replacing cancellation with body materialization fails.

| Route | Fixed model | Maximum admitted input/output | Reservation |
| --- | --- | --- | ---: |
| Scanner text/link | `deepseek/deepseek-v4-flash` | 100,000 UTF-8 source bytes; 8,192 completion tokens | 20,000,000 |
| Scanner image | `mistralai/mistral-small-2603` | 8 MiB decoded image within the model's 262,144-token context; 8,192 completion tokens | 50,000,000 |
| Timezone resolution | `deepseek/deepseek-v4-flash` | 16 KiB wire body, 4,096 input-token ceiling, 128 completion tokens | 1,000,000 |
| Summary label | `deepseek/deepseek-v4-flash` | 16 KiB wire body, 1,024 input-token ceiling, 16 completion tokens | 500,000 |
| URL detection | no provider; deterministic existing URL parser | 128 KiB wire/text ceiling | 0 |

The day policy also freezes prompt/completion price ceilings of 90/180 nanodollars per token for
DeepSeek and 150/600 for Mistral, matching the public model catalog checked on 2026-08-02. C1 tests
prove each reservation is greater than the worst-case price calculation. P1 refuses community
mode before transport if the configured price-policy digest no longer matches the separately
reviewed deployment policy; changing prices creates a new policy version no earlier than the next
UTC day. Provider aliases, arbitrary environment-selected models, web search, and fallback models
are forbidden.

Reservation lease is two minutes before permit. Direct/capture provider permit lease is fifteen
minutes. Same-request authority and raw-free completed response persist for 48 hours, so every
midnight retry maps to its original day. Budget/counter rows persist 72 hours; content-free audit
and cutover records follow their longer recorded retention. An actual cost above reservation is an
`accounting_policy_breach`: record the full actual value, freeze all further community admission
for that UTC day, retain evidence, and never hide or clamp the overrun. Missing/invalid cost or an
unknown post-permit outcome consumes the full reservation. Admin calls reserve zero but retain
idempotency and daily counter behavior.

## Authority and resource matrix

| Operation | `legacy` authority | `shadow` authoritative decision | Isolated shadow target | `cloudflare` authority | Post-cutover legacy behavior |
| --- | --- | --- | --- | --- | --- |
| provider request/idempotency | current route + Upstash | current route + Upstash | `REQUEST_SHADOW`, `BUDGET_SHADOW`, `QUOTA_SHADOW` DO namespaces | request/budget/quota DOs | no call |
| auth challenge/lockout/session | not present in a C1 legacy artifact; old pattern is rejected | verified-email D1 + `AUTH_LOCKOUT` DO remains sole auth authority | `shadow_auth_metrics` contains content-free comparison telemetry only | verified-email D1 + `AUTH_LOCKOUT` DO | no call |
| waitlist limit/write | Upstash + current D1 proxy path | legacy result | `WAITLIST_SHADOW` DO + `shadow_waitlist` table | waitlist DO + direct D1 | read-only comparison disabled from response path |
| capture/golden/report catalog | absent | capture disabled; synthetic shadow records only | `shadow_capture_*` tables and local private buckets | direct D1 + private services | no call |
| cutover/audit/comparison | orchestration record | direct D1 content-free evidence | dedicated `shadow_comparisons` | direct D1 | read-only evidence only |

Shadow namespaces and tables are physically distinct and are never renamed, copied, or promoted
into authoritative resources. A shadow timeout/failure records a bounded missing-comparison code
asynchronously and cannot change authoritative latency, status, headers, or result. In Cloudflare
mode, any Upstash comparison runs after the response through bounded background evidence work; its
result cannot influence authority and its failure is silent to the user but visible in content-free
operations evidence.

## Private Worker capability and RPC matrix

Every RPC schema is strict, versioned, size-bounded, and returns closed codes. Private configs set
`workers_dev: false` and `preview_urls: false`. Services accept the current and immediately prior
RPC schema during an ordered deployment; producers change only after all consumers support the new
version, and old support is removed in a later release.

| Worker | Direct bindings/secrets | Accepted RPC data | Returns | Forbidden |
| --- | --- | --- | --- | --- |
| app/capture orchestrator | D1, DOs, service stubs; no R2/key | authorized raw snapshot in request lifetime; opaque IDs/bindings | sanitized scan/capture receipt | direct object/key access |
| crypto entrypoints | versioned domain-specific AES/MAC secrets only | role-specific bounded plaintext/ciphertext or identifier | ciphertext envelope, plaintext, or HMAC | D1/R2/list/network/logging input; cross-role method calls |
| capture write gateway | `CAPTURE_R2` only | ciphertext, random key, closed metadata, create precondition | ciphertext length/digest/version | plaintext, crypto, get/list/delete/overwrite |
| capture read gateway | `CAPTURE_R2` only | catalog-authorized random key/generation | ciphertext + closed metadata | plaintext, put/list/delete |
| golden write gateway | `GOLDEN_R2` only | ciphertext and immutable metadata | ciphertext verification | plaintext, read/list/delete/overwrite |
| report write gateway | `REPORT_R2` only | ciphertext and immutable metadata | ciphertext verification | plaintext, read/list/delete/overwrite |
| inventory gateway | capture/golden/report R2 list bindings; no crypto/D1/get-body | aggregate entrypoint: bucket/version/cursor; reconcile entrypoint: bucket/cursor | aggregate digest/count/cursor, or bounded server-only key/generation records | object body, decrypt, write/delete, catalog decision, client return |
| deletion gateway | capture/golden/report R2 bindings; no key | D1-claimed key/class/generation | absent/present closed result | plaintext, decrypt, list-based authority, create |
| review reader | D1 + capture read + crypto services | server-derived authorization, capture/version | audited plaintext to app action only | write/delete/promotion/key access |
| promotion orchestrator | D1 + capture read + crypto + golden write services | reviewed capture binding and independently authored expected observation | capture/golden CAS result | captured-output prefilling, direct R2/key |
| report orchestrator | D1 + report-encrypt + report-write service stubs | authorized synthetic evaluation/result metadata | immutable report/catalog CAS result | capture plaintext, direct R2/key, arbitrary logs |
| key rotation | D1 + read/rotation-crypto/write/delete/inventory service stubs | claimed catalog generation, target key version, bounded inventory pages | CAS/inventory/audit result | direct R2/key, object body listing, overwrite |
| reconciler | D1 + inventory-reconcile + deletion gateway | expired intent/lease, catalog claim, or bounded server-only inventory record | repaired/claimed/tombstoned closed result | decrypt, provider call, deleting before D1 claim |

Plaintext service boundaries exist only between the request-lifetime orchestrator/review reader and
crypto. Bucket gateways are ciphertext-only. Promotion, re-encryption, key retirement, per-class
deletion, inventory, and reconciliation each retain the exact Packet 4 state/version/generation,
audit, and retention obligations.

The crypto Worker exports five named RPC entrypoints and no default callable crypto surface:
`CaptureEncrypt`, `ReviewDecrypt`, `PromotionCrypto`, `ReportEncrypt`, and `RotationCrypto`.
Each caller receives a service binding pinned to exactly one named entrypoint; each class exposes
only its required methods and secret domain. In particular, capture and report entrypoints cannot
decrypt, review cannot encrypt or MAC promotion bindings, promotion cannot use capture/report key
domains, and rotation cannot serve request-lifetime plaintext. Contract tests enumerate every
public method and mutation-prove that adding a cross-role method fails the capability assertion.

The inventory Worker exports two named entrypoints per bucket class. The aggregate entrypoint lists
only closed metadata and returns bounded cursor pages containing counts and a canonical digest by
key/schema version; it never returns an object key or body. The private reconcile entrypoint is
bound only to the D1-owning reconciler and returns bounded server-only records containing object
key, generation, class, and metadata version—never content. Its result type is forbidden from the
app Worker and every client response. For each candidate the reconciler first proves the key/generation absent
from all live catalog/intents, then atomically inserts a unique D1 `deletion_pending` claim and
audit row. Only the deletion gateway may consume that exact claim; it deletes and verifies absence
before the reconciler tombstones it. A future writer cannot reuse a claimed key. Record replay,
catalog-race, cursor-race, and create-between-list-and-claim mutations fail before deletion.

The rotation orchestrator uses only aggregate digests joined with a separately paged D1 catalog
inventory to prove both Packet 4 populations—cataloged objects and claimed/unclaimed bucket
objects—twice at least 24 hours apart before key retirement. Aggregate listing is evidence only and
never authorizes reads, deletion, catalog creation, or promotion; reconcile records authorize only
an absence check and claim attempt, never deletion.

## Exact OpenNext and admission manifest

C1 creates these checked-in configuration sources:

- `open-next.config.ts`: `defineCloudflareConfig()` with no ISR/R2/tag/queue overrides.
- `cloudflare/app-worker.ts`: uses
  `import handler from "../.open-next/worker.js"` and exports an explicit
  `async fetch(request, env, ctx)` wrapper. The wrapper first removes every caller-supplied
  internal identity header, matches the closed route manifest below, calls
  `admitEdgeRequest(request, env, ctx)`, returns its fixed rejection when denied, or passes its
  one rebuilt single-use `Request` to `handler.fetch(admitted.request, env, ctx)`. Unmatched page
  and asset routes pass through only after header scrubbing. A test mutation replacing the wrapper
  with `fetch: handler.fetch` must fail. The module explicitly exports `RequestAuthority`,
  `ResolverRequestAuthority`, `IdentityDayPolicy`, `ScanBudgetAuthority`, `DailyCounter`, and
  `AuthLockout`.
- `wrangler.jsonc`: `main: "cloudflare/app-worker.ts"`, `name: "event-every"`,
  `compatibility_date: "2026-08-02"`, flags `nodejs_compat` and
  `global_fetch_strictly_public`, `ASSETS` at `.open-next/assets`, `WORKER_SELF_REFERENCE` bound to
  `event-every`, direct `EVENT_EVERY_DB`, distinct authoritative/shadow DO namespaces, declarative
  SQLite class exports, private service bindings, closed vars, and no remote local binding.
- `cloudflare/workers/*/wrangler.jsonc`: one config per private Worker with only the bindings in the
  capability matrix and both public endpoint switches disabled.
- `worker-configuration.d.ts`: generated and diff-checked by
  `bunx wrangler types --env-interface CloudflareEnv`; hand edits fail verification.
- `.open-next/` and `.wrangler/`: ignored generated output owned and removed only by the invoking
  local gate.

`WORKER_SELF_REFERENCE` is retained because current OpenNext setup declares it; C1 tests prove no
application route uses it as a state or provider bypass. A config assertion fails if either required
compatibility flag, any private endpoint disablement, or any binding separation disappears.

| Route and method | Wire ceiling | Identity/request ID | Admission result before application |
| --- | ---: | --- | --- |
| `POST /api/scan` | 12 MiB; inner exact source limits still apply | trusted edge HMAC + UUID required | 400/403/413/415 fixed body |
| `POST /api/detect-urls` | 128 KiB | trusted edge HMAC; returns at-most-two-minute/day-bound scan-flow capability for at most ten canonical URLs | 400/403/409/413/415 |
| `POST /api/resolve-timezone` | 16 KiB | trusted edge HMAC + UUID required | 400/403/413/415 |
| `POST /api/summarize` | 16 KiB | trusted edge HMAC + UUID required | 400/403/413/415 |
| `POST /api/waitlist` | 4 KiB | trusted edge HMAC; normalized email is D1 idempotency | 400/403/413/415 |
| `POST /api/auth/challenge`, `POST /api/auth/redeem` | 2 KiB | trusted edge HMAC; fixed issuance response | 202 issuance; fixed 400/403/413/415 redemption |
| `GET /api/auth/check` | no body | session only; no request ID | fixed authenticated boolean, no role/email |
| `POST /api/auth/logout` | zero-byte body | session + canonical Origin + CSRF after C1-C | fixed 200/403/413/415 |
| `GET /api/usage` | no body | trusted edge HMAC + optional verified session | fixed raw-free quota/budget view; 400 on malformed edge identity |
| `POST /api/scrape-url` | 4 KiB request; 512 KiB upstream | canonical Origin + trusted edge HMAC + UUID + matching scan-flow capability | 400/403/408/409/413/415/422/429 fixed body |
| `GET /api/keep-alive` | retired public route; no body | none | fixed `410`; no state call from public request |
| `POST /api/auth/verify` (pattern) | retired; body is never read | none | fixed `410`; no cookie/session issuance |
| private admin actions, exact methods in C1-C manifest | 64 KiB | verified session + request UUID + CSRF + recent reauth | fixed 401/403/409/413/415 |

P1 has one non-public control-plane operation outside the HTTP route surface:
`scripts/cloudflare/bootstrap-admin.ts` issues only the authenticated, 4 KiB-capped D1 API request
defined in the bootstrap section. A source assertion rejects any app route, Worker public fetch
handler, or service binding that exposes this initializer.

Every `/api/**/route.ts` path is enumerated by a generated route-inventory assertion; a new or
method-changed route fails verification until this table and the executable manifest agree. Wrong
methods return fixed `405` with a closed `Allow` value.

C1-A replaces the arbitrary `/api/scrape-url` fetch with the product's accepted bounded link
resolver. It accepts one canonical `http:` or `https:` URL of at most 2,048 UTF-8 bytes, with no
credentials, fragment, non-default port, localhost/single-label host, or literal non-global IP.
`/api/detect-urls` returns an HMAC scan-flow capability binding the trusted identity, ordered HMAC
of at most ten canonical detected URLs, issuance/expiry, and random nonce. Expiry is the earlier of
two minutes or the issuance UTC day's final-15-second blackout start; detection during that
blackout returns fixed `409 resolver_day_rollover` and issues no capability. The
resolver requires canonical production Origin, a stable UUID request ID, an unexpired matching
capability, and membership of the requested URL before touching resolver state; no-`Origin` calls
are rejected. The separate atomic resolver policy is exactly 50 operations/day and two concurrent
leases per identity as defined above.
Outbound fetch uses the `global_fetch_strictly_public` runtime flag, no cookie/authorization/
referrer/client headers, a fixed user agent, manual redirects, a five-second shared deadline, and
the incoming abort signal. It follows at most three redirects and revalidates scheme, host, port,
credentials, fragment, localhost/single-label form, literal IP, and public-destination enforcement
through the complete original canonical predicate on every hop; relative locations resolve against
the preceding canonical URL. DNS/private-network rejection, redirect loops, missing/invalid
Location, and redirect exhaustion return a fixed error without exposing the destination.

Only `text/html` and `text/plain` responses are accepted. The resolver counts the actual decoded
response stream, cancels above 512 KiB, never trusts `Content-Length`, and produces at most 100,000
UTF-8 text bytes plus a 512-byte title using one deterministic HTML-to-text sanitizer. Non-success
status is status-class-only and its body is canceled unread. The route returns the final canonical
URL but no upstream headers/error text. C1-A caps deterministic detection at ten URLs and resolves
at most two concurrently; the existing URL-only flow remains valid when at least one resolution
succeeds and returns the same bounded enriched-text shape. Workerd tests cover private/literal IP,
DNS rebinding simulation, each redirect hop, chunked overflow, decoded overflow, abort/deadline,
malformed HTML, error-body canaries, and exact boundaries; each control has a causal mutation.
The rollover mutation presents an old capability under a fresh UUID immediately after midnight and
must prove zero request/counter change, lease, permit, or outbound fetch.

The public `/api/keep-alive` route is retired in C1-A. During `legacy` and `shadow`, its compatibility
write moves to a service-only scheduled handler with no public route; it has the sole legacy
Upstash binding, a bounded status-only result, and no effect on request authority. P2 disables that
schedule and removes its binding/secret after the retirement observation gate. In `cloudflare`
mode it is disabled even before P2. Thus public retirement occurs in C1-A, while the private legacy
compatibility mechanism is removed only after P2.

Canonical same-origin JSON and documented no-Origin server/test calls are accepted except that
`/api/scrape-url` always rejects no-Origin as specified above. Local browser
origin is exactly `http://127.0.0.1:<owned-port>` from the isolated gate, never a production
allowlist. Caller `Content-Length`, forwarding headers, identity headers, role/email fields, and
request-ID day hints are ignored or removed. Non-identity content encoding is rejected.

## Error and observability policy

Production code emits structured events from explicit allowlists: event code, request/capture
opaque ID, route, phase, status class, retryable flag, duration bucket, and closed outcome. Logger
arguments cannot accept arbitrary objects, errors, headers, request/response bodies, or strings from
providers/storage. Native errors are mapped at the boundary and discarded.

Tests seed unique canaries in source text, image data URLs, provider bodies, prompts, keys, native
errors, cookies, and emails, then inspect response bodies, console output, Worker traces, D1, every
DO, every R2 bucket, idempotency rows, and report metadata. Any canary outside the encrypted test
object is a failure. Automated tests block non-loopback egress and scrub credential-shaped values.

## C1 decomposition

C1 is implemented as four independently accepted subplans:

1. **C1-A runtime and admission repair:** exact OpenNext/config/type scaffold, executable custom
   Worker wrapper and complete route inventory, source-visible pattern route/UI/cookie retirement
   with every admin/provider-bypass surface disabled until C1-C, bounded URL resolver replacement,
   public keep-alive retirement and private legacy/shadow schedule seam,
   platform ports, corrupt-storage BE-02, same-origin/media BE-03, trusted IP BE-04, exact body and
   image BE-07/CF-01, abort-signal propagation BE-08, deterministic URL detection, and current E1
   regression proof. It defines request-state contracts but claims no BE-01/CF-02 acceptance.
2. **C1-B exact state and cutover seam:** RequestAuthority, budget/quota/idempotency/lockout DOs,
   real atomic last-slot BE-01, exact accounting BE-09, retry CF-02, direct-D1 waitlist, concrete
   CAS/audit guard, physically isolated legacy/shadow/cloudflare modes, route-level Vercel rollback,
   and UTC rollover/replay/concurrency mutations.
3. **C1-C private capture and observatory:** verified-email replacement, audited first-admin
   bootstrap command and role trust, challenge/CSRF/log protection, Packet 4 D1/R2 host ports, the complete private RPC
   capability graph, admin review/promotion, retention/reconciliation/key rotation, CF-03, and
   synthetic report evidence. Eligible capture reuses C1-B reservation/counter state but D1 is its
   sole provider-permit issuer.
4. **C1-D release-candidate acceptance:** production OpenNext bundle inspection, local multi-Worker
   harness, workerd streaming/crypto/binding tests, 50/51 cardinality BE-10, BE-05 and BE-06,
   Chromium/WebKit/Safari-shaped coverage, complete mutation ledger, rollback artifact, and
   independent architecture/security acceptance.

Each BE/CF scenario has one owning implementation subplan: C1-A owns BE-02/03/04/07/08 and CF-01;
C1-B owns BE-01/09 and CF-02; C1-C owns CF-03; C1-D owns BE-05/06/10. C1-D reruns all earlier
proofs as release-candidate regression evidence but never reports them as newly implemented work.

Each subplan starts RED, commits proof-sized units, reruns the complete offline E1 matrix, and
receives independent review before the next begins. C1-D may prepare staging commands and resource
manifests but does not execute them.

## Verification

C1 acceptance requires all of the following without credentials or external calls:

- frozen dependency install and ordinary E1 unit/lint/type/build/browser gates;
- OpenNext production build with pinned resolved dependency versions and explicit `nodejs_compat`;
- Workers Vitest inside workerd for DO, D1, R2, service-binding, Web Crypto, request-stream, and
  generated-binding behavior;
- the current multi-Worker integration harness against production Worker builds;
- isolated local D1 migrations and synthetic local R2 buckets; no remote bindings;
- concurrency barriers for last quota slot, budget reservation, idempotent retry, lockout, capture
  lease/CAS, writer/collector, deletion/outcome, and promotion/deletion races;
- exact request media/origin/wire/decoded-size/client-IP/abort tests;
- strict no-egress and credential scrubbing for every automated command;
- canary scans across responses, logs/traces, DO/D1/R2, caches, and retry metadata;
- Chromium and WebKit product E2E against the local OpenNext/workerd release bundle;
- a production-code mutation for every new E2E/runtime/state/security scenario, observed red and
  byte-identical restored green;
- protected-path inventory, cumulative path guard, diff/status/port/output cleanup; and
- independent Sol/high architecture/security review with no Critical or Important finding.

## Gate boundaries

- C1 performs no Cloudflare login, resource creation, remote migration, upload, deployment, route,
  DNS, domain, Access policy, secret, Resend, OpenRouter, production-data, or paid action.
- P1 requires explicit deployment/credential authority. It creates isolated staging resources,
  proves shadow mode, canonical production, actual Safari, redirects, and the full evidence matrix.
- P2 observes the declared UTC rollover, rehearses rollback with Cloudflare remaining authority,
  and proves reconciliation.
- EE-DONE is blocked until Vercel, Upstash, proxy Worker, keep-alive cron/route, obsolete DNS and
  secrets are retired and a clean post-retirement production proof passes.
- Calendar Casa remains blocked until EE-DONE.

## Acceptance

This design is accepted only when the Event Every diff is design-only, no placeholder or
contradictory authority remains, the E1 static/protected gates pass, an independent Sol/high
architecture/security reviewer returns `VERIFIED:true`, and the design is committed. The next
gate is a placeholder-free C1-A TDD implementation plan; no implementation begins before that plan
is independently accepted.

### Independent acceptance evidence

After six bounded repair reviews, controlled OpenAI `gpt-5.6-sol`/high rereview returned
`VERIFIED:true` with no Critical or Important finding. It confirmed the final resolver rollover
repair and every previously closed authority, rotation, bootstrap, rollback, D1 CAS/audit, Packet 4,
accounting, provider-error, observability, OpenNext, keep-alive, and subplan-ownership contract.
Report:
`/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260802T173306Z-39653-c1-cloudflare-design-repair6-rereview/report.json`.

This acceptance authorizes the local C1-A implementation-plan gate only. It does not authorize a
dependency download, credential/private-data use, Cloudflare control-plane call, provider call,
deployment, DNS/billing mutation, or production action.
