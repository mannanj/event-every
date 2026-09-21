import type { D1Like } from './d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import type { AttachmentBucket } from './attachments';
import type { EmailSendBinding } from './email';

/**
 * The bindings the account system needs.
 *
 * Deliberately a separate accessor from `@/platform/cloudflare-context`: that
 * one throws `provider_state_unavailable` when the scanner's authorities are
 * missing, and sign-in must keep working when event processing does not. A
 * frozen owner budget takes the scanner offline; it should never take the door
 * off the building.
 */
export interface AccountsEnv {
  /** The per-app accounts database, not the shared waitlist one. */
  ACCOUNTS_DB?: D1Like;

  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  EMAIL?: EmailSendBinding;

  /** Public Turnstile site key. Handed to the browser, so not a secret. */
  TURNSTILE_SITEKEY?: string;
  /** Used only for server-side siteverify, never sent to a client. */
  TURNSTILE_SECRET?: string;

  /** Master key for envelope encryption. 32 bytes, base64. */
  ACCOUNT_DATA_KEK?: string;

  /**
   * Backed-up original files, sealed under the same per-account key the events
   * use. Optional: an account without it simply cannot turn backup on, and
   * everything else works exactly as before.
   */
  ATTACHMENTS?: AttachmentBucket;

  /** Keys the rate-limit bucket hashes, so the table is not a log of people. */
  RATE_LIMIT_HASH_SECRET?: string;

  /** Absolute origin, used to build the magic link that goes in the email. */
  APP_ORIGIN?: string;
}

export function accountsEnv(): AccountsEnv {
  return getCloudflareContext().env as CloudflareEnv & AccountsEnv;
}

/**
 * The accounts database, or a thrown error naming what is missing.
 *
 * Accounts are additive: every route that needs them checks here first and
 * answers "accounts are not available" rather than failing oddly, so a
 * deployment without the binding degrades to the anonymous app it was before.
 */
export function accountsDb(env: AccountsEnv = accountsEnv()): D1Like {
  if (!env.ACCOUNTS_DB) throw new Error('accounts_unavailable');
  return env.ACCOUNTS_DB;
}

export function accountsConfigured(env: AccountsEnv = accountsEnv()): boolean {
  return Boolean(env.ACCOUNTS_DB && env.ACCOUNT_DATA_KEK);
}

/**
 * Attachment backup is available only when the bucket, the master key and the
 * database are all present. Without any of them the account menu does not offer
 * it, which is better than offering a switch that silently does nothing.
 */
export function attachmentsConfigured(env: AccountsEnv = accountsEnv()): boolean {
  return Boolean(env.ATTACHMENTS && env.ACCOUNT_DATA_KEK && env.ACCOUNTS_DB);
}

export function attachmentsBucket(env: AccountsEnv = accountsEnv()): AttachmentBucket {
  if (!env.ATTACHMENTS) throw new Error('attachments_unavailable');
  return env.ATTACHMENTS;
}

/** Where the magic link points. Falls back to the request's own origin. */
export function appOrigin(request: Request, env: AccountsEnv = accountsEnv()): string {
  return env.APP_ORIGIN && env.APP_ORIGIN.length > 0
    ? env.APP_ORIGIN
    : new URL(request.url).origin;
}
