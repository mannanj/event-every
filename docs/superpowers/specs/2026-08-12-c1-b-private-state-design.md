# Event Every C1-B Private Provider-State Design

**Date:** 2026-08-12

**Status:** Accepted after independent architecture/security review

**Accepted review:** `/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T201855Z-14029-c1-b-private-design-final-acceptance/report.json` (`VERIFIED:true`, no Critical, Important, or Minor findings)

**Rejected reviews repaired:** `/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T194006Z-3903-c1-b-private-design-review/report.json`, `/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T195514Z-7222-c1-b-private-design-rereview/report.json`, `/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T200832Z-10902-c1-b-private-design-final-rereview/report.json`, and `/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T201416Z-12724-c1-b-private-design-acceptance-review/report.json` (all `VERIFIED:false`). The revisions add a minimized Scanner replay projection, durable permit verifier, committed-hold invariant, crash-safe alarm-before-state ordering, authority-owned absolute transport deadlines, cross-midnight/key-rotation protocol, reload-safe content-free operation recovery, serialized breach accounting within JavaScript-safe SQLite integers, a fixed provider origin, emitted-artifact community retirement, and the external accepted-authority digest.

**Scope:** Local, synthetic, owner-only Cloudflare/OpenNext provider state. This design does not authorize credentials, private data, provider calls, non-loopback traffic, deployment, public/community access, capture, verified-email authentication, or production mutation.

**Accepted program authority:** `/Users/manblack/Documents/calendar/docs/superpowers/specs/2026-08-11-private-use-process-redesign.md`, SHA-256 `c6d6e97ce3206f05e804a65576eb7cc9301cb63b12c30013665e63a228564c6f`. That Calendar-owned document is intentionally outside the Event Every repository; its accepted review is `/Users/manblack/Documents/codex-agent-routing/.routed-runs/20260812T024858Z-7320-private-use-process-redesign-rereview/report.json`.

## Purpose

C1-A proved the runtime, edge-admission, trusted-identity, and bounded resolver boundaries. Provider routes still deliberately fail closed when `STATE_AUTHORITY_MODE=cloudflare` because the legacy path cannot provide atomic budget reservation or durable at-most-once effects. C1-B supplies that missing private-use state boundary for:

- `POST /api/scan`;
- `POST /api/summarize`;
- `POST /api/resolve-timezone`; and
- read-only `POST /api/provider-status`; and
- the content-free budget view at `GET /api/usage`.

The acceptance outcome is a local Worker artifact in which each intentional provider operation has one stable request UUID, reserves an integer owner budget before transport, can receive at most one transport permit, persists a minimized raw-source-free terminal result or an explicit ambiguous outcome, and never revives the community-key path.

## Current defect boundary

The current legacy provider transition starts provider transport and IP-rate charging independently. The Redis budget:

- checks and charges in separate operations;
- uses floating-point USD;
- fails open when Redis is missing or unavailable;
- records cost after transport; and
- treats missing provider cost as zero.

The routes also select `OPENROUTER_COMMUNITY_KEY`, preserve community-limit responses and UI, and allow environment-selected summary/timezone model identifiers. Those behaviors are incompatible with the accepted private-use sequence. C1-B replaces them; it does not wrap them with a second best-effort check.

## Decision drivers

1. A retry must never cause a second provider call after the first transport permit might have been issued.
2. Concurrent requests for the last budget slot must have one transactionally determined winner.
3. Missing, malformed, delayed, or unpersisted provider accounting cannot become zero cost.
4. A provider result that is safe to return must be durable before the response is sent.
5. Alarms may reconcile state and accounting but may never issue transport.
6. Durable records must exclude the raw source envelope, evidence excerpts/locators, prompts, credentials, provider envelopes/error bodies, native errors, and stacks. A closed, minimized calendar result is derived user data and may persist only for the documented 48-hour replay window.
7. Owner-only scope must remain materially smaller than the deferred public/community design.

## Alternatives considered

### A. One SQLite Durable Object per UTC day

One object could own both the daily budget and every request made that day. This minimizes RPCs, but creates one hot shard, makes per-request retention expensive, and makes a retry after midnight depend on recovering the original daily object before it can even determine request status. It also couples operation replay to budget retention. Rejected.

### B. D1 as the request and budget coordinator

D1 transactions can serialize budget rows, but D1 does not make the lost-response edge around a one-time transport permit simpler. The design would need a larger schema, migration, backup, and rollback surface before C1-B has any content that requires D1. Rejected for this slice; later private capture may introduce its own separately reviewed D1 state.

### C. Split request and day authorities

Use one `ProviderRequestAuthority` SQLite Durable Object per request UUID digest and one `OwnerBudgetAuthority` SQLite Durable Object per frozen UTC day. The request object owns immutable binding, the sole permit, replay, ambiguity, and settlement outbox. The day object owns atomic integer reservation and settlement. Selected.

## Deliberate private-use simplifications

C1-B has no community/admin mode split, verified-email session, per-identity provider quota, waitlist, capture, shadow authority, or public cutover. The owner budget is the only provider admission policy. Existing edge admission and resolver limits remain unchanged.

The private Worker is unconditionally Cloudflare-authoritative. Checked-in `wrangler.jsonc` uses `STATE_AUTHORITY_MODE=cloudflare`, and the production runtime neither defaults to nor statically imports the legacy provider, usage, waitlist, Redis, or community-key graph. `legacy` may survive only as an explicitly injected unit-test adapter or a separate development entry that the emitted private Worker cannot reach. `shadow` remains fail-closed and is not selectable by the private Worker artifact.

There is no hybrid fallback. Missing bindings, secrets, policy values, or Durable Object availability produce a fixed unavailable response before transport. The built `.open-next/worker.js` is scanned for forbidden legacy module signatures, community/public copy, `OPENROUTER_COMMUNITY_KEY`, `OPENROUTER_API_KEY`, Upstash key names, and waitlist code before it is accepted.

## Fixed policy

Money is stored as unsigned integer USD nanodollars (`1 USD = 1_000_000_000`). The daily owner limit is `5_000_000_000` nanodollars. The first reservation freezes this policy in the day's budget object under policy version `owner-v1`.

| Operation variant | Fixed model | Reservation (nanodollars) |
| --- | --- | ---: |
| Scanner text | `deepseek/deepseek-v4-flash` | 20,000,000 |
| Scanner image | `mistralai/mistral-small-2603` | 50,000,000 |
| Timezone resolution | `deepseek/deepseek-v4-flash` | 1,000,000 |
| Summary label | `deepseek/deepseek-v4-flash` | 500,000 |

Scanner model identifiers already come from the frozen vendored Scanner contract. C1-B removes active summary/timezone model environment overrides. The provider URL is the exact compile-time constant `https://openrouter.ai/api/v1/chat/completions`; no environment, request, stored row, or response can change its scheme, origin, path, or redirects policy. Redirect following is disabled. `OPENROUTER_BASE_URL` is removed from and forbidden in the private Worker graph. Local proof treats the URL/model identifiers as inert values and uses an injected synthetic transport. Provider availability, price-policy currency, the owner secret, and paid behavior remain later deployment gates.

The pre-permit reservation lease is two minutes. `OwnerBudgetAuthority.commit`, using its own `Date.now()`, returns one authoritative absolute `transportDeadlineMs = commitNow + 14 minutes` and `committedUntilMs = commitNow + 15 minutes`; both are persisted by both authorities. Replayable request results persist until exactly 48 hours after the request authority durably enters `completed` or `failed`. Nonterminal requests cannot create a replay expiry; their phase-specific leases drive them to release or `unknown`. Budget rows persist for 72 hours after their terminal `released`/`settled` transition. After result expiry, the request object deletes the replay body but retains an indefinite minimal tombstone containing only the request digest, execution ID, terminal class, and `expired` state; the UUID can never become a new operation.

## Authority names and immutable binding

The browser creates one strict UUID for an intentional operation and preserves it across transport retries. The request Durable Object name is:

```text
SHA-256("event-every/provider-request/v1\0" + lowercase-request-uuid)
```

The UUID is an opaque random protocol nonce, not user identity. A domain-separated stable digest ensures a retry maps to the same object across midnight and secret rotation.

After route-specific validation and normalization, the host computes a request-shape HMAC:

```text
HMAC-SHA-256(
  selected PROVIDER_REQUEST_HMAC key,
  "event-every/provider-shape/v1\0" + route + "\0" + operation-variant + "\0" + canonical-json
)
```

Canonical JSON is produced only from the strict validated route input with fixed field order. It includes the values that determine the provider request, including image data while in memory, but only the HMAC is durable. Unknown properties are rejected. HMAC keys are distinct Worker secrets and are never written to Wrangler vars, output, logs, exceptions, or evidence.

Bindings carry a current key/version and an optional previous key/version. A new request must use the current key. A retry presents candidate digests for both configured versions; an existing object accepts only the candidate whose version equals its frozen `shape_key_version`. The previous key must remain configured for at least 48 hours after rotation. A rotation that would remove a key inside that replay window is a later deployment-gate failure, not an implicit conflict.

On first `begin`, `ProviderRequestAuthority` freezes:

- request digest and random execution ID;
- route and operation variant;
- request-shape HMAC;
- request-shape key version;
- original UTC authority day;
- policy version and maximum reservation;
- creation, permit, and tombstone timestamps; and
- the initial `prepared` state.

The request UUID itself is not stored. A retry with the same immutable binding observes current state. The same UUID with any changed binding is a fixed idempotency conflict before budget or transport. C1-A still derives and injects trusted edge identity for its existing admission/resolver duties, but owner-only provider admission does not need that identity and C1-B neither binds nor persists it.

## State machines

### ProviderRequestAuthority

```text
prepared
  -> reserved
  -> budget_committed
  -> provider_inflight
  -> completed | failed | unknown
  -> expired
```

- `prepared`: immutable request binding exists; no budget row is proven.
- `reserved`: the day authority has idempotently reserved the maximum cost.
- `budget_committed`: the reservation has been made conservative; it can no longer be released as unused.
- `provider_inflight`: the one unguessable permit nonce was issued and its domain-separated SHA-256 verifier is durable.
- `completed`: a validated minimized response is durable and replayable.
- `failed`: a fixed, content-free terminal provider failure is durable and replayable.
- `unknown`: transport may have happened but a safe result is not durably known; no replay can transport.
- `expired`: replay data has been erased and the UUID is permanently unusable.

`claimTransport` generates 32 random bytes, persists only
`SHA-256("event-every/provider-permit/v1\0" + nonce)` in the same SQLite transaction as the state transition, and returns the raw nonce only to that live caller. `completeKnown`, `completeFailed`, and `completeUnknown` recompute and constant-time compare the verifier, including after object eviction. The raw nonce is never durable. A terminal or expired state rejects all later completion RPCs.

Terminal rows include `settlement_pending` or `settlement_complete`. Settlement state does not change the replayed application result because the maximum reservation already protects admission while settlement is pending.

### OwnerBudgetAuthority

```text
reserved -> released
reserved -> committed -> settled
reserved -> committed -> settled_full
```

One SQLite transaction admits a reservation only when:

```text
SUM(settled actual/full amounts)
+ SUM(max reservation for every row in reserved or committed)
+ requested_max
<= daily_limit_nanodollars
```

`reserve` is idempotent by execution ID and rejects changed request/day/route/amount binding. `commit` is idempotent and moves the row into the conservative post-permit class before the request authority can issue a permit. Committed-but-unsettled rows continue contributing their full maximum to every admission decision. Settlement atomically replaces that maximum hold with the exact or full settled amount. An expired uncommitted row releases. An expired committed row settles the full reservation before any competing settlement or admission observes it. Neither alarm calls a provider.

The owner limit is an admission bound under the fixed model/input/output policy, not a claim that a provider can never misbill. A valid actual cost above its reservation or any syntactically positive cost above the supported integer range freezes the day immediately. The later deployment gate must independently verify current provider pricing and the request-side token/output caps before a real key can be authorized.

## Operation sequence

The only valid order is:

1. C1-A admission validates method, origin, encoding, wire bytes, and injects trusted identity.
2. The route validates a strict request UUID and strict route schema, then derives variant and current/previous request-shape HMAC candidates.
3. The route calls `ProviderRequestAuthority.begin` with the current UTC day as a proposal. A new row freezes it; an existing row returns its already frozen authority day and shape-key version. The caller never supplies or overwrites the original day on retry.
4. A terminal same-binding result is replayed immediately. Pending, unknown, expired, or conflicting state returns its fixed response and stops.
5. The route calls the original-day `OwnerBudgetAuthority.reserve` with execution ID, request-authority digest, route, variant, policy version, and maximum cost.
6. The route records the reservation in `ProviderRequestAuthority`.
7. The route calls `OwnerBudgetAuthority.commit`. The authority derives and returns its durable absolute `transportDeadlineMs` and `committedUntilMs`. If its response is lost, the same idempotent call is the only allowed retry and returns the same deadlines. After commit, the reservation can only settle actual or full.
8. The route records `budget_committed` with both absolute deadlines, then calls `ProviderRequestAuthority.claimTransport`.
9. The atomic `budget_committed -> provider_inflight` transition persists the permit verifier and returns one unguessable nonce. This live response is the sole authority to call the provider.
10. `claimTransport` uses the request authority's own clock and rejects when `Date.now() >= transportDeadlineMs`; caller-provided time cannot influence a transition. Its winning response returns the absolute transport deadline with the nonce. The route invokes exactly one injected transport with `OPENROUTER_OWNER_KEY`, the fixed URL/model/request, execution ID, and permit nonce held only in memory. Its signal is `AbortSignal.any([request.signal, AbortSignal.timeout(max(0, transportDeadlineMs - Date.now()))])`; the fetch and response reader receive that same signal.
11. A successful provider body is stream-bounded and parsed once. The route converts it to the route's closed minimized replay projection before persistence. The first response and every replay are materialized from that same projection.
12. The route calls `completeKnown` with the nonce, minimized replay projection, and exact cost outcome. The request object durably stores the replay result and settlement outbox before acknowledging success.
13. `ProviderRequestAuthority` settles through `OwnerBudgetAuthority`. A failed settlement RPC leaves the outbox and alarm active; it does not erase or change a durable result.
14. Only after `completeKnown` acknowledges the durable response may the route answer the client.

If abort occurs before budget commit, the reservation is released or left to expire. Once budget commit begins, any abort, exception, lost permit response, timeout, invalid provider body, or lost completion response is conservative: the operation never transports again and the full reservation is eventually consumed unless an exact durable known settlement already exists. A late transport/completion after the internal deadline or after `unknown` is rejection-observed and cannot replace the terminal state or reduce settlement.

## Exact RPC and alarm contract

`ProviderRequestAuthority` exposes only these state-changing methods:

- `begin({ requestDigest, route, variant, bindingCandidates, proposedAuthorityDay, policyVersion, reservationNanodollars })`;
- `recordReservation({ executionId, authorityDay, reservationNanodollars })`;
- `recordBudgetCommitted({ executionId, transportDeadlineMs, committedUntilMs })`;
- `claimTransport({ executionId })`;
- `completeKnown({ executionId, nonce, replay, costOutcome })`;
- `completeFailed({ executionId, nonce, code, httpStatus, costOutcome })`; and
- `completeUnknown({ executionId, nonce, code })`.

`OwnerBudgetAuthority` exposes `reserve`, `commit`, `release`, `settle`, and `status`. Every method carries the execution ID and frozen authority day; every mutating method is idempotent and rejects changed immutable binding. Production methods derive time internally. Pure transition functions accept an injected clock only in unit tests; no public DO RPC accepts caller-controlled `nowMs`.

Both Durable Objects run an opportunistic expiry sweep at the start of every RPC. Their constructors use `blockConcurrencyWhile` to create/validate schema, read the earliest deadline or pending outbox row, and arm an alarm.

Every state transition that creates future work follows an alarm-before-state invariant. Before its SQLite transaction, the object reads `storage.getAlarm()` and durably calls `setAlarm(min(existingAlarm, requiredDeadline, Date.now() + 30 seconds))`; only after that promise resolves may it commit the row/outbox/deadline. A crash before the row leaves only a harmless early alarm. A crash after the row leaves an already durable alarm no later than the required work. RPCs never move an alarm later. After an alarm transaction proves all work earlier than the next deadline is terminal, that alarm invocation may move the alarm to the next exact deadline or delete it. Constructors and subsequent RPCs still repair absent/stale alarm state defensively, but correctness does not depend on either occurring.

Alarms use transactionally compared timestamps, schedule the earliest of lease/result/retention/outbox deadlines, and retry failed cross-object settlement with bounded exponential delays from one second to five minutes. Tests terminate the object immediately before and after every `setAlarm` and SQLite commit boundary, issue no later RPC, advance time, and require the durable alarm alone to reconcile.

The request alarm may only:

- expire `prepared`/`reserved` work and enqueue release;
- turn an expired `budget_committed` or `provider_inflight` request into `unknown` and enqueue full settlement;
- retry a release/settlement outbox;
- erase replay data at 48 hours and leave the permanent tombstone; or
- re-arm itself.

The budget alarm may only release expired `reserved` rows, settle expired `committed` rows to full, delete eligible 72-hour accounting rows after their request settlement is terminal, or re-arm itself. No constructor, RPC retry, alarm, outbox, or status read can issue a permit or call transport.

Failure classification is fixed:

| Observation after live permit | Request state | Client contract | Accounting |
| --- | --- | --- | --- |
| bounded success + valid minimized result + durable completion | `completed` | stored route response | exact cost, or full if cost missing/malformed |
| provider HTTP response, including privacy/credit/rate/5xx | `failed` | stored fixed status/code; body never read | full |
| bounded success with invalid application result | `failed` | `502 provider_invalid_response` | full |
| fetch/network error after invocation | `unknown` | `502 provider_outcome_unknown` | full |
| request abort or fourteen-minute deadline after invocation | `unknown` | `502 provider_outcome_unknown` | full |
| lost claim response | `provider_inflight`, then `unknown` on expiry | pending, then unknown | full on expiry |
| known completion stored but settlement RPC fails | `completed` + `settlement_pending` | stored route response | maximum remains held; outbox retries |
| completion RPC response lost | stored terminal state if RPC committed, otherwise inflight/unknown | replay terminal state, never transport | exact/full if committed; otherwise full on expiry |

Provider HTTP mappings are content-free and exact: `402 -> 503 owner_provider_credit_unavailable`; `408 -> 504 provider_timeout`; `429 -> 503 provider_rate_limited`; Scanner's fixed-model privacy-routing `503 -> 503 privacy_endpoint_unavailable`; all other `4xx -> 502 provider_rejected`; and all other `5xx -> 502 provider_unavailable`. No upstream header or error-body field is copied. Route validation remains its existing fixed `400`; idempotency pending/conflict/expired remains `409`; budget rejection is `402 owner_budget_exhausted` with the frozen original-day reset timestamp; state/binding/secret failure is `503 provider_state_unavailable`; and ambiguous post-invocation outcome is `502 provider_outcome_unknown`.

At the exact transport boundary, the request-authority transaction that first observes `Date.now() >= transportDeadlineMs` wins the monotonic transition to `unknown`; a completion at that timestamp is late and rejected. `committedUntilMs` is the later budget fallback deadline and cannot extend transport authority.

## Cost parsing and settlement

Successful provider bodies are read through a streaming byte counter capped at 2 MiB. The reader cancels immediately on overflow. Bytes are decoded once with fatal UTF-8, and a lossless JSON-token pass rejects trailing material, duplicate top-level `usage`, and duplicate direct `usage.cost` keys while preserving the original cost lexeme. The same parsed value feeds the existing provider response validation. `Response.json()` is not an accounting source.

The parser first recognizes the complete JSON-number grammar:

```text
-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?
```

The exact-accounting subset is:

```text
(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?
```

The exact subset accepts no sign, exponent, leading zero, whitespace, `NaN`, or `Infinity`. Conversion uses decimal digits and `BigInt`: pad or take the first nine fractional digits, then add one nanodollar when any later accepted fractional digit is nonzero. Before any SQL binding the value must be at most `Number.MAX_SAFE_INTEGER - 5_000_000_000 = 9_007_194_254_740_991` nanodollars. It is converted to `number` only after that proof; SQL bindings and reads assert `Number.isSafeInteger`.

Missing, duplicate, structurally malformed, negative, or lexical zero-with-exponent cost consumes the full reservation without a day freeze. Every lexically positive JSON number outside the exact subset—including any positive exponent form—or above the safe storage ceiling records bounded `accounting_cost_overflow`, settles the reservation full, and freezes the day. Thus `1e100` can never be demoted to ordinary missing accounting, while no inexact value crosses the SQL boundary.

A valid cost at or below the reservation settles the exact value. Above-reservation settlement is serialized inside the day authority:

- the first storable above-reservation value atomically stores the full actual value, freezes further admission as `accounting_policy_breach`, and marks the budget row `primary_breach`;
- the first positive overflow settles only its full reservation, freezes the day as `accounting_cost_overflow`, and marks `primary_overflow`; and
- after either frozen state exists, every already-committed later above-reservation or overflow completion settles only its own full reservation and records bounded `secondary_breach`, never the later actual value.

Before the first breach, settled values plus all outstanding maximum reservations are at most the 5-billion daily limit. The first storable actual is at most `Number.MAX_SAFE_INTEGER - dailyLimit`; replacing its reservation with that actual and later replacing every other hold with no more than its reservation keeps every row, aggregate SQL sum, and JavaScript read at or below `Number.MAX_SAFE_INTEGER`. A transaction rechecks frozen state, so two concurrent breach settlements cannot both become primary.

The request authority durably stores failed state `502 accounting_policy_breach` for a storable above-reservation response and `502 accounting_cost_overflow` for positive overflow, without a replay result. Budget `secondary_breach` does not change those fixed client codes. All are terminal, replay the same fixed status/code, and never expose provider data.

Provider non-success bodies are never materialized. The transport cancels the body and maps only status class to fixed internal failure. Because no trusted cost exists after transport, terminal HTTP, network, timeout, and privacy-endpoint failures consume the full reservation.

## Retry and failure contract

Retries use the same POST and request UUID; there is no new public status endpoint.

The page-level provider operation owner, not an individual `fetch` attempt, creates the UUID. Before the first POST it durably stores a content-free local IndexedDB record in a new `provider-operations` store inside the existing `summon-input` database:

```text
{ requestId, route, consumerKind, consumerRef, createdAtMs, transportDeadlineMs, state }
```

`requestId` and `consumerRef` are strict local UUIDs; `consumerRef` identifies the local review batch or history row that will consume a replay. C1-B changes newly created history-row IDs to `crypto.randomUUID()` while continuing to read legacy IDs. The record contains no canonical body, source text, image bytes/data URL, URL, prompt, candidate value, summary, timezone, credential, or provider data. If this small record cannot be persisted, the client fails before the provider POST. The normalized body remains only in memory during the original page session. `scanClient` and `summarizer` use that record for the initial request and every retry.

C1-B adds same-origin `POST /api/provider-status`, with a 1 KiB strict JSON body `{ requestId }`. The unguessable 122-bit UUID is a replay capability; the later live gate also requires owner Access before real use. The route resolves the request authority by stable UUID digest and calls only `status()`. It may return pending metadata, the minimized stored replay, a fixed terminal failure, unknown, or expired. It cannot begin/bind a request, reserve/commit/release/settle budget, issue/return a permit nonce, invoke transport, extend retention, or expose authority/budget rows. It copies no caller/provider data into errors or logs.

On network/no-response or `409 provider_request_pending`, the live page polls the same POST/body/UUID with abort-aware exponential delays `250 ms, 500 ms, 1 s, 2 s, 4 s`, capped at 5 seconds. The local initial-attempt time plus fifteen minutes may change the UI copy to “Still checking this request,” but it never expires or abandons the operation. Once a pending response supplies the authoritative `transportDeadlineMs`, the client updates the local record. Polling continues through that deadline and then performs one final same-body/same-UUID observation; the request authority's opportunistic sweep makes that response terminal, failed, completed, expired, or unknown rather than pending.

On page startup, the operation owner loads every nonterminal local record before enabling a new provider submission. It polls `/api/provider-status` with the same capped backoff until terminal/expired; a completed replay is delivered to `consumerRef`, and the local record is then deleted. Pending across reload therefore remains the same UUID without persisting or resending raw input. A pre-permit request that cannot proceed without its lost in-memory body expires/releases; status never reconstructs or transports it.

The client never retries conflict, expired, unknown, budget, validation, accounting-breach, or provider terminal failures. A pending interval longer than 750 ms is therefore still the same operation. The original/restored page queue remains visibly pending and cannot enqueue the same consumer operation as new. Only explicit Cancel aborts polling, deletes the local record, and authorizes a later explicit submission to create a new UUID. Server terminal/expired status also deletes the record and permits a new explicit submission. A reload alone never abandons or replaces the UUID.

Timezone currently has no browser caller; its route contract is still tested with the same UUID and pending metadata behavior.

| Stored state | Same-binding retry | Provider calls on retry |
| --- | --- | ---: |
| `prepared` / `reserved` before lease expiry | continue the idempotent state sequence | at most one, only after a fresh live claim response |
| `budget_committed` | continue only to the one claim; a lost earlier claim response is detectable from state | 0 when state is already inflight or later |
| `provider_inflight` | fixed `409 provider_request_pending` while lease is live | 0 |
| `completed` | exact stored response and status | 0 |
| `failed` | fixed stored error code and status | 0 |
| `unknown` | fixed `502 provider_outcome_unknown` | 0 |
| `expired` | fixed `409 provider_request_expired` | 0 |
| changed immutable binding | fixed `409 provider_request_conflict` | 0 |

The subtle lost-claim edge is closed by state, not by guessing. If `claimTransport` commits but its response is lost, the object is already `provider_inflight`; no later call can receive the nonce. If budget commit succeeds but the request never reaches `claimTransport`, the full reservation may be consumed despite zero provider use. That conservative loss of availability is accepted to preserve the spending bound.

The required recovery proofs cover:

- two concurrent requests racing for the final budget slot;
- provider completion followed by route/process failure before the client response;
- retry after a lost claim response;
- retry after an ambiguous transport outcome;
- settlement RPC failure followed by alarm recovery;
- two already-inflight above-reservation completions serialized into one primary and one secondary breach without aggregate rounding/overflow;
- pre-permit abort and reservation expiry;
- post-permit abort and full settlement;
- a retry crossing UTC midnight while remaining bound to the original day; and
- object eviction between every durable phase.

## Minimized durable replay schema

`ProviderRequestAuthority` may durably store only:

- protocol/policy version;
- request and request-shape digests;
- request-shape key version;
- random execution ID;
- route and operation variant;
- authority day and timestamps;
- the permit nonce verifier while state is inflight;
- integer reservation and settlement values;
- closed state/error codes;
- a validated replay envelope for the application result; and
- bounded settlement retry count/next-attempt metadata.

The replay envelope is a separate closed schema, never `ScanResponseSchema` serialized wholesale:

- `DurableScanReplaySchema` retains the locally generated source handle and candidate IDs as strict lowercase UUIDs; sets provider `sourceUid` to `null`; retains only bounded candidate field values and numeric confidence; replaces every evidence array with `[]`; and stores issues only as `{ code, field }`. On both the first response and replay, local closed maps reconstruct `kind`, `severity`, and bounded message from the issue code. Provider-authored issue messages, evidence excerpts, evidence locators, offsets, and provider identifiers are never stored or returned.
- Scanner output is capped at 50 candidates and 200 total issue references. UTF-8 ceilings are title 512 bytes, description 16 KiB, location 2 KiB, URL 2,048 bytes, and each serialized candidate 64 KiB. A provider result outside this projection is `provider_invalid_response`, not truncated into a different event.
- Candidate calendar values—title, description, location, URL, temporal value, and recurrence—are derived user data and can resemble submitted data. They are intentionally retained only inside the replay row for 48 hours and must be disclosed by `EE-DATA-FAQ`. They are absent from budget rows, logs, errors, caches, retry metadata, tombstones, and evidence artifacts.
- `DurableSummaryReplaySchema` is Title Case, two or three whitespace-separated words, at most 96 UTF-8 bytes, with no punctuation/control characters.
- `DurableTimezoneReplaySchema` contains one IANA timezone string of at most 255 UTF-8 bytes and finite confidence in `[0,1]`.

The first successful client response is materialized from the durable projection after the write acknowledges. A retry therefore returns byte-equivalent JSON rather than a richer first response. The projection may not contain raw source text/image data URL, the raw submitted request envelope, prompt, provider request/response envelope, provider response ID, credential, native exception, provider-authored error/message/evidence, or stack.

`OwnerBudgetAuthority` stores only policy/day, request-authority digest, execution ID, route/variant, integer reservation/settlement, phase, timestamps, and fixed breach code. It does not store identity or replay data because neither is needed to serialize the owner-wide budget.

No new D1 table is required for C1-B. Provider request and budget correctness live entirely in SQLite Durable Objects. The sentinel D1 binding remains unused and nondeployable until a later accepted artifact owns a concrete D1 need.

## Owner-only key and community retirement

The active provider path recognizes only the Worker secret `OPENROUTER_OWNER_KEY`. It never falls back to:

- `OPENROUTER_COMMUNITY_KEY`;
- `OPENROUTER_API_KEY`;
- an admin header, cookie, token, or request-derived mode;
- Upstash budget/rate-limit state; or
- an environment-selected fallback model.

The app graph deletes the community provider, Redis budget/rate limit, community usage/waitlist adapters, community event utilities, `/spent` page, waitlist route implementation, and whole-page community/waitlist screen. `/api/waitlist` remains only as an edge-manifest retirement entry so admission returns fixed `410 route_retired` before body reads or OpenNext delegation. Every landing/app statement about community sponsorship, a shared daily limit, public free usage, membership, or a waitlist is removed; the later FAQ task owns the complete data-use copy after behavior is proven.

The separate `cloudflare/legacy-keepalive-*` compatibility worker remains disabled and outside the app Worker graph because C1-A already proved that isolation. It is not deployed or invoked by C1-B. `src/platform/legacy/dispatch.ts` may remain as archive-tested pure code only if the emitted private Worker scan proves it and every community/key/Redis symbol absent. No product route or runtime selector imports it.

Removing code and configuration from the private artifact does not authorize deletion, disablement, or mutation of any already deployed Vercel project, Upstash database, legacy route/service, Cloudflare resource, DNS record, or secret. Those external retirements remain separately gated by the accepted program authority.

## Usage response

`GET /api/usage` in `cloudflare` mode reads only the current UTC day's `OwnerBudgetAuthority`. It returns a no-store, content-free contract:

```json
{
  "status": "available",
  "policyVersion": "owner-v1",
  "authorityDay": "2026-08-12",
  "limitNanodollars": 5000000000,
  "spentNanodollars": 0,
  "reservedNanodollars": 0,
  "remainingNanodollars": 5000000000,
  "exhausted": false,
  "frozen": false,
  "resetAt": "2026-08-13T00:00:00.000Z"
}
```

`reservedNanodollars` includes both `reserved` and `committed` rows. `remainingNanodollars` is `max(0, limit - settled - reserved)`; `exhausted` is true when no minimum route reservation can be admitted, and `frozen` is true for either accounting breach class. The response exposes no request IDs, identities, routes, model names, retry rows, or user-derived values. If state is unavailable, the route returns fixed `503 owner_budget_unavailable` and never falls back to Redis.

## Privacy canary

The required command is exactly:

```bash
bun run verify:private:privacy
```

It runs entirely locally with a synthetic owner key, synthetic request canaries, injected MSW/in-memory provider responses, and Workerd Durable Objects. A preload denies non-loopback egress and scrubs inherited credential-like environment variables.

The canary uses four distinct marker classes so it does not make an impossible claim about documented calendar results:

- a raw-only input marker placed where no valid result projection needs it;
- a provider-envelope/error/evidence marker;
- a synthetic secret marker; and
- a documented-result marker deliberately used as a candidate value or generated summary.

For text, image, summary, timezone, provider-error, abort, retry, and settlement-failure scenarios, the command asserts that raw-only, provider-envelope, and secret markers are absent from:

- client success and error responses where the value is not part of the documented result;
- console/stdout/stderr and the closed logger seam;
- `ProviderRequestAuthority` and `OwnerBudgetAuthority` SQLite rows;
- alarm/outbox and retry metadata;
- cache APIs and any generated local artifact; and
- bounded test reports.

The documented-result marker may appear only in the first/replayed client result and the request authority's minimized replay row during its 48-hour window. It must be absent from all other locations above and from the permanent tombstone after expiry. Tests also inject provider-authored evidence/message markers and prove the local projection removes them while reconstructing closed issue copy.

The local `provider-operations` IndexedDB store is separately inspected: it may contain only the seven content-free fields above, never any marker except the synthetic UUID chosen for `requestId`/`consumerRef`. Reload tests prove the record precedes the first POST, resumes through `/api/provider-status`, delivers a completed replay, and is removed on terminal status or explicit Cancel.

Worker tests inspect Durable Object SQLite directly through `cloudflare:test`; production introspection endpoints are forbidden. The command also asserts no `.wrangler`, `.open-next`, provider, credential, or non-loopback side effect survives completion.

## Mutation obligations

Each critical guarantee needs a mutation that changes production behavior and makes its named test fail. At minimum:

1. allow a second permit after a lost claim response;
2. persist or compare the raw permit nonce instead of its durable verifier, or skip verifier comparison after eviction;
3. reserve outside the day-object transaction;
4. omit committed rows from the outstanding budget sum;
5. release a committed reservation on alarm;
6. coerce missing cost to zero;
7. parse cost through binary floating point, round the tenth decimal down, accept duplicate cost, or fail to freeze on positive overflow;
8. answer success before the minimized replay result is durable;
9. retry provider transport from an alarm or ambiguous state;
10. bind an idempotency key without the normalized request shape or accepted key version;
11. rebind a cross-midnight retry to the new UTC day;
12. read or copy a provider non-success body;
13. persist Scanner evidence/provider messages or another raw provider field;
14. create a new browser UUID after a lost response;
15. fall back to a community/API key or Redis budget;
16. admit `/api/waitlist` or emit community code/copy in the private Worker;
17. accept an environment-selected model; and
18. allow `OPENROUTER_BASE_URL`, a redirect, or any non-exact provider origin;
19. commit deadline/outbox state before a durable alarm and crash with no later RPC;
20. derive transport timeout from retry time instead of the authority's absolute deadline;
21. stop browser polling after 750 ms and create a replacement UUID;
22. treat positive exponent overflow as ordinary missing cost or coerce `BigInt` through unsafe SQL `number`;
23. let two concurrent above-reservation completions both store their actual amounts; and
24. drop the local provider-operation record on reload or let `/api/provider-status` reserve, claim, transport, or extend retention; and
25. bypass the privacy canary's no-egress or output scan.

## File boundaries for the implementation plan

The implementation plan may assign work only within these groups, with exact paths enumerated per task:

- provider contracts, policy, request binding, cost parser, and unit tests under `src/platform/provider/**`;
- `ProviderRequestAuthority`, `OwnerBudgetAuthority`, and Workerd tests under `src/platform/cloudflare/**` and `test/worker/**`;
- Cloudflare runtime/context, Worker exports, Wrangler bindings/types, and their existing config tests;
- the three provider route modules, new provider-status route, usage route, Scanner transport seam, route manifest, and focused tests;
- `src/services/scanClient.ts`, `src/services/summarizer.ts`, `src/services/inputStorage.ts`, their tests, and `src/app/page.tsx` as the page-level operation owner needed to preserve one UUID through terminal polling and reload;
- the closed minimized replay projection and local issue-message mapping;
- owner-only key/model/origin cleanup, private exhaustion UI, landing public/community sentence, retired waitlist/spent surface, and emitted Worker forbidden-symbol scan;
- local offline/privacy verification scripts, package commands, and bounded mutation ledger; and
- the accepted plan/evidence/tracker files.

The implementation must preserve the six pre-existing protected Event Every worktree entries and C1-A protected hashes. It may not edit the E1 mutation ledger or C1-A mutation runner files.

## Acceptance boundary

C1-B is accepted only when all of the following are true on one committed head:

- unit and Workerd tests prove every state transition and recovery row above;
- route tests prove fixed response mappings and zero provider work before a live permit;
- concurrent final-slot, provider-crash, settlement-failure, ambiguous-retry, and UTC-rollover tests pass;
- a browser reload during a provider-inflight window resumes the same UUID through the read-only status route and never issues a second transport;
- the required mutations are demonstrated red then restored green;
- `bun run verify:private:privacy` exits zero with no external/provider call;
- the existing C1-A committed-head gate remains green and its protected hashes match;
- a local Chromium and WebKit owner flow passes against the Worker artifact;
- no generated `.wrangler` or `.open-next` artifact remains;
- exact file ownership and worktree checks pass; and
- an independent architecture/security reviewer reports no Critical or Important finding.

This acceptance still does not authorize a real owner key, real user data, Access configuration, remote resources, deployment, or provider transport. Those remain later private-artifact gates. The truthful cross-product user-data FAQ remains queued after C1-B fixes the actual stored fields and retention, and before any owner-data artifact is accepted.
