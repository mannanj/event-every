import { afterEach, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  acknowledgeProviderOperation,
  beginProviderOperation,
  cancelProviderOperation,
  listProviderOperations,
  recoverProviderOperations,
  resumeProviderOperation,
  setProviderOperationDependenciesForTests,
  type ProviderOperationRecord,
} from '@/services/providerOperation';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const CONSUMER_REF = '22222222-2222-4222-8222-222222222222';
const operation: ProviderOperationRecord = {
  requestId: REQUEST_ID,
  route: '/api/summarize',
  consumerKind: 'summarize',
  consumerRef: CONSUMER_REF,
  createdAtMs: 1_000,
  transportDeadlineMs: null,
  state: 'pending',
};

afterEach(() => setProviderOperationDependenciesForTests(undefined));

test('persists the exact content-free record before begin resolves', async () => {
  let release!: () => void;
  const persisted = new Promise<void>((resolve) => { release = resolve; });
  const save = mock(async () => persisted);
  let settled = false;
  setProviderOperationDependenciesForTests({
    requestId: () => REQUEST_ID,
    now: () => 1_000,
    store: { save, list: async () => [], delete: async () => undefined },
  });

  const pending = beginProviderOperation({
    route: '/api/scan', consumerKind: 'scan_text', consumerRef: CONSUMER_REF,
  }).then((value) => { settled = true; return value; });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  const created = await pending;
  expect(created).toEqual({
    requestId: REQUEST_ID, route: '/api/scan', consumerKind: 'scan_text',
    consumerRef: CONSUMER_REF, createdAtMs: 1_000, transportDeadlineMs: null, state: 'pending',
  });
  expect(JSON.stringify(created)).not.toMatch(/rawInput|dataUrl|prompt|model|credential/i);
});

test('rejects records with extra or malformed fields while restoring', async () => {
  setProviderOperationDependenciesForTests({
    store: {
      save: async () => undefined,
      list: async () => [{ ...operation, rawInput: 'must-not-load' }],
      delete: async () => undefined,
    },
  });
  await expect(listProviderOperations()).rejects.toThrow('Invalid provider operation record');
});

test('blocks a new submission while any nonterminal record exists', async () => {
  const requestId = mock(() => '33333333-3333-4333-8333-333333333333');
  const save = mock(async (_record: unknown) => undefined);
  setProviderOperationDependenciesForTests({
    requestId,
    store: { save, list: async () => [operation], delete: async () => undefined },
  });
  await expect(beginProviderOperation({
    route: '/api/scan', consumerKind: 'scan_text', consumerRef: CONSUMER_REF,
  })).rejects.toThrow('already pending');
  expect(requestId).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

test('fails before provider work when the operation cannot be persisted', async () => {
  const save = mock(async (_record: unknown) => { throw new Error('quota'); });
  setProviderOperationDependenciesForTests({
    requestId: () => REQUEST_ID,
    store: { save, list: async () => [], delete: async () => undefined },
  });
  await expect(beginProviderOperation({
    route: '/api/scan', consumerKind: 'scan_text', consumerRef: CONSUMER_REF,
  })).rejects.toThrow('quota');
  expect(save).toHaveBeenCalledTimes(1);
});

test('serializes concurrent begins before either can create a second UUID', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const save = mock(async () => held);
  const requestId = mock(() => REQUEST_ID);
  setProviderOperationDependenciesForTests({
    requestId,
    store: { save, list: async () => [], delete: async () => undefined },
  });
  const first = beginProviderOperation({
    route: '/api/scan', consumerKind: 'scan_text', consumerRef: CONSUMER_REF,
  });
  await Promise.resolve();
  await expect(beginProviderOperation({
    route: '/api/summarize', consumerKind: 'summarize', consumerRef: CONSUMER_REF,
  })).rejects.toThrow('already pending');
  release();
  await first;
  expect(requestId).toHaveBeenCalledTimes(1);
});

test('polls one UUID with exact capped backoff and no replacement POST', async () => {
  const delays: number[] = [];
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const responses = [250, 500, 1_000, 2_000, 4_000].map(() =>
    new Response(JSON.stringify({ status: 'pending', code: 'provider_request_pending', phase: 'provider_inflight' }), { status: 409 }))
    .concat(new Response(JSON.stringify({ status: 'completed', replay: { summary: 'Team Lunch' } })));
  setProviderOperationDependenciesForTests({
    wait: async (delay) => { delays.push(delay); },
    fetcher: mock(async (input, init) => { calls.push([input, init]); return responses.shift()!; }),
    store: { save: async () => undefined, list: async () => [], delete: async () => undefined },
  });

  await expect(resumeProviderOperation(operation, (replay) => replay)).resolves.toEqual({ summary: 'Team Lunch' });
  expect(delays).toEqual([250, 500, 1_000, 2_000, 4_000, 5_000]);
  expect(calls).toHaveLength(6);
  for (const [url, init] of calls) {
    expect(url).toBe('/api/provider-status');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ requestId: REQUEST_ID }) });
  }
});

test('stores only an authority deadline, observes at it, then makes one final observation', async () => {
  let now = 0;
  const delays: number[] = [];
  const save = mock(async () => undefined);
  const responses = [
    new Response(JSON.stringify({ status: 'pending', code: 'provider_request_pending', phase: 'provider_inflight', transportDeadlineMs: 1_000 }), { status: 409 }),
    new Response(JSON.stringify({ status: 'pending', code: 'provider_request_pending', phase: 'provider_inflight', transportDeadlineMs: 1_000 }), { status: 409 }),
    new Response(JSON.stringify({ status: 'pending', code: 'provider_request_pending', phase: 'provider_inflight', transportDeadlineMs: 1_000 }), { status: 409 }),
    new Response(JSON.stringify({ status: 'completed', replay: { summary: 'Saved Replay' } })),
  ];
  setProviderOperationDependenciesForTests({
    now: () => now,
    wait: async (delay) => { delays.push(delay); now += delay; },
    fetcher: mock(async () => responses.shift()!),
    store: { save, list: async () => [], delete: async () => undefined },
  });

  await expect(resumeProviderOperation(operation, (replay) => replay)).resolves.toEqual({ summary: 'Saved Replay' });
  expect(delays).toEqual([250, 500, 250, 0]);
  expect(save).toHaveBeenCalledWith({ ...operation, transportDeadlineMs: 1_000 });
});

test('network loss after the authority deadline never abandons the saved operation', async () => {
  let now = 0;
  const delays: number[] = [];
  const remove = mock(async (_requestId: string) => undefined);
  const responses: Array<Response | Error> = [
    new Response(JSON.stringify({ status: 'pending', code: 'provider_request_pending', phase: 'provider_inflight', transportDeadlineMs: 250 }), { status: 409 }),
    new TypeError('offline'),
    new Response(JSON.stringify({ status: 'completed', replay: { summary: 'Still Saved' } })),
  ];
  setProviderOperationDependenciesForTests({
    now: () => now,
    wait: async (delay) => { delays.push(delay); now += delay; },
    fetcher: mock(async () => {
      const next = responses.shift()!;
      if (next instanceof Error) throw next;
      return next;
    }),
    store: { save: async () => undefined, list: async () => [], delete: remove },
  });
  await expect(resumeProviderOperation(operation)).resolves.toEqual({ summary: 'Still Saved' });
  expect(delays).toEqual([250, 0, 1_000]);
  expect(remove).not.toHaveBeenCalled();
});

test('reload delivery is acknowledged before deletion', async () => {
  let deliver!: () => void;
  const delivered = new Promise<void>((resolve) => { deliver = resolve; });
  let observeStatus!: () => void;
  const statusStarted = new Promise<void>((resolve) => { observeStatus = resolve; });
  const remove = mock(async () => undefined);
  const fetcher = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(input).toBe('/api/provider-status');
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ requestId: REQUEST_ID }),
    });
    observeStatus();
    return new Response(JSON.stringify({ status: 'completed', replay: { summary: 'Recovered' } }));
  });
  setProviderOperationDependenciesForTests({
    wait: async () => undefined,
    fetcher,
    store: { save: async () => undefined, list: async () => [operation], delete: remove },
  });
  const recovery = recoverProviderOperations(async (record, replay) => {
    expect(record).toEqual(operation);
    expect(replay).toEqual({ summary: 'Recovered' });
    await delivered;
  });
  await statusStarted;
  expect(remove).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  deliver();
  await recovery;
  expect(remove).toHaveBeenCalledWith(REQUEST_ID);
});

test('terminal server status deletes the record and never retries', async () => {
  const remove = mock(async (_requestId: string) => undefined);
  const fetcher = mock(async () => new Response(JSON.stringify({
    error: 'Provider request expired.', code: 'provider_request_expired',
  }), { status: 409 }));
  setProviderOperationDependenciesForTests({
    fetcher,
    wait: async () => undefined,
    store: { save: async () => undefined, list: async () => [], delete: remove },
  });
  await expect(resumeProviderOperation(operation)).rejects.toMatchObject({
    status: 409, code: 'provider_request_expired',
  });
  expect(remove).toHaveBeenCalledWith(REQUEST_ID);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('an already-aborted recovery performs no status request', async () => {
  const controller = new AbortController();
  controller.abort(new DOMException('cancelled', 'AbortError'));
  const fetcher = mock(async () => new Response());
  setProviderOperationDependenciesForTests({
    fetcher,
    store: { save: async () => undefined, list: async () => [], delete: async () => undefined },
  });
  await expect(resumeProviderOperation(operation, (value) => value, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
});

test('acknowledgement and explicit cancel remove only the selected operation', async () => {
  const remove = mock(async (_requestId: string) => undefined);
  setProviderOperationDependenciesForTests({
    store: { save: async () => undefined, list: async () => [], delete: remove },
  });
  await acknowledgeProviderOperation(REQUEST_ID);
  await cancelProviderOperation(CONSUMER_REF);
  expect(remove.mock.calls.map((call) => call[0])).toEqual([REQUEST_ID, CONSUMER_REF]);
});

test('browser graph contains no owner credential and page owns restore/block/UUID history flow', () => {
  for (const path of ['src/services/providerOperation.ts', 'src/services/scanClient.ts', 'src/services/summarizer.ts', 'src/app/page.tsx']) {
    expect(readFileSync(path, 'utf8')).not.toMatch(/OPENROUTER_OWNER_KEY|OPENROUTER_API_KEY/);
  }
  const page = readFileSync('src/app/page.tsx', 'utf8');
  expect(page).toContain('recoverProviderOperations');
  expect(page).toContain('beginProviderOperation');
  expect(page).toContain('createHistoryEntryId');
  expect(page).not.toMatch(/ih-\$\{Date\.now\(\)\}/);
});
