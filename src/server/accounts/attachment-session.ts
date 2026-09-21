import { NextResponse } from 'next/server';

import type { Account } from './auth';
import { readSession } from './auth';
import type { AttachmentBucket } from './attachments';
import type { D1Like } from './d1';
import {
  accountsDb,
  accountsEnv,
  attachmentsBucket,
  attachmentsConfigured,
  type AccountsEnv,
} from './env';
import { accountDek } from './store';

/**
 * The door every /api/attachments/* route goes through.
 *
 * These are browser requests carrying the session cookie - unlike the MCP
 * routes next door, which carry a signed actor token because a Worker on
 * another host has no cookie to send. Both end in the same place: an account
 * id taken from something the caller could not have forged, and a data key
 * derived from it.
 */

const HEADERS = { 'Cache-Control': 'no-store' } as const;

export interface AttachmentContext {
  db: D1Like;
  env: AccountsEnv;
  bucket: AttachmentBucket;
  account: Account;
  dek: CryptoKey;
}

export type AttachmentGate =
  | { ok: true; context: AttachmentContext }
  | { ok: false; response: NextResponse };

export function attachmentJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function refuse(error: string, status: number): { ok: false; response: NextResponse } {
  return { ok: false, response: attachmentJson({ error }, status) };
}

export async function requireAttachmentSession(request: Request): Promise<AttachmentGate> {
  const env = accountsEnv();
  if (!attachmentsConfigured(env)) {
    return refuse('Attachment backup is not available.', 503);
  }

  let db: D1Like;
  try {
    db = accountsDb(env);
  } catch {
    return refuse('Attachment backup is not available.', 503);
  }

  const account = await readSession(db, request.headers.get('cookie'));
  if (!account) return refuse('Not signed in.', 401);

  // Derived per request rather than cached. The key is the account's, the
  // request is the account's, and holding one across requests in a Worker
  // isolate that serves several at once is how they get crossed.
  const dek = await accountDek(db, env.ACCOUNT_DATA_KEK!, account.id);

  return { ok: true, context: { db, env, bucket: attachmentsBucket(env), account, dek } };
}
