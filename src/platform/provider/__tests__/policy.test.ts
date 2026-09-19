import { describe, expect, test } from 'bun:test';
import { OWNER_DAILY_LIMIT_NANODOLLARS, OWNER_MODEL_CHAINS, OWNER_MODELS, OWNER_POLICY_VERSION, OWNER_PROVIDER_URL, OWNER_ROUTE_POLICY, ownerPolicyForVariant } from '../policy';

describe('owner provider policy', () => {
  test('is immutable and locks every route to one permitted variant', () => {
    expect(OWNER_POLICY_VERSION).toBe('owner-v1');
    expect(OWNER_DAILY_LIMIT_NANODOLLARS).toBe(1_000_000_000);
    expect(OWNER_PROVIDER_URL).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(OWNER_MODELS).toEqual({
      'scan-text': 'mistralai/mistral-small-2603', 'scan-image': 'mistralai/mistral-small-2603',
      'resolve-timezone': 'deepseek/deepseek-v4.1-flash', summarize: 'deepseek/deepseek-v4.1-flash',
    });
    expect(Object.fromEntries(['scan-text', 'scan-image', 'resolve-timezone', 'summarize'].map((variant) => [variant, ownerPolicyForVariant(variant as never)]))).toEqual({
      'scan-text': { route: 'scan', model: 'mistralai/mistral-small-2603', reservationNanodollars: 20_000_000 },
      'scan-image': { route: 'scan', model: 'mistralai/mistral-small-2603', reservationNanodollars: 50_000_000 },
      'resolve-timezone': { route: 'resolve-timezone', model: 'deepseek/deepseek-v4.1-flash', reservationNanodollars: 1_000_000 },
      summarize: { route: 'summarize', model: 'deepseek/deepseek-v4.1-flash', reservationNanodollars: 500_000 },
    });
    expect(OWNER_ROUTE_POLICY.scan.variants).toEqual(['scan-text', 'scan-image']);
    expect(Object.isFrozen(OWNER_ROUTE_POLICY)).toBeTrue();
  });

  test('every fallback chain leads with the variant\'s measured model', () => {
    // The head is the model the variant's accuracy was measured on. If a chain
    // ever led with anything else, the fallback would quietly become the
    // default and every published accuracy figure would describe a model the
    // app no longer reaches first.
    for (const variant of ['scan-text', 'scan-image', 'resolve-timezone', 'summarize'] as const) {
      const chain = OWNER_MODEL_CHAINS[variant];
      expect(chain[0]).toBe(OWNER_MODELS[variant]);
      expect(chain.length).toBeGreaterThan(1);
      expect(new Set(chain).size).toBe(chain.length);
      expect(Object.isFrozen(chain)).toBeTrue();
    }
  });

  test('no chain routes to a US-hosted model vendor', () => {
    // A standing constraint on this project, not a performance choice. Asserted
    // rather than commented so a future model swap has to confront it.
    const forbidden = ['openai/', 'anthropic/', 'google/', 'meta-llama/', 'x-ai/', 'microsoft/', 'cohere/', 'nvidia/', 'amazon/'];
    for (const chain of Object.values(OWNER_MODEL_CHAINS)) {
      for (const model of chain) {
        expect(forbidden.some((vendor) => model.startsWith(vendor))).toBeFalse();
      }
    }
  });
});
