import { describe, expect, test } from 'bun:test';
import { PROVIDER_BODY_MAX_BYTES, parseBoundedProviderJson, parseCostLexeme, readBoundedProviderJson } from '../cost';
import type { CostOutcome } from '../contracts';

describe('lossless provider cost accounting', () => {
  test.each<[string, CostOutcome]>([
    ['0', { kind: 'exact', nanodollars: 0 }],
    ['0.0000000001', { kind: 'exact', nanodollars: 1 }],
    ['0.1234567890', { kind: 'exact', nanodollars: 123_456_789 }],
    ['5', { kind: 'exact', nanodollars: 5_000_000_000 }],
    ['01', { kind: 'malformed' }],
    ['-1', { kind: 'malformed' }],
    ['1e100', { kind: 'positive-overflow' }],
    ['9.007194254740992e6', { kind: 'positive-overflow' }],
  ])('classifies %s without binary rounding', (lexeme, expected) => {
    expect(parseCostLexeme(lexeme)).toEqual(expected);
  });

  test('rejects duplicate usage and usage.cost before decoding', () => {
    expect(() => parseBoundedProviderJson('{"usage":{"cost":1},"usage":{"cost":2}}')).toThrow('duplicate usage');
    expect(() => parseBoundedProviderJson('{"usage":{"cost":1,"cost":2}}')).toThrow('duplicate usage.cost');
  });

  test('preserves the source lexeme and refuses trailing data', () => {
    expect(parseBoundedProviderJson('{"usage":{"cost":0.0000000001}}').costLexeme).toBe('0.0000000001');
    expect(() => parseBoundedProviderJson('{"usage":{}} trailing')).toThrow('trailing JSON');
  });

  test('accepts only JSON-defined whitespace', () => {
    expect(() => parseBoundedProviderJson('\u00a0{"usage":{"cost":1}}')).toThrow('malformed JSON');
    expect(() => parseBoundedProviderJson('{"usage":{"cost":1}}\ufeff')).toThrow('trailing JSON');
    expect(() => parseBoundedProviderJson('\u2028{"usage":{"cost":1}}')).toThrow('malformed JSON');
    expect(parseBoundedProviderJson('\t\r\n {"usage":{"cost":1}} \n').costLexeme).toBe('1');
  });

  test('uses the aggregate-safe ceiling and only observes accounting keys at their exact paths', () => {
    expect(parseCostLexeme('9007194.254740991')).toEqual({ kind: 'exact', nanodollars: 9_007_194_254_740_991 });
    expect(parseCostLexeme('9007194.254740992')).toEqual({ kind: 'positive-overflow' });
    expect(() => parseBoundedProviderJson('{"nested":{"usage":{"cost":1}},"usage":{"cost":2}}')).not.toThrow();
    expect(() => parseBoundedProviderJson('{"usage":{"nested":{"cost":1},"cost":2}}')).not.toThrow();
  });

  test('reads a valid provider body at the exact 2 MiB boundary', async () => {
    const json = '{"usage":{"cost":1}}';
    const input = `${' '.repeat(PROVIDER_BODY_MAX_BYTES - new TextEncoder().encode(json).byteLength)}${json}`;
    expect(new TextEncoder().encode(input).byteLength).toBe(PROVIDER_BODY_MAX_BYTES);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(input)); controller.close(); } });
    await expect(readBoundedProviderJson(stream)).resolves.toMatchObject({ costLexeme: '1' });
  });

  test('cancels an overflowing provider stream immediately', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(PROVIDER_BODY_MAX_BYTES)); controller.enqueue(new Uint8Array(1)); },
      cancel() { cancelled = true; },
    });
    await expect(readBoundedProviderJson(stream)).rejects.toThrow('provider body too large');
    expect(cancelled).toBeTrue();
  });

  test('rejects fatal UTF-8 from provider streams', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([0xc3])); controller.close(); } });
    await expect(readBoundedProviderJson(stream)).rejects.toThrow();
  });
});
