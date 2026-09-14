import { describe, expect, test } from 'bun:test';

import { createEventEveryOpenRouterTransport } from '@/server/scanner/transport';
import type { ProviderTransportResult } from '@/platform/provider/transport';

/**
 * The Scanner discards an entire observation when text evidence reports an
 * endOffset past the end of the source. Models get the event right and still
 * miscount by a few characters, and that single check was 82% of /api/scan's
 * failures - 44% of inputs extracted correctly before this, 78% after.
 *
 * These pin the behaviour that bought that, because it is invisible: nothing
 * downstream reads evidence, so a regression here would show up only as scans
 * quietly failing again.
 */

function envelope(content: unknown) {
  return {
    id: 'gen-1',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) } }],
  };
}

async function through(body: unknown): Promise<unknown> {
  const transport = createEventEveryOpenRouterTransport({
    invoke: async (): Promise<ProviderTransportResult> => ({
      status: 'success',
      value: body,
      costOutcome: { kind: 'missing' },
    }),
  });
  const result = await transport.complete({} as never);
  if (!result.ok) throw new Error('expected ok');
  return result.body;
}

function contentOf(body: unknown): Record<string, unknown> {
  const raw = (body as { choices: { message: { content: string } }[] }).choices[0]!.message.content;
  return JSON.parse(raw) as Record<string, unknown>;
}

const WITH_OFFSETS = {
  candidates: [{
    title: { value: 'Dentist', confidence: 0.9, evidence: [{ sourceId: 's1', locator: 'text', excerpt: 'Dentist', startOffset: 0, endOffset: 999 }] },
    issues: [],
  }],
  issues: [{ code: 'field_not_found', field: 'url', evidence: [{ sourceId: 's1', locator: 'text', excerpt: 'x', startOffset: 3, endOffset: 4 }] }],
};

describe('evidence offsets are dropped before the Scanner sees them', () => {
  test('both offsets become null, at every depth', async () => {
    const out = contentOf(await through(envelope(WITH_OFFSETS)));
    const candidate = (out.candidates as Record<string, unknown>[])[0]!;
    const titleEvidence = ((candidate.title as Record<string, unknown>).evidence as Record<string, unknown>[])[0]!;
    expect(titleEvidence.startOffset).toBeNull();
    expect(titleEvidence.endOffset).toBeNull();

    // Scan-level issues carry evidence too, and are validated by the same rule.
    const issueEvidence = ((out.issues as Record<string, unknown>[])[0]!.evidence as Record<string, unknown>[])[0]!;
    expect(issueEvidence.startOffset).toBeNull();
    expect(issueEvidence.endOffset).toBeNull();
  });

  test('everything else survives untouched', async () => {
    const out = contentOf(await through(envelope(WITH_OFFSETS)));
    const candidate = (out.candidates as Record<string, unknown>[])[0]!;
    const title = candidate.title as Record<string, unknown>;
    expect(title.value).toBe('Dentist');
    expect(title.confidence).toBe(0.9);
    expect(((title.evidence as Record<string, unknown>[])[0]!).excerpt).toBe('Dentist');
  });

  test('a body with no offsets is passed through by identity', async () => {
    // No rebuild when there is nothing to change, so the common path allocates
    // nothing and cannot perturb the envelope.
    const clean = envelope({ candidates: [], issues: [] });
    expect(await through(clean)).toBe(clean);
  });

  test('non-JSON content is left exactly as it came', async () => {
    // So the Scanner reports the real problem rather than one introduced here.
    const broken = envelope('not json at all');
    expect(await through(broken)).toBe(broken);
  });

  test('an envelope without a usable choice is untouched', async () => {
    const odd = { id: 'gen-2', choices: [] };
    expect(await through(odd)).toBe(odd);
  });

  test('a transport failure is still reported as a failure', async () => {
    const transport = createEventEveryOpenRouterTransport({
      invoke: async (): Promise<ProviderTransportResult> => ({
        status: 'failed',
        failure: { code: 'provider_rejected', httpStatus: 502 },
        costOutcome: { kind: 'missing' },
        providerStatus: 429,
      }),
    });
    const result = await transport.complete({} as never);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.failure).toBe('http');
    expect(result.retryable).toBe(true);
  });
});
