import { afterEach, describe, expect, test } from 'bun:test';
import { setTypeSafeKeyForTests } from '../client';
import { decideTriage, splitParagraphs, triageQuestions, triageText, type TriageVerdict } from '../triage';

const verdict = (over: Partial<TriageVerdict>): TriageVerdict => ({
  hasEvent: 0.95,
  complete: 0.9,
  shape: {
    choice: 'one_event',
    probabilities: { one_event: 0.9, several_events_shared_date: 0.02, several_independent_events: 0.02, recurring_schedule: 0.02, listing_of_many: 0.02, no_event: 0.02 },
    confidence: 0.9,
  },
  boundaries: [],
  paragraphs: ['Dentist April 7 2pm'],
  ms: 100,
  ...over,
});

describe('splitParagraphs', () => {
  test('splits on blank lines and bullets, joins wrapped lines', () => {
    expect(splitParagraphs('Standup Monday 9am\nin the Blue Room\n\n- Retro Tuesday 4pm\n- Demo Wednesday 3pm\n')).toEqual([
      'Standup Monday 9am\nin the Blue Room',
      '- Retro Tuesday 4pm',
      '- Demo Wednesday 3pm',
    ]);
  });
  test('caps at forty paragraphs', () => {
    expect(splitParagraphs(Array.from({ length: 50 }, (_, i) => `p${i}`).join('\n\n'))).toHaveLength(40);
  });
});

describe('triageQuestions', () => {
  test('asks boundaries only with three or more paragraphs and completeness only for typed input', () => {
    expect(Object.keys(triageQuestions('paste', 2))).toEqual(['has_event', 'shape', 'complete']);
    expect(Object.keys(triageQuestions('url-page', 3))).toEqual(['has_event', 'shape', 'boundary_1', 'boundary_2']);
  });
});

describe('decideTriage', () => {
  test('null verdict means a single scan', () => {
    expect(decideTriage(null)).toEqual({ kind: 'single' });
  });
  test('skips only when both signals agree there is no event', () => {
    const shape = { ...verdict({}).shape, choice: 'no_event' as const, probabilities: { ...verdict({}).shape.probabilities, one_event: 0.05, no_event: 0.9 } };
    expect(decideTriage(verdict({ hasEvent: 0.05, shape }))).toEqual({ kind: 'skip', reason: 'no_event' });
    expect(decideTriage(verdict({ hasEvent: 0.4, shape }))).toEqual({ kind: 'single' });
  });
  test('splits independent events at confident boundaries and caps chunks', () => {
    const paragraphs = ['Mon: Dentist 2pm', 'Tue: Dinner 7pm', 'Wed: Gym 6am', 'Thu: Call 10am'];
    const shape = { ...verdict({}).shape, choice: 'several_independent_events' as const, probabilities: { ...verdict({}).shape.probabilities, one_event: 0.1, several_independent_events: 0.85 } };
    expect(decideTriage(verdict({ shape, paragraphs, boundaries: [0.9, 0.3, 0.95] }))).toEqual({
      kind: 'split',
      chunks: ['Mon: Dentist 2pm', 'Tue: Dinner 7pm\n\nWed: Gym 6am', 'Thu: Call 10am'],
    });
    const many = Array.from({ length: 10 }, (_, i) => `Day ${i}: thing`);
    const decision = decideTriage(verdict({ shape, paragraphs: many, boundaries: many.slice(1).map(() => 0.95) }));
    expect(decision.kind).toBe('split');
    if (decision.kind === 'split') expect(decision.chunks).toHaveLength(6);
  });
  test('shared-date agendas are not split', () => {
    const shape = { ...verdict({}).shape, choice: 'several_events_shared_date' as const, probabilities: { ...verdict({}).shape.probabilities, one_event: 0.1, several_events_shared_date: 0.85 } };
    expect(decideTriage(verdict({ shape, paragraphs: ['March 4', 'Standup 9am', 'Retro 4pm'], boundaries: [0.9, 0.9] }))).toEqual({ kind: 'single' });
  });
});

describe('triageText fallback', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; setTypeSafeKeyForTests(undefined); });

  test('returns null without a key and never calls the network', async () => {
    setTypeSafeKeyForTests(null);
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    expect(await triageText('Dentist April 7 2pm', 'paste')).toBeNull();
    expect(called).toBe(false);
  });

  test('returns null on a slow call, a non-2xx, and a malformed body', async () => {
    setTypeSafeKeyForTests('test-key');
    globalThis.fetch = ((_: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    expect(await triageText('Dentist April 7 2pm', 'paste', { timeoutMs: 20 })).toBeNull();
    globalThis.fetch = (async () => new Response('nope', { status: 529 })) as unknown as typeof fetch;
    expect(await triageText('Dentist April 7 2pm', 'paste')).toBeNull();
    globalThis.fetch = (async () => Response.json({ answers: { has_event: { type: 'noul', noul: 0.9 } } })) as unknown as typeof fetch;
    expect(await triageText('Dentist April 7 2pm', 'paste')).toBeNull();
  });

  test('parses a good answer', async () => {
    setTypeSafeKeyForTests('test-key');
    let sent: unknown;
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({
        answers: {
          has_event: { type: 'noul', noul: 0.97 },
          complete: { type: 'noul', noul: 0.92 },
          shape: { type: 'choice', choice: 'one_event', probabilities: { one_event: 0.88, no_event: 0.02 }, confidence: 0.85 },
        },
        usage: { input_tokens: 100, output_tokens: 10 },
      });
    }) as unknown as typeof fetch;
    const result = await triageText('Dentist April 7 2pm', 'paste', { now: new Date('2026-09-16T12:00:00Z') });
    expect(result?.hasEvent).toBe(0.97);
    expect(result?.shape.choice).toBe('one_event');
    expect(result?.shape.probabilities.several_independent_events).toBe(0);
    expect((sent as { state: { referenceWeekday: string } }).state.referenceWeekday).toBe('Wednesday');
    expect((sent as { model: string }).model).toBe('jev-latest');
  });
});
