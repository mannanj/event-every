import { expect, mock, spyOn, test } from 'bun:test';
import * as requestId from '@/services/requestId';
import { summarizeInput } from '@/services/summarizer';

test('summarizer forwards its created request UUID', async () => {
  const generatedId = '018f47a0-7b5c-7cc4-9a34-123456789abc';
  const forbiddenReplacement = '018f47a0-7b5c-7cc4-9a34-abcdefabcdef';
  const id = spyOn(requestId, 'createProviderRequestId')
    .mockReturnValueOnce(generatedId)
    .mockReturnValue(forbiddenReplacement);
  const originalFetch = globalThis.fetch;
  const fetchMock = mock(async () => new Response(JSON.stringify({ summary: 'Team Lunch' })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    await expect(summarizeInput({ text: 'Lunch' })).resolves.toBe('Team Lunch');
    expect(fetchMock).toHaveBeenCalledWith('/api/summarize', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', 'X-Event-Every-Request-Id': generatedId },
    }));
    expect(id).toHaveBeenCalledTimes(1);
  } finally { globalThis.fetch = originalFetch; id.mockRestore(); }
});
