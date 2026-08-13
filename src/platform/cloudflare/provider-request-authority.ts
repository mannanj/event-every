// @ts-expect-error cloudflare:workers is provided by Workerd, not the Next.js type graph.
import { DurableObject } from 'cloudflare:workers';
import type {
  DurableObjectStateLike,
  OwnerBudgetBinding,
  OwnerBudgetReleaseResult,
  OwnerBudgetSettleResult,
  OwnerBudgetSettlementInput,
  ProviderBindingCandidate,
  ProviderRequestBeginInput,
  ProviderRequestBeginResult,
  ProviderRequestClaimResult,
  ProviderRequestCompletedResult,
  ProviderRequestCompletionResult,
  ProviderRequestExpiredResult,
  ProviderRequestFailedResult,
  ProviderRequestObservedResult,
  ProviderRequestPendingResult,
  ProviderRequestRecordResult,
  ProviderRequestSettlementState,
  ProviderRequestStatusResult,
  ProviderRequestUnknownResult,
} from '../contracts';
import type { CostOutcome, StoredProviderFailure } from '../provider/contracts';
import {
  OWNER_DAILY_LIMIT_NANODOLLARS,
  OWNER_POLICY_VERSION,
  OWNER_VARIANT_POLICY,
  PRE_PERMIT_LEASE_MS,
  REPLAY_RETENTION_MS,
} from '../provider/policy';
import {
  DurableScanReplaySchema,
  DurableSummaryReplaySchema,
  DurableTimezoneReplaySchema,
} from '../provider/replay';

const ALARM_SAFETY_MS = 30_000;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 5 * 60_000;
const MAX_PRIMARY_ACTUAL_NANODOLLARS = Number.MAX_SAFE_INTEGER - OWNER_DAILY_LIMIT_NANODOLLARS;
const REQUEST_DIGEST = /^[0-9a-f]{64}$/;
const SHAPE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[0-9a-f]{64}$/;
const BEGIN_KEYS = ['bindingCandidates', 'policyVersion', 'proposedAuthorityDay', 'requestDigest', 'reservationNanodollars', 'route', 'variant'];
const CANDIDATE_KEYS = ['digest', 'version'];
const RESERVATION_KEYS = ['authorityDay', 'executionId', 'reservationNanodollars'];
const BUDGET_COMMIT_KEYS = ['committedUntilMs', 'executionId', 'transportDeadlineMs'];
const CLAIM_KEYS = ['executionId'];
const COMPLETE_KNOWN_KEYS = ['costOutcome', 'executionId', 'nonce', 'replay'];
const COMPLETE_FAILED_KEYS = ['code', 'costOutcome', 'executionId', 'httpStatus', 'nonce'];
const COMPLETE_UNKNOWN_KEYS = ['code', 'executionId', 'nonce'];
const STATUS_KEYS: readonly string[] = [];
const PERMIT_DOMAIN = 'event-every/provider-permit/v1\0';
const text = new TextEncoder();

type ActiveState = 'prepared' | 'reserved' | 'budget_committed' | 'provider_inflight' | 'completed' | 'failed' | 'unknown' | 'expired';
type TerminalClass = 'completed' | 'failed' | 'unknown' | 'expired';
type RequestRow = Readonly<{
  requestDigest: string;
  executionId: string;
  route: ProviderRequestBeginInput['route'];
  variant: ProviderRequestBeginInput['variant'];
  shapeDigest: string;
  shapeKeyVersion: string;
  authorityDay: string;
  policyVersion: string;
  reservationNanodollars: number;
  state: ActiveState;
  settlementState: ProviderRequestSettlementState | null;
  createdAtMs: number;
  phaseDeadlineMs: number;
  transportDeadlineMs: number | null;
  committedUntilMs: number | null;
  permitVerifier: string | null;
  replayJson: string | null;
  errorCode: StoredProviderFailure['code'] | null;
  httpStatus: 502 | 503 | 504 | null;
  costKind: CostOutcome['kind'] | null;
  costNanodollars: number | null;
  terminalClass: TerminalClass | null;
  terminalAtMs: number | null;
  replayExpiresAtMs: number | null;
}>;
type OutboxRow = Readonly<{
  executionId: string;
  operation: 'release' | 'settle';
  costKind: CostOutcome['kind'];
  costNanodollars: number | null;
  retryCount: number;
  nextAttemptMs: number;
}>;
type TombstoneRow = Readonly<{
  requestDigest: string;
  executionId: string;
  terminalClass: TerminalClass;
  state: 'expired';
}>;
type SchemaColumn = Readonly<{
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}>;
type OwnerBudgetStub = Readonly<{
  release(input: OwnerBudgetBinding): Promise<OwnerBudgetReleaseResult>;
  settle(input: OwnerBudgetSettlementInput): Promise<OwnerBudgetSettleResult>;
}>;
type OwnerBudgetNamespace = Readonly<{
  idFromName(name: string): unknown;
  get(id: unknown): OwnerBudgetStub;
}>;
type RequestAuthorityEnv = Readonly<{ OWNER_BUDGET_AUTHORITY: OwnerBudgetNamespace }>;

const REQUEST_COLUMNS: readonly SchemaColumn[] = [
  { cid: 0, name: 'request_digest', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'execution_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 2, name: 'route', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 3, name: 'variant', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 4, name: 'shape_digest', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 5, name: 'shape_key_version', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 6, name: 'authority_day', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 7, name: 'policy_version', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 8, name: 'reservation_nanodollars', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 9, name: 'state', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 10, name: 'settlement_state', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 11, name: 'created_at_ms', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 12, name: 'phase_deadline_ms', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 13, name: 'transport_deadline_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 14, name: 'committed_until_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 15, name: 'permit_verifier', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 16, name: 'replay_json', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 17, name: 'error_code', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 18, name: 'http_status', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 19, name: 'cost_kind', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 20, name: 'cost_nanodollars', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 21, name: 'terminal_class', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 22, name: 'terminal_at_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 23, name: 'replay_expires_at_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
];
const OUTBOX_COLUMNS: readonly SchemaColumn[] = [
  { cid: 0, name: 'execution_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'operation', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 2, name: 'cost_kind', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 3, name: 'cost_nanodollars', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 4, name: 'retry_count', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 5, name: 'next_attempt_ms', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
];
const TOMBSTONE_COLUMNS: readonly SchemaColumn[] = [
  { cid: 0, name: 'request_digest', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'execution_id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 2, name: 'terminal_class', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 3, name: 'state', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
];
const STATE_CHECK = /CHECK\s*\(\s*state\s+IN\s*\(\s*'prepared'\s*,\s*'reserved'\s*,\s*'budget_committed'\s*,\s*'provider_inflight'\s*,\s*'completed'\s*,\s*'failed'\s*,\s*'unknown'\s*,\s*'expired'\s*\)\s*\)/i;
const SETTLEMENT_CHECK = /CHECK\s*\(\s*settlement_state\s+IN\s*\(\s*'settlement_pending'\s*,\s*'settlement_complete'\s*\)\s*\)/i;
const EXECUTION_ID_UNIQUE = /execution_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i;
const OUTBOX_OPERATION_CHECK = /CHECK\s*\(\s*operation\s+IN\s*\(\s*'release'\s*,\s*'settle'\s*\)\s*\)/i;
const OUTBOX_COST_CHECK = /CHECK\s*\(\s*cost_kind\s+IN\s*\(\s*'exact'\s*,\s*'missing'\s*,\s*'malformed'\s*,\s*'positive-overflow'\s*\)\s*\)/i;
const TOMBSTONE_TERMINAL_CHECK = /CHECK\s*\(\s*terminal_class\s+IN\s*\(\s*'completed'\s*,\s*'failed'\s*,\s*'unknown'\s*,\s*'expired'\s*\)\s*\)/i;
const TOMBSTONE_STATE_CHECK = /CHECK\s*\(\s*state\s*=\s*'expired'\s*\)/i;

export class ProviderRequestAuthority extends DurableObject<RequestAuthorityEnv> {
  private readonly ctx: DurableObjectStateLike;
  private readonly requestEnv: RequestAuthorityEnv;

  constructor(ctx: DurableObjectStateLike, env: RequestAuthorityEnv) {
    super(ctx, env);
    this.ctx = ctx;
    this.requestEnv = env;
    ctx.blockConcurrencyWhile(async () => {
      this.createSchema();
      this.validateSchema();
      await this.repairAlarmFromRpc(authorityNow());
    });
  }

  async begin(input: ProviderRequestBeginInput): Promise<ProviderRequestBeginResult> {
    if (!validBeginInput(input)) return { status: 'conflict' };
    const nowMs = await this.sweepAtRpcStart();
    const tombstone = this.readTombstone();
    if (tombstone) return observeTombstone(tombstone);
    const existing = this.readRequest();
    if (existing) return sameBeginBinding(existing, input) ? observe(existing) : { status: 'conflict' };

    const reservedUntilMs = safeAdd(nowMs, PRE_PERMIT_LEASE_MS);
    await this.armBeforeState(reservedUntilMs, nowMs);
    return this.ctx.storage.transactionSync(() => {
      const concurrentTombstone = this.readTombstone();
      if (concurrentTombstone) return observeTombstone(concurrentTombstone);
      const concurrent = this.readRequest();
      if (concurrent) return sameBeginBinding(concurrent, input) ? observe(concurrent) : { status: 'conflict' as const };
      const candidate = input.bindingCandidates[0];
      const executionId = crypto.randomUUID();
      this.ctx.storage.sql.exec(`INSERT INTO provider_request (
        request_digest, execution_id, route, variant, shape_digest, shape_key_version,
        authority_day, policy_version, reservation_nanodollars, state, settlement_state,
        created_at_ms, phase_deadline_ms, transport_deadline_ms, committed_until_ms,
        permit_verifier, replay_json, error_code, http_status, cost_kind,
        cost_nanodollars, terminal_class, terminal_at_ms, replay_expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
      input.requestDigest,
      executionId,
      input.route,
      input.variant,
      candidate.digest,
      candidate.version,
      input.proposedAuthorityDay,
      input.policyVersion,
      input.reservationNanodollars,
      nowMs,
      reservedUntilMs);
      return observe(this.readRequestRequired());
    });
  }

  async recordReservation(input: Readonly<{ executionId: string; authorityDay: string; reservationNanodollars: number }>): Promise<ProviderRequestRecordResult> {
    if (!validReservationInput(input)) return { status: 'conflict' };
    const nowMs = await this.sweepAtRpcStart();
    const row = this.readRequest();
    if (!row || !sameReservation(row, input)) return { status: 'conflict' };
    if (row.state === 'reserved') return { status: 'recorded', phase: 'reserved' };
    if (row.state !== 'prepared') return { status: 'conflict' };

    await this.armBeforeState(row.phaseDeadlineMs, nowMs);
    return this.ctx.storage.transactionSync(() => {
      const current = this.readRequest();
      if (!current || !sameReservation(current, input)) return { status: 'conflict' as const };
      if (current.state === 'reserved') return { status: 'recorded' as const, phase: 'reserved' as const };
      if (current.state !== 'prepared') return { status: 'conflict' as const };
      this.ctx.storage.sql.exec("UPDATE provider_request SET state = 'reserved' WHERE execution_id = ? AND state = 'prepared'", input.executionId);
      return { status: 'recorded' as const, phase: 'reserved' as const };
    });
  }

  async recordBudgetCommitted(input: Readonly<{ executionId: string; transportDeadlineMs: number; committedUntilMs: number }>): Promise<ProviderRequestRecordResult> {
    if (!validBudgetCommitInput(input)) return { status: 'conflict' };
    const nowMs = await this.sweepAtRpcStart();
    const row = this.readRequest();
    if (!row || row.executionId !== input.executionId) return { status: 'conflict' };
    if (row.state === 'budget_committed' && sameCommittedDeadlines(row, input)) return committedRecord(row);
    if (row.state !== 'reserved') return { status: 'conflict' };

    await this.armBeforeState(input.transportDeadlineMs, nowMs);
    return this.ctx.storage.transactionSync(() => {
      const current = this.readRequest();
      if (!current || current.executionId !== input.executionId) return { status: 'conflict' as const };
      if (current.state === 'budget_committed' && sameCommittedDeadlines(current, input)) return committedRecord(current);
      if (current.state !== 'reserved') return { status: 'conflict' as const };
      this.ctx.storage.sql.exec(`UPDATE provider_request SET state = 'budget_committed',
        phase_deadline_ms = ?, transport_deadline_ms = ?, committed_until_ms = ?
        WHERE execution_id = ? AND state = 'reserved'`,
      input.transportDeadlineMs, input.transportDeadlineMs, input.committedUntilMs, input.executionId);
      return committedRecord(this.readRequestRequired());
    });
  }

  async claimTransport(input: Readonly<{ executionId: string }>): Promise<ProviderRequestClaimResult> {
    if (!validClaimInput(input)) return { status: 'conflict' };
    await this.sweepAtRpcStart();
    const row = this.readRequest();
    if (!row || row.executionId !== input.executionId) return { status: 'conflict' };
    if (row.state !== 'budget_committed') return observe(row);
    if (row.transportDeadlineMs === null) return { status: 'conflict' };

    const nonce = randomNonce();
    const verifier = await permitVerifier(nonce);
    const alarmNow = authorityNow();
    await this.armBeforeState(row.transportDeadlineMs, alarmNow);
    const result: ProviderRequestClaimResult | Readonly<{ status: 'deadline-crossed' }> = this.ctx.storage.transactionSync(() => {
      const current = this.readRequest();
      if (!current || current.executionId !== input.executionId) return { status: 'conflict' as const };
      if (current.state !== 'budget_committed') return observe(current);
      if (current.transportDeadlineMs === null) return { status: 'conflict' as const };
      const transactionNow = authorityNow();
      if (transactionNow >= current.transportDeadlineMs) {
        this.writeUnknown(current, transactionNow);
        return { status: 'deadline-crossed' as const };
      }
      this.ctx.storage.sql.exec(`UPDATE provider_request SET state = 'provider_inflight', permit_verifier = ?
        WHERE execution_id = ? AND state = 'budget_committed'`, verifier, input.executionId);
      return { status: 'permit' as const, nonce, transportDeadlineMs: current.transportDeadlineMs };
    });
    if (result.status === 'deadline-crossed') {
      await this.drainDueOutbox(authorityNow());
      await this.repairAlarmFromRpc(authorityNow());
      return observeUnknown(this.readRequestRequired());
    }
    return result;
  }

  async completeKnown(input: Readonly<{ executionId: string; nonce: string; replay: unknown; costOutcome: CostOutcome }>): Promise<ProviderRequestCompletionResult> {
    if (!validKnownCompletionInput(input)) return { status: 'rejected' };
    return this.complete(input.executionId, input.nonce, {
      kind: 'known',
      replay: input.replay,
      costOutcome: input.costOutcome,
    });
  }

  async completeFailed(input: Readonly<{ executionId: string; nonce: string; code: StoredProviderFailure['code']; httpStatus: 502 | 503 | 504; costOutcome: CostOutcome }>): Promise<ProviderRequestCompletionResult> {
    if (!validFailedCompletionInput(input)) return { status: 'rejected' };
    return this.complete(input.executionId, input.nonce, {
      kind: 'failed',
      code: input.code,
      httpStatus: input.httpStatus,
      costOutcome: input.costOutcome,
    });
  }

  async completeUnknown(input: Readonly<{ executionId: string; nonce: string; code: 'provider_outcome_unknown' }>): Promise<ProviderRequestCompletionResult> {
    if (!validUnknownCompletionInput(input)) return { status: 'rejected' };
    return this.complete(input.executionId, input.nonce, { kind: 'unknown' });
  }

  async status(input: Readonly<Record<string, never>>): Promise<ProviderRequestStatusResult> {
    if (!validStatusInput(input)) return { status: 'unavailable' };
    await this.sweepAtRpcStart();
    const tombstone = this.readTombstone();
    if (tombstone) return observeTombstone(tombstone);
    const row = this.readRequest();
    return row ? observe(row) : { status: 'not-found' };
  }

  async alarm(): Promise<void> {
    this.validateSchema();
    await this.armRecoveryBeforeAlarmWork(authorityNow());
    this.sweepTransaction();
    await this.drainDueOutbox(authorityNow());
    const next = this.earliestDeadline();
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  private async complete(
    executionId: string,
    nonce: string,
    terminal: Readonly<
      | { kind: 'known'; replay: unknown; costOutcome: CostOutcome }
      | { kind: 'failed'; code: StoredProviderFailure['code']; httpStatus: 502 | 503 | 504; costOutcome: CostOutcome }
      | { kind: 'unknown' }
    >,
  ): Promise<ProviderRequestCompletionResult> {
    this.validateSchema();
    const envelopeRow = this.readRequest();
    if (!envelopeRow || envelopeRow.executionId !== executionId) return { status: 'rejected' };
    const normalizedTerminal = terminal.kind === 'known'
      ? (() => {
        const replay = parseReplay(envelopeRow.route, terminal.replay);
        return replay.ok ? { ...terminal, replay: replay.value } : null;
      })()
      : terminal;
    if (normalizedTerminal === null) return { status: 'rejected' };
    if (envelopeRow.state !== 'provider_inflight' || envelopeRow.permitVerifier === null || envelopeRow.transportDeadlineMs === null) return { status: 'rejected' };
    if (!await validPermit(nonce, envelopeRow.permitVerifier)) return { status: 'rejected' };
    const nowMs = await this.sweepAtRpcStart();
    const row = this.readRequest();
    if (!row || row.executionId !== executionId) return { status: 'rejected' };
    if (row.state === 'unknown' && nowMs >= envelopeRow.transportDeadlineMs) {
      return { status: 'late', outcome: observeUnknown(row) };
    }
    if (isTerminalState(row.state)) return { status: 'rejected' };
    if (row.state !== 'provider_inflight' || row.permitVerifier === null || row.transportDeadlineMs === null) return { status: 'rejected' };

    const alarmNow = authorityNow();
    await this.armBeforeState(alarmNow, alarmNow);
    const decision = this.ctx.storage.transactionSync(() => {
      const current = this.readRequest();
      if (!current || current.executionId !== executionId || current.state !== 'provider_inflight'
        || current.permitVerifier === null || current.transportDeadlineMs === null) return 'rejected' as const;
      const transactionNow = authorityNow();
      if (transactionNow >= current.transportDeadlineMs) {
        this.writeUnknown(current, transactionNow);
        return 'late' as const;
      }
      const decided = decideTerminal(current, normalizedTerminal);
      const replayExpiresAtMs = terminal.kind === 'unknown' ? null : safeAdd(transactionNow, REPLAY_RETENTION_MS);
      const phaseDeadlineMs = replayExpiresAtMs ?? transactionNow;
      this.ctx.storage.sql.exec(`UPDATE provider_request SET state = ?, settlement_state = 'settlement_pending',
        phase_deadline_ms = ?, permit_verifier = NULL, replay_json = ?, error_code = ?, http_status = ?, cost_kind = ?,
        cost_nanodollars = ?, terminal_class = ?, terminal_at_ms = ?, replay_expires_at_ms = ?
        WHERE execution_id = ? AND state = 'provider_inflight'`,
      decided.state,
      phaseDeadlineMs,
      decided.replayJson,
      decided.errorCode,
      decided.httpStatus,
      decided.costOutcome.kind,
      decided.costOutcome.kind === 'exact' ? decided.costOutcome.nanodollars : null,
      decided.state,
      transactionNow,
      replayExpiresAtMs,
      executionId);
      this.ctx.storage.sql.exec(`INSERT INTO provider_request_outbox (
        execution_id, operation, cost_kind, cost_nanodollars, retry_count, next_attempt_ms
      ) VALUES (?, 'settle', ?, ?, 0, ?)`,
      executionId,
      decided.costOutcome.kind,
      decided.costOutcome.kind === 'exact' ? decided.costOutcome.nanodollars : null,
      transactionNow);
      return 'stored' as const;
    });
    if (decision === 'rejected') return { status: 'rejected' };
    await this.drainDueOutbox(authorityNow());
    await this.repairAlarmFromRpc(authorityNow());
    if (decision === 'late') return { status: 'late', outcome: observeUnknown(this.readRequestRequired()) };
    return { status: 'stored', outcome: observeTerminal(this.readRequestRequired()) };
  }

  private writeUnknown(row: RequestRow, transactionNow: number): void {
    this.ctx.storage.sql.exec(`UPDATE provider_request SET state = 'unknown', settlement_state = 'settlement_pending',
      phase_deadline_ms = ?, permit_verifier = NULL, replay_json = NULL, error_code = 'provider_outcome_unknown', http_status = 502,
      cost_kind = 'missing', cost_nanodollars = NULL, terminal_class = 'unknown', terminal_at_ms = ?, replay_expires_at_ms = NULL
      WHERE execution_id = ? AND state IN ('budget_committed','provider_inflight')`, transactionNow, transactionNow, row.executionId);
    this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO provider_request_outbox (
      execution_id, operation, cost_kind, cost_nanodollars, retry_count, next_attempt_ms
    ) VALUES (?, 'settle', 'missing', NULL, 0, ?)`, row.executionId, transactionNow);
  }

  private createSchema(): void {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS provider_request (
      request_digest TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL UNIQUE,
      route TEXT NOT NULL,
      variant TEXT NOT NULL,
      shape_digest TEXT NOT NULL,
      shape_key_version TEXT NOT NULL,
      authority_day TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      reservation_nanodollars INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('prepared','reserved','budget_committed','provider_inflight','completed','failed','unknown','expired')),
      settlement_state TEXT CHECK(settlement_state IN ('settlement_pending','settlement_complete')),
      created_at_ms INTEGER NOT NULL,
      phase_deadline_ms INTEGER NOT NULL,
      transport_deadline_ms INTEGER,
      committed_until_ms INTEGER,
      permit_verifier TEXT,
      replay_json TEXT,
      error_code TEXT,
      http_status INTEGER,
      cost_kind TEXT,
      cost_nanodollars INTEGER,
      terminal_class TEXT,
      terminal_at_ms INTEGER,
      replay_expires_at_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS provider_request_outbox (
      execution_id TEXT PRIMARY KEY,
      operation TEXT NOT NULL CHECK(operation IN ('release','settle')),
      cost_kind TEXT NOT NULL CHECK(cost_kind IN ('exact','missing','malformed','positive-overflow')),
      cost_nanodollars INTEGER,
      retry_count INTEGER NOT NULL,
      next_attempt_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS provider_request_tombstone (
      request_digest TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      terminal_class TEXT NOT NULL CHECK(terminal_class IN ('completed','failed','unknown','expired')),
      state TEXT NOT NULL CHECK(state = 'expired')
    )`);
  }

  private validateSchema(): void {
    const tables = this.ctx.storage.sql.exec<{ name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    ).toArray().map(({ name }) => name);
    const requestColumns = this.ctx.storage.sql.exec<SchemaColumn>('PRAGMA table_info(provider_request)').toArray();
    const outboxColumns = this.ctx.storage.sql.exec<SchemaColumn>('PRAGMA table_info(provider_request_outbox)').toArray();
    const tombstoneColumns = this.ctx.storage.sql.exec<SchemaColumn>('PRAGMA table_info(provider_request_tombstone)').toArray();
    const schemas = this.ctx.storage.sql.exec<{ name: string; sql: string | null }>(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name IN ('provider_request','provider_request_outbox','provider_request_tombstone')",
    ).toArray();
    const requestSql = schemas.find(({ name }) => name === 'provider_request')?.sql;
    const outboxSql = schemas.find(({ name }) => name === 'provider_request_outbox')?.sql;
    const tombstoneSql = schemas.find(({ name }) => name === 'provider_request_tombstone')?.sql;
    if (!sameSchemaValue(tables, ['provider_request', 'provider_request_outbox', 'provider_request_tombstone'])) throw schemaError();
    if (!sameSchemaValue(requestColumns, REQUEST_COLUMNS) || !sameSchemaValue(outboxColumns, OUTBOX_COLUMNS) || !sameSchemaValue(tombstoneColumns, TOMBSTONE_COLUMNS)) throw schemaError();
    if (!requestSql || !STATE_CHECK.test(requestSql) || !SETTLEMENT_CHECK.test(requestSql) || !EXECUTION_ID_UNIQUE.test(requestSql)) throw schemaError();
    if (!outboxSql || !OUTBOX_OPERATION_CHECK.test(outboxSql) || !OUTBOX_COST_CHECK.test(outboxSql)) throw schemaError();
    if (!tombstoneSql || !TOMBSTONE_TERMINAL_CHECK.test(tombstoneSql) || !TOMBSTONE_STATE_CHECK.test(tombstoneSql)) throw schemaError();
    const request = this.readRequest();
    const outbox = this.readOutbox();
    const tombstone = this.readTombstone();
    if (request && tombstone) throw schemaError();
    if (outbox) {
      if (!request || request.executionId !== outbox.executionId || request.settlementState !== 'settlement_pending') throw schemaError();
      if (outbox.operation === 'release') {
        if (request.state !== 'expired' || outbox.costKind !== 'missing') throw schemaError();
      } else {
        if (!isTerminalState(request.state) || request.costKind !== outbox.costKind || request.costNanodollars !== outbox.costNanodollars) throw schemaError();
      }
    }
    if (request?.settlementState === 'settlement_pending' && !outbox) throw schemaError();
  }

  private async sweepAtRpcStart(): Promise<number> {
    this.validateSchema();
    const beforeAlarm = authorityNow();
    const next = this.earliestDeadline();
    if (next !== null) await this.armBeforeState(next, beforeAlarm);
    let durableNow = authorityNow();
    const due = this.earliestDueStateDeadline(durableNow);
    if (due !== null) {
      await this.armBeforeState(due, durableNow);
      durableNow = authorityNow();
    }
    return this.sweepTransaction();
  }

  private sweepTransaction(): number {
    return this.ctx.storage.transactionSync(() => {
      const nowMs = authorityNow();
      const row = this.readRequest();
      if (!row) return nowMs;
      if ((row.state === 'completed' || row.state === 'failed') && row.replayExpiresAtMs !== null && row.replayExpiresAtMs <= nowMs) {
        this.rewriteTombstone(row);
        return nowMs;
      }
      if ((row.state === 'budget_committed' || row.state === 'provider_inflight') && row.transportDeadlineMs !== null && row.transportDeadlineMs <= nowMs) {
        this.writeUnknown(row, nowMs);
        return nowMs;
      }
      if ((row.state === 'prepared' || row.state === 'reserved') && row.phaseDeadlineMs <= nowMs) {
        if (row.state === 'prepared') {
          this.rewriteTombstone({ ...row, state: 'expired', terminalClass: 'expired' });
        } else {
          this.ctx.storage.sql.exec(`UPDATE provider_request SET state = 'expired', settlement_state = 'settlement_pending',
            phase_deadline_ms = ?, replay_json = NULL, error_code = NULL, http_status = NULL,
            cost_kind = 'missing', cost_nanodollars = NULL, terminal_class = 'expired', terminal_at_ms = ?, replay_expires_at_ms = NULL
            WHERE execution_id = ? AND state = 'reserved'`, nowMs, nowMs, row.executionId);
          this.ctx.storage.sql.exec(`INSERT OR IGNORE INTO provider_request_outbox (
            execution_id, operation, cost_kind, cost_nanodollars, retry_count, next_attempt_ms
          ) VALUES (?, 'release', 'missing', NULL, 0, ?)`, row.executionId, nowMs);
        }
      }
      return nowMs;
    });
  }

  private rewriteTombstone(row: RequestRow): void {
    const terminalClass = row.terminalClass ?? 'expired';
    this.ctx.storage.sql.exec(`INSERT INTO provider_request_tombstone (
      request_digest, execution_id, terminal_class, state
    ) VALUES (?, ?, ?, 'expired')`, row.requestDigest, row.executionId, terminalClass);
    this.ctx.storage.sql.exec('DELETE FROM provider_request_outbox WHERE execution_id = ?', row.executionId);
    this.ctx.storage.sql.exec('DELETE FROM provider_request WHERE execution_id = ?', row.executionId);
  }

  private async drainDueOutbox(nowMs: number): Promise<void> {
    const outbox = this.readOutbox();
    if (!outbox || outbox.nextAttemptMs > nowMs) return;
    const row = this.readRequest();
    if (!row || row.executionId !== outbox.executionId) throw schemaError();
    const budget = this.requestEnv.OWNER_BUDGET_AUTHORITY.get(
      this.requestEnv.OWNER_BUDGET_AUTHORITY.idFromName(row.authorityDay),
    );
    const binding: OwnerBudgetBinding = {
      executionId: row.executionId,
      requestAuthorityName: row.requestDigest,
      authorityDay: row.authorityDay,
      route: row.route,
      variant: row.variant,
      policyVersion: row.policyVersion,
      reservationNanodollars: row.reservationNanodollars,
    };
    await this.armBeforeExternalAwait(authorityNow());
    try {
      if (outbox.operation === 'release') {
        const result = await budget.release(binding);
        if (result.status === 'released' || result.status === 'settled' || result.status === 'settled_full') {
          this.finishOutbox(row, null);
          return;
        }
        if (result.status === 'committed') {
          const transitionNow = authorityNow();
          await this.armBeforeState(transitionNow, transitionNow);
          this.ctx.storage.transactionSync(() => {
            this.ctx.storage.sql.exec(`UPDATE provider_request_outbox SET operation = 'settle', cost_kind = 'missing',
              cost_nanodollars = NULL, next_attempt_ms = ? WHERE execution_id = ?`, authorityNow(), row.executionId);
          });
          return;
        }
      } else {
        const costOutcome = outboxCost(outbox);
        const result = await budget.settle({ ...binding, costOutcome });
        if (result.status === 'settled' || result.status === 'settled_full') {
          this.finishOutbox(row, result.frozenCode ?? null);
          return;
        }
      }
    } catch {
      // The durable retry row is the only error record; native details are intentionally discarded.
    }
    await this.scheduleOutboxRetry(outbox, authorityNow());
  }

  private finishOutbox(row: RequestRow, frozenCode: 'accounting_policy_breach' | 'accounting_cost_overflow' | null): void {
    this.ctx.storage.transactionSync(() => {
      const current = this.readRequest();
      const outbox = this.readOutbox();
      if (!current || !outbox || current.executionId !== row.executionId || outbox.executionId !== row.executionId) return;
      if (current.state === 'expired') {
        this.rewriteTombstone(current);
        return;
      }
      if (frozenCode && current.state === 'completed') {
        this.ctx.storage.sql.exec(`UPDATE provider_request SET state = 'failed', terminal_class = 'failed',
          replay_json = NULL, error_code = ?, http_status = 502, settlement_state = 'settlement_complete'
          WHERE execution_id = ?`, frozenCode, current.executionId);
      } else {
        this.ctx.storage.sql.exec("UPDATE provider_request SET settlement_state = 'settlement_complete' WHERE execution_id = ?", current.executionId);
      }
      this.ctx.storage.sql.exec('DELETE FROM provider_request_outbox WHERE execution_id = ?', current.executionId);
    });
  }

  private async scheduleOutboxRetry(outbox: OutboxRow, nowMs: number): Promise<void> {
    const retryCount = Math.min(outbox.retryCount + 1, 31);
    const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * (2 ** Math.min(outbox.retryCount, 8)));
    const nextAttemptMs = safeAdd(nowMs, delay);
    await this.armBeforeState(nextAttemptMs, nowMs);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(`UPDATE provider_request_outbox SET retry_count = ?, next_attempt_ms = ?
        WHERE execution_id = ? AND retry_count = ?`, retryCount, nextAttemptMs, outbox.executionId, outbox.retryCount);
    });
  }

  private async armBeforeState(requiredDeadlineMs: number, nowMs: number): Promise<void> {
    assertSafeNonnegative(requiredDeadlineMs);
    const target = Math.min(requiredDeadlineMs, safeAdd(nowMs, ALARM_SAFETY_MS));
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > target) await this.ctx.storage.setAlarm(target);
  }

  private async armRecoveryBeforeAlarmWork(nowMs: number): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    await this.ctx.storage.setAlarm(existing === null ? nowMs : Math.min(existing, nowMs));
  }

  private async armBeforeExternalAwait(nowMs: number): Promise<void> {
    const target = nowMs;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > target) await this.ctx.storage.setAlarm(target);
  }

  private async repairAlarmFromRpc(nowMs: number): Promise<void> {
    const next = this.earliestDeadline();
    if (next !== null) await this.armBeforeState(next, nowMs);
  }

  private earliestDueStateDeadline(nowMs: number): number | null {
    const row = this.readRequest();
    if (!row) return null;
    const deadline = stateDeadline(row);
    return deadline !== null && deadline <= nowMs ? deadline : null;
  }

  private earliestDeadline(): number | null {
    const row = this.readRequest();
    const outbox = this.readOutbox();
    let earliest = row ? stateDeadline(row) : null;
    if (outbox && (earliest === null || outbox.nextAttemptMs < earliest)) earliest = outbox.nextAttemptMs;
    return earliest;
  }

  private readRequestWithoutValidation(): RequestRow | undefined {
    const rows = this.ctx.storage.sql.exec<RequestRow>(`SELECT
      request_digest AS requestDigest, execution_id AS executionId, route, variant,
      shape_digest AS shapeDigest, shape_key_version AS shapeKeyVersion,
      authority_day AS authorityDay, policy_version AS policyVersion,
      reservation_nanodollars AS reservationNanodollars, state,
      settlement_state AS settlementState, created_at_ms AS createdAtMs,
      phase_deadline_ms AS phaseDeadlineMs, transport_deadline_ms AS transportDeadlineMs,
      committed_until_ms AS committedUntilMs, permit_verifier AS permitVerifier,
      replay_json AS replayJson, error_code AS errorCode, http_status AS httpStatus,
      cost_kind AS costKind, cost_nanodollars AS costNanodollars,
      terminal_class AS terminalClass, terminal_at_ms AS terminalAtMs,
      replay_expires_at_ms AS replayExpiresAtMs FROM provider_request`).toArray();
    if (rows.length > 1) throw schemaError();
    return rows[0];
  }

  private readRequest(): RequestRow | undefined {
    const row = this.readRequestWithoutValidation();
    if (row) assertRequestRow(row);
    return row;
  }

  private readRequestRequired(): RequestRow {
    const row = this.readRequest();
    if (!row) throw schemaError();
    return row;
  }

  private readOutbox(): OutboxRow | undefined {
    const rows = this.ctx.storage.sql.exec<OutboxRow>(`SELECT execution_id AS executionId,
      operation, cost_kind AS costKind, cost_nanodollars AS costNanodollars,
      retry_count AS retryCount, next_attempt_ms AS nextAttemptMs
      FROM provider_request_outbox`).toArray();
    if (rows.length > 1) throw schemaError();
    const row = rows[0];
    if (row) assertOutboxRow(row);
    return row;
  }

  private readTombstone(): TombstoneRow | undefined {
    const rows = this.ctx.storage.sql.exec<TombstoneRow>(`SELECT request_digest AS requestDigest,
      execution_id AS executionId, terminal_class AS terminalClass, state
      FROM provider_request_tombstone`).toArray();
    if (rows.length > 1) throw schemaError();
    const row = rows[0];
    if (row && (!REQUEST_DIGEST.test(row.requestDigest) || !UUID.test(row.executionId) || !isTerminalClass(row.terminalClass) || row.state !== 'expired')) throw schemaError();
    return row;
  }
}

function observe(row: RequestRow): ProviderRequestObservedResult {
  if (row.state === 'completed' || row.state === 'failed' || row.state === 'unknown') return observeTerminal(row);
  if (row.state === 'expired') return { status: 'expired', executionId: row.executionId, terminalClass: row.terminalClass ?? 'expired' };
  const common = {
    status: 'pending' as const,
    phase: row.state,
    executionId: row.executionId,
    authorityDay: row.authorityDay,
    shapeKeyVersion: row.shapeKeyVersion,
  };
  if (row.state === 'prepared' || row.state === 'reserved') return { ...common, reservedUntilMs: row.phaseDeadlineMs } satisfies ProviderRequestPendingResult;
  if (row.transportDeadlineMs === null) throw schemaError();
  return { ...common, transportDeadlineMs: row.transportDeadlineMs } satisfies ProviderRequestPendingResult;
}

function observeTerminal(row: RequestRow): ProviderRequestCompletedResult | ProviderRequestFailedResult | ProviderRequestUnknownResult {
  if (row.settlementState === null) throw schemaError();
  if (row.state === 'completed') {
    if (row.replayJson === null) throw schemaError();
    return { status: 'completed', replay: parseStoredReplay(row), settlement: row.settlementState };
  }
  if (row.state === 'failed') {
    if (row.errorCode === null || row.httpStatus === null) throw schemaError();
    return { status: 'failed', code: row.errorCode, httpStatus: row.httpStatus, settlement: row.settlementState };
  }
  if (row.state === 'unknown') return observeUnknown(row);
  throw schemaError();
}

function observeUnknown(row: RequestRow): ProviderRequestUnknownResult {
  if (row.state !== 'unknown' || row.settlementState === null || row.errorCode !== 'provider_outcome_unknown' || row.httpStatus !== 502) throw schemaError();
  return { status: 'unknown', code: 'provider_outcome_unknown', httpStatus: 502, settlement: row.settlementState };
}

function observeTombstone(row: TombstoneRow): ProviderRequestExpiredResult {
  return { status: 'expired', executionId: row.executionId, terminalClass: row.terminalClass };
}

function committedRecord(row: RequestRow): ProviderRequestRecordResult {
  if (row.transportDeadlineMs === null || row.committedUntilMs === null) return { status: 'conflict' };
  return {
    status: 'recorded',
    phase: 'budget_committed',
    transportDeadlineMs: row.transportDeadlineMs,
    committedUntilMs: row.committedUntilMs,
  };
}

function decideTerminal(
  row: RequestRow,
  terminal: Readonly<
    | { kind: 'known'; replay: unknown; costOutcome: CostOutcome }
    | { kind: 'failed'; code: StoredProviderFailure['code']; httpStatus: 502 | 503 | 504; costOutcome: CostOutcome }
    | { kind: 'unknown' }
  >,
): Readonly<{
  state: 'completed' | 'failed' | 'unknown';
  replayJson: string | null;
  errorCode: StoredProviderFailure['code'] | null;
  httpStatus: 502 | 503 | 504 | null;
  costOutcome: CostOutcome;
}> {
  if (terminal.kind === 'unknown') return { state: 'unknown', replayJson: null, errorCode: 'provider_outcome_unknown', httpStatus: 502, costOutcome: { kind: 'missing' } };
  if (terminal.costOutcome.kind === 'positive-overflow') return { state: 'failed', replayJson: null, errorCode: 'accounting_cost_overflow', httpStatus: 502, costOutcome: terminal.costOutcome };
  if (terminal.costOutcome.kind === 'exact' && terminal.costOutcome.nanodollars > row.reservationNanodollars) {
    return { state: 'failed', replayJson: null, errorCode: 'accounting_policy_breach', httpStatus: 502, costOutcome: terminal.costOutcome };
  }
  if (terminal.kind === 'known') return { state: 'completed', replayJson: JSON.stringify(terminal.replay), errorCode: null, httpStatus: null, costOutcome: terminal.costOutcome };
  if (terminal.code === 'provider_invalid_response' && terminal.costOutcome.kind === 'exact') {
    return { state: 'failed', replayJson: null, errorCode: terminal.code, httpStatus: terminal.httpStatus, costOutcome: { kind: 'missing' } };
  }
  return { state: 'failed', replayJson: null, errorCode: terminal.code, httpStatus: terminal.httpStatus, costOutcome: terminal.costOutcome };
}

function parseStoredReplay(row: RequestRow): unknown {
  if (row.replayJson === null) throw schemaError();
  let value: unknown;
  try { value = JSON.parse(row.replayJson); } catch { throw schemaError(); }
  const replay = parseReplay(row.route, value);
  if (!replay.ok) throw schemaError();
  return replay.value;
}

function parseReplay(route: RequestRow['route'], value: unknown): Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false }> {
  const parsed = route === 'scan'
    ? DurableScanReplaySchema.safeParse(value)
    : route === 'summarize'
      ? DurableSummaryReplaySchema.safeParse(value)
      : DurableTimezoneReplaySchema.safeParse(value);
  if (!parsed.success) return { ok: false };
  if (route === 'resolve-timezone') {
    const replay: unknown = parsed.data;
    const timezone = isRecord(replay) ? replay.timezone : undefined;
    if (typeof timezone !== 'string' || !validIanaTimezone(timezone)) return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

function validIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function validBeginInput(input: unknown): input is ProviderRequestBeginInput {
  if (!isRecord(input) || !sameSchemaValue(Object.keys(input).sort(), BEGIN_KEYS)) return false;
  if (typeof input.requestDigest !== 'string' || !REQUEST_DIGEST.test(input.requestDigest)) return false;
  if (typeof input.route !== 'string' || typeof input.variant !== 'string' || typeof input.proposedAuthorityDay !== 'string' || typeof input.policyVersion !== 'string' || typeof input.reservationNanodollars !== 'number') return false;
  if (!Array.isArray(input.bindingCandidates) || input.bindingCandidates.length < 1 || input.bindingCandidates.length > 2) return false;
  if (!input.bindingCandidates.every(validCandidate)) return false;
  if (new Set(input.bindingCandidates.map(({ version }) => version)).size !== input.bindingCandidates.length) return false;
  if (!validUtcDay(input.proposedAuthorityDay) || input.policyVersion !== OWNER_POLICY_VERSION) return false;
  if (!Number.isSafeInteger(input.reservationNanodollars) || input.reservationNanodollars < 0) return false;
  const policy = OWNER_VARIANT_POLICY[input.variant as keyof typeof OWNER_VARIANT_POLICY];
  return policy !== undefined && policy.route === input.route && policy.reservationNanodollars === input.reservationNanodollars;
}

function validCandidate(value: unknown): value is ProviderBindingCandidate {
  return isRecord(value)
    && sameSchemaValue(Object.keys(value).sort(), CANDIDATE_KEYS)
    && typeof value.version === 'string'
    && SHAPE_VERSION.test(value.version)
    && typeof value.digest === 'string'
    && REQUEST_DIGEST.test(value.digest);
}

function validReservationInput(input: unknown): input is Readonly<{ executionId: string; authorityDay: string; reservationNanodollars: number }> {
  return isRecord(input)
    && sameSchemaValue(Object.keys(input).sort(), RESERVATION_KEYS)
    && typeof input.executionId === 'string'
    && UUID.test(input.executionId)
    && typeof input.authorityDay === 'string'
    && validUtcDay(input.authorityDay)
    && typeof input.reservationNanodollars === 'number'
    && Number.isSafeInteger(input.reservationNanodollars)
    && input.reservationNanodollars >= 0;
}

function validBudgetCommitInput(input: unknown): input is Readonly<{ executionId: string; transportDeadlineMs: number; committedUntilMs: number }> {
  if (!isRecord(input) || !sameSchemaValue(Object.keys(input).sort(), BUDGET_COMMIT_KEYS)) return false;
  if (typeof input.executionId !== 'string' || !UUID.test(input.executionId)) return false;
  if (typeof input.transportDeadlineMs !== 'number' || typeof input.committedUntilMs !== 'number') return false;
  if (!isSafeNonnegative(input.transportDeadlineMs) || !isSafeNonnegative(input.committedUntilMs)) return false;
  return input.committedUntilMs - input.transportDeadlineMs === 60_000;
}

function validClaimInput(input: unknown): input is Readonly<{ executionId: string }> {
  return isRecord(input)
    && sameSchemaValue(Object.keys(input).sort(), CLAIM_KEYS)
    && typeof input.executionId === 'string'
    && UUID.test(input.executionId);
}

function validKnownCompletionInput(input: unknown): input is Readonly<{ executionId: string; nonce: string; replay: unknown; costOutcome: CostOutcome }> {
  return isRecord(input)
    && sameSchemaValue(Object.keys(input).sort(), COMPLETE_KNOWN_KEYS)
    && validCompletionIdentity(input)
    && validCostOutcome(input.costOutcome);
}

function validFailedCompletionInput(input: unknown): input is Readonly<{ executionId: string; nonce: string; code: StoredProviderFailure['code']; httpStatus: 502 | 503 | 504; costOutcome: CostOutcome }> {
  if (!isRecord(input)
    || !sameSchemaValue(Object.keys(input).sort(), COMPLETE_FAILED_KEYS)
    || !validCompletionIdentity(input)
    || typeof input.code !== 'string'
    || typeof input.httpStatus !== 'number'
    || !validDirectProviderFailure(input.code, input.httpStatus)
    || !validCostOutcome(input.costOutcome)) return false;
  if (input.code === 'provider_invalid_response') return true;
  return input.costOutcome.kind === 'missing' || input.costOutcome.kind === 'malformed';
}

function validUnknownCompletionInput(input: unknown): input is Readonly<{ executionId: string; nonce: string; code: 'provider_outcome_unknown' }> {
  return isRecord(input)
    && sameSchemaValue(Object.keys(input).sort(), COMPLETE_UNKNOWN_KEYS)
    && validCompletionIdentity(input)
    && input.code === 'provider_outcome_unknown';
}

function validCompletionIdentity(input: Record<string, unknown>): boolean {
  return typeof input.executionId === 'string'
    && UUID.test(input.executionId)
    && typeof input.nonce === 'string'
    && NONCE.test(input.nonce);
}

function validStatusInput(input: unknown): input is Readonly<Record<string, never>> {
  return isRecord(input) && sameSchemaValue(Object.keys(input).sort(), STATUS_KEYS);
}

function validCostOutcome(cost: unknown): cost is CostOutcome {
  if (!isRecord(cost) || typeof cost.kind !== 'string') return false;
  const keys = Object.keys(cost).sort();
  if (cost.kind === 'exact') {
    return sameSchemaValue(keys, ['kind', 'nanodollars'])
      && typeof cost.nanodollars === 'number'
      && Number.isSafeInteger(cost.nanodollars)
      && cost.nanodollars >= 0
      && cost.nanodollars <= MAX_PRIMARY_ACTUAL_NANODOLLARS;
  }
  return (cost.kind === 'missing' || cost.kind === 'malformed' || cost.kind === 'positive-overflow')
    && sameSchemaValue(keys, ['kind']);
}

function validFailure(code: string, status: number): code is StoredProviderFailure['code'] {
  const statuses: Readonly<Record<StoredProviderFailure['code'], 502 | 503 | 504>> = {
    provider_rejected: 502,
    provider_unavailable: 502,
    provider_timeout: 504,
    provider_rate_limited: 503,
    owner_provider_credit_unavailable: 503,
    privacy_endpoint_unavailable: 503,
    provider_invalid_response: 502,
    provider_outcome_unknown: 502,
    accounting_policy_breach: 502,
    accounting_cost_overflow: 502,
  };
  return code in statuses && statuses[code as StoredProviderFailure['code']] === status;
}

function validDirectProviderFailure(code: string, status: number): code is StoredProviderFailure['code'] {
  return code !== 'provider_outcome_unknown'
    && code !== 'accounting_policy_breach'
    && code !== 'accounting_cost_overflow'
    && validFailure(code, status);
}

function sameBeginBinding(row: RequestRow, input: ProviderRequestBeginInput): boolean {
  const matching = input.bindingCandidates.find(({ version }) => version === row.shapeKeyVersion);
  return row.requestDigest === input.requestDigest
    && row.route === input.route
    && row.variant === input.variant
    && row.policyVersion === input.policyVersion
    && row.reservationNanodollars === input.reservationNanodollars
    && matching?.digest === row.shapeDigest;
}

function sameReservation(row: RequestRow, input: Readonly<{ executionId: string; authorityDay: string; reservationNanodollars: number }>): boolean {
  return row.executionId === input.executionId
    && row.authorityDay === input.authorityDay
    && row.reservationNanodollars === input.reservationNanodollars;
}

function sameCommittedDeadlines(row: RequestRow, input: Readonly<{ transportDeadlineMs: number; committedUntilMs: number }>): boolean {
  return row.transportDeadlineMs === input.transportDeadlineMs && row.committedUntilMs === input.committedUntilMs;
}

function stateDeadline(row: RequestRow): number | null {
  if (row.state === 'prepared' || row.state === 'reserved') return row.phaseDeadlineMs;
  if (row.state === 'budget_committed' || row.state === 'provider_inflight') return row.transportDeadlineMs;
  if (row.state === 'completed' || row.state === 'failed') return row.replayExpiresAtMs;
  return null;
}

function outboxCost(row: OutboxRow): CostOutcome {
  return row.costKind === 'exact'
    ? { kind: 'exact', nanodollars: row.costNanodollars! }
    : { kind: row.costKind };
}

function assertRequestRow(row: RequestRow): void {
  if (!REQUEST_DIGEST.test(row.requestDigest) || !UUID.test(row.executionId) || !SHAPE_VERSION.test(row.shapeKeyVersion) || !REQUEST_DIGEST.test(row.shapeDigest)) throw schemaError();
  if (!validUtcDay(row.authorityDay) || row.policyVersion !== OWNER_POLICY_VERSION) throw schemaError();
  const policy = OWNER_VARIANT_POLICY[row.variant];
  if (!policy || policy.route !== row.route || policy.reservationNanodollars !== row.reservationNanodollars) throw schemaError();
  for (const value of [row.reservationNanodollars, row.createdAtMs, row.phaseDeadlineMs, row.transportDeadlineMs, row.committedUntilMs, row.costNanodollars, row.terminalAtMs, row.replayExpiresAtMs]) {
    if (value !== null && !isSafeNonnegative(value)) throw schemaError();
  }
  if (row.phaseDeadlineMs < row.createdAtMs) throw schemaError();
  if (!['prepared', 'reserved', 'budget_committed', 'provider_inflight', 'completed', 'failed', 'unknown', 'expired'].includes(row.state)) throw schemaError();
  if (row.settlementState !== null && row.settlementState !== 'settlement_pending' && row.settlementState !== 'settlement_complete') throw schemaError();
  if (row.permitVerifier !== null && !VERIFIER.test(row.permitVerifier)) throw schemaError();
  if (row.state === 'prepared' || row.state === 'reserved') {
    if (row.transportDeadlineMs !== null || row.committedUntilMs !== null || row.permitVerifier !== null
      || row.replayJson !== null || row.errorCode !== null || row.httpStatus !== null || row.costKind !== null
      || row.costNanodollars !== null || row.terminalClass !== null || row.terminalAtMs !== null
      || row.replayExpiresAtMs !== null || row.settlementState !== null) throw schemaError();
  }
  if (row.state === 'budget_committed' || row.state === 'provider_inflight') {
    if (row.transportDeadlineMs === null || row.committedUntilMs === null
      || row.phaseDeadlineMs !== row.transportDeadlineMs
      || row.committedUntilMs - row.transportDeadlineMs !== 60_000
      || (row.state === 'budget_committed' ? row.permitVerifier !== null : row.permitVerifier === null)
      || row.replayJson !== null || row.errorCode !== null || row.httpStatus !== null || row.costKind !== null
      || row.costNanodollars !== null || row.terminalClass !== null || row.terminalAtMs !== null
      || row.replayExpiresAtMs !== null || row.settlementState !== null) throw schemaError();
  }
  if (isTerminalState(row.state)) {
    if (row.terminalClass !== row.state || row.terminalAtMs === null || row.settlementState === null || row.costKind === null || row.permitVerifier !== null) throw schemaError();
    if (row.transportDeadlineMs === null || row.committedUntilMs === null || row.terminalAtMs < row.createdAtMs) throw schemaError();
    if ((row.state === 'completed' || row.state === 'failed') && row.terminalAtMs >= row.transportDeadlineMs) throw schemaError();
    if (row.costKind === 'exact') {
      if (row.costNanodollars === null || !validCostOutcome({ kind: 'exact', nanodollars: row.costNanodollars })) throw schemaError();
    } else if (row.costNanodollars !== null) throw schemaError();
  }
  if (row.state === 'completed') {
    if (row.replayJson === null || row.errorCode !== null || row.httpStatus !== null || row.replayExpiresAtMs === null
      || row.replayExpiresAtMs - row.terminalAtMs! !== REPLAY_RETENTION_MS
      || row.phaseDeadlineMs !== row.replayExpiresAtMs
      || row.costKind === 'positive-overflow'
      || (row.costKind === 'exact' && row.costNanodollars! > row.reservationNanodollars)) throw schemaError();
    parseStoredReplay(row);
  }
  if (row.state === 'failed') {
    if (row.replayJson !== null || row.errorCode === null || row.httpStatus === null || !validFailure(row.errorCode, row.httpStatus)
      || row.replayExpiresAtMs === null || row.replayExpiresAtMs - row.terminalAtMs! !== REPLAY_RETENTION_MS
      || row.phaseDeadlineMs !== row.replayExpiresAtMs) throw schemaError();
    if (row.errorCode === 'accounting_policy_breach') {
      if (row.costKind !== 'exact' || row.costNanodollars === null || row.costNanodollars <= row.reservationNanodollars) throw schemaError();
    } else if (row.errorCode === 'accounting_cost_overflow') {
      if (row.costKind !== 'positive-overflow') throw schemaError();
    } else if (row.errorCode === 'provider_outcome_unknown' || row.costKind === 'exact') throw schemaError();
  }
  if (row.state === 'unknown') {
    if (row.replayJson !== null || row.errorCode !== 'provider_outcome_unknown' || row.httpStatus !== 502
      || row.costKind !== 'missing' || row.costNanodollars !== null || row.replayExpiresAtMs !== null
      || row.phaseDeadlineMs !== row.terminalAtMs) throw schemaError();
  }
  if (row.state === 'expired') {
    if (row.transportDeadlineMs !== null || row.committedUntilMs !== null || row.permitVerifier !== null
      || row.terminalClass !== 'expired' || row.terminalAtMs === null || row.phaseDeadlineMs !== row.terminalAtMs
      || row.settlementState !== 'settlement_pending' || row.replayJson !== null || row.errorCode !== null
      || row.httpStatus !== null || row.costKind !== 'missing' || row.costNanodollars !== null
      || row.replayExpiresAtMs !== null) throw schemaError();
  }
}

function assertOutboxRow(row: OutboxRow): void {
  if (!UUID.test(row.executionId) || (row.operation !== 'release' && row.operation !== 'settle')) throw schemaError();
  if (!Number.isSafeInteger(row.retryCount) || row.retryCount < 0 || row.retryCount > 31) throw schemaError();
  assertSafeNonnegative(row.nextAttemptMs);
  const cost = outboxCost(row);
  if (!validCostOutcome(cost)) throw schemaError();
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function permitVerifier(nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', text.encode(`${PERMIT_DOMAIN}${nonce}`));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function validPermit(nonce: string, storedHex: string): Promise<boolean> {
  const candidateHex = await permitVerifier(nonce);
  const candidate = hexBytes(candidateHex);
  const stored = hexBytes(storedHex);
  let difference = candidate.length ^ stored.length;
  for (let index = 0; index < 32; index++) difference |= (candidate[index] ?? 0) ^ (stored[index] ?? 0);
  return difference === 0;
}

function hexBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16) || 0;
  return bytes;
}

function validUtcDay(day: string): boolean {
  if (!UTC_DAY.test(day)) return false;
  const milliseconds = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === day;
}

function isTerminalState(state: ActiveState): state is 'completed' | 'failed' | 'unknown' {
  return state === 'completed' || state === 'failed' || state === 'unknown';
}

function isTerminalClass(value: string): value is TerminalClass {
  return value === 'completed' || value === 'failed' || value === 'unknown' || value === 'expired';
}

function authorityNow(): number {
  const nowMs = Date.now();
  assertSafeNonnegative(nowMs);
  return nowMs;
}

function safeAdd(left: number, right: number): number {
  assertSafeNonnegative(left);
  assertSafeNonnegative(right);
  const value = left + right;
  assertSafeNonnegative(value);
  return value;
}

function isSafeNonnegative(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertSafeNonnegative(value: number): asserts value is number {
  if (!isSafeNonnegative(value)) throw new Error('provider request integer unavailable');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameSchemaValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function schemaError(): Error {
  return new Error('provider request schema unavailable');
}
