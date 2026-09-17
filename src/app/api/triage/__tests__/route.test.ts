import { afterEach, describe, expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { setTypeSafeKeyForTests } from '@/server/typesafe/client';

const { POST } = await import('@/app/api/triage/route');
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/triage', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

describe('triage route', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; setTypeSafeKeyForTests(undefined); });

  test('answers unavailable without a key, before reading the body', async () => {
    setTypeSafeKeyForTests(null);
    const response = await post({ nonsense: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false });
  });

  test('rejects a malformed body and oversize text falls back', async () => {
    setTypeSafeKeyForTests('k');
    expect((await post({ text: '' , source: 'paste' })).status).toBe(400);
    const big = await post({ text: 'x'.repeat(20_000), source: 'paste' });
    expect(await big.json()).toEqual({ available: false });
  });

  test('returns a decision from a good answer and unavailable from a failed call', async () => {
    setTypeSafeKeyForTests('k');
    globalThis.fetch = (async () => Response.json({
      answers: {
        has_event: { type: 'noul', noul: 0.02 },
        complete: { type: 'noul', noul: 0.5 },
        shape: { type: 'choice', choice: 'no_event', probabilities: { no_event: 0.93, one_event: 0.03 }, confidence: 0.9 },
      },
      usage: { input_tokens: 1, output_tokens: 1 },
    })) as unknown as typeof fetch;
    const good = await (await post({ text: 'milk, eggs, coffee filters', source: 'paste' })).json();
    expect(good).toMatchObject({ available: true, decision: { kind: 'skip', reason: 'no_event' }, shape: 'no_event' });

    globalThis.fetch = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    expect(await (await post({ text: 'Dentist April 7 2pm', source: 'paste' })).json()).toEqual({ available: false });
  });
});
