// @ts-expect-error cloudflare:workers is provided by Workerd, not the Next.js type graph.
import { DurableObject } from 'cloudflare:workers';
import type {
  DurableObjectStateLike,
  OwnerBudgetBinding,
  OwnerBudgetBreachClass,
  OwnerBudgetCommitResult,
  OwnerBudgetFrozenCode,
  OwnerBudgetReleaseResult,
  OwnerBudgetReserveResult,
  OwnerBudgetSettleResult,
  OwnerBudgetSettlementInput,
  OwnerBudgetStatusResult,
} from '../contracts';
import {
  ACCOUNTING_RETENTION_MS,
  COMMITTED_LEASE_MS,
  OWNER_DAILY_LIMIT_NANODOLLARS,
  OWNER_POLICY_VERSION,
  OWNER_VARIANT_POLICY,
  PRE_PERMIT_LEASE_MS,
  TRANSPORT_LEASE_MS,
} from '../provider/policy';
import type { CostOutcome } from '../provider/contracts';

const ALARM_SAFETY_MS = 30_000;
const MINIMUM_RESERVATION_NANODOLLARS = 500_000;
const MAX_PRIMARY_ACTUAL_NANODOLLARS = Number.MAX_SAFE_INTEGER - OWNER_DAILY_LIMIT_NANODOLLARS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AUTHORITY_NAME = /^[0-9a-f]{64}$/;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BINDING_KEYS = ['authorityDay', 'executionId', 'policyVersion', 'requestAuthorityName', 'reservationNanodollars', 'route', 'variant'];
const SETTLEMENT_KEYS = ['authorityDay', 'costOutcome', 'executionId', 'policyVersion', 'requestAuthorityName', 'reservationNanodollars', 'route', 'variant'];
const STATUS_KEYS = ['authorityDay'];

type Phase = 'reserved' | 'committed' | 'released' | 'settled' | 'settled_full';
type PolicyRow = Readonly<{
  authorityDay: string;
  policyVersion: string;
  limitNanodollars: number;
  frozenCode: OwnerBudgetFrozenCode | null;
  createdAtMs: number;
}>;
type OperationRow = Readonly<{
  executionId: string;
  requestAuthorityName: string;
  route: OwnerBudgetBinding['route'];
  variant: OwnerBudgetBinding['variant'];
  reservationNanodollars: number;
  settledNanodollars: number | null;
  phase: Phase;
  breachClass: OwnerBudgetBreachClass | null;
  reservedUntilMs: number;
  transportDeadlineMs: number | null;
  committedUntilMs: number | null;
  terminalAtMs: number | null;
}>;
type SchemaColumn = Readonly<{
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}>;

const POLICY_COLUMNS: readonly SchemaColumn[] = [
  { cid: 0, name: 'authority_day', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'policy_version', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 2, name: 'limit_nanodollars', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 3, name: 'frozen_code', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 4, name: 'created_at_ms', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
];
const OPERATION_COLUMNS: readonly SchemaColumn[] = [
  { cid: 0, name: 'execution_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
  { cid: 1, name: 'request_authority_name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 2, name: 'route', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 3, name: 'variant', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 4, name: 'reservation_nanodollars', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 5, name: 'settled_nanodollars', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 6, name: 'phase', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 7, name: 'breach_class', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 8, name: 'reserved_until_ms', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 0 },
  { cid: 9, name: 'transport_deadline_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 10, name: 'committed_until_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
  { cid: 11, name: 'terminal_at_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
];
const PHASE_CHECK = /CHECK\s*\(\s*phase\s+IN\s*\(\s*'reserved'\s*,\s*'committed'\s*,\s*'released'\s*,\s*'settled'\s*,\s*'settled_full'\s*\)\s*\)/i;
const BREACH_CHECK = /CHECK\s*\(\s*breach_class\s+IN\s*\(\s*'primary_breach'\s*,\s*'primary_overflow'\s*,\s*'secondary_breach'\s*\)\s*\)/i;

export class OwnerBudgetAuthority extends DurableObject<Record<string, never>> {
  private readonly ctx: DurableObjectStateLike;

  constructor(ctx: DurableObjectStateLike, env: Record<string, never>) {
    super(ctx, env);
    this.ctx = ctx;
    ctx.blockConcurrencyWhile(async () => {
      this.createSchema();
      this.validateSchema();
      await this.repairAlarmFromRpc(Date.now());
    });
  }

  async reserve(input: OwnerBudgetBinding): Promise<OwnerBudgetReserveResult> {
    if (!validBindingInput(input)) return { status: 'conflict' };
    const nowMs = authorityNow();
    if (!validUtcDay(input.authorityDay)) return { status: 'day-mismatch' };
    await this.sweepAtRpcStart(nowMs);
    const policy = this.readPolicy();
    if (policy && policy.authorityDay !== input.authorityDay) return { status: 'day-mismatch' };
    if (!validBinding(input)) return { status: 'conflict' };

    const existing = this.readOperation(input.executionId);
    if (existing) return this.replayReserve(existing, policy, input);
    if (policy?.frozenCode) return exhausted(input.authorityDay);

    const reservedUntilMs = safeAdd(nowMs, PRE_PERMIT_LEASE_MS);
    await this.armBeforeState(reservedUntilMs, nowMs);
    return this.ctx.storage.transactionSync(() => {
      const concurrentPolicy = this.readPolicy();
      if (concurrentPolicy && concurrentPolicy.authorityDay !== input.authorityDay) return { status: 'day-mismatch' as const };
      const concurrent = this.readOperation(input.executionId);
      if (concurrent) return this.replayReserve(concurrent, concurrentPolicy, input);
      if (concurrentPolicy?.frozenCode) return exhausted(input.authorityDay);

      if (!concurrentPolicy) {
        this.ctx.storage.sql.exec(
          'INSERT INTO owner_budget_policy (authority_day, policy_version, limit_nanodollars, frozen_code, created_at_ms) VALUES (?, ?, ?, NULL, ?)',
          input.authorityDay,
          OWNER_POLICY_VERSION,
          OWNER_DAILY_LIMIT_NANODOLLARS,
          nowMs,
        );
      } else if (concurrentPolicy.policyVersion !== input.policyVersion || concurrentPolicy.limitNanodollars !== OWNER_DAILY_LIMIT_NANODOLLARS) {
        return { status: 'conflict' as const };
      }

      const totals = this.readTotals();
      const admittedTotal = safeAdd(safeAdd(totals.spent, totals.reserved), input.reservationNanodollars);
      if (admittedTotal > OWNER_DAILY_LIMIT_NANODOLLARS) return exhausted(input.authorityDay);
      this.ctx.storage.sql.exec(
        `INSERT INTO owner_budget_operation (
          execution_id, request_authority_name, route, variant, reservation_nanodollars,
          settled_nanodollars, phase, breach_class, reserved_until_ms,
          transport_deadline_ms, committed_until_ms, terminal_at_ms
        ) VALUES (?, ?, ?, ?, ?, NULL, 'reserved', NULL, ?, NULL, NULL, NULL)`,
        input.executionId,
        input.requestAuthorityName,
        input.route,
        input.variant,
        input.reservationNanodollars,
        reservedUntilMs,
      );
      return { status: 'reserved' as const, reservedUntilMs };
    });
  }

  async commit(input: OwnerBudgetBinding): Promise<OwnerBudgetCommitResult> {
    if (!validBindingInput(input)) return { status: 'conflict' };
    const nowMs = authorityNow();
    if (!validUtcDay(input.authorityDay)) return { status: 'day-mismatch' };
    await this.sweepAtRpcStart(nowMs);
    const checked = this.checkedOperation(input);
    if (checked.status !== 'ok') return { status: checked.status };
    if (checked.row.phase === 'committed') return committedResult(checked.row);
    if (isTerminal(checked.row.phase)) return { status: checked.row.phase };

    const transportDeadlineMs = safeAdd(nowMs, TRANSPORT_LEASE_MS);
    const committedUntilMs = safeAdd(nowMs, COMMITTED_LEASE_MS);
    await this.armBeforeState(committedUntilMs, nowMs);
    return this.ctx.storage.transactionSync(() => {
      const current = this.checkedOperation(input);
      if (current.status !== 'ok') return { status: current.status };
      if (current.row.phase === 'committed') return committedResult(current.row);
      if (isTerminal(current.row.phase)) return { status: current.row.phase };
      this.ctx.storage.sql.exec(
        "UPDATE owner_budget_operation SET phase = 'committed', transport_deadline_ms = ?, committed_until_ms = ? WHERE execution_id = ? AND phase = 'reserved'",
        transportDeadlineMs,
        committedUntilMs,
        input.executionId,
      );
      return { status: 'committed' as const, transportDeadlineMs, committedUntilMs };
    });
  }

  async release(input: OwnerBudgetBinding): Promise<OwnerBudgetReleaseResult> {
    if (!validBindingInput(input)) return { status: 'conflict' };
    const nowMs = authorityNow();
    if (!validUtcDay(input.authorityDay)) return { status: 'day-mismatch' };
    await this.sweepAtRpcStart(nowMs);
    const checked = this.checkedOperation(input);
    if (checked.status !== 'ok') return { status: checked.status };
    if (checked.row.phase !== 'reserved') return { status: checked.row.phase };

    await this.armBeforeState(safeAdd(nowMs, ACCOUNTING_RETENTION_MS), nowMs);
    return this.ctx.storage.transactionSync(() => {
      const current = this.checkedOperation(input);
      if (current.status !== 'ok') return { status: current.status };
      if (current.row.phase !== 'reserved') return { status: current.row.phase };
      this.ctx.storage.sql.exec(
        "UPDATE owner_budget_operation SET phase = 'released', terminal_at_ms = ? WHERE execution_id = ? AND phase = 'reserved'",
        nowMs,
        input.executionId,
      );
      return { status: 'released' as const };
    });
  }

  async settle(input: OwnerBudgetSettlementInput): Promise<OwnerBudgetSettleResult> {
    const nowMs = authorityNow();
    if (!validSettlementInput(input)) return { status: 'conflict' };
    if (!validUtcDay(input.authorityDay)) return { status: 'day-mismatch' };
    await this.sweepAtRpcStart(nowMs);
    const checked = this.checkedOperation(input);
    if (checked.status !== 'ok') return { status: checked.status };
    if (isCommittedExpiryFull(checked.row)) return this.settleCommittedExpiry(input);
    if (checked.row.phase === 'settled' || checked.row.phase === 'settled_full') return replaySettlement(checked.row, this.readPolicy(), input);
    if (checked.row.phase !== 'committed') return { status: 'conflict' };

    await this.armBeforeState(safeAdd(nowMs, ACCOUNTING_RETENTION_MS), nowMs);
    return this.ctx.storage.transactionSync(() => {
      const current = this.checkedOperation(input);
      if (current.status !== 'ok') return { status: current.status };
      if (isCommittedExpiryFull(current.row)) return this.settleCommittedExpiryTransaction(input, current.row);
      if (current.row.phase === 'settled' || current.row.phase === 'settled_full') return replaySettlement(current.row, this.readPolicy(), input);
      if (current.row.phase !== 'committed') return { status: 'conflict' as const };
      const currentPolicy = this.readPolicy();
      if (!currentPolicy) return { status: 'conflict' as const };

      const settlement = decideSettlement(current.row, currentPolicy, input.costOutcome);
      if (settlement.freezeCode) {
        this.ctx.storage.sql.exec(
          'UPDATE owner_budget_policy SET frozen_code = ? WHERE authority_day = ? AND frozen_code IS NULL',
          settlement.freezeCode,
          input.authorityDay,
        );
      }
      this.ctx.storage.sql.exec(
        'UPDATE owner_budget_operation SET phase = ?, settled_nanodollars = ?, breach_class = ?, terminal_at_ms = ? WHERE execution_id = ? AND phase = \'committed\'',
        settlement.phase,
        settlement.amount,
        settlement.breachClass,
        nowMs,
        input.executionId,
      );
      const totals = this.readTotals();
      safeAdd(totals.spent, totals.reserved);
      return settlementResult(settlement.phase, settlement.breachClass, currentPolicy.frozenCode ?? settlement.freezeCode);
    });
  }

  async status(input: Readonly<{ authorityDay: string }>): Promise<OwnerBudgetStatusResult> {
    if (!validStatusInput(input)) return { status: 'day-mismatch' };
    const nowMs = authorityNow();
    if (!validUtcDay(input.authorityDay)) return { status: 'day-mismatch' };
    await this.sweepAtRpcStart(nowMs);
    const policy = this.readPolicy();
    if (policy && policy.authorityDay !== input.authorityDay) return { status: 'day-mismatch' };
    const totals = this.readTotals();
    const limit = policy?.limitNanodollars ?? OWNER_DAILY_LIMIT_NANODOLLARS;
    const used = safeAdd(totals.spent, totals.reserved);
    const remaining = Math.max(0, limit - used);
    assertSafeNonnegative(remaining);
    return {
      status: 'available',
      policyVersion: policy?.policyVersion ?? OWNER_POLICY_VERSION,
      authorityDay: input.authorityDay,
      limitNanodollars: limit,
      spentNanodollars: totals.spent,
      reservedNanodollars: totals.reserved,
      remainingNanodollars: remaining,
      exhausted: Boolean(policy?.frozenCode) || remaining < MINIMUM_RESERVATION_NANODOLLARS,
      frozen: Boolean(policy?.frozenCode),
      resetAt: resetAt(input.authorityDay),
    };
  }

  async alarm(): Promise<void> {
    const nowMs = authorityNow();
    const dueDeadline = this.earliestDueSweepDeadline(nowMs);
    if (dueDeadline !== null) await this.armBeforeState(dueDeadline, nowMs);
    this.sweepTransaction(nowMs);
    const next = this.earliestDeadline();
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  private createSchema(): void {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS owner_budget_policy (
      authority_day TEXT PRIMARY KEY,
      policy_version TEXT NOT NULL,
      limit_nanodollars INTEGER NOT NULL,
      frozen_code TEXT,
      created_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS owner_budget_operation (
      execution_id TEXT PRIMARY KEY,
      request_authority_name TEXT NOT NULL,
      route TEXT NOT NULL,
      variant TEXT NOT NULL,
      reservation_nanodollars INTEGER NOT NULL,
      settled_nanodollars INTEGER,
      phase TEXT NOT NULL CHECK(phase IN ('reserved','committed','released','settled','settled_full')),
      breach_class TEXT CHECK(breach_class IN ('primary_breach','primary_overflow','secondary_breach')),
      reserved_until_ms INTEGER NOT NULL,
      transport_deadline_ms INTEGER,
      committed_until_ms INTEGER,
      terminal_at_ms INTEGER
    )`);
  }

  private validateSchema(): void {
    const applicationTables = this.ctx.storage.sql.exec<{ name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    ).toArray().map(({ name }) => name);
    const policyColumns = this.ctx.storage.sql.exec<SchemaColumn>('PRAGMA table_info(owner_budget_policy)').toArray();
    const operationColumns = this.ctx.storage.sql.exec<SchemaColumn>('PRAGMA table_info(owner_budget_operation)').toArray();
    const operationSql = this.ctx.storage.sql.exec<{ sql: string | null }>(
      "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'owner_budget_operation'",
    ).toArray()[0]?.sql;
    if (!sameSchemaValue(applicationTables, ['owner_budget_operation', 'owner_budget_policy'])) throw new Error('owner budget schema unavailable');
    if (!sameSchemaValue(policyColumns, POLICY_COLUMNS)) throw new Error('owner budget schema unavailable');
    if (!sameSchemaValue(operationColumns, OPERATION_COLUMNS)) throw new Error('owner budget schema unavailable');
    if (!operationSql || !PHASE_CHECK.test(operationSql) || !BREACH_CHECK.test(operationSql)) throw new Error('owner budget schema unavailable');
  }

  private async sweepAtRpcStart(nowMs: number): Promise<void> {
    this.validateSchema();
    const dueDeadline = this.earliestDueSweepDeadline(nowMs);
    if (dueDeadline !== null) await this.armBeforeState(dueDeadline, nowMs);
    this.sweepTransaction(nowMs);
    await this.repairAlarmFromRpc(nowMs);
  }

  private settleCommittedExpiry(input: OwnerBudgetSettlementInput): OwnerBudgetSettleResult {
    return this.ctx.storage.transactionSync(() => {
      const current = this.checkedOperation(input);
      if (current.status !== 'ok') return { status: current.status };
      if (!isCommittedExpiryFull(current.row)) return replaySettlement(current.row, this.readPolicy(), input);
      return this.settleCommittedExpiryTransaction(input, current.row);
    });
  }

  private settleCommittedExpiryTransaction(input: OwnerBudgetSettlementInput, row: OperationRow): OwnerBudgetSettleResult {
    if (isConservativeCommittedExpiryOutcome(row, input.costOutcome)) {
      this.ctx.storage.sql.exec(
        `UPDATE owner_budget_operation SET transport_deadline_ms = NULL
         WHERE execution_id = ? AND phase = 'settled_full' AND breach_class IS NULL
           AND transport_deadline_ms IS NOT NULL AND committed_until_ms IS NOT NULL
           AND terminal_at_ms >= committed_until_ms`,
        input.executionId,
      );
      return { status: 'settled_full' };
    }
    const policy = this.readPolicy();
    if (!policy) return { status: 'conflict' };
    const settlement = decideSettlement(row, policy, input.costOutcome);
    if (settlement.freezeCode) {
      this.ctx.storage.sql.exec(
        'UPDATE owner_budget_policy SET frozen_code = ? WHERE authority_day = ? AND frozen_code IS NULL',
        settlement.freezeCode,
        input.authorityDay,
      );
    }
    this.ctx.storage.sql.exec(
      `UPDATE owner_budget_operation SET phase = ?, settled_nanodollars = ?, breach_class = ?
       WHERE execution_id = ? AND phase = 'settled_full' AND breach_class IS NULL
         AND committed_until_ms IS NOT NULL AND terminal_at_ms >= committed_until_ms`,
      settlement.phase,
      settlement.amount,
      settlement.breachClass,
      input.executionId,
    );
    const totals = this.readTotals();
    safeAdd(totals.spent, totals.reserved);
    return settlementResult(settlement.phase, settlement.breachClass, policy.frozenCode ?? settlement.freezeCode);
  }

  private sweepTransaction(nowMs: number): void {
    this.ctx.storage.transactionSync(() => {
      for (const row of this.readExpiring(nowMs)) {
        if (row.phase === 'reserved') {
          this.ctx.storage.sql.exec(
            "UPDATE owner_budget_operation SET phase = 'released', terminal_at_ms = ? WHERE execution_id = ? AND phase = 'reserved' AND reserved_until_ms <= ?",
            nowMs,
            row.executionId,
            nowMs,
          );
        } else {
          this.ctx.storage.sql.exec(
            "UPDATE owner_budget_operation SET phase = 'settled_full', settled_nanodollars = reservation_nanodollars, terminal_at_ms = ? WHERE execution_id = ? AND phase = 'committed' AND committed_until_ms <= ?",
            nowMs,
            row.executionId,
            nowMs,
          );
        }
      }
      const cutoff = nowMs - ACCOUNTING_RETENTION_MS;
      assertSafeNonnegative(cutoff);
      this.ctx.storage.sql.exec(
        "DELETE FROM owner_budget_operation WHERE phase IN ('released','settled','settled_full') AND terminal_at_ms <= ?",
        cutoff,
      );
      const totals = this.readTotals();
      safeAdd(totals.spent, totals.reserved);
    });
  }

  private async armBeforeState(requiredDeadlineMs: number, nowMs: number): Promise<void> {
    assertSafeNonnegative(requiredDeadlineMs);
    const target = Math.min(requiredDeadlineMs, safeAdd(nowMs, ALARM_SAFETY_MS));
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > target) await this.ctx.storage.setAlarm(target);
  }

  private async repairAlarmFromRpc(nowMs: number): Promise<void> {
    const next = this.earliestDeadline();
    if (next !== null) await this.armBeforeState(next, nowMs);
  }

  private earliestDeadline(): number | null {
    let earliest: number | null = null;
    for (const row of this.readAllOperations()) {
      const deadline = row.phase === 'reserved'
        ? row.reservedUntilMs
        : row.phase === 'committed'
          ? row.committedUntilMs
          : row.terminalAtMs === null
            ? null
            : safeAdd(row.terminalAtMs, ACCOUNTING_RETENTION_MS);
      if (deadline !== null && (earliest === null || deadline < earliest)) earliest = deadline;
    }
    return earliest;
  }

  private earliestDueSweepDeadline(nowMs: number): number | null {
    let earliest: number | null = null;
    for (const row of this.readAllOperations()) {
      let deadline: number | null = null;
      if (row.phase === 'reserved' && row.reservedUntilMs <= nowMs) deadline = safeAdd(nowMs, ACCOUNTING_RETENTION_MS);
      else if (row.phase === 'committed' && row.committedUntilMs !== null && row.committedUntilMs <= nowMs) deadline = safeAdd(nowMs, ACCOUNTING_RETENTION_MS);
      else if (isTerminal(row.phase) && row.terminalAtMs !== null) {
        const retentionDeadline = safeAdd(row.terminalAtMs, ACCOUNTING_RETENTION_MS);
        if (retentionDeadline <= nowMs) deadline = retentionDeadline;
      }
      if (deadline !== null && (earliest === null || deadline < earliest)) earliest = deadline;
    }
    return earliest;
  }

  private checkedOperation(input: OwnerBudgetBinding):
    | Readonly<{ status: 'ok'; row: OperationRow }>
    | Readonly<{ status: 'conflict' | 'day-mismatch' }> {
    const policy = this.readPolicy();
    if (!policy || policy.authorityDay !== input.authorityDay) return { status: 'day-mismatch' };
    const row = this.readOperation(input.executionId);
    if (!row || !validBinding(input) || !sameBinding(row, policy, input)) return { status: 'conflict' };
    return { status: 'ok', row };
  }

  private replayReserve(row: OperationRow, policy: PolicyRow | undefined, input: OwnerBudgetBinding): OwnerBudgetReserveResult {
    if (!policy || !sameBinding(row, policy, input)) return { status: 'conflict' };
    if (row.phase === 'released' || row.phase === 'settled' || row.phase === 'settled_full') return { status: row.phase };
    return { status: 'reserved', reservedUntilMs: row.reservedUntilMs };
  }

  private readPolicy(): PolicyRow | undefined {
    const row = this.ctx.storage.sql.exec<PolicyRow>(`SELECT
      authority_day AS authorityDay,
      policy_version AS policyVersion,
      limit_nanodollars AS limitNanodollars,
      frozen_code AS frozenCode,
      created_at_ms AS createdAtMs
      FROM owner_budget_policy LIMIT 1`).toArray()[0];
    if (row) {
      assertSafeNonnegative(row.limitNanodollars);
      assertSafeNonnegative(row.createdAtMs);
    }
    return row;
  }

  private readOperation(executionId: string): OperationRow | undefined {
    return this.readOperations('execution_id = ?', executionId)[0];
  }

  private readAllOperations(): OperationRow[] {
    return this.readOperations('1 = 1');
  }

  private readExpiring(nowMs: number): OperationRow[] {
    return this.readOperations("(phase = 'reserved' AND reserved_until_ms <= ?) OR (phase = 'committed' AND committed_until_ms <= ?)", nowMs, nowMs);
  }

  private readOperations(where: string, ...bindings: (string | number)[]): OperationRow[] {
    const rows = this.ctx.storage.sql.exec<OperationRow>(`SELECT
      execution_id AS executionId,
      request_authority_name AS requestAuthorityName,
      route,
      variant,
      reservation_nanodollars AS reservationNanodollars,
      settled_nanodollars AS settledNanodollars,
      phase,
      breach_class AS breachClass,
      reserved_until_ms AS reservedUntilMs,
      transport_deadline_ms AS transportDeadlineMs,
      committed_until_ms AS committedUntilMs,
      terminal_at_ms AS terminalAtMs
      FROM owner_budget_operation WHERE ${where}`, ...bindings).toArray();
    for (const row of rows) assertOperationSafe(row);
    return rows;
  }

  private readTotals(): Readonly<{ spent: number; reserved: number }> {
    const row = this.ctx.storage.sql.exec<{ spent: number; reserved: number }>(`SELECT
      COALESCE(SUM(CASE WHEN phase IN ('settled','settled_full') THEN settled_nanodollars ELSE 0 END), 0) AS spent,
      COALESCE(SUM(CASE WHEN phase IN ('reserved','committed') THEN reservation_nanodollars ELSE 0 END), 0) AS reserved
      FROM owner_budget_operation`).one();
    assertSafeNonnegative(row.spent);
    assertSafeNonnegative(row.reserved);
    return row;
  }
}

function decideSettlement(row: OperationRow, policy: PolicyRow, cost: OwnerBudgetSettlementInput['costOutcome']): Readonly<{
  phase: 'settled' | 'settled_full';
  amount: number;
  breachClass: OwnerBudgetBreachClass | null;
  freezeCode: OwnerBudgetFrozenCode | null;
}> {
  if (cost.kind === 'exact') {
    if (cost.nanodollars <= row.reservationNanodollars) {
      return { phase: 'settled', amount: cost.nanodollars, breachClass: null, freezeCode: null };
    }
    if (policy.frozenCode) {
      return { phase: 'settled_full', amount: row.reservationNanodollars, breachClass: 'secondary_breach', freezeCode: null };
    }
    return { phase: 'settled', amount: cost.nanodollars, breachClass: 'primary_breach', freezeCode: 'accounting_policy_breach' };
  }
  if (cost.kind === 'positive-overflow') {
    return policy.frozenCode
      ? { phase: 'settled_full', amount: row.reservationNanodollars, breachClass: 'secondary_breach', freezeCode: null }
      : { phase: 'settled_full', amount: row.reservationNanodollars, breachClass: 'primary_overflow', freezeCode: 'accounting_cost_overflow' };
  }
  return { phase: 'settled_full', amount: row.reservationNanodollars, breachClass: null, freezeCode: null };
}

function replaySettlement(row: OperationRow, policy: PolicyRow | undefined, input: OwnerBudgetSettlementInput): OwnerBudgetSettleResult {
  if (row.phase === 'settled') {
    if (input.costOutcome.kind !== 'exact' || row.settledNanodollars !== input.costOutcome.nanodollars) return { status: 'conflict' };
  } else {
    const compatibleFullReplay = row.breachClass === null
      ? isAcknowledgedCommittedExpiryFull(row)
        ? isConservativeCommittedExpiryOutcome(row, input.costOutcome)
        : input.costOutcome.kind === 'missing' || input.costOutcome.kind === 'malformed'
      : row.breachClass === 'primary_overflow'
        ? input.costOutcome.kind === 'positive-overflow'
        : row.breachClass === 'secondary_breach'
          ? input.costOutcome.kind === 'positive-overflow'
            || (input.costOutcome.kind === 'exact' && input.costOutcome.nanodollars > row.reservationNanodollars)
          : false;
    if (!compatibleFullReplay) return { status: 'conflict' };
  }
  const phase = row.phase === 'settled' ? 'settled' : 'settled_full';
  return settlementResult(phase, row.breachClass, policy?.frozenCode ?? null);
}

function settlementResult(
  phase: 'settled' | 'settled_full',
  breachClass: OwnerBudgetBreachClass | null,
  frozenCode: OwnerBudgetFrozenCode | null,
): OwnerBudgetSettleResult {
  if (breachClass && frozenCode) return { status: phase, breachClass, frozenCode };
  return { status: phase };
}

function committedResult(row: OperationRow): OwnerBudgetCommitResult {
  if (row.transportDeadlineMs === null || row.committedUntilMs === null) return { status: 'conflict' };
  return { status: 'committed', transportDeadlineMs: row.transportDeadlineMs, committedUntilMs: row.committedUntilMs };
}

function isCommittedExpiryFull(row: OperationRow): boolean {
  return row.phase === 'settled_full'
    && row.breachClass === null
    && row.transportDeadlineMs !== null
    && row.committedUntilMs !== null
    && row.terminalAtMs !== null
    && row.terminalAtMs >= row.committedUntilMs;
}

function isAcknowledgedCommittedExpiryFull(row: OperationRow): boolean {
  return row.phase === 'settled_full'
    && row.breachClass === null
    && row.transportDeadlineMs === null
    && row.committedUntilMs !== null
    && row.terminalAtMs !== null
    && row.terminalAtMs >= row.committedUntilMs;
}

function isConservativeCommittedExpiryOutcome(row: OperationRow, cost: CostOutcome): boolean {
  return cost.kind === 'missing'
    || cost.kind === 'malformed'
    || (cost.kind === 'exact' && cost.nanodollars <= row.reservationNanodollars);
}

function validBindingInput(input: unknown): input is OwnerBudgetBinding {
  return isRecord(input)
    && sameSchemaValue(Object.keys(input).sort(), BINDING_KEYS)
    && validBindingFieldTypes(input);
}

function validBindingFieldTypes(input: Record<string, unknown>): boolean {
  return typeof input.executionId === 'string'
    && typeof input.requestAuthorityName === 'string'
    && typeof input.authorityDay === 'string'
    && typeof input.route === 'string'
    && typeof input.variant === 'string'
    && typeof input.policyVersion === 'string'
    && typeof input.reservationNanodollars === 'number';
}

function validBinding(input: OwnerBudgetBinding): boolean {
  if (!UUID.test(input.executionId) || !AUTHORITY_NAME.test(input.requestAuthorityName)) return false;
  if (input.policyVersion !== OWNER_POLICY_VERSION || !Number.isSafeInteger(input.reservationNanodollars) || input.reservationNanodollars < 0) return false;
  const policy = OWNER_VARIANT_POLICY[input.variant];
  return policy !== undefined && policy.route === input.route && policy.reservationNanodollars === input.reservationNanodollars;
}

function validSettlementInput(input: unknown): input is OwnerBudgetSettlementInput {
  return isRecord(input)
    && sameSchemaValue(Object.keys(input).sort(), SETTLEMENT_KEYS)
    && validBindingFieldTypes(input)
    && validCostOutcome(input.costOutcome);
}

function validStatusInput(input: unknown): input is Readonly<{ authorityDay: string }> {
  return isRecord(input)
    && sameSchemaValue(Object.keys(input).sort(), STATUS_KEYS)
    && typeof input.authorityDay === 'string';
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

function sameBinding(row: OperationRow, policy: PolicyRow, input: OwnerBudgetBinding): boolean {
  return row.executionId === input.executionId
    && row.requestAuthorityName === input.requestAuthorityName
    && row.route === input.route
    && row.variant === input.variant
    && row.reservationNanodollars === input.reservationNanodollars
    && policy.authorityDay === input.authorityDay
    && policy.policyVersion === input.policyVersion;
}

function validUtcDay(day: string): boolean {
  if (!UTC_DAY.test(day)) return false;
  const milliseconds = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isSafeInteger(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === day;
}

function resetAt(day: string): string {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return new Date(safeAdd(start, 86_400_000)).toISOString();
}

function exhausted(day: string): Readonly<{ status: 'exhausted'; resetAt: string }> {
  return { status: 'exhausted', resetAt: resetAt(day) };
}

function isTerminal(phase: Phase): phase is 'released' | 'settled' | 'settled_full' {
  return phase === 'released' || phase === 'settled' || phase === 'settled_full';
}

function authorityNow(): number {
  const nowMs = Date.now();
  assertSafeNonnegative(nowMs);
  return nowMs;
}

function safeAdd(left: number, right: number): number {
  assertSafeNonnegative(left);
  assertSafeNonnegative(right);
  const result = left + right;
  assertSafeNonnegative(result);
  return result;
}

function assertOperationSafe(row: OperationRow): void {
  for (const value of [
    row.reservationNanodollars,
    row.settledNanodollars,
    row.reservedUntilMs,
    row.transportDeadlineMs,
    row.committedUntilMs,
    row.terminalAtMs,
  ]) {
    if (value !== null) assertSafeNonnegative(value);
  }
}

function assertSafeNonnegative(value: number): asserts value is number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('owner budget integer unavailable');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameSchemaValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
