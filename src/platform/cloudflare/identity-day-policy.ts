// @ts-expect-error cloudflare:workers is provided by Workerd, not the Next.js type graph.
import { DurableObject } from 'cloudflare:workers';
import { utcDay } from '../resolver/capability';
import type { DurableObjectStateLike } from '../contracts';

type FreezeInput = Readonly<{ scheduleDigest: string; proposedVersion: string; nowMs: number }>;

export class IdentityDayPolicy extends DurableObject<Record<string, never>> {
  private readonly ctx: DurableObjectStateLike;

  constructor(ctx: DurableObjectStateLike, env: Record<string, never>) {
    super(ctx, env);
    this.ctx = ctx;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS identity_day_policy (
        utc_day TEXT PRIMARY KEY,
        schedule_digest TEXT NOT NULL,
        version TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      )`);
    });
  }

  async freeze(input: FreezeInput): Promise<{ status: 'frozen'; version: string } | { status: 'conflict' }> {
    const trustedDay = utcDay(input.nowMs);
    if (!input.scheduleDigest || !/^[A-Za-z0-9._-]{1,64}$/.test(input.proposedVersion)) return { status: 'conflict' };
    return this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql.exec<{ scheduleDigest: string; version: string }>(
        'SELECT schedule_digest AS scheduleDigest, version FROM identity_day_policy WHERE utc_day = ?', trustedDay,
      ).toArray()[0];
      if (row) return row.scheduleDigest === input.scheduleDigest && row.version === input.proposedVersion
        ? { status: 'frozen' as const, version: row.version }
        : { status: 'conflict' as const };
      this.ctx.storage.sql.exec(
        'INSERT INTO identity_day_policy (utc_day, schedule_digest, version, created_at_ms) VALUES (?, ?, ?, ?)',
        trustedDay, input.scheduleDigest, input.proposedVersion, input.nowMs,
      );
      return { status: 'frozen' as const, version: input.proposedVersion };
    });
  }
}
