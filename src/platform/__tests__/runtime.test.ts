import { afterEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getProviderPort, getUsagePort, getWaitlistPort, setPlatformRuntimeForTests } from '@/platform/runtime';
import type { AdmissionResult, LegacyProviderPort, LegacyUsagePort, LegacyWaitlistPort, NotReady } from '@/platform/contracts';
import { recordClosedEvent } from '@/platform/logger';

afterEach(() => setPlatformRuntimeForTests(undefined));

describe('platform runtime', () => {
  test('all runtime selectors have the exact no-argument topology', () => {
    const providerSelector: () => LegacyProviderPort | NotReady = getProviderPort;
    const usageSelector: () => LegacyUsagePort | NotReady = getUsagePort;
    const waitlistSelector: () => LegacyWaitlistPort | NotReady = getWaitlistPort;

    expect(providerSelector.length).toBe(0);
    expect(usageSelector.length).toBe(0);
    expect(waitlistSelector.length).toBe(0);
  });

  test('AdmissionResult uses success and failure discriminants', () => {
    const success: AdmissionResult = { status: 'success', request: new Request('http://localhost'), identity: { kind: 'unknown', keyVersion: '', hmac: '' } };
    const failure: AdmissionResult = { status: 'failure', response: new Response(null, { status: 400 }) };
    expect(success.status).toBe('success'); expect(failure.status).toBe('failure');
  });
  test.each(['shadow', 'cloudflare'] as const)('%s fails closed for every legacy port', (mode) => {
    const provider = { dispatch: mock(() => ({ status: 'aborted-before-dispatch' as const })) };
    const usage = { read: mock(async () => ({ status: 'unavailable' as const, code: 'legacy_usage_unavailable' as const })) };
    const waitlist = { submit: mock(async () => ({ status: 'unavailable' as const, code: 'legacy_waitlist_unavailable' as const })) };
    setPlatformRuntimeForTests({ mode, provider, usage, waitlist });

    expect(getProviderPort()).toEqual({ status: 'not-ready', code: 'c1_state_not_ready' });
    expect(getUsagePort()).toEqual({ status: 'not-ready', code: 'c1_state_not_ready' });
    expect(getWaitlistPort()).toEqual({ status: 'not-ready', code: 'c1_state_not_ready' });
    expect(provider.dispatch).not.toHaveBeenCalled();
    expect(usage.read).not.toHaveBeenCalled();
    expect(waitlist.submit).not.toHaveBeenCalled();
  });

  test('legacy selects all legacy ports', () => {
    setPlatformRuntimeForTests({ mode: 'legacy' });
    expect('status' in getProviderPort()).toBe(false);
    expect('status' in getUsagePort()).toBe(false);
    expect('status' in getWaitlistPort()).toBe(false);
  });

  test('rejects an unknown configured authority mode', () => {
    process.env.STATE_AUTHORITY_MODE = 'not-a-mode';
    try {
      expect(() => getProviderPort()).toThrow('unknown STATE_AUTHORITY_MODE');
    } finally {
      delete process.env.STATE_AUTHORITY_MODE;
    }
  });

  test('provider routes import legacy composition rather than limit or LLM seams', () => {
    for (const route of ['scan', 'resolve-timezone', 'summarize']) {
      const source = readFileSync(`src/app/api/${route}/route.ts`, 'utf8');
      expect(source).not.toContain("from '@/lib/limits'");
      expect(source).not.toContain("from '@/lib/llm'");
      expect(source).toContain("from '@/platform/legacy'");
    }
  });
});

// This block is compile-time API proof. It is never executed, while direct tsc
// requires every @ts-expect-error to correspond to a rejected logger input.
if (false) {
  recordClosedEvent('deferred_work_failed');
  recordClosedEvent({ code: 'legacy_provider_unavailable', id: 'opaque-id', route: 'scan', phase: 'dispatch', statusClass: 5, retryable: true, durationBucket: 'under_1s', outcome: 'unavailable' });
  // @ts-expect-error arbitrary event names are not part of the closed API
  recordClosedEvent('customer_email_received');
  // @ts-expect-error headers are forbidden logger fields
  recordClosedEvent({ code: 'deferred_work_failed', headers: new Headers() });
  // @ts-expect-error bodies are forbidden logger fields
  recordClosedEvent({ code: 'deferred_work_failed', body: 'raw body' });
  // @ts-expect-error native errors cannot cross the logger API
  recordClosedEvent(new Error('native failure'));
  // @ts-expect-error arbitrary objects cannot cross the logger API
  recordClosedEvent({ anything: 'goes' });
}
