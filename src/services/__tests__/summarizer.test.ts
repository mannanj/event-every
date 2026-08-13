import { expect, mock, test } from 'bun:test';
import type { ProviderOperationRecord } from '@/services/providerOperation';
import { summarizeInput } from '@/services/summarizer';

const operation: ProviderOperationRecord = {
  requestId: '11111111-1111-4111-8111-111111111111', route: '/api/summarize', consumerKind: 'summarize',
  consumerRef: '22222222-2222-4222-8222-222222222222', createdAtMs: 1, transportDeadlineMs: null, state: 'pending',
};

test('summarizer forwards its persisted operation UUID', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock(async () => new Response(JSON.stringify({ summary: 'Team Lunch' })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    await expect(summarizeInput({ text: 'Lunch' }, operation)).resolves.toBe('Team Lunch');
    expect(fetchMock).toHaveBeenCalledWith('/api/summarize', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', 'X-Event-Every-Request-Id': operation.requestId },
    }));
  } finally { globalThis.fetch = originalFetch; }
});

test('summarizer polls pending work with the same operation UUID', async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock(async (url: RequestInfo | URL, _init?: RequestInit) => url === '/api/summarize'
    ? new Response(JSON.stringify({ status: 'pending', code: 'provider_request_pending', phase: 'provider_inflight' }), { status: 409 })
    : new Response(JSON.stringify({ status: 'completed', replay: { summary: 'Saved Replay' } })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    await expect(summarizeInput({ text: 'Lunch' }, operation)).resolves.toBe('Saved Replay');
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/summarize', '/api/provider-status']);
    expect((fetchMock.mock.calls[1]?.[1] as unknown as RequestInit).body).toBe(JSON.stringify({ requestId: operation.requestId }));
  } finally { globalThis.fetch = originalFetch; }
});
