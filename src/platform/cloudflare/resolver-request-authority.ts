// @ts-expect-error cloudflare:workers is provided by Workerd, not the Next.js type graph.
import { DurableObject } from 'cloudflare:workers';
import { RESOLVER_TOMBSTONE_MS, type DurableObjectStateLike } from '../contracts';
import { isTrustedUtcDay, utcDay } from '../resolver/capability';

type BeginInput = Readonly<{ requestId: string; authorityDay: string; identityVersion: string; identityHmac: string; canonicalUrlHmac: string; capabilityDigest: string; permitDeadlineMs: number; nowMs: number }>;
type ClaimInput = Readonly<{ executionId: string; nowMs: number; currentUtcDay: string }>;
type Stored = Readonly<{ executionId: string; requestId: string; authorityDay: string; identityVersion: string; identityHmac: string; canonicalUrlHmac: string; capabilityDigest: string; permitDeadlineMs: number; state: 'begun' | 'claimed' | 'complete' | 'unknown'; nonce: string | null; outcome: 'success' | 'failed' | 'unknown' | null }>;

export class ResolverRequestAuthority extends DurableObject<Record<string, never>> {
  private readonly ctx: DurableObjectStateLike;

  constructor(ctx: DurableObjectStateLike, env: Record<string, never>) {
    super(ctx, env);
    this.ctx = ctx;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS resolver_request (
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
      )`);
    });
  }

  async begin(input: BeginInput): Promise<{ status: 'begun'; executionId: string } | { status: 'conflict' | 'expired' | 'day-mismatch' }> {
if (!isTrustedUtcDay(input.authorityDay, input.nowMs)) {
      return { status: 'day-mismatch' };
    }
    if (input.nowMs >= input.permitDeadlineMs) return { status: 'expired' };
    return this.ctx.storage.transactionSync(() => {
      const stored = this.readByRequestId(input.requestId);
      if (stored) {
        const same = stored.authorityDay === input.authorityDay && stored.identityVersion === input.identityVersion
          && stored.identityHmac === input.identityHmac && stored.canonicalUrlHmac === input.canonicalUrlHmac
          && stored.capabilityDigest === input.capabilityDigest && stored.permitDeadlineMs === input.permitDeadlineMs;
        return same && stored.state === 'begun'
          ? { status: 'begun' as const, executionId: stored.executionId }
          : { status: 'conflict' as const };
      }
      const executionId = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        `INSERT INTO resolver_request (execution_id, request_id, authority_day, identity_version, identity_hmac, canonical_url_hmac, capability_digest, permit_deadline_ms, state, nonce, outcome, created_at_ms, updated_at_ms, tombstone_until_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'begun', NULL, NULL, ?, ?, ?)`,
        executionId, input.requestId, input.authorityDay, input.identityVersion, input.identityHmac,
        input.canonicalUrlHmac, input.capabilityDigest, input.permitDeadlineMs, input.nowMs, input.nowMs,
        input.nowMs + RESOLVER_TOMBSTONE_MS,
      );
      return { status: 'begun' as const, executionId };
    });
  }

  async claim(input: ClaimInput): Promise<{ status: 'permit'; nonce: string } | { status: 'inflight' | 'complete' | 'unknown' | 'expired' | 'day-mismatch' }> {
if (!isTrustedUtcDay(input.currentUtcDay, input.nowMs)) {
      return { status: 'day-mismatch' };
    }
    return this.ctx.storage.transactionSync(() => {
      const stored = this.readByExecutionId(input.executionId);
      const trustedDay = utcDay(input.nowMs);
      if (!stored || stored.authorityDay !== trustedDay) return { status: 'day-mismatch' as const };
      if (stored.state !== 'begun') {
return { status: stored.state === 'claimed' ? 'inflight' as const : stored.state };
      }
      if (input.nowMs >= stored.permitDeadlineMs) {
        this.ctx.storage.sql.exec("UPDATE resolver_request SET state = 'unknown', outcome = 'unknown', nonce = NULL, updated_at_ms = ? WHERE execution_id = ?", input.nowMs, input.executionId);
        return { status: 'expired' as const };
      }
      const nonce = crypto.randomUUID();
      this.ctx.storage.sql.exec("UPDATE resolver_request SET state = 'claimed', nonce = ?, updated_at_ms = ? WHERE execution_id = ?", nonce, input.nowMs, input.executionId);
      return { status: 'permit' as const, nonce };
    });
  }

  async complete(input: { executionId: string; outcome: 'success' | 'failed' | 'unknown'; nowMs: number }): Promise<{ status: 'stored' | 'conflict' }> {
    return this.ctx.storage.transactionSync(() => {
      const stored = this.readByExecutionId(input.executionId);
      if (!stored || !isTrustedUtcDay(stored.authorityDay, input.nowMs)) return { status: 'conflict' as const };
      if (stored.state === 'complete' || stored.state === 'unknown') return stored.outcome === input.outcome ? { status: 'stored' as const } : { status: 'conflict' as const };
      const state = input.outcome === 'unknown' ? 'unknown' : 'complete';
      this.ctx.storage.sql.exec('UPDATE resolver_request SET state = ?, outcome = ?, updated_at_ms = ? WHERE execution_id = ?', state, input.outcome, input.nowMs, input.executionId);
      return { status: 'stored' as const };
    });
  }

  private readByRequestId(requestId: string): Stored | undefined { return this.read('request_id', requestId); }
  private readByExecutionId(executionId: string): Stored | undefined { return this.read('execution_id', executionId); }
  private read(column: 'request_id' | 'execution_id', value: string): Stored | undefined {
    return this.ctx.storage.sql.exec<Stored>(`SELECT execution_id AS executionId, request_id AS requestId, authority_day AS authorityDay, identity_version AS identityVersion, identity_hmac AS identityHmac, canonical_url_hmac AS canonicalUrlHmac, capability_digest AS capabilityDigest, permit_deadline_ms AS permitDeadlineMs, state, nonce, outcome FROM resolver_request WHERE ${column} = ?`, value).toArray()[0];
  }
}
