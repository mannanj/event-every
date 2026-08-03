import { describe, expect, test } from 'bun:test';
import {
  cloudflareTrustedEdgeAddress,
  deriveEdgeIdentity,
  headerBackedTrustedEdgeAddressForTests,
  identityHeaderValue,
} from '@/platform/identity';

const bindings = {
  IDENTITY_KEY_CURRENT_VERSION: 'test-v7',
  IDENTITY_HMAC_CURRENT: 'synthetic-identity-secret',
};

const trustedEdge = headerBackedTrustedEdgeAddressForTests;

const edgeRequest = (headers: HeadersInit = {}) => new Request('https://event-every.test/api/scan', { headers });

describe('trusted edge identity', () => {
  test('forged forwarding header is ignored', async () => {
    const forged = await deriveEdgeIdentity(edgeRequest({
      'x-forwarded-for': '203.0.113.77',
      'x-real-ip': '203.0.113.78',
      'x-event-every-identity': 'known:forged:deadbeef',
    }), bindings, trustedEdge);
    const differentForgery = await deriveEdgeIdentity(edgeRequest({
      'x-forwarded-for': '198.51.100.2',
      'x-real-ip': '198.51.100.3',
      'x-event-every-identity': 'known:also-forged:cafebabe',
    }), bindings, trustedEdge);

    expect(forged).toEqual({ kind: 'unknown', keyVersion: '', hmac: '' });
    expect(differentForgery).toEqual(forged);
    expect(identityHeaderValue(forged)).toBe('unknown');
  });

  test('derives the versioned domain-separated Web Crypto HMAC for one IPv4 address', async () => {
    const identity = await deriveEdgeIdentity(
      edgeRequest({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '192.0.2.9' }),
      bindings,
      trustedEdge,
    );

    expect(identity).toEqual({
      kind: 'known',
      keyVersion: 'test-v7',
      hmac: 'b358152868b3580bc1efdaa911a5d460d63386a1e08169c8358642a794b7d3d2',
    });
    expect(identityHeaderValue(identity)).toBe(`known:test-v7:${identity.hmac}`);
  });

  test('canonicalizes equivalent IPv6 spellings before HMAC derivation', async () => {
    const compressed = await deriveEdgeIdentity(edgeRequest({ 'cf-connecting-ip': '2001:db8::ff00:42:8329' }), bindings, trustedEdge);
    const expanded = await deriveEdgeIdentity(edgeRequest({
      'cf-connecting-ip': '2001:0DB8:0000:0000:0000:FF00:0042:8329',
    }), bindings, trustedEdge);

    expect(compressed).toEqual(expanded);
    expect(compressed).toEqual({
      kind: 'known',
      keyVersion: 'test-v7',
      hmac: '6dc3f22684d7457130a0117bd86da2bfa870bd00a1cd7140b4c2b8109d7cf6a6',
    });
  });

  test.each([
    ['missing', undefined],
    ['malformed', 'not-an-ip'],
    ['non-canonical IPv4 octets', '203.0.113.007'],
    ['conflicting', '203.0.113.7, 198.51.100.4'],
    ['zone-scoped IPv6', 'fe80::1%eth0'],
    ['bracketed IPv6', '[2001:db8::1]'],
  ])('maps %s CF-Connecting-IP to the same stable unknown shard', async (_case, value) => {
    const headers: Record<string, string> = {};
    if (value !== undefined) headers['cf-connecting-ip'] = value;
    const identity = await deriveEdgeIdentity(edgeRequest(headers), bindings, trustedEdge);
    expect(identity).toEqual({ kind: 'unknown', keyVersion: '', hmac: '' });
    expect(identityHeaderValue(identity)).toBe('unknown');
  });

  test('keeps the key version in the reference and changes the HMAC with the key', async () => {
    const request = edgeRequest({ 'cf-connecting-ip': '192.0.2.44' });
    const current = await deriveEdgeIdentity(request, bindings, trustedEdge);
    const rotated = await deriveEdgeIdentity(request, {
      IDENTITY_KEY_CURRENT_VERSION: 'test-v8',
      IDENTITY_HMAC_CURRENT: 'synthetic-next-secret',
    }, trustedEdge);

    expect(rotated.keyVersion).toBe('test-v8');
    expect(rotated.hmac).not.toBe(current.hmac);
    expect(identityHeaderValue(rotated)).toMatch(/^known:test-v8:[0-9a-f]{64}$/);
  });

  test('a bare request cannot forge Cloudflare identity provenance', async () => {
    const identity = await deriveEdgeIdentity(
      edgeRequest({ 'cf-connecting-ip': '203.0.113.7' }),
      bindings,
      cloudflareTrustedEdgeAddress,
    );
    expect(identity).toEqual({ kind: 'unknown', keyVersion: '', hmac: '' });
  });

  test('locks independent IPv4 and IPv6 HMAC vectors', async () => {
    const ipv4 = await deriveEdgeIdentity(edgeRequest({ 'cf-connecting-ip': '203.0.113.7' }), bindings, trustedEdge);
    const ipv6 = await deriveEdgeIdentity(edgeRequest({ 'cf-connecting-ip': '2001:db8::ff00:42:8329' }), bindings, trustedEdge);
    expect(ipv4.hmac).toBe('b358152868b3580bc1efdaa911a5d460d63386a1e08169c8358642a794b7d3d2');
    expect(ipv6.hmac).toBe('6dc3f22684d7457130a0117bd86da2bfa870bd00a1cd7140b4c2b8109d7cf6a6');
  });
});
