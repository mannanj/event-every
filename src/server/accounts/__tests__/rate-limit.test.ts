import { describe, expect, test } from 'bun:test';

import { bucketKey } from '@/server/accounts/rate-limit';

const SECRET = 'test-secret-not-used-anywhere-real';

describe('rate limit bucket keys', () => {
  test('the stored key does not contain the address', async () => {
    // The whole point: a dump of rate_limit must not be a list of who tried to
    // sign in.
    const key = await bucketKey('email', 'ada@example.com', SECRET);
    expect(key).not.toContain('ada@example.com');
    expect(key).not.toContain('ada');
    expect(key).not.toContain('example.com');
  });

  test('the stored key does not contain the IP', async () => {
    const key = await bucketKey('ip', '203.0.113.4', SECRET);
    expect(key).not.toContain('203.0.113.4');
  });

  test('the kind stays legible so two kinds cannot collide', async () => {
    expect(await bucketKey('email', 'a@b.c', SECRET)).toStartWith('email:');
    expect(await bucketKey('ip', '203.0.113.4', SECRET)).toStartWith('ip:');
  });

  test('the same input counts against the same bucket', async () => {
    // Counting behaviour has to be unchanged, or the limit stops limiting.
    expect(await bucketKey('email', 'ada@example.com', SECRET)).toBe(
      await bucketKey('email', 'ada@example.com', SECRET),
    );
  });

  test('different people get different buckets', async () => {
    expect(await bucketKey('email', 'ada@example.com', SECRET)).not.toBe(
      await bucketKey('email', 'grace@example.com', SECRET),
    );
  });

  test('the same value as an address and as an IP are different buckets', async () => {
    expect(await bucketKey('email', 'x', SECRET)).not.toBe(await bucketKey('ip', 'x', SECRET));
  });

  test('another secret produces another bucket', async () => {
    // Rotating the secret resets the windows rather than silently reusing them.
    expect(await bucketKey('email', 'ada@example.com', SECRET)).not.toBe(
      await bucketKey('email', 'ada@example.com', 'a-different-secret'),
    );
  });

  test('a missing secret refuses rather than keying in the clear', async () => {
    // Falling back to a plain key would quietly turn the table back into a log
    // of people, which is exactly the bug this fixes.
    await expect(bucketKey('email', 'ada@example.com', undefined)).rejects.toThrow(
      /RATE_LIMIT_HASH_SECRET/,
    );
    await expect(bucketKey('email', 'ada@example.com', '')).rejects.toThrow(/refusing/);
  });

  test('the key is fixed length regardless of input length', async () => {
    const short = await bucketKey('email', 'a@b.c', SECRET);
    const long = await bucketKey('email', `${'x'.repeat(180)}@example.com`, SECRET);
    expect(short.length).toBe(long.length);
  });
});

describe('the second bucket actually gets a handle', () => {
  test('reads the identity admission substitutes, not a caller header', async () => {
    const { clientHandle } = await import('@/server/accounts/turnstile');
    // Two versions of this shipped inert because they read headers admission had
    // already deleted, and the limit counted nothing while looking configured.
    const admitted = new Request('https://eventevery.com/api/auth/challenge', {
      headers: { 'x-event-every-identity': 'local-v1:abc123' },
    });
    expect(clientHandle(admitted)).toBe('local-v1:abc123');
  });

  test('an IP header alone yields no handle, because admission strips those', async () => {
    const { clientHandle } = await import('@/server/accounts/turnstile');
    const spoofed = new Request('https://eventevery.com/api/auth/challenge', {
      headers: { 'cf-connecting-ip': '203.0.113.4', 'x-forwarded-for': '198.51.100.9' },
    });
    expect(clientHandle(spoofed)).toBeNull();
  });
});
