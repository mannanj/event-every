import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  C1_B_MUTATIONS,
  createMutationEnvironment,
  parseMutationArguments,
  renderMutationLedger,
  runMutationRows,
  validateMutationManifest,
  type MutationExecution,
  type MutationRow,
} from './run-c1-b-mutations';

const EXPECTED_IDS = Array.from({ length: 25 }, (_, index) => `C1B-M${String(index + 1).padStart(2, '0')}`);

describe('C1-B causal mutation runner', () => {
  test('locks the exact 25-row manifest to one live allowlisted edit and one focused assertion', () => {
    expect(C1_B_MUTATIONS.map(({ id }) => id)).toEqual(EXPECTED_IDS);
    expect(() => validateMutationManifest(C1_B_MUTATIONS, process.cwd())).not.toThrow();
    for (const row of C1_B_MUTATIONS) {
      expect(row.target).toMatch(/^(?:src|cloudflare|scripts)\//);
      expect(row.before).not.toBe(row.after);
      expect(row.command.length).toBeGreaterThan(1);
      expect(row.expectedAssertion.length).toBeGreaterThan(12);
      expect(readFileSync(row.target, 'utf8').split(row.before)).toHaveLength(2);
    }
  });

  test('rejects missing or duplicate IDs, broad or no-op edits, and paths outside the C1-B allowlist', () => {
    const first = C1_B_MUTATIONS[0]!;
    expect(() => validateMutationManifest(C1_B_MUTATIONS.slice(1), process.cwd())).toThrow('manifest');
    expect(() => validateMutationManifest([...C1_B_MUTATIONS.slice(0, -1), first], process.cwd())).toThrow('manifest');
    expect(() => validateMutationManifest([{ ...first, after: first.before }, ...C1_B_MUTATIONS.slice(1)], process.cwd())).toThrow('edit');
    expect(() => validateMutationManifest([{ ...first, before: 'return' }, ...C1_B_MUTATIONS.slice(1)], process.cwd())).toThrow('anchor');
    expect(() => validateMutationManifest([{ ...first, target: 'tasks/task-192.md' }, ...C1_B_MUTATIONS.slice(1)], process.cwd())).toThrow('allowlist');
  });

  test('accepts only the two ledger modes', () => {
    expect(parseMutationArguments(['--write-ledger'])).toEqual({ mode: 'write' });
    expect(parseMutationArguments(['--verify-ledger'])).toEqual({ mode: 'verify' });
    for (const args of [[], ['--write-ledger', '--verify-ledger'], ['--unknown']]) {
      expect(() => parseMutationArguments(args)).toThrow('usage');
    }
  });

  test('scrubs credential families and installs only owned temp and offline preload controls', () => {
    const env = createMutationEnvironment({
      PATH: '/synthetic/bin', HOME: '/synthetic/home',
      OPENROUTER_API_KEY: 'forbidden', OPENROUTER_OWNER_KEY: 'forbidden',
      AWS_SECRET_ACCESS_KEY: 'forbidden', NPM_TOKEN: 'forbidden', NODE_OPTIONS: '--inspect', BUN_OPTIONS: '--hot',
    }, '/repo', '/owned-temp', { C1B_PROVIDER_MODEL: 'synthetic/mutant' });
    expect(env.PATH).toBe('/synthetic/bin');
    expect(env.HOME).toBeUndefined();
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.OPENROUTER_OWNER_KEY).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.NPM_TOKEN).toBeUndefined();
    expect(env.TMPDIR).toBe('/owned-temp');
    expect(env.TMP).toBe('/owned-temp');
    expect(env.TEMP).toBe('/owned-temp');
    expect(env.NODE_OPTIONS).toBe('--require=/repo/scripts/private-offline-preload.cjs');
    expect(env.BUN_OPTIONS).toBe('--preload=/repo/scripts/private-offline-preload.cjs');
    expect(env.C1B_PROVIDER_MODEL).toBe('synthetic/mutant');
  });

  test('requires a named red, proves restored green, preserves source hashes, and always removes the snapshot', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'c1-b-runner-test-'));
    const root = join(fixture, 'root');
    const snapshot = join(fixture, 'snapshot');
    const target = 'src/example.ts';
    const calls: string[] = [];
    const row: MutationRow = {
      id: 'C1B-M01', guarantee: 'fixture guarantee', target,
      before: 'const safe = true;', after: 'const safe = false;',
      command: ['bun', 'test', 'fixture.test.ts'], expectedAssertion: 'fixture catches unsafe edit', timeoutMs: 1_000,
    };
    const execution: MutationExecution = {
      root,
      makeSnapshot: () => snapshot,
      exportHead(destination) {
        writeFileSync(join(fixture, 'destination.txt'), destination);
        Bun.spawnSync(['mkdir', '-p', join(destination, 'src')]);
        writeFileSync(join(destination, target), row.before);
      },
      attachDependencies: () => undefined,
      run(_command, options) {
        const mutated = readFileSync(join(options.cwd, target), 'utf8').includes(row.after);
        calls.push(mutated ? 'red' : 'green');
        return mutated
          ? { exitCode: 1, output: `FAIL ${row.expectedAssertion}` }
          : { exitCode: 0, output: 'PASS' };
      },
      remove(path) { calls.push(`remove:${path}`); rmSync(path, { recursive: true, force: true }); },
      sourceHashes: () => ({ [target]: readFileSync(join(root, target), 'utf8') }),
    };
    Bun.spawnSync(['mkdir', '-p', join(root, 'src')]);
    writeFileSync(join(root, target), row.before);
    try {
      await expect(runMutationRows([row], execution)).resolves.toEqual([{ id: 'C1B-M01', redExit: 1, greenExit: 0 }]);
      expect(calls).toEqual(['red', 'green', `remove:${snapshot}`]);
      expect(readFileSync(join(root, target), 'utf8')).toBe(row.before);
      expect(readFileSync(join(fixture, 'destination.txt'), 'utf8')).toBe(snapshot);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test('rejects a green mutant, wrong failure text, source drift, and still cleans each snapshot', async () => {
    const row: MutationRow = { ...C1_B_MUTATIONS[0]!, prepare: undefined };
    for (const result of [
      { exitCode: 0, output: 'PASS' },
      { exitCode: 1, output: 'unrelated failure' },
    ]) {
      let removed = false;
      let source = row.before;
      const snapshot = mkdtempSync(join(tmpdir(), 'c1-b-runner-reject-'));
      const hashes = { [row.target]: 'stable' };
      const execution: MutationExecution = {
        root: process.cwd(), makeSnapshot: () => snapshot,
        exportHead: () => undefined, attachDependencies: () => undefined,
        run: () => result, remove: (target) => { removed = true; rmSync(target, { recursive: true, force: true }); }, sourceHashes: () => hashes,
        read: () => source, write: (_file, value) => { source = value; },
      };
      await expect(runMutationRows([row], execution)).rejects.toThrow(result.exitCode === 0 ? 'green mutant' : 'expected assertion');
      expect(removed).toBe(true);
    }

    let reads = 0;
    let driftSource = row.before;
    const driftSnapshot = mkdtempSync(join(tmpdir(), 'c1-b-runner-drift-'));
    const execution: MutationExecution = {
      root: process.cwd(), makeSnapshot: () => driftSnapshot,
      exportHead: () => undefined, attachDependencies: () => undefined,
      run: () => ({ exitCode: 1, output: row.expectedAssertion }), remove: (target) => rmSync(target, { recursive: true, force: true }),
      sourceHashes: () => ({ [row.target]: reads++ === 0 ? 'before' : 'after' }),
      read: () => driftSource, write: (_file, value) => { driftSource = value; },
    };
    await expect(runMutationRows([row], execution)).rejects.toThrow('source hashes');
  });

  test('renders a deterministic bounded ledger without source bodies or child output', () => {
    const results = C1_B_MUTATIONS.map(({ id }) => ({ id, redExit: 1, greenExit: 0 }));
    const first = renderMutationLedger(C1_B_MUTATIONS, results);
    expect(renderMutationLedger(C1_B_MUTATIONS, results)).toBe(first);
    expect(first).toContain('| C1B-M01 |');
    expect(first).toContain('| 1 | PASS |');
    for (const row of C1_B_MUTATIONS) {
      expect(first).not.toContain(row.before);
      expect(first).not.toContain(row.after);
    }
    expect(first).not.toMatch(/OPENROUTER|stack trace|\/private\/tmp|child stdout|child stderr/i);
  });
});
