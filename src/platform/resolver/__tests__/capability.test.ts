import { describe, expect, test } from 'bun:test';
import {
  issueResolverCapability,
  resolverRequestAuthorityName,
  verifyResolverCapability,
} from '@/platform/resolver/capability';

const key = 'synthetic-resolver-capability-key';
const identity = 'known:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const dayStart = Date.UTC(2026, 7, 3);

describe('resolver capability', () => {
  test('capability expires before blackout', async () => {
    const nowMs = dayStart + 86_400_000 - 120_000;
    const issued = await issueResolverCapability({ identity, urls: ['https://one.test/', 'https://two.test/event'], nowMs, key, nonce: 'nonce-1' });
    expect(issued.status).toBe('issued');
    if (issued.status !== 'issued') return;
    expect(issued.expiresAtMs).toBe(dayStart + 86_400_000 - 15_000);
  });

  test('HMAC binds the ordered canonical list and trusted identity', async () => {
    const issued = await issueResolverCapability({ identity, urls: ['https://one.test/', 'https://two.test/event'], nowMs: dayStart + 1_000, key, nonce: 'nonce-2' });
    expect(issued.status).toBe('issued');
    if (issued.status !== 'issued') return;
    expect((await verifyResolverCapability(issued.capability, { identity, urls: issued.urls, nowMs: dayStart + 2_000, key })).status).toBe('valid');
    expect((await verifyResolverCapability(issued.capability, { identity: `${identity}-changed`, urls: issued.urls, nowMs: dayStart + 2_000, key })).status).toBe('invalid');
    expect((await verifyResolverCapability(issued.capability, { identity, urls: [...issued.urls].reverse(), nowMs: dayStart + 2_000, key })).status).toBe('invalid');
  });

  test('blackout issues no capability and request names reveal no UUID', async () => {
    expect((await issueResolverCapability({ identity, urls: ['https://one.test/'], nowMs: dayStart + 86_400_000 - 15_000, key, nonce: 'nonce-3' }))).toEqual({ status: 'day-rollover' });
    const name = await resolverRequestAuthorityName('018f47a0-7b5c-7cc4-9a34-123456789abc');
    expect(name).toMatch(/^[0-9a-f]{64}$/);
    expect(name).not.toContain('018f47a0');
  });

  test('old capability after midnight is invalid before any state lookup', async () => {
    const issued = await issueResolverCapability({ identity, urls: ['https://one.test/'], nowMs: dayStart + 1_000, key, nonce: 'nonce-4' });
    expect(issued.status).toBe('issued');
    if (issued.status !== 'issued') return;
    await expect(verifyResolverCapability(issued.capability, { identity, urls: issued.urls, nowMs: dayStart + 86_400_000 + 1, key })).resolves.toEqual({ status: 'invalid' });
  });
});
