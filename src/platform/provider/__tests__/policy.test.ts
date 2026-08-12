import { describe, expect, test } from 'bun:test';
import { OWNER_DAILY_LIMIT_NANODOLLARS, OWNER_MODELS, OWNER_POLICY_VERSION, OWNER_PROVIDER_URL, OWNER_ROUTE_POLICY, ownerPolicyForVariant } from '../policy';

describe('owner provider policy', () => {
  test('is immutable and locks every route to one permitted variant', () => {
    expect(OWNER_POLICY_VERSION).toBe('owner-v1');
    expect(OWNER_DAILY_LIMIT_NANODOLLARS).toBe(5_000_000_000);
    expect(OWNER_PROVIDER_URL).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(OWNER_MODELS).toEqual({
      'scan-text': 'deepseek/deepseek-v4-flash', 'scan-image': 'mistralai/mistral-small-2603',
      'resolve-timezone': 'deepseek/deepseek-v4-flash', summarize: 'deepseek/deepseek-v4-flash',
    });
    expect(Object.fromEntries(['scan-text', 'scan-image', 'resolve-timezone', 'summarize'].map((variant) => [variant, ownerPolicyForVariant(variant as never)]))).toEqual({
      'scan-text': { route: 'scan', model: 'deepseek/deepseek-v4-flash', reservationNanodollars: 20_000_000 },
      'scan-image': { route: 'scan', model: 'mistralai/mistral-small-2603', reservationNanodollars: 50_000_000 },
      'resolve-timezone': { route: 'resolve-timezone', model: 'deepseek/deepseek-v4-flash', reservationNanodollars: 1_000_000 },
      summarize: { route: 'summarize', model: 'deepseek/deepseek-v4-flash', reservationNanodollars: 500_000 },
    });
    expect(OWNER_ROUTE_POLICY.scan.variants).toEqual(['scan-text', 'scan-image']);
    expect(Object.isFrozen(OWNER_ROUTE_POLICY)).toBeTrue();
  });
});
