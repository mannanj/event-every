/**
 * Event Every signed in to a sister app - Calendar first.
 *
 * The OAuth mechanics are the shared package's
 * (src/vendor/mcp-connector/linked-app.ts); this module only decides which app,
 * which account, and where the tokens live (sealed, in `linked_app`). Event
 * Every needs only the connection for now, so there is no `read`.
 */
import type { D1Like } from '@/server/accounts/d1';
import {
  finishSignIn,
  revoke,
  seal,
  startSignIn,
  unseal,
  type LinkedTokens,
  type SignInFlow,
} from '@/vendor/mcp-connector/linked-app';
import { isLinkedAppId, type LinkedAppId } from '@/lib/linked-apps';
import { linkedAppRepo } from './repository';

/** The name Calendar's "Connected" list shows for this sign-in. */
export const CLIENT_NAME = 'Event Every';

const TOKENS = 'tokens';
const FLOW = 'flow';
export const FLOW_COOKIE = 'ee_linked_flow';

const DEFAULT_MCP_URLS: Record<LinkedAppId, string> = {
  calendar: 'https://calendar-mcp.mannanteam.workers.dev/mcp',
};

export interface LinkedEnv {
  LINKED_APPS_SECRET?: string;
  /** Overrides Calendar's MCP URL; used by tests to point at a local fake. */
  CALENDAR_MCP_URL?: string;
}

/**
 * Null when unconfigured: the feature is off, not broken. Dev and test get a
 * fixed key so the flow runs locally; production never does - there a missing
 * secret fails closed rather than sealing every token under a known key.
 */
export function linkedSecret(env: LinkedEnv = {}, nodeEnv: string | undefined = process.env.NODE_ENV): string | null {
  const configured = env.LINKED_APPS_SECRET?.trim() || process.env.LINKED_APPS_SECRET?.trim();
  if (configured) return configured;
  if (nodeEnv === 'production') return null;
  return 'dev-only-linked-apps-secret';
}

export class LinkedAppUnavailable extends Error {
  name = 'LinkedAppUnavailable';
}

/** Everything one request needs: whose account, which database, the sealing key. */
export interface LinkedCtx {
  db: D1Like;
  accountId: string;
  secret: string | null;
  env?: LinkedEnv;
}

function secretOrThrow(ctx: LinkedCtx): string {
  if (!ctx.secret) throw new LinkedAppUnavailable('LINKED_APPS_SECRET is not set');
  return ctx.secret;
}

const server = (ctx: LinkedCtx, appId: LinkedAppId) => ({
  mcpUrl: (appId === 'calendar' && (ctx.env?.CALENDAR_MCP_URL?.trim() || process.env.CALENDAR_MCP_URL?.trim())) || DEFAULT_MCP_URLS[appId],
});

export const linkedApps = {
  async status(ctx: LinkedCtx): Promise<{ appId: LinkedAppId; connectedAt: number }[]> {
    const rows = await linkedAppRepo.listSignedIn(ctx.db, ctx.accountId);
    return rows.map((r) => ({ appId: r.app_id, connectedAt: Math.floor((r.connected_at ?? r.updated_at) / 1000) }));
  },

  /** Where to send the browser, and the sealed cookie that must come back with it. */
  async start(
    ctx: LinkedCtx,
    appId: LinkedAppId,
    input: { redirectUri: string; returnTo: string },
  ): Promise<{ location: string; cookie: string }> {
    const secret = secretOrThrow(ctx);
    const { location, flow } = await startSignIn({
      appId,
      server: server(ctx, appId),
      clientName: CLIENT_NAME,
      redirectUri: input.redirectUri,
      returnTo: input.returnTo,
      owner: ctx.accountId,
    });
    return { location, cookie: await seal(secret, FLOW, flow) };
  },

  async finish(
    ctx: LinkedCtx,
    input: { cookie: string | undefined; query: URLSearchParams },
  ): Promise<{ ok: true; appId: LinkedAppId; returnTo: string } | { ok: false; reason: string; returnTo: string }> {
    const secret = secretOrThrow(ctx);
    const flow = await unseal<SignInFlow>(secret, FLOW, input.cookie);
    const returnTo = flow?.returnTo ?? '/';
    // The app is whatever the sealed flow says this browser started.
    const appId = flow && isLinkedAppId(flow.appId) ? flow.appId : null;
    if (!appId) return { ok: false, reason: 'state', returnTo };
    const result = await finishSignIn({ flow, query: input.query, owner: ctx.accountId, server: server(ctx, appId) });
    if (!result.ok) return { ok: false, reason: result.reason, returnTo };
    await linkedAppRepo.signIn(ctx.db, ctx.accountId, appId, await seal(secret, TOKENS, result.tokens));
    return { ok: true, appId, returnTo };
  },

  async signOut(ctx: LinkedCtx, appId: LinkedAppId): Promise<void> {
    const row = await linkedAppRepo.get(ctx.db, ctx.accountId, appId);
    const tokens = ctx.secret ? await unseal<LinkedTokens>(ctx.secret, TOKENS, row?.tokens_sealed) : null;
    // Forget first: whatever their server says, this account stops using it.
    await linkedAppRepo.signOut(ctx.db, ctx.accountId, appId);
    if (tokens) await revoke(server(ctx, appId), tokens);
  },
};
