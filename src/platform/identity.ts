import type { EdgeIdentity } from './contracts';

export type IdentitySchedule = Readonly<{
  currentVersion: string;
  nextVersion: string | null;
  activatesAtMs: number | null;
  digest: string;
}>;

export function proposedIdentityVersion(schedule: IdentitySchedule, nowMs: number): string {
  const currentValid = KEY_VERSION.test(schedule.currentVersion);
  const nextValid = schedule.nextVersion === null || KEY_VERSION.test(schedule.nextVersion);
  const rotationShape = schedule.nextVersion === null
    ? schedule.activatesAtMs === null
    : schedule.activatesAtMs !== null && schedule.nextVersion !== schedule.currentVersion;
  if (!currentValid || !nextValid || !rotationShape || schedule.digest.length === 0) {
    throw new Error('invalid identity schedule');
  }
  if (schedule.nextVersion === null || schedule.activatesAtMs === null) return schedule.currentVersion;
return nowMs < schedule.activatesAtMs ? schedule.currentVersion : schedule.nextVersion;
}

export const IDENTITY_HMAC_DOMAIN = 'event-every/edge-identity/v1\0';
export const INTERNAL_IDENTITY_HEADER = 'x-event-every-identity';

const UNKNOWN_IDENTITY: EdgeIdentity = Object.freeze({ kind: 'unknown', keyVersion: '', hmac: '' });
const KEY_VERSION = /^[A-Za-z0-9._-]{1,64}$/;

type IdentityBindings = Readonly<{
  IDENTITY_KEY_CURRENT_VERSION: string;
  IDENTITY_HMAC_CURRENT: string;
}>;

export type TrustedEdgeAddressPort = Readonly<{
  readAddress(request: Request): string | null;
}>;

function readConnectingIpHeader(request: Request): string | null {
  return request.headers.get('cf-connecting-ip');
}

export const headerBackedTrustedEdgeAddressForTests: TrustedEdgeAddressPort = Object.freeze({
  readAddress: readConnectingIpHeader,
});

export const cloudflareTrustedEdgeAddress: TrustedEdgeAddressPort = Object.freeze({
  readAddress(request) {
    const cf = (request as Request & Readonly<{ cf?: unknown }>).cf;
    if (cf === null || typeof cf !== 'object') return null;
    return readConnectingIpHeader(request);
  },
});

export async function deriveEdgeIdentity(
  request: Request,
  bindings: IdentityBindings,
  trustedEdge: TrustedEdgeAddressPort,
): Promise<EdgeIdentity> {
  const source = trustedEdge.readAddress(request);
  const canonicalIp = source === null || source.includes(',') ? null : parseCanonicalIp(source);
  if (
    canonicalIp === null
    || !KEY_VERSION.test(bindings.IDENTITY_KEY_CURRENT_VERSION)
    || bindings.IDENTITY_HMAC_CURRENT.length === 0
  ) {
    return UNKNOWN_IDENTITY;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(bindings.IDENTITY_HMAC_CURRENT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${IDENTITY_HMAC_DOMAIN}${canonicalIp}`),
  );
  const hmac = Array.from(
    new Uint8Array(signed),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    kind: 'known',
    keyVersion: bindings.IDENTITY_KEY_CURRENT_VERSION,
    hmac,
  };
}

export function identityHeaderValue(identity: EdgeIdentity): string {
  return identity.kind === 'known'
    ? `known:${identity.keyVersion}:${identity.hmac}`
    : 'unknown';
}

function parseCanonicalIp(value: string): string | null {
  if (value.length === 0 || value !== value.trim()) return null;
  const ipv4 = parseIpv4(value);
  if (ipv4 !== null) return ipv4.join('.');
  return parseIpv6(value);
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

function parseIpv6(value: string): string | null {
  if (!value.includes(':') || value.includes('%') || value.includes('[') || value.includes(']')) return null;

  let hexadecimal = value;
  if (hexadecimal.includes('.')) {
    const finalColon = hexadecimal.lastIndexOf(':');
    if (finalColon < 0) return null;
    const ipv4 = parseIpv4(hexadecimal.slice(finalColon + 1));
    if (ipv4 === null) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    hexadecimal = `${hexadecimal.slice(0, finalColon)}:${high}:${low}`;
  }

  const compression = hexadecimal.indexOf('::');
  if (compression !== hexadecimal.lastIndexOf('::')) return null;

  let groups: number[];
  if (compression >= 0) {
    const left = hexadecimal.slice(0, compression);
    const right = hexadecimal.slice(compression + 2);
    const leftGroups = parseIpv6Groups(left);
    const rightGroups = parseIpv6Groups(right);
    if (leftGroups === null || rightGroups === null) return null;
    const omitted = 8 - leftGroups.length - rightGroups.length;
    if (omitted < 1) return null;
    groups = [...leftGroups, ...new Array<number>(omitted).fill(0), ...rightGroups];
  } else {
    const parsed = parseIpv6Groups(hexadecimal);
    if (parsed === null || parsed.length !== 8) return null;
    groups = parsed;
  }

  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) {
      index++;
      continue;
    }
    let end = index + 1;
    while (end < groups.length && groups[end] === 0) end++;
    const length = end - index;
    if (length >= 2 && length > bestLength) {
      bestStart = index;
      bestLength = length;
    }
    index = end;
  }

  const canonical = groups.map((group) => group.toString(16));
  if (bestStart < 0) return canonical.join(':');
  const left = canonical.slice(0, bestStart).join(':');
  const right = canonical.slice(bestStart + bestLength).join(':');
  return `${left}::${right}`;
}

function parseIpv6Groups(value: string): number[] | null {
  if (value === '') return [];
  const groups = value.split(':');
  if (groups.some((group) => !/^[0-9A-Fa-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}
