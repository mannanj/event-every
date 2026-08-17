import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const LEDGER = 'docs/testing/c1-b-private-mutation-ledger.md';
const OUTPUT_LIMIT = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const CREDENTIAL_NAME = /(?:OPENROUTER|ANTHROPIC|API[_-]?KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV[_-]?REST|PASSWORD|CREDENTIAL|AWS_)/i;
const EXPECTED_IDS = Array.from({ length: 25 }, (_, index) => `C1B-M${String(index + 1).padStart(2, '0')}`);

type MutationPreparation = 'open-next';
export type MutationRow = Readonly<{
  id: string;
  guarantee: string;
  target: string;
  before: string;
  after: string;
  command: readonly string[];
  expectedAssertion: string;
  timeoutMs: number;
  prepare?: MutationPreparation;
  environment?: Readonly<Record<string, string>>;
}>;

type SpawnResult = Readonly<{ exitCode: number; output: string }>;
type RunOptions = Readonly<{ cwd: string; env: Record<string, string | undefined>; timeoutMs: number }>;
export type MutationExecution = Readonly<{
  root: string;
  makeSnapshot(): string;
  exportHead(destination: string): void | Promise<void>;
  attachDependencies(snapshot: string): void | Promise<void>;
  run(command: readonly string[], options: RunOptions): SpawnResult | Promise<SpawnResult>;
  remove(target: string): void;
  sourceHashes(): Readonly<Record<string, string>>;
  read?(file: string): string;
  write?(file: string, value: string): void;
}>;

type MutationResult = Readonly<{ id: string; redExit: number; greenExit: number }>;

const bunTest = (file: string, pattern: string): readonly string[] => [
  'bun', 'test', file, '--isolate', '--test-name-pattern', pattern,
];
const workerdTest = (file: string, pattern: string): readonly string[] => [
  'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.workers.ts', file, '-t', pattern,
];

export const C1_B_MUTATIONS: readonly MutationRow[] = Object.freeze([
  {
    id: 'C1B-M01', guarantee: 'A lost claim response cannot permit a second provider transport.',
    target: 'src/platform/cloudflare/provider-request-authority.ts',
    before: "    if (row.state !== 'budget_committed') return observe(row);\n    if (row.transportDeadlineMs === null) return { status: 'conflict' };\n\n    const nonce = randomNonce();\n    const verifier = await permitVerifier(nonce);\n    const alarmNow = authorityNow();\n    await this.armBeforeState(row.transportDeadlineMs, alarmNow);\n    const result: ProviderRequestClaimResult | Readonly<{ status: 'deadline-crossed' }> = this.ctx.storage.transactionSync(() => {\n      const current = this.readRequest();\n      if (!current || current.executionId !== input.executionId) return { status: 'conflict' as const };\n      if (current.state !== 'budget_committed') return observe(current);",
    after: "    if (row.state !== 'budget_committed' && row.state !== 'provider_inflight') return observe(row);\n    if (row.transportDeadlineMs === null) return { status: 'conflict' };\n\n    const nonce = randomNonce();\n    const verifier = await permitVerifier(nonce);\n    const alarmNow = authorityNow();\n    await this.armBeforeState(row.transportDeadlineMs, alarmNow);\n    const result: ProviderRequestClaimResult | Readonly<{ status: 'deadline-crossed' }> = this.ctx.storage.transactionSync(() => {\n      const current = this.readRequest();\n      if (!current || current.executionId !== input.executionId) return { status: 'conflict' as const };\n      if (current.state !== 'budget_committed' && current.state !== 'provider_inflight') return observe(current);",
    command: workerdTest('test/worker/provider-request-authority.integration.test.ts', 'never persists or reissues the raw nonce'),
    expectedAssertion: 'never persists or reissues the raw nonce and verifies a valid nonce after eviction', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M02', guarantee: 'Completion must compare the nonce with the durable permit verifier after eviction.',
    target: 'src/platform/cloudflare/provider-request-authority.ts',
    before: "    if (!await validPermit(nonce, envelopeRow.permitVerifier)) return { status: 'rejected' };",
    after: "    if (false && !await validPermit(nonce, envelopeRow.permitVerifier)) return { status: 'rejected' };",
    command: workerdTest('test/worker/provider-request-authority.integration.test.ts', 'never persists or reissues the raw nonce'),
    expectedAssertion: 'never persists or reissues the raw nonce and verifies a valid nonce after eviction', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M03', guarantee: 'Owner-day reservation admission and insertion are one SQLite transaction.',
    target: 'src/platform/cloudflare/owner-budget-authority.ts',
    before: "    return this.ctx.storage.transactionSync(() => {\n      const concurrentPolicy = this.readPolicy();\n      if (concurrentPolicy && concurrentPolicy.authorityDay !== input.authorityDay) return { status: 'day-mismatch' as const };\n      const concurrent = this.readOperation(input.executionId);\n      if (concurrent) return this.replayReserve(concurrent, concurrentPolicy, input);\n      if (concurrentPolicy?.frozenCode) return exhausted(input.authorityDay);\n\n      if (!concurrentPolicy) {\n        this.ctx.storage.sql.exec(\n          'INSERT INTO owner_budget_policy (authority_day, policy_version, limit_nanodollars, frozen_code, created_at_ms) VALUES (?, ?, ?, NULL, ?)',\n          input.authorityDay,\n          OWNER_POLICY_VERSION,\n          OWNER_DAILY_LIMIT_NANODOLLARS,\n          nowMs,\n        );\n      } else if (concurrentPolicy.policyVersion !== input.policyVersion || concurrentPolicy.limitNanodollars !== OWNER_DAILY_LIMIT_NANODOLLARS) {\n        return { status: 'conflict' as const };\n      }\n\n      const totals = this.readTotals();",
    after: "    return Promise.resolve().then(async () => {\n      const concurrentPolicy = this.readPolicy();\n      if (concurrentPolicy && concurrentPolicy.authorityDay !== input.authorityDay) return { status: 'day-mismatch' as const };\n      const concurrent = this.readOperation(input.executionId);\n      if (concurrent) return this.replayReserve(concurrent, concurrentPolicy, input);\n      if (concurrentPolicy?.frozenCode) return exhausted(input.authorityDay);\n\n      if (!concurrentPolicy) {\n        this.ctx.storage.sql.exec(\n          'INSERT INTO owner_budget_policy (authority_day, policy_version, limit_nanodollars, frozen_code, created_at_ms) VALUES (?, ?, ?, NULL, ?)',\n          input.authorityDay,\n          OWNER_POLICY_VERSION,\n          OWNER_DAILY_LIMIT_NANODOLLARS,\n          nowMs,\n        );\n      } else if (concurrentPolicy.policyVersion !== input.policyVersion || concurrentPolicy.limitNanodollars !== OWNER_DAILY_LIMIT_NANODOLLARS) {\n        return { status: 'conflict' as const };\n      }\n\n      const totals = this.readTotals();\n      await new Promise((resolve) => setTimeout(resolve, 25));",
    command: workerdTest('test/worker/owner-budget-authority.integration.test.ts', 'serializes two real concurrent requests racing for the final daily slot'),
    expectedAssertion: 'serializes two real concurrent requests racing for the final daily slot', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M04', guarantee: 'Committed holds remain outstanding when admitting new owner-day work.',
    target: 'src/platform/cloudflare/owner-budget-authority.ts',
    before: "COALESCE(SUM(CASE WHEN phase IN ('reserved','committed') THEN reservation_nanodollars ELSE 0 END), 0) AS reserved",
    after: "COALESCE(SUM(CASE WHEN phase IN ('reserved') THEN reservation_nanodollars ELSE 0 END), 0) AS reserved",
    command: workerdTest('test/worker/owner-budget-authority.integration.test.ts', 'counts committed holds in admission'),
    expectedAssertion: 'counts committed holds in admission and never moves an RPC alarm later', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M05', guarantee: 'An expired committed hold settles the full reservation rather than releasing it.',
    target: 'src/platform/cloudflare/owner-budget-authority.ts',
    before: "\"UPDATE owner_budget_operation SET phase = 'settled_full', settled_nanodollars = reservation_nanodollars, terminal_at_ms = ? WHERE execution_id = ? AND phase = 'committed' AND committed_until_ms <= ?\"",
    after: "\"UPDATE owner_budget_operation SET phase = 'released', settled_nanodollars = NULL, terminal_at_ms = ? WHERE execution_id = ? AND phase = 'committed' AND committed_until_ms <= ?\"",
    command: workerdTest('test/worker/owner-budget-authority.integration.test.ts', 'lets the durable alarm alone settle an expired committed hold full after eviction'),
    expectedAssertion: 'lets the durable alarm alone settle an expired committed hold full after eviction', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M06', guarantee: 'Missing provider cost consumes the full reservation, never zero.',
    target: 'src/platform/cloudflare/owner-budget-authority.ts',
    before: "  return { phase: 'settled_full', amount: row.reservationNanodollars, breachClass: null, freezeCode: null };",
    after: "  return { phase: 'settled', amount: 0, breachClass: null, freezeCode: null };",
    command: workerdTest('test/worker/owner-budget-authority.integration.test.ts', 'persists a missing cost with the exact durable phase after eviction'),
    expectedAssertion: 'persists a missing cost with the exact durable phase after eviction', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M07', guarantee: 'Provider cost is classified from its exact decimal lexeme before Number conversion.',
    target: 'src/platform/provider/cost.ts',
    before: "  const exact = EXACT_COST.exec(lexeme);\n  if (!exact) return /[1-9]/.test(lexeme.replace(/[eE].*$/, '')) ? { kind: 'positive-overflow' } : { kind: 'malformed' };\n  const [integer, fraction = ''] = lexeme.split('.');",
    after: "  const binaryNanodollars = Number(lexeme) * 1_000_000_000;\n  if (!Number.isSafeInteger(binaryNanodollars)) return { kind: 'positive-overflow' };\n  return { kind: 'exact', nanodollars: binaryNanodollars };\n  const exact = EXACT_COST.exec(lexeme);\n  if (!exact) return /[1-9]/.test(lexeme.replace(/[eE].*$/, '')) ? { kind: 'positive-overflow' } : { kind: 'malformed' };\n  const [integer, fraction = ''] = lexeme.split('.');",
    command: bunTest('src/platform/provider/__tests__/cost.test.ts', 'classifies 0.0000000001 without binary rounding'),
    expectedAssertion: 'classifies 0.0000000001 without binary rounding', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M08', guarantee: 'The client is answered only after minimized replay persistence acknowledges.',
    target: 'src/platform/cloudflare/provider-operation.ts',
    before: "    const completed = await requestAuthority.completeKnown({\n      executionId: observed.executionId,\n      nonce: claim.nonce,\n      replay,\n      costOutcome: finalTransport.costOutcome,\n    });\n    if (completed.status !== 'rejected') return completionResult(completed);",
    after: "    void requestAuthority.completeKnown({\n      executionId: observed.executionId,\n      nonce: claim.nonce,\n      replay,\n      costOutcome: finalTransport.costOutcome,\n    });\n    return { status: 'completed', replay, settlement: 'settlement_pending' };",
    command: bunTest('src/platform/provider/__tests__/operation.test.ts', 'runs the exact durable sequence before one transport and stores completion before return'),
    expectedAssertion: 'runs the exact durable sequence before one transport and stores completion before return', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M09', guarantee: 'An ambiguous durable result is replayed without another provider transport.',
    target: 'src/platform/cloudflare/provider-operation.ts',
    before: "  if (isTerminal(observed)) return observed;",
    after: "  if (isTerminal(observed)) {\n    if (observed.status === 'unknown') {\n      await resolved.callProvider({ consumerKind: CONSUMER_BY_VARIANT[input.variant], apiKey: resolved.ownerKey, providerBody: { messages: [] }, signal: input.signal });\n    }\n    return observed;\n  }",
    command: bunTest('src/platform/provider/__tests__/operation.test.ts', 'replays a durable terminal after a lost request.completeUnknown response'),
    expectedAssertion: 'replays a durable terminal after a lost request.completeUnknown response', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M10', guarantee: 'Idempotency binds the normalized request shape and its key version.',
    target: 'src/platform/cloudflare/provider-request-authority.ts',
    before: "function sameBeginBinding(row: RequestRow, input: ProviderRequestBeginInput): boolean {\n  const matching = input.bindingCandidates.find(({ version }) => version === row.shapeKeyVersion);\n  return row.requestDigest === input.requestDigest\n    && row.route === input.route\n    && row.variant === input.variant\n    && row.policyVersion === input.policyVersion\n    && row.reservationNanodollars === input.reservationNanodollars\n    && matching?.digest === row.shapeDigest;\n}",
    after: "function sameBeginBinding(row: RequestRow, input: ProviderRequestBeginInput): boolean {\n  return row.requestDigest === input.requestDigest\n    && row.route === input.route\n    && row.variant === input.variant\n    && row.policyVersion === input.policyVersion\n    && row.reservationNanodollars === input.reservationNanodollars\n    && input.bindingCandidates.length > 0;\n}",
    command: workerdTest('test/worker/provider-request-authority.integration.test.ts', 'freezes the original day and matching key version across midnight'),
    expectedAssertion: 'freezes the original day and matching key version across midnight and accepts a previous-key retry', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M11', guarantee: 'A cross-midnight retry keeps the original frozen UTC authority day.',
    target: 'src/platform/cloudflare/provider-request-authority.ts',
    before: "    if (existing) return sameBeginBinding(existing, input) ? observe(existing) : { status: 'conflict' };",
    after: "    if (existing) return sameBeginBinding(existing, input) ? { ...observe(existing), authorityDay: input.proposedAuthorityDay } : { status: 'conflict' };",
    command: workerdTest('test/worker/provider-request-authority.integration.test.ts', 'freezes the original day and matching key version across midnight'),
    expectedAssertion: 'freezes the original day and matching key version across midnight and accepts a previous-key retry', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M12', guarantee: 'Provider non-success bodies are cancelled without being materialized.',
    target: 'src/platform/provider/transport.ts',
    before: "    await cancelStatusBody(response);",
    after: "    await response.text();",
    command: bunTest('src/platform/provider/__tests__/transport.test.ts', 'never reads status 302 and cancels its body exactly once'),
    expectedAssertion: 'never reads status 302 and cancels its body exactly once', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M13', guarantee: 'Durable Scanner replay removes evidence and provider-authored message data.',
    target: 'src/platform/provider/replay.ts',
    before: "const projectClaim = (value: unknown) => { const parsed = rawClaim.safeParse(value); if (!parsed.success || !parsed.data) return invalid(); return { value: parsed.data.value, confidence: parsed.data.confidence, evidence: [] as never[] }; };",
    after: "const projectClaim = (value: unknown) => { const parsed = rawClaim.safeParse(value); if (!parsed.success || !parsed.data) return invalid(); return { value: typeof parsed.data.value === 'string' && parsed.data.evidence.length > 0 ? `${parsed.data.value} provider authored ${JSON.stringify(parsed.data.evidence)}` : parsed.data.value, confidence: parsed.data.confidence, evidence: [] as never[] }; };",
    command: bunTest('src/platform/provider/__tests__/replay.test.ts', 'retains only strict local source/candidate ids'),
    expectedAssertion: 'retains only strict local source/candidate ids and byte-replays serialized projection including top-level issues', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M14', guarantee: 'A lost browser response keeps the original UUID and switches to status polling.',
    target: 'src/services/scanClient.ts',
    before: "  } catch (error) {\n    if (signal?.aborted) throw error;\n    return resumeProviderOperation(operation, (replay) => ScanResponseSchema.parse(replay), signal);\n  }",
    after: "  } catch (error) {\n    if (signal?.aborted) throw error;\n    try {\n      await fetch('/api/scan', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json', 'X-Event-Every-Request-Id': crypto.randomUUID() },\n        body: JSON.stringify(admittedRequest),\n        signal,\n      });\n    } catch { /* replacement response remains ambiguous */ }\n    return resumeProviderOperation(operation, (replay) => ScanResponseSchema.parse(replay), signal);\n  }",
    command: bunTest('src/services/__tests__/scanClient.test.ts', 'network ambiguity polls status with the same UUID and never repeats the provider POST'),
    expectedAssertion: 'network ambiguity polls status with the same UUID and never repeats the provider POST', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M15', guarantee: 'The private worker accepts only the owner key and has no API-key fallback.',
    target: 'src/platform/cloudflare-context.ts',
    before: "  if (!env.PROVIDER_REQUEST_AUTHORITY || !env.OWNER_BUDGET_AUTHORITY || !nonempty(env.OPENROUTER_OWNER_KEY)) {\n    throw new Error('provider_state_unavailable');\n  }\n  return {\n    requestAuthority: env.PROVIDER_REQUEST_AUTHORITY,\n    ownerBudgetAuthority: env.OWNER_BUDGET_AUTHORITY,\n    ownerKey: env.OPENROUTER_OWNER_KEY,\n  };",
    after: "  const ownerKey = env.OPENROUTER_OWNER_KEY || (env as ProviderBindingEnv & { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY;\n  if (!env.PROVIDER_REQUEST_AUTHORITY || !env.OWNER_BUDGET_AUTHORITY || !nonempty(ownerKey)) {\n    throw new Error('provider_state_unavailable');\n  }\n  return {\n    requestAuthority: env.PROVIDER_REQUEST_AUTHORITY,\n    ownerBudgetAuthority: env.OWNER_BUDGET_AUTHORITY,\n    ownerKey,\n  };",
    command: bunTest('src/platform/__tests__/runtime.test.ts', 'accepts only the dedicated owner key'),
    expectedAssertion: 'accepts only the dedicated owner key with no API-key fallback', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M16', guarantee: 'The retired waitlist route returns 410 before OpenNext delegation.',
    target: 'src/platform/route-manifest.ts',
    before: "'/api/waitlist': policy('POST', 4 * 1024, true)",
    after: "'/api/waitlist': policy('POST', 4 * 1024)",
    command: bunTest('src/platform/__tests__/admission.test.ts', 'retires /api/waitlist with fixed 410 before identity or body read'),
    expectedAssertion: 'retires /api/waitlist with fixed 410 before identity or body read', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M17', guarantee: 'Each provider model is fixed in source and cannot be selected by environment.',
    target: 'src/platform/provider/transport.ts',
    before: "  const model = OWNER_MODELS[VARIANT_BY_CONSUMER[consumerKind]];",
    after: "  const model = process.env.CI ?? OWNER_MODELS[VARIANT_BY_CONSUMER[consumerKind]];",
    command: bunTest('src/platform/provider/__tests__/transport.test.ts', 'pins scan_text to its complete policy request shape'),
    expectedAssertion: 'pins scan_text to its complete policy request shape', timeoutMs: DEFAULT_TIMEOUT_MS,
    environment: { CI: 'synthetic/environment-selected-model' },
  },
  {
    id: 'C1B-M18', guarantee: 'Provider redirects remain manual at the fixed origin.',
    target: 'src/platform/provider/transport.ts',
    before: "      redirect: 'manual',",
    after: "      redirect: 'follow',",
    command: bunTest('src/platform/provider/__tests__/transport.test.ts', 'uses only the fixed origin, exact headers/body, manual redirects, and caller signal'),
    expectedAssertion: 'uses only the fixed origin, exact headers/body, manual redirects, and caller signal', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M19', guarantee: 'Terminal deadline and outbox state never commit before a durable alarm.',
    target: 'src/platform/cloudflare/provider-request-authority.ts',
    before: "    await this.armBeforeState(alarmNow, alarmNow);",
    after: "    void alarmNow;",
    command: workerdTest('test/worker/provider-request-authority.integration.test.ts', 'durably arms no later than a terminal outbox row'),
    expectedAssertion: 'important finding 1: durably arms no later than a terminal outbox row and recovers after commit by alarm only', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M20', guarantee: 'Transport timeout is derived from the authority absolute deadline, not retry time.',
    target: 'src/platform/cloudflare/provider-operation.ts',
    before: "  const afterClaimNow = resolved.now();",
    after: "  const afterClaimNow = resolved.now() - 14 * 60_000;",
    command: bunTest('src/platform/provider/__tests__/operation.test.ts', 'turns now=1786623240000 into unknown without transport'),
    expectedAssertion: 'turns now=1786623240000 into unknown without transport', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M21', guarantee: 'Browser polling persists past 750 ms and never creates a replacement UUID.',
    target: 'src/services/providerOperation.ts',
    before: "  await deps.wait(BACKOFF_MS[0], signal);\n  backoffIndex = 1;",
    after: "  await deps.wait(750, signal);\n  record = parseProviderOperation({ ...record, requestId: deps.requestId() });\n  throw new Error('Provider polling abandoned after 750 ms.');",
    command: bunTest('src/services/__tests__/providerOperation.test.ts', 'polls one UUID with exact capped backoff and no replacement POST'),
    expectedAssertion: 'polls one UUID with exact capped backoff and no replacement POST', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M22', guarantee: 'A positive exponent cost is overflow, never ordinary missing accounting.',
    target: 'src/platform/provider/cost.ts',
    before: "  if (!exact) return /[1-9]/.test(lexeme.replace(/[eE].*$/, '')) ? { kind: 'positive-overflow' } : { kind: 'malformed' };",
    after: "  if (!exact) return /[1-9]/.test(lexeme.replace(/[eE].*$/, '')) ? { kind: 'missing' } : { kind: 'malformed' };",
    command: bunTest('src/platform/provider/__tests__/cost.test.ts', 'classifies 1e100 without binary rounding'),
    expectedAssertion: 'classifies 1e100 without binary rounding', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M23', guarantee: 'Concurrent above-reservation settlements store one actual amount and one full hold.',
    target: 'src/platform/cloudflare/owner-budget-authority.ts',
    before: "    if (policy.frozenCode) {",
    after: "    if (false && policy.frozenCode) {",
    command: workerdTest('test/worker/owner-budget-authority.integration.test.ts', 'serializes concurrent above-reservation settlements into one primary and one secondary breach'),
    expectedAssertion: 'serializes concurrent above-reservation settlements into one primary and one secondary breach', timeoutMs: 120_000, prepare: 'open-next',
  },
  {
    id: 'C1B-M24', guarantee: 'Reload polls the original local operation before deletion and status remains read-only.',
    target: 'src/services/providerOperation.ts',
    before: "    try {\n      const replay = await resumeProviderOperation(record, (value) => value, signal);",
    after: "    try {\n      await acknowledgeProviderOperation(record.requestId);\n      const replay = await resumeProviderOperation(record, (value) => value, signal);",
    command: ['bun', 'test', 'src/services/__tests__/providerOperation.test.ts', 'src/services/__tests__/scanClient.test.ts', 'src/app/api/provider-status/__tests__/route.test.ts', '--isolate'],
    expectedAssertion: 'reload delivery is acknowledged before deletion', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  {
    id: 'C1B-M25', guarantee: 'The privacy preload rejects non-loopback global fetch before its captured seam.',
    target: 'scripts/private-offline-preload.cjs',
    before: "if (typeof globalThis.fetch === 'function') {\n  const originalFetch = globalThis.fetch;\n  globalThis.fetch = function privateOfflineFetch(input, init) {\n    requireTarget(input, init, 'fetch');\n    return originalFetch.call(this, input, init);\n  };\n}",
    after: "void globalThis.fetch;",
    command: bunTest('scripts/run-private-offline.test.ts', 'blocks an unhandled provider request before the captured native fetch seam'),
    expectedAssertion: 'blocks an unhandled provider request before the captured native fetch seam', timeoutMs: DEFAULT_TIMEOUT_MS,
  },
]);

function fail(message: string): never {
  throw new Error(`C1-B mutations: ${message}`);
}

function count(value: string, needle: string): number {
  if (!needle) return 0;
  return value.split(needle).length - 1;
}

function allowlist(root: string): Set<string> {
  return new Set(readFileSync(path.join(root, 'scripts/c1-b-owned-paths.txt'), 'utf8').split(/\r?\n/).filter(Boolean));
}

export function validateMutationManifest(rows: readonly MutationRow[], root: string): void {
  if (rows.length !== EXPECTED_IDS.length || rows.some((row, index) => row.id !== EXPECTED_IDS[index])) fail('manifest IDs are not the exact closed set');
  if (new Set(rows.map(({ id }) => id)).size !== rows.length) fail('manifest contains duplicate IDs');
  const owned = allowlist(root);
  for (const row of rows) {
    if (!owned.has(row.target) || !/^(?:src|cloudflare|scripts)\//.test(row.target)) fail(`${row.id} target is outside the C1-B allowlist`);
    if (!row.before || row.before === row.after) fail(`${row.id} edit is empty or a no-op`);
    if (!row.command.length || !row.command.every(Boolean) || row.expectedAssertion.length < 12) fail(`${row.id} focused proof is incomplete`);
    const source = readFileSync(path.join(root, row.target), 'utf8');
    if (count(source, row.before) !== 1) fail(`${row.id} anchor must match exactly once`);
    if (source.includes(row.after)) fail(`${row.id} edit is already present`);
  }
}

export function parseMutationArguments(argv: readonly string[]): Readonly<{ mode: 'write' | 'verify' }> {
  if (argv.length === 1 && argv[0] === '--write-ledger') return { mode: 'write' };
  if (argv.length === 1 && argv[0] === '--verify-ledger') return { mode: 'verify' };
  fail('usage: bun scripts/run-c1-b-mutations.ts --write-ledger|--verify-ledger');
}

export function createMutationEnvironment(
  source: Record<string, string | undefined>,
  root: string,
  ownedTemp: string,
  additions: Readonly<Record<string, string>> = {},
  guardRoot = root,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const name of ['PATH', 'USER', 'LANG', 'LC_ALL', 'TERM', 'CI', 'SYSTEMROOT', 'WINDIR']) {
    if (source[name] !== undefined && !CREDENTIAL_NAME.test(name)) env[name] = source[name];
  }
  const roots = guardRoot === root ? [root] : [guardRoot, root];
  env.NODE_OPTIONS = roots.map((value) => `--require=${path.join(value, 'scripts/private-offline-preload.cjs')}`).join(' ');
  env.BUN_OPTIONS = roots.map((value) => `--preload=${path.join(value, 'scripts/private-offline-preload.cjs')}`).join(' ');
  env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  env.TMPDIR = ownedTemp;
  env.TMP = ownedTemp;
  env.TEMP = ownedTemp;
  for (const [name, value] of Object.entries(additions)) {
    if (CREDENTIAL_NAME.test(name) || CREDENTIAL_NAME.test(value)) fail('mutation environment contains a credential-shaped value');
    env[name] = value;
  }
  return env;
}

function hash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sameRecord(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

function workerdEnvironment(env: Record<string, string | undefined>, snapshot: string): Record<string, string | undefined> {
  return {
    ...env,
    NODE_OPTIONS: `--require=${path.join(snapshot, 'scripts/c1-a-offline-preload.cjs')}`,
    BUN_OPTIONS: undefined,
    WRANGLER_WRITE_LOGS: 'false',
    WRANGLER_SEND_METRICS: 'false',
  };
}

function boundedAppend(current: string, chunk: Uint8Array): string {
  if (current.length >= OUTPUT_LIMIT) return current;
  return `${current}${new TextDecoder().decode(chunk)}`.slice(0, OUTPUT_LIMIT);
}

async function runChild(command: readonly string[], options: RunOptions): Promise<SpawnResult> {
  const [program, ...args] = command;
  if (!program) return { exitCode: 1, output: '' };
  return new Promise((resolve) => {
    let output = '';
    let settled = false;
    let child;
    try {
      child = spawn(program, args, {
        cwd: options.cwd,
        env: options.env as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch {
      resolve({ exitCode: 1, output: '' });
      return;
    }
    child.stdout.on('data', (chunk: Uint8Array) => { output = boundedAppend(output, chunk); });
    child.stderr.on('data', (chunk: Uint8Array) => { output = boundedAppend(output, chunk); });
    const terminate = (signal: NodeJS.Signals): void => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* already exited */ }
    };
    const timer = setTimeout(() => {
      terminate('SIGTERM');
      setTimeout(() => terminate('SIGKILL'), 1_000).unref();
    }, options.timeoutMs);
    const done = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, output });
    };
    child.once('error', () => done(1));
    child.once('exit', (code, signal) => done(signal ? 128 : code ?? 1));
  });
}

function exportCommittedHead(root: string, destination: string): void {
  const archive = path.join(destination, '.c1-b-head.tar');
  const archived = Bun.spawnSync(['git', 'archive', '--format=tar', '--output', archive, 'HEAD'], { cwd: root, stdout: 'ignore', stderr: 'ignore' });
  if (archived.exitCode !== 0) fail('could not export committed HEAD');
  const extracted = Bun.spawnSync(['tar', '-xf', archive, '-C', destination], { cwd: root, stdout: 'ignore', stderr: 'ignore' });
  unlinkSync(archive);
  if (extracted.exitCode !== 0) fail('could not extract committed HEAD');
}

export function createDefaultMutationExecution(root: string, rows: readonly MutationRow[] = C1_B_MUTATIONS): MutationExecution {
  const targets = [...new Set(rows.map(({ target }) => target))];
  return {
    root,
    makeSnapshot: () => mkdtempSync(path.join(tmpdir(), 'event-every-c1-b-mutation-')),
    exportHead: (destination) => exportCommittedHead(root, destination),
    attachDependencies(snapshot) {
      const dependencies = path.join(root, 'node_modules');
      if (!lstatSync(dependencies).isDirectory()) fail('existing dependency tree is unavailable');
      symlinkSync(dependencies, path.join(snapshot, 'node_modules'), 'dir');
      if (!lstatSync(path.join(snapshot, 'node_modules')).isSymbolicLink()) fail('dependency attachment is not a symlink');
    },
    run: runChild,
    remove: (target) => rmSync(target, { recursive: true, force: true }),
    sourceHashes: () => Object.fromEntries(targets.map((target) => [target, hash(path.join(root, target))])),
  };
}

async function prepareSnapshot(row: MutationRow, _execution: MutationExecution, snapshot: string, _env: Record<string, string | undefined>): Promise<void> {
  if (row.prepare !== 'open-next') return;
  for (const output of ['.open-next', '.wrangler']) rmSync(path.join(snapshot, output), { recursive: true, force: true });
  const assets = path.join(snapshot, '.open-next/assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(
    path.join(snapshot, '.open-next/worker.js'),
    "export default { fetch() { return new Response(null, { status: 404 }); } };\n",
  );
  if (!existsSync(path.join(snapshot, '.open-next/worker.js'))) fail(`${row.id} focused setup failed`);
}

export async function runMutationRows(rows: readonly MutationRow[], execution: MutationExecution): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  const read = execution.read ?? ((file: string) => readFileSync(file, 'utf8'));
  const write = execution.write ?? ((file: string, value: string) => writeFileSync(file, value));
  for (const row of rows) {
    const sourceBefore = execution.sourceHashes();
    const snapshot = execution.makeSnapshot();
    try {
      await execution.exportHead(snapshot);
      await execution.attachDependencies(snapshot);
      const target = path.join(snapshot, row.target);
      const original = read(target);
      if (count(original, row.before) !== 1) fail(`${row.id} anchor must match exactly once in committed HEAD`);
      write(target, original.replace(row.before, row.after));
      const mutated = read(target);
      if (count(mutated, row.after) !== 1 || mutated === original) fail(`${row.id} edit did not apply exactly once`);
      const ownedTemp = path.join(snapshot, '.c1-b-mutation-tmp');
      mkdirSync(ownedTemp, { recursive: true });
      const env = createMutationEnvironment(process.env, snapshot, ownedTemp, row.environment, execution.root);
      const commandEnv = row.prepare === 'open-next' ? workerdEnvironment(env, snapshot) : env;
      await prepareSnapshot(row, execution, snapshot, env);
      const red = await execution.run(row.command, { cwd: snapshot, env: commandEnv, timeoutMs: row.timeoutMs });
      if (red.exitCode === 0) fail(`${row.id} green mutant`);
      if (!red.output.includes(row.expectedAssertion)) fail(`${row.id} did not fail its expected assertion`);

      write(target, original);
      if (read(target) !== original) fail(`${row.id} target did not restore`);
      await prepareSnapshot(row, execution, snapshot, env);
      const green = await execution.run(row.command, { cwd: snapshot, env: commandEnv, timeoutMs: row.timeoutMs });
      if (green.exitCode !== 0) fail(`${row.id} restored committed code is not green`);
      results.push({ id: row.id, redExit: red.exitCode, greenExit: green.exitCode });
    } finally {
      execution.remove(snapshot);
      if (existsSync(snapshot)) fail(`${row.id} left a temporary snapshot`);
      if (!sameRecord(sourceBefore, execution.sourceHashes())) fail(`${row.id} changed source hashes`);
    }
  }
  return results;
}

function cell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderMutationLedger(rows: readonly MutationRow[], results: readonly MutationResult[]): string {
  const byId = new Map(results.map((result) => [result.id, result]));
  const lines = [
    '# C1-B private-state causal mutation ledger',
    '',
    '| ID | Guarantee | Production file | Focused command | Expected assertion | Observed nonzero exit | Restored green |',
    '|---|---|---|---|---|---:|---|',
  ];
  for (const row of rows) {
    const result = byId.get(row.id);
    if (!result || result.redExit === 0 || result.greenExit !== 0) fail(`ledger result is incomplete for ${row.id}`);
    lines.push(`| ${row.id} | ${cell(row.guarantee)} | ${cell(row.target)} | \`${cell(row.command.join(' '))}\` | ${cell(row.expectedAssertion)} | ${result.redExit} | PASS |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const root = path.resolve(import.meta.dir, '..');
  const { mode } = parseMutationArguments(process.argv.slice(2));
  validateMutationManifest(C1_B_MUTATIONS, root);
  const results = await runMutationRows(C1_B_MUTATIONS, createDefaultMutationExecution(root));
  const ledger = renderMutationLedger(C1_B_MUTATIONS, results);
  const ledgerPath = path.join(root, LEDGER);
  if (mode === 'write') writeFileSync(ledgerPath, ledger);
  else if (!existsSync(ledgerPath) || readFileSync(ledgerPath, 'utf8') !== ledger) fail('ledger differs from deterministic mutation results');
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'C1-B mutations: failed');
    process.exitCode = 1;
  }
}
