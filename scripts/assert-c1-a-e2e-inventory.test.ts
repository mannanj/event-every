import { describe, expect, test } from 'bun:test';
import {
  C1_A_TITLES,
  PRESERVED_E1_TITLES,
  RETIRED_E1_TITLES,
  assertC1AE2EInventory,
  createInventoryEnvironment,
  parsePlaywrightList,
  validateInventoryArgument,
  type InventoryListing,
} from './assert-c1-a-e2e-inventory';

const projects = ['chromium', 'webkit'] as const;
const preserved = Array.from({ length: 59 }, (_, index) => `preserved title ${String(index + 1).padStart(2, '0')}`);

function listing(titles: readonly string[], file = 'e2e/example.spec.ts'): string {
  return titles.flatMap((title, index) => projects.map((project) => `  [${project}] › ${file}:${index + 1}:1 › ${title}`)).join('\n');
}

function inventory(ordinaryTitles = preserved, c1Titles: readonly string[] = [C1_A_TITLES[0]]): InventoryListing {
  return {
    ordinary: parsePlaywrightList(listing(ordinaryTitles)),
    c1a: parsePlaywrightList(listing(c1Titles, 'e2e/c1-a-runtime-admission.spec.ts')),
  };
}

describe('C1-A browser inventory', () => {
  test('accepts only the closed 60|61|62 argument contract', () => {
    expect(validateInventoryArgument(['60'])).toBe(60);
    expect(validateInventoryArgument(['61'])).toBe(61);
    expect(validateInventoryArgument(['62'])).toBe(62);
    for (const argv of [[], ['59'], ['63'], ['60', '61']]) {
      expect(() => validateInventoryArgument(argv)).toThrow('c1-a inventory: expected 60|61|62');
    }
  });

  test('parses only canonical Chromium and WebKit Playwright list records', () => {
    const parsed = parsePlaywrightList([
      'Listing tests:',
      '  [chromium] › e2e/alpha.spec.ts:10:3 › alpha title',
      '  [webkit] › e2e/beta.spec.ts:20:4 › beta › title',
      '  [firefox] › e2e/nope.spec.ts:1:1 › ignored',
      'Total: 2 tests in 2 files',
    ].join('\n'));
    expect(parsed.chromium).toEqual(['alpha title']);
    expect(parsed.webkit).toEqual(['beta › title']);
  });

  test('requires the exact checked-in 59-title ordinary inventory and no retired title', () => {
    expect(PRESERVED_E1_TITLES).toHaveLength(59);
    expect(PRESERVED_E1_TITLES.some((title) => RETIRED_E1_TITLES.some((retired) => title.endsWith(retired)))).toBeFalse();
    expect(() => assertC1AE2EInventory(inventory(), 60, preserved)).not.toThrow();
    expect(() => assertC1AE2EInventory(inventory(preserved.slice(1)), 60, preserved)).toThrow('c1-a inventory: ordinary titles');
    expect(() => assertC1AE2EInventory(inventory([...preserved.slice(1), RETIRED_E1_TITLES[0]]), 60, preserved)).toThrow('c1-a inventory: retired title');
  });

  test('scrubs credential-shaped values and fixes the synthetic C1-A suffix', () => {
    const env = createInventoryEnvironment({ PATH: '/bin', OPENROUTER_API_KEY: 'admin-secret', AUTH_PATTERN: 'pattern-secret' }, '/repo');
    expect(env.PATH).toBe('/bin');
    expect(env.OPENROUTER_API_KEY).toBe('');
    expect(env.AUTH_PATTERN).toBe('');
    expect(env.C1_A_OUTPUT_SUFFIX).toBe('000000000000');
    expect(env.BUN_CONFIG_NO_LOAD_DOTENV).toBe('1');
  });

  test('requires each enabled C1-A title exactly once per project and rejects future titles', () => {
    expect(() => assertC1AE2EInventory(inventory(preserved, C1_A_TITLES.slice(0, 2)), 61, preserved)).not.toThrow();
    expect(() => assertC1AE2EInventory(inventory(preserved, [C1_A_TITLES[0], C1_A_TITLES[0]]), 60, preserved)).toThrow('c1-a inventory: C1-A titles');
    expect(() => assertC1AE2EInventory(inventory(preserved, C1_A_TITLES.slice(0, 2)), 60, preserved)).toThrow('c1-a inventory: C1-A titles');
    expect(() => assertC1AE2EInventory(inventory(preserved, C1_A_TITLES), 62, preserved)).not.toThrow();
  });

  test('requires identical inventories for Chromium and WebKit', () => {
    const value = inventory();
    value.ordinary.webkit.pop();
    expect(() => assertC1AE2EInventory(value, 60, preserved)).toThrow('c1-a inventory: ordinary titles');
  });
});
