# `@event-every/scanner`

Browser-safe contracts and deterministic iCalendar operations for turning offline provider
observations or `.ics` text into partial, reviewable event candidates.

Packets 1 and 2 are deliberately incomplete as an application. They validate facts, keep missing
values explicit, preserve evidence and unsupported semantics, decide whether a candidate can be
exported, and provide an isolated host-injected OpenRouter adapter boundary. Event Every and
Calendar Casa own review, editing, saving, authentication, sharing, booking, categories,
application event identity, and every product screen around that boundary.

## Candidate contract

- Every reviewable field is present. A fact that was not found has `value: null`.
- Missing or ambiguous facts remain unresolved and carry structured issues; the scanner never
  fills them from the clock or a plausible default.
- `candidateId` is injected and scan-local. An external `sourceUid` is preserved exactly, is not
  constrained to UUID syntax, and is never replaced with `candidateId`.
- Candidates retain provider or VEVENT order and remain independent. Applications decide whether
  anything should be deduplicated or merged across candidates or scans.
- Evidence contains bounded references only. Raw source and provider payloads do not belong in a
  candidate.

## Browser export

Revalidate the edited candidate immediately before generating the file. The caller must supply an
explicit export UID when the source did not provide one.

```ts
import { generateIcs, validateForIcs } from "@event-every/scanner";

const policy = {
  uid: editedCandidate.sourceUid ?? explicitlyAllocatedExportUid,
  dtstamp: "2026-07-23T18:00:00Z",
  prodId: "-//Event Every//Event Scanner 1.0//EN"
};

const readiness = validateForIcs(editedCandidate, policy);
if (readiness.canGenerate) {
  const generated = generateIcs(editedCandidate, policy);
  if (generated.ok) {
    const blob = new Blob([generated.calendarText], {
      type: "text/calendar;charset=utf-8"
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "event.ics";
    anchor.click();
    URL.revokeObjectURL(href);
  }
}
```

`generateIcs` performs fresh readiness validation itself. Calling `validateForIcs` first is useful
for review UI, but it does not authorize a later generation call with changed inputs.

## Server-delivered export

A server route independently revalidates the candidate and policy with the same operation. It
returns `text/calendar` only on success and structured `422` blockers otherwise.

```ts
import { generateIcs } from "@event-every/scanner";

const generated = generateIcs(candidateFromValidatedRequest, policy);
if (!generated.ok) {
  return Response.json(
    {
      blockers: generated.blockers,
      warnings: generated.warnings,
      omittedFields: generated.omittedFields
    },
    { status: 422 }
  );
}

return new Response(generated.calendarText, {
  headers: { "Content-Type": "text/calendar;charset=utf-8" }
});
```

Authentication, authorization, request validation, saved-event lookup, and delivery policy remain
the server application's responsibility.

## Provider boundary

Import adapters only from `@event-every/scanner/openrouter`; the default
`@event-every/scanner` entry remains provider-neutral. `TextLinkProviderPort` and
`VisionProviderPort` accept opaque source handles and return observations. Packet 2 supplies fixed
OpenRouter request and response boundaries, while the host owns every secret and network action.

```ts
import {
  createOpenRouterTextLinkProvider,
  type OpenRouterChatRequest,
  type OpenRouterTransport,
} from "@event-every/scanner/openrouter";

const transport: OpenRouterTransport = {
  async complete(request: OpenRouterChatRequest) {
    return hostOpenRouterTransport(request);
  },
};

const provider = createOpenRouterTextLinkProvider({
  transport,
  resolve: async (handle) => {
    const source = await privateSourceStore.read(handle.contentHandle);
    if (handle.kind === "text") {
      return {
        sourceId: handle.sourceId,
        kind: "text",
        text: source.cleanedText,
      };
    }
    return {
      sourceId: handle.sourceId,
      kind: "link",
      text: source.cleanedText,
      canonicalUrl: source.canonicalUrl,
    };
  },
});

const observation = await provider.scan(sourceHandles);
```

`hostOpenRouterTransport` owns the credential, fetch, timeout, abort, and sanitized HTTP mapping.
`privateSourceStore` owns content lookup. Link-fetching, SSRF, redirect, and size policy occur
before the resolver returns.

### Packet 2 adapter rules

- Fixed models cannot be overridden by callers: text/link requests use the fixed DeepSeek model and
  vision requests use the fixed Mistral model.
- The host resolves opaque handles and owns network access, secrets, credentials, timeouts, aborts,
  and sanitized transport mapping. The scanner owns neither direct fetch nor provider credentials.
- Never put raw input, raw model output, request bodies, or provider response bodies in errors or
  logs. Adapter errors are typed and sanitized.
- Only PNG, JPEG, and WebP base64 data URLs cross the image adapter boundary, after host MIME and
  size verification.
- Requests are non-streaming, strict-schema, and private-routing only; there are no retries or
  fallback models.

## Packets 1 and 2 adapter exclusions

- No raw source/provider payloads in candidates, runtime logs, or production-derived fixtures.
- No fabricated date, year, timezone, offset, end, duration, or UID fallback.
- No UUID constraint on external/source UIDs.
- No cross-candidate deduplication, merge, suppression, ranking, sibling fencing, or cross-scan
  application identity.
- No recurrence expansion or series editing.
- No caller-configurable model, fallback model, retry, auth implementation, or credential ownership
  in the provider-neutral package or OpenRouter adapter.
- No capture inbox, golden-case promotion, production-capture corpus, or eval governance beyond the
  Packet 3 runner described below.
- No persistence, raw-artifact retention, Cloudflare, R2, D1, or Durable Objects.
- No review/edit/save UI, sharing, booking, categories, Event Every integration, Calendar Casa
  integration, server route, deployment, or publish.
- The deferred browser/on-device task is uninvestigated and is not a gate dependency.

## Verification

Run `bun run verify` before every commit. It covers package and host type checking, lint, unit
tests, all four real browser bundles, their isolation matrices, and declarations. New pure logic
also requires a focused unit test and recorded deliberate mutation evidence in
[`docs/mutation-ledger.md`](docs/mutation-ledger.md).

## Packet 3 evaluation

Evaluation is offline by default:

```bash
bun run eval -- --corpus data/eval/v1/corpus.json --actuals test/fixtures/eval-offline-actuals.json --out .tmp/eval-report
```

`src/eval/**` is browser-safe and accepts host-injected contracts only. The Bun host scripts own
corpus files, source resolution, credentials, network transport, the local authority, and JSON/
Markdown artifact writes. Offline evaluation never constructs a provider, reads a credential, or
makes a network call.

Live evaluation is the separately gated, explicitly paid host command:

```bash
bun run eval:live -- --confirm-paid
```

It requires a current canonical authority, complete current charge bound, source resolver, and
`OPENROUTER_API_KEY`. The explicit command and confirmation flag are separate gates; the offline
command cannot select live mode. The fixed Packet 2 adapters are the only live provider path.

The machine-local authority root comes from the OS user record and cannot be redirected by
`HOME`, `LOCALAPPDATA`, the repository, or the artifact path. Reports include the package version,
the checked-out Git commit, and a content-derived run ID. Actual spend is recorded only from an
authenticated OpenRouter response ID and exact `usage.cost` conversion to USD micros; missing,
fractional-micro, or malformed billing remains ambiguous without an estimate. Reports are safe
local artifacts, and any output path overlapping the authority root is refused.

The authority permits at most USD 5 (5,000,000 micros) per UTC ISO week, with no rollover.
Ambiguous or otherwise unresolved admitted calls retain their reservation hold and block later
paid calls as necessary; they are never guessed as zero cost. Safe artifacts omit raw sources,
model output, request/response bodies, credentials, error causes, and stacks.

Packet 3 excludes private or production-derived capture, automatic/scheduled/CI live evaluations,
retry or fallback models, arbitrary models, release thresholds, model training or leaderboards,
Cloudflare resources and deployment, Event Every and Calendar Casa integration, review/edit/save
UI, publishing, and browser/on-device model work. Packet 4 owns private capture and R2 policy.

## Packet 4 private-capture policy

Import capture policy only from `@event-every/scanner/capture`. Its `test@mannan.is` check is a
byte-exact equality policy, not proof of host session authentication. Eligible orchestration must
durably prepare a frozen snapshot and win its admission claim before the host admits a provider.

Hosts and later packets retain raw bytes, HMAC/AES-GCM, sessions, D1/R2, admin UI, deletion jobs,
and every production effect. Private capture provenance never enters Packet 3 evaluation, and
captured output never becomes expected truth automatically. Scanner verification is offline and
private-data-free; it performs no credential, provider, storage, or paid-live action.
