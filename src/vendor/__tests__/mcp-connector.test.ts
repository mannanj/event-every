import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * The connector panel is shared by five apps and lives in
 * `~/Documents/mcp-connector`. Each app keeps a GENERATED copy, because bun
 * satisfies a `file:` dependency with per-file symlinks that Turbopack refuses
 * to follow - so a copy is what keeps the build hermetic.
 *
 * A copy is only safe if drift is caught, which is this test's entire job.
 *
 * IT IS ALSO HERE BECAUSE I DID THE WRONG THING FIRST. Event Every originally
 * shipped a bespoke connector component, which is precisely what the package's
 * own note warns against: "a second home is how the next edit forks four apps
 * one level up". This test is the thing that stops the fork happening again
 * quietly.
 */

const appRoot = path.resolve(import.meta.dir, '..', '..', '..');
const vendored = path.join(appRoot, 'src', 'vendor', 'mcp-connector');

/**
 * Where the shared package lives, if it is here at all.
 *
 * Checked as a SIBLING first and only then under `~/Documents`. Keying solely
 * on a home directory meant the drift half could never run anywhere but this
 * laptop - on CI or another machine it skipped silently, and a test that can
 * only fail in one place is a test that mostly does not run.
 *
 * MCP_CONNECTOR_SRC overrides both, so CI can point at a checkout.
 */
function findPackageSrc(): string | null {
  const candidates = [
    process.env.MCP_CONNECTOR_SRC,
    path.resolve(appRoot, '..', 'mcp-connector', 'src'),
    path.join(homedir(), 'Documents', 'mcp-connector', 'src'),
  ].filter((one): one is string => Boolean(one));
  return candidates.find((one) => existsSync(one)) ?? null;
}

const PAIRS = [
  ['index.tsx', 'connector.tsx'],
  ['styles.css', 'styles.css'],
  ['mask.ts', 'mask.ts'],
] as const;

describe('the vendored connector', () => {
  test('is present and carries the generated banner', () => {
    for (const [, to] of PAIRS) {
      const copy = readFileSync(path.join(vendored, to), 'utf8');
      expect(copy).toContain('GENERATED FROM @mannan/mcp-connector');
    }
  });

  test('has not drifted from the shared package', () => {
    const packageSrc = findPackageSrc();
    if (!packageSrc) {
      // A clone without the package still builds, because the copy is
      // committed. Nothing to compare against, so nothing to assert - but say
      // so, rather than passing silently and looking like coverage.
      console.log('  (skipped: shared package not found; set MCP_CONNECTOR_SRC)');
      return;
    }

    for (const [from, to] of PAIRS) {
      const source = readFileSync(path.join(packageSrc, from), 'utf8');
      const copy = readFileSync(path.join(vendored, to), 'utf8');

      // A vendored file is the source with a banner on top, so the test is
      // "ends with the source", not "identical to it".
      expect(
        copy.endsWith(source),
        `${to} has drifted. Re-sync with:\n  node ~/Documents/mcp-connector/bin/sync.mjs ${vendored}`,
      ).toBe(true);
    }
  });

  test('nothing else in the app implements the same panel', () => {
    // The fork this test exists to prevent. If a second connector component
    // appears, the shared package stops being the one place to edit.
    const strays = ['src/components/McpConnect.tsx', 'src/components/McpConnector.tsx'];
    for (const stray of strays) {
      expect(existsSync(path.join(appRoot, stray)), `${stray} should not exist`).toBe(false);
    }
  });
});
