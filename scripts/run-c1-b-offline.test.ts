import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  C1_B_OFFLINE_COMMANDS,
  C1_B_PROTECTED_FILE_HASHES,
  C1_B_PROTECTED_STATUS,
  C1_B_STAGE_NAMES,
  createC1BOfflineEnvironment,
  parseC1BOfflineArguments,
  runC1BOffline,
  validateC1BOfflineCommands,
  type C1BOfflineSeams,
} from './run-c1-b-offline';

const EXPECTED_COMMANDS = [
  ['bun', 'run', 'type-check'],
  ['bun', 'run', 'lint'],
  ['bun', 'test', 'src', '--isolate'],
  ['bun', 'test', 'scripts/run-private-offline.test.ts', 'scripts/assert-c1-b-paths.test.ts', 'scripts/assert-c1-a-config.test.ts', 'scripts/assert-c1-a-e2e-inventory.test.ts', 'scripts/run-c1-a-offline.test.ts', 'scripts/run-c1-a-worker-e2e.test.ts', 'scripts/assert-private-worker.test.ts', 'scripts/run-private-privacy.test.ts', 'scripts/run-private-worker-e2e.test.ts', 'scripts/run-c1-b-mutations.test.ts', 'scripts/run-c1-b-offline.test.ts', '--isolate'],
  ['bun', 'run', 'test:workers'],
  ['bun', 'run', 'verify:c1:a'],
  ['bun', 'run', 'verify:private:privacy'],
  ['bun', 'scripts/run-c1-b-mutations.ts', '--verify-ledger'],
  ['bun', 'scripts/assert-private-worker.ts'],
  ['bun', 'scripts/assert-c1-b-paths.ts', 'terminal'],
  ['bun', 'run', 'assert:e1-protected'],
] as const;

const bytes = (value = '') => new TextEncoder().encode(value);

function fixture(overrides: Partial<C1BOfflineSeams> = {}) {
  const root = '/synthetic/event-every';
  const temp = path.join(root, '.c1-b-offline-abcdef123456');
  const owned = new Set<string>();
  const calls: Array<Readonly<{ command: readonly string[]; env: Record<string, string | undefined>; timeoutMs: number }>> = [];
  const removals: string[][] = [];
  const hashCalls = new Map<string, number>();
  const protectedByPath = new Map(Object.entries(C1_B_PROTECTED_FILE_HASHES).map(([file, digest]) => [path.join(root, file), digest]));
  const seams: C1BOfflineSeams = {
    suffix: () => 'abcdef123456',
    hash(file) {
      hashCalls.set(file, (hashCalls.get(file) ?? 0) + 1);
      return protectedByPath.get(file) ?? `authored:${file}`;
    },
    status: () => C1_B_PROTECTED_STATUS,
    listOwned: () => [...owned].sort(),
    prepareTemp(target) { expect(target).toBe(temp); owned.add(target); },
    tempEmpty: () => true,
    removeOwned(paths) { removals.push([...paths]); for (const target of paths) owned.delete(target); },
    spawn: async (command, options, timeoutMs) => {
      calls.push({ command: [...command], env: { ...options.env }, timeoutMs });
      return { exitCode: 0, stdout: bytes(), stderr: bytes() };
    },
    ...overrides,
  };
  return { root, temp, owned, calls, removals, hashCalls, seams };
}

describe('C1-B aggregate offline gate', () => {
  test('exposes only the exact aggregate package command', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['verify:c1:b']).toBe('bun scripts/run-c1-b-offline.ts');
    expect(packageJson.scripts?.lint).toBe("eslint . --ignore-pattern '.claude/**'");
  });

  test('locks the exact ordered eleven-stage command list and rejects any expanded authority', () => {
    expect(C1_B_OFFLINE_COMMANDS).toEqual(EXPECTED_COMMANDS);
    expect(C1_B_STAGE_NAMES).toEqual([
      'typecheck', 'lint', 'source-unit', 'runner-unit', 'workerd', 'c1-a',
      'private-privacy', 'mutations', 'artifact', 'terminal-paths', 'protected',
    ]);
    expect(() => validateC1BOfflineCommands(C1_B_OFFLINE_COMMANDS)).not.toThrow();
    for (const command of [
      ['bun', 'install'], ['bun', 'run', 'deploy'], ['npm', 'publish'],
      ['curl', 'https://example.invalid'], ['wrangler', 'deploy'], ['git', 'push'],
    ]) expect(() => validateC1BOfflineCommands([command])).toThrow('forbidden command');
    expect(() => validateC1BOfflineCommands(C1_B_OFFLINE_COMMANDS.slice(0, -1))).toThrow('exact command set');
    expect(() => parseC1BOfflineArguments([])).not.toThrow();
    expect(() => parseC1BOfflineArguments(['--extra'])).toThrow('no arguments');
  });

  test('scrubs credentials, owns one temp root, and splits the source suite across two workers', async () => {
    const f = fixture();
    const env = createC1BOfflineEnvironment({
      PATH: '/bin', OPENROUTER_API_KEY: 'secret', CLOUDFLARE_API_TOKEN: 'secret',
      NODE_OPTIONS: '--inspect', BUN_OPTIONS: '--hot', SAFE: 'ignored',
    }, f.root, f.temp);
    expect(env.PATH).toBe('/bin');
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(env.SAFE).toBeUndefined();
    expect(env.TMPDIR).toBe(f.temp);
    expect(env.TMP).toBe(f.temp);
    expect(env.TEMP).toBe(f.temp);
    expect(env.NODE_OPTIONS).toBe(`--require=${path.join(f.root, 'scripts/private-offline-preload.cjs')}`);
    expect(env.BUN_OPTIONS).toBe(`--preload=${path.join(f.root, 'scripts/private-offline-preload.cjs')}`);

    await expect(runC1BOffline(f.root, { PATH: '/bin', TOKEN: 'secret' }, [], f.seams)).resolves.toEqual(C1_B_STAGE_NAMES);
    expect(f.calls.map(({ command }) => [...command])).toEqual(EXPECTED_COMMANDS.map((command) => [...command]));
    expect(f.calls.every(({ timeoutMs }) => timeoutMs === 15 * 60_000)).toBe(true);
    expect(f.calls[2]?.env.BUN_OPTIONS).toBe(`--preload=${path.join(f.root, 'scripts/private-offline-preload.cjs')} --parallel=2`);
    expect(f.calls.filter((_call, index) => index !== 2).every(({ env: child }) => !child.BUN_OPTIONS?.includes('--parallel=2'))).toBe(true);
    expect(f.removals).toEqual([[f.temp]]);
    expect(f.owned.size).toBe(0);
  });

  test('fails fast with fixed bounded errors and never exposes child output', async () => {
    const f = fixture({
      spawn: async (command, options, timeoutMs) => {
        f.calls.push({ command: [...command], env: { ...options.env }, timeoutMs });
        return f.calls.length === 4
          ? { exitCode: 9, stdout: bytes(`TOKEN secret ${'x'.repeat(100_000)}`), stderr: bytes('native stack') }
          : { exitCode: 0, stdout: bytes(), stderr: bytes() };
      },
    });
    const error = await runC1BOffline(f.root, { TOKEN: 'secret' }, [], f.seams).then(() => undefined, (value) => value as Error);
    expect(error?.message).toBe('c1-b offline: runner-unit stage failed');
    expect(error?.message).not.toMatch(/secret|native stack|TOKEN|x{100}/);
    expect(f.calls).toHaveLength(4);
    expect(f.owned.size).toBe(0);
  });

  test('maps timeout and signal exits to fixed failures and still removes owned output', async () => {
    for (const result of [
      { exitCode: 124, stdout: bytes(), stderr: bytes() },
      { exitCode: 130, signalCode: 'SIGTERM', stdout: bytes(), stderr: bytes() },
    ]) {
      const f = fixture({ spawn: async () => result });
      await expect(runC1BOffline(f.root, {}, [], f.seams)).rejects.toThrow('c1-b offline: typecheck stage failed');
      expect(f.removals).toEqual([[f.temp]]);
      expect(f.owned.size).toBe(0);
    }
  });

  test('refuses a pre-existing generated-output collision without dispatching or deleting it', async () => {
    const f = fixture();
    const collision = path.join(f.root, '.open-next');
    f.owned.add(collision);
    await expect(runC1BOffline(f.root, {}, [], f.seams)).rejects.toThrow('owned output collision');
    expect(f.calls).toEqual([]);
    expect(f.removals).toEqual([]);
    expect(f.owned).toEqual(new Set([collision]));
  });

  test('fails closed on authored, protected-hash, or protected-status drift', async () => {
    const authored = fixture();
    const baseHash = authored.seams.hash;
    authored.seams = {
      ...authored.seams,
      hash(file) {
        const value = baseHash(file);
        if (file.endsWith('scripts/run-c1-b-offline.ts') && (authored.hashCalls.get(file) ?? 0) > 1) return `${value}:changed`;
        return value;
      },
    };
    await expect(runC1BOffline(authored.root, {}, [], authored.seams)).rejects.toThrow('authored input changed');
    expect(authored.owned.size).toBe(0);

    const protectedHash = fixture();
    protectedHash.seams = {
      ...protectedHash.seams,
      hash(file) { return file.endsWith('docs/testing/e1-mutation-ledger.md') ? 'wrong' : fixture().seams.hash(file); },
    };
    await expect(runC1BOffline(protectedHash.root, {}, [], protectedHash.seams)).rejects.toThrow('protected hash');
    expect(protectedHash.calls).toEqual([]);

    let statusReads = 0;
    const protectedStatus = fixture({ status: () => statusReads++ === 0 ? C1_B_PROTECTED_STATUS : `${C1_B_PROTECTED_STATUS}?? unexpected\n` });
    await expect(runC1BOffline(protectedStatus.root, {}, [], protectedStatus.seams)).rejects.toThrow('protected status changed');
    expect(protectedStatus.owned.size).toBe(0);
  });

  test('detects stage leftovers and a nonempty owned temp, then removes all owned paths', async () => {
    const f = fixture({
      tempEmpty: () => false,
      spawn: async (command, options, timeoutMs) => {
        f.calls.push({ command: [...command], env: { ...options.env }, timeoutMs });
        if (f.calls.length === EXPECTED_COMMANDS.length) f.owned.add(path.join(f.root, 'test-results-private-leaked'));
        return { exitCode: 0, stdout: bytes(), stderr: bytes() };
      },
    });
    await expect(runC1BOffline(f.root, {}, [], f.seams)).rejects.toThrow('generated output remained');
    expect(f.removals[0]).toEqual([
      f.temp,
      path.join(f.root, 'test-results-private-leaked'),
    ].sort());
    expect(f.owned.size).toBe(0);
  });

  test('removes owned output before the final protected status and hash check', async () => {
    const f = fixture();
    f.seams = {
      ...f.seams,
      status: () => f.owned.size === 0 ? C1_B_PROTECTED_STATUS : `${C1_B_PROTECTED_STATUS}?? owned-output\n`,
    };
    await expect(runC1BOffline(f.root, {}, [], f.seams)).resolves.toEqual(C1_B_STAGE_NAMES);
    expect(f.removals).toEqual([[f.temp]]);
  });
});
