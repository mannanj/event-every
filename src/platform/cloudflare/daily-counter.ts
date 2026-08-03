// @ts-expect-error cloudflare:workers is provided by Workerd, not the Next.js type graph.
import { DurableObject } from 'cloudflare:workers';
import { RESOLVER_BLACKOUT_MS, RESOLVER_DAILY_LIMIT, RESOLVER_LEASE_MS, RESOLVER_MAX_CONCURRENT, type DurableObjectStateLike, type SqlStorageLike } from '../contracts';
import { isTrustedUtcDay, nextUtcMidnightMs } from '../resolver/capability';

type AdmitInput = Readonly<{ executionId: string; requestAuthorityName: string; identityHmac: string; authorityDay: string; currentUtcDay: string; nowMs: number }>;
type Lease = Readonly<{ leaseId: string; executionId: string; requestAuthorityName: string; authorityDay: string; identityHmac: string; phase: 'before-outbound' | 'after-outbound'; expiresAtMs: number }>;
type ResolverAuthorityStub = Readonly<{ complete(input: { executionId: string; outcome: 'unknown'; nowMs: number }): Promise<{ status: 'stored' | 'conflict' }> }>;
type ResolverCounterEnv = Readonly<{ RESOLVER_REQUEST_AUTHORITY: Readonly<{ idFromName(name: string): unknown; get(id: unknown): ResolverAuthorityStub }> }>;

export function incrementDailyCountSql(sql: SqlStorageLike, authorityDay: string, identityHmac: string): void {
  sql.exec(`INSERT INTO resolver_daily_count (authority_day, identity_hmac, consumed) VALUES (?, ?, 1)
    ON CONFLICT(authority_day, identity_hmac) DO UPDATE SET consumed = consumed + 1`, authorityDay, identityHmac);
}

export class DailyCounter extends DurableObject<ResolverCounterEnv> {
  private readonly ctx: DurableObjectStateLike;
  private readonly env: ResolverCounterEnv;

  constructor(ctx: DurableObjectStateLike, env: ResolverCounterEnv) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS resolver_daily_count (
        authority_day TEXT NOT NULL,
        identity_hmac TEXT NOT NULL,
        consumed INTEGER NOT NULL CHECK(consumed >= 0),
        PRIMARY KEY (authority_day, identity_hmac)
      ); CREATE TABLE IF NOT EXISTS resolver_lease (
        lease_id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL UNIQUE,
        request_authority_name TEXT NOT NULL CHECK(length(request_authority_name) = 64),
        authority_day TEXT NOT NULL,
        identity_hmac TEXT NOT NULL,
        phase TEXT NOT NULL CHECK(phase IN ('before-outbound','after-outbound')),
        expires_at_ms INTEGER NOT NULL
      ); CREATE TABLE IF NOT EXISTS resolver_reconcile_outbox (
        execution_id TEXT PRIMARY KEY,
        request_authority_name TEXT NOT NULL CHECK(length(request_authority_name) = 64),
        outcome TEXT NOT NULL CHECK(outcome = 'unknown'),
        created_at_ms INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      )`);
    });
  }

  async admitResolver(input: AdmitInput): Promise<{ status: 'admitted'; leaseId: string; expiresAtMs: number } | { status: 'busy'; retryAfterSeconds: number } | { status: 'daily-limit'; resetAt: string } | { status: 'day-rollover' | 'day-mismatch' }> {
if (!isTrustedUtcDay(input.currentUtcDay, input.nowMs)) {
      return { status: 'day-mismatch' };
    }
    if (input.authorityDay !== input.currentUtcDay || !/^[0-9a-f]{64}$/.test(input.requestAuthorityName)) return { status: 'day-mismatch' };
    if (input.nowMs >= nextUtcMidnightMs(input.nowMs) - RESOLVER_BLACKOUT_MS) return { status: 'day-rollover' };
    return this.ctx.storage.transactionSync(() => {
      const expired = this.readLeases('expires_at_ms <= ?', input.nowMs);
      for (const lease of expired) {
this.moveExpiredLeaseToOutbox(lease, input.nowMs);
        this.ctx.storage.sql.exec('DELETE FROM resolver_lease WHERE lease_id = ?', lease.leaseId);
      }
      const active = this.readLeases('authority_day = ? AND identity_hmac = ?', input.authorityDay, input.identityHmac);
      const activeLeases = active.length;
if (activeLeases >= RESOLVER_MAX_CONCURRENT) return busyResult(input.nowMs, active);
      const count = this.ctx.storage.sql.exec<{ consumed: number }>('SELECT consumed FROM resolver_daily_count WHERE authority_day = ? AND identity_hmac = ?', input.authorityDay, input.identityHmac).toArray()[0]?.consumed ?? 0;
      if (count >= RESOLVER_DAILY_LIMIT) return { status: 'daily-limit' as const, resetAt: new Date(nextUtcMidnightMs(input.nowMs)).toISOString() };
      const leaseId = crypto.randomUUID();
      const expiresAtMs = input.nowMs + RESOLVER_LEASE_MS;
      this.ctx.storage.sql.exec("INSERT INTO resolver_lease (lease_id, execution_id, request_authority_name, authority_day, identity_hmac, phase, expires_at_ms) VALUES (?, ?, ?, ?, ?, 'before-outbound', ?)", leaseId, input.executionId, input.requestAuthorityName, input.authorityDay, input.identityHmac, expiresAtMs);
      incrementDailyCountSql(this.ctx.storage.sql, input.authorityDay, input.identityHmac);
      this.ctx.storage.setAlarm(expiresAtMs);
      return { status: 'admitted' as const, leaseId, expiresAtMs };
    });
  }

  async releaseResolver(input: { executionId: string; leaseId: string; phase: 'before-outbound' | 'after-outbound'; nowMs: number }): Promise<{ status: 'released' | 'consumed' | 'conflict' }> {
    return this.ctx.storage.transactionSync(() => {
      const lease = this.ctx.storage.sql.exec<Lease>('SELECT lease_id AS leaseId, execution_id AS executionId, request_authority_name AS requestAuthorityName, authority_day AS authorityDay, identity_hmac AS identityHmac, phase, expires_at_ms AS expiresAtMs FROM resolver_lease WHERE lease_id = ?', input.leaseId).toArray()[0];
      if (!lease || lease.executionId !== input.executionId || !isTrustedUtcDay(lease.authorityDay, input.nowMs)) return { status: 'conflict' as const };
      this.ctx.storage.sql.exec('DELETE FROM resolver_lease WHERE lease_id = ?', input.leaseId);
      return { status: input.phase === 'before-outbound' ? 'released' as const : 'consumed' as const };
    });
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now();
    for (const lease of this.readLeases('expires_at_ms <= ?', nowMs)) {
      this.moveExpiredLeaseToOutbox(lease, nowMs);
      this.ctx.storage.sql.exec('DELETE FROM resolver_lease WHERE lease_id = ?', lease.leaseId);
    }
    const rows = this.ctx.storage.sql.exec<{ executionId: string; requestAuthorityName: string }>('SELECT execution_id AS executionId, request_authority_name AS requestAuthorityName FROM resolver_reconcile_outbox ORDER BY created_at_ms LIMIT 20').toArray();
    let retry = false;
    for (const row of rows) {
      try {
        const stub = this.env.RESOLVER_REQUEST_AUTHORITY.get(this.env.RESOLVER_REQUEST_AUTHORITY.idFromName(row.requestAuthorityName));
        const result = await stub.complete({ executionId: row.executionId, outcome: 'unknown', nowMs });
        if (result.status === 'stored') this.ctx.storage.sql.exec('DELETE FROM resolver_reconcile_outbox WHERE execution_id = ?', row.executionId);
        else retry = true;
      } catch {
        this.ctx.storage.sql.exec('UPDATE resolver_reconcile_outbox SET attempts = attempts + 1 WHERE execution_id = ?', row.executionId);
        retry = true;
      }
    }
    if (retry || this.readLeases('1 = 1').length > 0) await this.ctx.storage.setAlarm(nowMs + RESOLVER_LEASE_MS);
  }

  private moveExpiredLeaseToOutbox(lease: Lease, nowMs: number): void {
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO resolver_reconcile_outbox (execution_id, request_authority_name, outcome, created_at_ms) VALUES (?, ?, 'unknown', ?)", lease.executionId, lease.requestAuthorityName, nowMs);
  }
  private readLeases(where: string, ...values: (string | number)[]): Lease[] {
    return this.ctx.storage.sql.exec<Lease>(`SELECT lease_id AS leaseId, execution_id AS executionId, request_authority_name AS requestAuthorityName, authority_day AS authorityDay, identity_hmac AS identityHmac, phase, expires_at_ms AS expiresAtMs FROM resolver_lease WHERE ${where}`, ...values).toArray();
  }
}

function busyResult(nowMs: number, leases: readonly Lease[]): { status: 'busy'; retryAfterSeconds: number } {
  const earliest = Math.min(...leases.map((lease) => lease.expiresAtMs));
  return { status: 'busy', retryAfterSeconds: Math.max(1, Math.min(10, Math.ceil((earliest - nowMs) / 1_000))) };
}
