/**
 * Request plumbing shared by the /api/linked-apps routes: who is asking, which
 * app, and the absolute URLs a redirect has to carry.
 */
import { NextResponse } from 'next/server';
import { readSession } from '@/server/accounts/auth';
import { accountsConfigured, accountsDb, accountsEnv, appOrigin } from '@/server/accounts/env';
import { isLinkedAppId, type LinkedAppId } from '@/lib/linked-apps';
import { linkedSecret, type LinkedCtx, type LinkedEnv } from './service';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function failJson(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/** A signed-in person (and, when `app` is given, an app we know). */
export async function personAndApp(
  request: Request,
  app: string | null,
): Promise<{ ctx: LinkedCtx; appId: LinkedAppId | null; origin: string } | { error: NextResponse }> {
  if (app !== null && !isLinkedAppId(app)) return { error: failJson(404, 'Unknown app') };
  const env = accountsEnv();
  if (!accountsConfigured(env)) return { error: failJson(503, 'Accounts are not available.') };
  let account;
  try {
    account = await readSession(accountsDb(env), request.headers.get('cookie'));
  } catch {
    return { error: failJson(503, 'Accounts are not available.') };
  }
  if (!account) return { error: failJson(401, 'Not signed in.') };
  const linkedEnv = env as LinkedEnv;
  return {
    ctx: { db: accountsDb(env), accountId: account.id, secret: linkedSecret(linkedEnv), env: linkedEnv },
    appId: app as LinkedAppId | null,
    origin: appOrigin(request, env).replace(/\/+$/, ''),
  };
}

export function callbackUrl(origin: string): string {
  return `${origin}/api/linked-apps/callback`;
}

/** Scoped to the linked-apps routes; the flow is ten minutes, one hop out and back. */
export function flowCookie(name: string, value: string, origin: string, maxAge = 600): string {
  const secure = origin.startsWith('https:') ? '; Secure' : '';
  return `${name}=${value}; Path=/api/linked-apps; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
