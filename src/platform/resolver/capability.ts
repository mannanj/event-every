import { normalizeUrl } from '../../utils/url';
import { REQUEST_NAME_DOMAIN, RESOLVER_BLACKOUT_MS, RESOLVER_URL_MAX_BYTES, URL_HMAC_DOMAIN } from '../contracts';


type IssueInput = Readonly<{ identity: string; urls: readonly string[]; nowMs: number; key: string; nonce?: string }>;
type VerifyInput = Readonly<{ identity: string; urls: readonly string[]; nowMs: number; key: string }>;
type Payload = Readonly<{ v: 1; identity: string; urls: readonly string[]; authorityDay: string; issuedAtMs: number; expiresAtMs: number; nonce: string }>;
type Issued = Readonly<{ status: 'issued'; capability: string; capabilityDigest: string; authorityDay: string; expiresAtMs: number; urls: readonly string[] }>;
type Valid = Readonly<{ status: 'valid'; payload: Payload; capabilityDigest: string }>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextUtcMidnightMs(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function isTrustedUtcDay(day: string, nowMs: number): boolean {
  return day === utcDay(nowMs);
}

function canonicalize(urls: readonly string[]): string[] | null {
  if (urls.length > 10) return null;
  const output: string[] = [];
  for (const value of urls) {
    const normalized = normalizeUrl(value);
    if (!normalized || encoder.encode(normalized).byteLength > RESOLVER_URL_MAX_BYTES) return null;
    output.push(normalized);
  }
  return output;
}

async function hmacHex(keyText: string, value: string): Promise<string> {
  if (keyText.length === 0) return '';
  const key = await crypto.subtle.importKey('raw', encoder.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function decodeBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function sameHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function issueResolverCapability(input: IssueInput): Promise<{ status: 'day-rollover' } | Issued> {
  const blackoutStartMs = nextUtcMidnightMs(input.nowMs) - RESOLVER_BLACKOUT_MS;
  if (input.nowMs >= blackoutStartMs) return { status: 'day-rollover' };
  const urls = canonicalize(input.urls);
  if (urls === null || input.key.length === 0 || input.identity.length === 0) return { status: 'day-rollover' };
const expiresAtMs = Math.min(input.nowMs + 120_000, blackoutStartMs);
  const payload: Payload = {
    v: 1,
    identity: input.identity,
    urls,
    authorityDay: utcDay(input.nowMs),
    issuedAtMs: input.nowMs,
    expiresAtMs,
    nonce: input.nonce ?? crypto.randomUUID(),
  };
  const encoded = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacHex(input.key, encoded);
  const capability = `${encoded}.${signature}`;
  return { status: 'issued', capability, capabilityDigest: await sha256Hex(capability), authorityDay: payload.authorityDay, expiresAtMs, urls };
}

export async function verifyResolverCapability(capability: string, input: VerifyInput): Promise<{ status: 'invalid' } | Valid> {
  const [encoded, signature, extra] = capability.split('.');
  if (!encoded || !signature || extra !== undefined || input.key.length === 0) return { status: 'invalid' };
  if (!sameHex(signature, await hmacHex(input.key, encoded))) return { status: 'invalid' };
  let payload: Payload;
  try { payload = JSON.parse(decoder.decode(decodeBase64Url(encoded))) as Payload; } catch { return { status: 'invalid' }; }
  const urls = canonicalize(input.urls);
  if (
    payload.v !== 1 || payload.identity !== input.identity || urls === null
    || JSON.stringify(payload.urls) !== JSON.stringify(urls)
    || !Number.isSafeInteger(payload.issuedAtMs) || !Number.isSafeInteger(payload.expiresAtMs)
    || input.nowMs < payload.issuedAtMs || input.nowMs >= payload.expiresAtMs
    || !isTrustedUtcDay(payload.authorityDay, input.nowMs)
  ) return { status: 'invalid' };
  return { status: 'valid', payload, capabilityDigest: await sha256Hex(capability) };
}

export async function resolverRequestAuthorityName(requestId: string): Promise<string> {
  return sha256Hex(`${REQUEST_NAME_DOMAIN}${requestId}`);
}

export function canonicalUrlHmac(key: string, canonicalUrl: string): Promise<string> {
  return hmacHex(key, `${URL_HMAC_DOMAIN}${canonicalUrl}`);
}
