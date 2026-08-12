import type { ProviderRoute, ProviderVariant } from './contracts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const text = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');

export function normalizeRequestUuid(value: string): string {
  if (!UUID.test(value)) throw new Error('invalid request uuid');
  return value.toLowerCase();
}

export async function providerRequestName(requestId: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', text.encode(`event-every/provider-request/v1\0${normalizeRequestUuid(requestId)}`)));
}

export type ShapeKey = Readonly<{ version: string; key: string }>;
export type BindingCandidate = Readonly<{ version: string; digest: string }>;
export async function createBindingCandidates(input: Readonly<{ route: ProviderRoute; variant: ProviderVariant; canonicalJson: string; current: ShapeKey; previous?: ShapeKey }>): Promise<readonly BindingCandidate[]> {
  const keys = [input.current, input.previous].filter((value): value is ShapeKey => Boolean(value));
  if (new Set(keys.map((value) => value.version)).size !== keys.length) throw new Error('duplicate shape key version');
  const material = text.encode(`event-every/provider-shape/v1\0${input.route}\0${input.variant}\0${input.canonicalJson}`);
  return Promise.all(keys.map(async ({ version, key }) => {
    if (!version || !key) throw new Error('invalid shape key');
    const imported = await crypto.subtle.importKey('raw', text.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return Object.freeze({ version, digest: hex(await crypto.subtle.sign('HMAC', imported, material)) });
  }));
}
