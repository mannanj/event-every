/**
 * Envelope encryption for synced events.
 *
 * WHY, GIVEN D1 IS ALREADY ENCRYPTED AT REST
 *
 * D1's at-rest encryption is transparent: every query returns plaintext. It
 * defends against someone carrying off the physical disks and against nothing
 * else — not a leaked API token, not dashboard access, not a query bug that
 * returns the wrong account's rows. Those are the failures that actually
 * happen. The accepted migration design already takes this position for R2
 * ("encrypted before R2. R2 platform encryption is defense in depth"); this is
 * the same stance applied to D1.
 *
 * THE SHAPE
 *
 *   KEK   one master key, a Worker secret, never written to any database
 *   DEK   one data key per account, stored only sealed under the KEK
 *   row   AES-256-GCM(DEK, event JSON), with a fresh 96-bit nonce per write
 *
 * A dump of the accounts database therefore yields wrapped keys and ciphertext.
 * Recovering a single event needs the KEK, which is not in it.
 *
 * THE CEILING, STATED PLAINLY
 *
 * The Worker can decrypt. This is not protection against a compromised Worker,
 * and it is not end-to-end encryption. Passwordless sign-in leaves no user
 * secret to derive a key from, so the alternative is making the user hold a
 * passphrase or recovery code they can lose — which trades a real threat for a
 * permanent data-loss mode. `key_version` exists on every row and every wrapped
 * key so that choice can be revisited without a schema change.
 *
 * AAD BINDS CIPHERTEXT TO ITS ROW
 *
 * Every seal is authenticated with `${accountId}:${eventId}` as additional
 * data. Moving a ciphertext to another row or another account makes the open
 * fail rather than silently returning someone else's event under a new id.
 */

const KEY_VERSION = 1;
const NONCE_BYTES = 12;

export interface Sealed {
  nonce: string;
  ciphertext: string;
  keyVersion: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function nonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
}

/**
 * The master key, from a Worker secret. Rejects anything but 32 bytes rather
 * than silently accepting a short key: a truncated or placeholder KEK would
 * encrypt perfectly well and protect nothing.
 */
export async function importKek(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) throw new Error('ACCOUNT_DATA_KEK must be 32 bytes, base64 encoded');
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

async function seal(
  key: CryptoKey,
  plaintext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Sealed> {
  const iv = nonce();
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return {
    nonce: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(sealed)),
    keyVersion: KEY_VERSION,
  };
}

async function open(
  key: CryptoKey,
  sealed: Readonly<{ nonce: string; ciphertext: string }>,
  additionalData: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(sealed.nonce) as BufferSource,
      additionalData: additionalData as BufferSource,
    },
    key,
    fromBase64(sealed.ciphertext) as BufferSource,
  );
  return new Uint8Array(plaintext);
}

/** A fresh account data key, sealed under the master key for storage. */
export async function createWrappedDek(kek: CryptoKey, accountId: string): Promise<Sealed> {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  return seal(kek, dek, new TextEncoder().encode(`dek:${accountId}`));
}

export async function unwrapDek(
  kek: CryptoKey,
  accountId: string,
  wrapped: Readonly<{ nonce: string; ciphertext: string }>,
): Promise<CryptoKey> {
  const raw = await open(kek, wrapped, new TextEncoder().encode(`dek:${accountId}`));
  return importDek(raw);
}

function rowAad(accountId: string, eventId: string): Uint8Array {
  return new TextEncoder().encode(`${accountId}:${eventId}`);
}

export async function sealEvent(
  dek: CryptoKey,
  accountId: string,
  eventId: string,
  event: unknown,
): Promise<Sealed> {
  const plaintext = new TextEncoder().encode(JSON.stringify(event));
  return seal(dek, plaintext, rowAad(accountId, eventId));
}

/**
 * The same envelope, for a file's bytes.
 *
 * Attachments live in R2 rather than D1, and the split is only about size: a
 * photo does not belong in a row. Everything else is identical - the same
 * per-account DEK, the same AES-GCM, the same AAD binding the ciphertext to one
 * account and one file id, so an object moved between accounts will not open.
 *
 * The ciphertext is returned as BYTES, not base64: it is written straight to an
 * R2 object, and base64 would add a third to every stored photo for nothing.
 * Only the nonce is base64, because that half lives in D1 beside the metadata.
 */
export interface SealedBytes {
  nonce: string;
  ciphertext: Uint8Array;
  keyVersion: number;
}

function fileAad(accountId: string, fileId: string): Uint8Array {
  return new TextEncoder().encode(`file:${accountId}:${fileId}`);
}

export async function sealFile(
  dek: CryptoKey,
  accountId: string,
  fileId: string,
  bytes: Uint8Array,
): Promise<SealedBytes> {
  const iv = nonce();
  const sealed = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      additionalData: fileAad(accountId, fileId) as BufferSource,
    },
    dek,
    bytes as BufferSource,
  );
  return { nonce: toBase64(iv), ciphertext: new Uint8Array(sealed), keyVersion: KEY_VERSION };
}

/** Null rather than a throw, for the same reason `openEvent` returns null. */
export async function openFile(
  dek: CryptoKey,
  accountId: string,
  fileId: string,
  sealed: Readonly<{ nonce: string; ciphertext: Uint8Array }>,
): Promise<Uint8Array | null> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(sealed.nonce) as BufferSource,
        additionalData: fileAad(accountId, fileId) as BufferSource,
      },
      dek,
      sealed.ciphertext as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

/**
 * Returns null rather than throwing when a row will not open. A single corrupt
 * or wrong-key row must not fail the whole sync and lock someone out of every
 * other event they own.
 */
export async function openEvent(
  dek: CryptoKey,
  accountId: string,
  eventId: string,
  sealed: Readonly<{ nonce: string; ciphertext: string }>,
): Promise<unknown | null> {
  try {
    const plaintext = await open(dek, sealed, rowAad(accountId, eventId));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}
