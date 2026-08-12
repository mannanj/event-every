import { describe, expect, test } from 'bun:test';
import { createBindingCandidates, normalizeRequestUuid, providerRequestName } from '../request-binding';

const id = '123e4567-e89b-42d3-a456-426614174000';

describe('provider request binding', () => {
  test('normalizes only lower-case RFC UUIDs and derives a stable domain-separated name', async () => {
    expect(normalizeRequestUuid(id)).toBe(id);
    expect(() => normalizeRequestUuid(id.toUpperCase())).toThrow('invalid request uuid');
    expect(() => normalizeRequestUuid('123e4567-e89b-12d3-a456-426614174000')).toThrow('invalid request uuid');
    expect(() => normalizeRequestUuid('123e4567-e89b-02d3-a456-426614174000')).toThrow('invalid request uuid');
    await expect(providerRequestName(id)).resolves.toBe('7a8a547aeb4f1f01718a29860f095cb8f116138dc28e9c321b57ecc9b9af0b5e');
  });

  test('rejects duplicate key versions', async () => {
    await expect(createBindingCandidates({ route: 'scan', variant: 'scan-text', canonicalJson: '{}', current: { version: 'v1', key: 'a' }, previous: { version: 'v1', key: 'b' } })).rejects.toThrow('duplicate shape key version');
  });

  test('constructs current and previous shape HMAC candidates without retaining the body', async () => {
    const candidates = await createBindingCandidates({
      route: 'scan', variant: 'scan-text', canonicalJson: '{"source":"only-in-memory"}',
      current: { version: 'current-v1', key: 'current-key' }, previous: { version: 'previous-v1', key: 'previous-key' },
    });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.version)).toEqual(['current-v1', 'previous-v1']);
    expect(candidates[0]?.digest).not.toBe(candidates[1]?.digest);
    expect(JSON.stringify(candidates)).not.toContain('only-in-memory');
  });

  test('matches the domain-separated HMAC vector', async () => {
    await expect(createBindingCandidates({ route: 'scan', variant: 'scan-text', canonicalJson: '{"a":1}', current: { version: 'v1', key: 'vector-key' } })).resolves.toEqual([
      { version: 'v1', digest: 'ba0722de418857f70de64c46f888e77cc6b229f302b0cc2c000403407c09865c' },
    ]);
  });
});
