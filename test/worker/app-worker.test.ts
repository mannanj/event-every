import { beforeEach, describe, expect, it, vi } from 'vitest';

const { delegated } = vi.hoisted(() => ({ delegated: vi.fn() }));
vi.mock('../../.open-next/worker.js', () => ({
  default: { fetch: delegated },
}));

import worker, {
  DailyCounter,
  IdentityDayPolicy,
  OwnerBudgetAuthority,
  ProviderRequestAuthority,
  ResolverRequestAuthority,
} from '../../cloudflare/app-worker';
import { INTERNAL_IDENTITY_HEADER } from '../../src/platform/admission';

function workerEnv(overrides: Record<string, unknown> = {}): CloudflareEnv {
  return {
    C1_DEPLOYMENT_DISABLED: '1',
    STATE_AUTHORITY_MODE: 'cloudflare',
    PROVIDER_POLICY_VERSION: 'owner-v1',
    PROVIDER_REQUEST_HMAC_CURRENT_VERSION: 'c1-b-current-v1',
    PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION: '',
    PROVIDER_REQUEST_HMAC_CURRENT: 'synthetic-request-shape-key',
    OPENROUTER_OWNER_KEY: 'deliberately-invalid-opaque-owner-key',
    OWNER_BUDGET_AUTHORITY: {},
    PROVIDER_REQUEST_AUTHORITY: {},
    IDENTITY_KEY_CURRENT_VERSION: 'test-v1',
    IDENTITY_HMAC_CURRENT: 'synthetic-worker-key',
    ...overrides,
  } as unknown as CloudflareEnv;
}

describe('C1-A app Worker admission wrapper', () => {
  beforeEach(() => delegated.mockReset());

  it('wrapper forwards only rebuilt admitted request', async () => {
    expect([
      DailyCounter,
      IdentityDayPolicy,
      ResolverRequestAuthority,
      OwnerBudgetAuthority,
      ProviderRequestAuthority,
    ].every((value) => typeof value === 'function')).toBe(true);
    const request = new Request('https://event-every.test/api/scan', {
      method: 'POST',
      headers: {
        origin: 'https://event-every.test',
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.12',
        'x-forwarded-for': '198.51.100.12',
        [INTERNAL_IDENTITY_HEADER]: 'known:forged:deadbeef',
        'x-c1-a': 'request',
      },
      body: '{}',
    });
    const env = workerEnv();
    const ctx = { waitUntil: vi.fn() };
    const response = new Response('delegated exactly', { status: 209, headers: { 'x-c1-a': 'response' } });
    delegated.mockResolvedValueOnce(response);

    expect(Object.keys(worker)).toEqual(['fetch']);
    await expect(worker.fetch(request, env, ctx as never)).resolves.toBe(response);
    expect(delegated).toHaveBeenCalledTimes(1);
    const [admittedRequest, delegatedEnv, delegatedCtx] = delegated.mock.calls[0];
    expect(admittedRequest).not.toBe(request);
    expect(admittedRequest.headers.get('cf-connecting-ip')).toBeNull();
    expect(admittedRequest.headers.get('x-forwarded-for')).toBeNull();
    expect(admittedRequest.headers.get(INTERNAL_IDENTITY_HEADER)).toBe('unknown');
    expect(admittedRequest.headers.get('x-c1-a')).toBe('request');
    expect(await admittedRequest.text()).toBe('{}');
    expect(delegatedEnv).toBe(env);
    expect(delegatedCtx).toBe(ctx);
  });

  it('scrubs forged edge headers before delegating a non-API asset', async () => {
    const request = new Request('https://event-every.test/_next/static/app.js', {
      headers: {
        'cf-connecting-ip': '203.0.113.99',
        'x-forwarded-for': '198.51.100.99',
        'x-real-ip': '192.0.2.99',
        forwarded: 'for=203.0.113.99',
        [INTERNAL_IDENTITY_HEADER]: 'known:forged:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'x-preserved-asset': 'yes',
      },
    });
    const env = workerEnv();
    const ctx = { waitUntil: vi.fn() };
    const response = new Response('asset');
    delegated.mockResolvedValueOnce(response);

    await expect(worker.fetch(request, env, ctx as never)).resolves.toBe(response);
    expect(delegated).toHaveBeenCalledTimes(1);
    const [scrubbedRequest] = delegated.mock.calls[0];
    expect(scrubbedRequest.headers.get('cf-connecting-ip')).toBeNull();
    expect(scrubbedRequest.headers.get('x-forwarded-for')).toBeNull();
    expect(scrubbedRequest.headers.get('x-real-ip')).toBeNull();
    expect(scrubbedRequest.headers.get('forwarded')).toBeNull();
    expect(scrubbedRequest.headers.get(INTERNAL_IDENTITY_HEADER)).toBe('unknown');
    expect(scrubbedRequest.headers.get('x-preserved-asset')).toBe('yes');
  });

  it('returns a fixed admission failure without delegating', async () => {
    const request = new Request('https://event-every.test/api/scan', {
      method: 'POST',
      headers: { origin: 'https://cross-site.invalid', 'content-type': 'application/json' },
      body: '{"private":"worker-canary"}',
    });
    const env = workerEnv();

    const response = await worker.fetch(request, env, {} as never);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('worker-canary');
    expect(delegated).not.toHaveBeenCalled();
  });

  it.each([
    ['owner key', { OPENROUTER_OWNER_KEY: '' }],
    ['request HMAC', { PROVIDER_REQUEST_HMAC_CURRENT: '' }],
    ['owner authority binding', { OWNER_BUDGET_AUTHORITY: undefined }],
    ['request authority binding', { PROVIDER_REQUEST_AUTHORITY: undefined }],
    ['authority mode', { STATE_AUTHORITY_MODE: 'legacy' }],
    ['policy version', { PROVIDER_POLICY_VERSION: 'community-v1' }],
    ['request HMAC version', { PROVIDER_REQUEST_HMAC_CURRENT_VERSION: 'wrong-v1' }],
    ['unpaired previous key', { PROVIDER_REQUEST_HMAC_PREVIOUS: 'synthetic-previous' }],
    ['unpaired previous version', { PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION: 'previous-v1' }],
  ])('fails closed before delegation when %s is invalid', async (_label, overrides) => {
    const response = await worker.fetch(
      new Request('https://event-every.test/api/scan', {
        method: 'POST',
        headers: {
          origin: 'https://event-every.test',
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.12',
        },
        body: '{}',
      }),
      workerEnv(overrides),
      {} as never,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Provider state unavailable.',
      code: 'provider_state_unavailable',
    });
    expect(delegated).not.toHaveBeenCalled();
  });
});
