// Crockford-ish base32: no I, L, O or U, so tokens stay unambiguous when read
// aloud or typed by hand.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A URL-safe random token. 10 chars ~= 50 bits of entropy. */
export function randomToken(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function newId(): string {
  return crypto.randomUUID();
}
