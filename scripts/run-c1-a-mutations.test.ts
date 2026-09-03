import { describe, expect, test } from 'bun:test';
import { chmodSync, closeSync, constants, existsSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dlopen, FFIType, ptr } from 'bun:ffi';
import {
  C1_A_MUTATIONS,
  CHILD_TIMEOUT_MS,
  COMPILE_TIMEOUT_MS,
  MUTATION_COMMANDS,
  MutationRunnerError,
  classifyLockfTermination,
  parseMutationArguments,
  renderMutationLedger,
  runBoundedChild,
  runLockfProbe,
  defaultDirtyTarget,
  trackedHeadFiles,
  tryLifecycleLock,
  runMutations,
  createTestFixtureWriteCapability,
  runTestFixtureMutations,
  type MutationExecution,
} from './run-c1-a-mutations';

const encoder = new TextEncoder();
const sha256 = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
const fixtureTrackedFiles = new Map<string, Map<string, Uint8Array>>();
const completeProofs = () => C1_A_MUTATIONS.map((row) => ({ ...row, restoredSha256: 'a'.repeat(64) }));
const allRedAssertions = C1_A_MUTATIONS.map(({ redAssertion }) => `(fail) ${redAssertion}`).join('\n');

function collectProcess(stream: NodeJS.ReadableStream | null): Promise<Buffer> {
  return new Promise((resolvePromise) => {
    if (!stream) return resolvePromise(Buffer.alloc(0)); const chunks: Buffer[] = [];
    stream.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolvePromise(Buffer.concat(chunks)));
  });
}

function trackFixtureFile(root: string, file: string): void {
  const relative = path.relative(root, file); const files = fixtureTrackedFiles.get(root) ?? new Map<string, Uint8Array>();
  files.set(relative, readFileSync(file)); fixtureTrackedFiles.set(root, files);
}

function fixtureRoot(): { root: string; target: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-mutations-'));
  const target = path.join(root, 'src/platform/identity.ts');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, "export const ip = request.headers.get('cf-connecting-ip');\n");
  trackFixtureFile(root, target);
  return { root, target };
}

function git(root: string, args: readonly string[]): void {
  const result = spawnSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'git fixture failed');
}

function committedGitFixture(contents: string): { root: string; target: string } {
  const { root, target } = fixtureRoot();
  writeFileSync(target, contents);
  git(root, ['init', '--quiet']); git(root, ['add', '.']);
  git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  return { root, target };
}

function completeMutationFixture(): { root: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-complete-'));
  const byTarget = new Map<string, Set<string>>();
  for (const row of C1_A_MUTATIONS) {
    const anchors = byTarget.get(row.target) ?? new Set<string>();
    anchors.add(row.oldText); byTarget.set(row.target, anchors);
  }
  for (const [target, anchors] of byTarget) {
    const pathname = path.join(root, target); mkdirSync(path.dirname(pathname), { recursive: true });
    writeFileSync(pathname, `${[...anchors].join('\n')}\n`); trackFixtureFile(root, pathname);
  }
  return { root };
}

function completeExecution(root: string, options: Partial<MutationExecution> = {}): MutationExecution {
  let behavioralRun = 0;
  return execution(root, {
    run: (argv) => {
      if (argv.join(' ').includes('typescript/bin/tsc')) return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
      behavioralRun += 1;
      return { exitCode: behavioralRun % 2 === 1 ? 1 : 0, stdout: encoder.encode(allRedAssertions), stderr: new Uint8Array() };
    },
    ...options,
  });
}

function writeFixtureMutations(execution: MutationExecution, hooks: Parameters<typeof createTestFixtureWriteCapability>[1] = {}) {
  const parsed = { mode: 'write' as const, ids: C1_A_MUTATIONS.map(({ id }) => id) };
  return runTestFixtureMutations(parsed, execution, createTestFixtureWriteCapability(execution, hooks));
}

const testProcessLibrary = dlopen('/usr/lib/libproc.dylib', {
  proc_listallpids: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  proc_pidinfo: { args: [FFIType.i32, FFIType.i32, FFIType.u64, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
});
const testLibc = dlopen('/usr/lib/libSystem.B.dylib', { getpgid: { args: [FFIType.i32], returns: FFIType.i32 } });
const procPidInfo = testProcessLibrary.symbols.proc_pidinfo;
function processParent(pid: number): number {
  const buffer = Buffer.alloc(136); const size = procPidInfo(pid, 3, 0, ptr(buffer), buffer.length);
  return size > 0 ? buffer.readUInt32LE(16) : 0;
}

function ancestryFrom(pid: number, expectedRoot: number): number[] {
  const ancestry: number[] = [];
  for (let current = pid; current > 0 && ancestry.length < 16; current = processParent(current)) {
    ancestry.push(current); if (current === expectedRoot) return ancestry;
  }
  return ancestry;
}

function descendantPids(rootPid: number): number[] {
  const bytes = Buffer.alloc(4 * 32_768); const count = testProcessLibrary.symbols.proc_listallpids(ptr(bytes), bytes.length);
  const parents = new Map<number, number>();
  for (let index = 0; index < count; index += 1) {
    const pid = bytes.readInt32LE(index * 4); if (pid > 1) parents.set(pid, processParent(pid));
  }
  const descendants = new Set<number>([rootPid]); let changed = true;
  while (changed) { changed = false; for (const [pid, parent] of parents) if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true; } }
  descendants.delete(rootPid); return [...descendants];
}

function derivedCliFixture(commandSource: string): { root: string; script: string; target: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-derived-')); const script = path.join(root, 'scripts/run-c1-a-mutations.ts');
  const target = path.join(root, 'src/platform/identity.ts'); mkdirSync(path.dirname(script), { recursive: true }); mkdirSync(path.dirname(target), { recursive: true });
  const source = readFileSync(path.join(import.meta.dir, 'run-c1-a-mutations.ts'), 'utf8')
    .replace(/const COMPILE_COMMAND = \[[^\n]+\] as const;/, "const COMPILE_COMMAND = ['/usr/bin/true'] as const;")
    .replace(/  'MUT-A': \[[^\n]+\],/, "  'MUT-A': ['/bin/sh', 'scripts/derived-behavior.sh'],");
  writeFileSync(script, source); writeFileSync(path.join(root, 'scripts/c1-a-offline-preload.cjs'), '');
  writeFileSync(path.join(root, 'scripts/derived-behavior.sh'), `if ! /usr/bin/grep -Fq "request.headers.get('x-forwarded-for')" src/platform/identity.ts; then exit 0; fi\n${commandSource}\nprintf '(fail) forged forwarding header is ignored' >&2\nexit 1\n`);
  writeFileSync(target, "export const ip = request.headers.get('cf-connecting-ip');\n"); mkdirSync(path.join(root, 'node_modules'));
  git(root, ['init', '--quiet']); git(root, ['add', '.']); git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  return { root, script, target };
}

function hostileGitEnvironment(): { attacker: string; restore: () => void } {
  const attacker = committedGitFixture("export const ip = 'attacker';\n").root;
  const saved = new Map<string, string | undefined>();
  const values: Record<string, string> = {
    GIT_DIR: path.join(attacker, '.git'), GIT_WORK_TREE: attacker, GIT_INDEX_FILE: path.join(attacker, '.git/index'),
    GIT_OBJECT_DIRECTORY: path.join(attacker, '.git/objects'), GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(attacker, '.git/objects'),
    GIT_COMMON_DIR: path.join(attacker, '.git'), GIT_NAMESPACE: 'attacker', GIT_REPLACE_REF_BASE: path.join(attacker, '.git/refs/replace'),
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.worktree', GIT_CONFIG_VALUE_0: attacker,
    GIT_EXEC_PATH: attacker, GIT_SSH: '/usr/bin/false', GIT_ASKPASS: '/usr/bin/false',
  };
  for (const [name, value] of Object.entries(values)) { saved.set(name, process.env[name]); process.env[name] = value; }
  return { attacker, restore: () => { for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } rmSync(attacker, { recursive: true, force: true }); } };
}

function execution(root: string, options: Partial<MutationExecution> = {}): MutationExecution {
  const calls: string[][] = [];
  let behavioralRunsSinceCompile = 0;
  mkdirSync(path.join(root, 'docs/testing'), { recursive: true });
  return {
    root,
    ledgerPath: path.join(root, 'docs/testing/c1-a-mutation-ledger.md'),
    now: () => 1_700_000_000_000,
    pid: 12345,
    isProcessAlive: () => false,
    run: (argv) => {
      calls.push([...argv]);
      const isCompile = argv.join(' ').includes('typescript/bin/tsc');
      if (isCompile) { behavioralRunsSinceCompile = 0; return { exitCode: 0, stdout: encoder.encode('compile'), stderr: new Uint8Array() }; }
      behavioralRunsSinceCompile += 1;
      return { exitCode: behavioralRunsSinceCompile === 1 ? 1 : 0, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() };
    },
    hasDirtyTarget: () => false,
    allowMissingLedger: true,
    calls,
    trackedSnapshotFiles: () => [...(fixtureTrackedFiles.get(root) ?? new Map())].map(([file, bytes]) => ({ path: file, bytes })),
    ...options,
  };
}

describe('C1-A mutation registry', () => {
  test('is a closed deterministic registry of all 45 authoritative IDs', () => {
    expect(C1_A_MUTATIONS).toHaveLength(45);
    expect(C1_A_MUTATIONS.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `C1A-M${String(index + 1).padStart(2, '0')}`),
      'C1A-M11', 'C1A-M12A', 'C1A-M12B', 'C1A-M12C',
      ...Array.from({ length: 31 }, (_, index) => `C1A-M${index + 13}`),
    ]);
    expect(Object.keys(MUTATION_COMMANDS).sort()).toEqual(['MUT-A', 'MUT-B', 'MUT-C', 'MUT-D', 'MUT-E', 'MUT-F', 'MUT-G', 'MUT-H', 'MUT-I', 'MUT-J', 'MUT-K', 'MUT-L', 'MUT-M', 'MUT-N', 'MUT-O', 'MUT-P', 'MUT-Q', 'MUT-R', 'MUT-S', 'MUT-T']);
    const repairRows = C1_A_MUTATIONS.filter(({ id }) => id === 'C1A-M22' || id === 'C1A-M23');
    expect(repairRows.map(({ target, oldText, id }) => ({ id, target, oldText }))).toEqual([
      { id: 'C1A-M22', target: 'src/services/reviewStorage.ts', oldText: 'storage.removeItem(REVIEW_STORAGE_KEY);' },
      { id: 'C1A-M23', target: 'src/services/reviewStorage.ts', oldText: 'storage.removeItem(REVIEW_STORAGE_KEY);' },
    ]);
    expect(C1_A_MUTATIONS.find(({ id }) => id === 'C1A-M01')).toMatchObject({ ownerTask: 4 });
    expect(C1_A_MUTATIONS.find(({ id }) => id === 'C1A-M27')).toMatchObject({ ownerTask: 3 });
    expect(C1_A_MUTATIONS.find(({ id }) => id === 'C1A-M21')).toMatchObject({ ownerTask: 10 });
  });

  test('accepts only a closed mode and registered ID', () => {
    expect(parseMutationArguments(['--verify-ledger', 'C1A-M01'])).toEqual({ mode: 'verify', ids: ['C1A-M01'] });
    expect(parseMutationArguments(['--write-ledger', '--all'])).toEqual({ mode: 'write', ids: C1_A_MUTATIONS.map(({ id }) => id) });
    for (const args of [[], ['--all'], ['--verify-ledger', 'C1A-M99'], ['--write-ledger', 'C1A-M01'], ['--write-ledger', 'C1A-M01', 'extra'], ['--verify-ledger', '--write-ledger']]) {
      expect(() => parseMutationArguments(args)).toThrow('c1-a mutations: expected');
    }
  });

  test('every authoritative row has one live production anchor and one exact replacement delta', () => {
    const root = path.resolve(import.meta.dir, '..');
    for (const row of C1_A_MUTATIONS) {
      const source = readFileSync(path.join(root, row.target), 'utf8'); const oldCount = source.split(row.oldText).length - 1;
      const beforeNew = source.split(row.newText).length - 1; const nestedNew = row.oldText.split(row.newText).length - 1;
      const mutated = source.replace(row.oldText, row.newText); const afterNew = mutated.split(row.newText).length - 1;
      expect({ id: row.id, oldCount, replacementDelta: afterNew - beforeNew + nestedNew }).toEqual({ id: row.id, oldCount: 1, replacementDelta: 1 });
    }
  });
});

describe('C1-A mutation runner', () => {
  test('observes real lockf exit 75, distinguishes startup causes, reacquires, and leaks no readiness pathname', async () => {
    const { root } = fixtureRoot();
    const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('event-every-c1-a-lock-ready-')));
    const holder = spawn('/usr/bin/lockf', ['-s', '-t', '0', root, process.execPath, '-e', "process.stdout.write('held');setInterval(()=>{},1000)"], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
    try {
      await once(holder.stdout!, 'data');
      expect(runLockfProbe(root)).toBe('contended');
      expect(classifyLockfTermination(75, undefined, false)).toBe('contended');
      expect(classifyLockfTermination(75, undefined, true)).toBe('completed');
      expect(classifyLockfTermination(1, undefined, false)).toBe('startup-failed');
      expect(runLockfProbe(root, '/definitely/missing/lockf')).toBe('unavailable');
    } finally {
      try { process.kill(-holder.pid!, 'SIGTERM'); } catch { /* already exited */ }
      await once(holder, 'close');
      expect(runLockfProbe(root)).toBe('completed');
      const after = readdirSync(tmpdir()).filter((name) => name.startsWith('event-every-c1-a-lock-ready-') && !before.has(name));
      expect(after).toEqual([]);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('the internal lifecycle retains an independent kernel lock if the lockf wrapper dies', () => {
    const { root } = fixtureRoot(); const first = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY); const contender = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      expect(tryLifecycleLock(first)).toBe(true);
      expect(tryLifecycleLock(contender)).toBe(false);
      closeSync(first);
      expect(tryLifecycleLock(contender)).toBe(true);
    } finally { try { closeSync(first); } catch { /* already closed */ } closeSync(contender); rmSync(root, { recursive: true, force: true }); }
  });
  test('runs compile, named RED, exact restore, and restored GREEN from a bounded fixture', () => {
    const { root, target } = fixtureRoot();
    try {
      const before = readFileSync(target, 'utf8'); const runner = execution(root);
      const results = runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 'C1A-M01', target: 'src/platform/identity.ts', restoredSha256: sha256(before) });
      expect(readFileSync(target, 'utf8')).toBe(before);
      expect(runner.calls).toHaveLength(3);
      expect(runner.calls![0].join(' ')).toContain('typescript/bin/tsc --noEmit');
      const preload = runner.calls![1][1]; const commandRoot = path.dirname(path.dirname(preload.slice('--preload='.length)));
      expect(runner.calls![1]).toEqual([process.execPath, preload, ...MUTATION_COMMANDS['MUT-A'].slice(1)]);
      expect(runner.calls![2]).toEqual([process.execPath, preload, ...MUTATION_COMMANDS['MUT-A'].slice(1)]);
      expect(commandRoot).not.toBe(root);
      expect(existsSync(commandRoot)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects dirty targets before mutation', () => {
    const { root } = fixtureRoot();
    try {
      const runner = execution(root, { hasDirtyTarget: () => true });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: dirty target');
      expect(runner.calls).toHaveLength(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('pins snapshot blobs and dirty checks to the requested repository despite hostile Git selectors', () => {
    const { root, target } = committedGitFixture("export const ip = 'trusted';\n"); const hostile = hostileGitEnvironment();
    try {
      expect(new TextDecoder().decode(trackedHeadFiles(root).find((file) => file.path === 'src/platform/identity.ts')!.bytes)).toBe("export const ip = 'trusted';\n");
      writeFileSync(target, "export const ip = 'locally dirty';\n");
      expect(defaultDirtyTarget(root, 'src/platform/identity.ts')).toBe(true);
      expect(readFileSync(path.join(hostile.attacker, 'src/platform/identity.ts'), 'utf8')).toBe("export const ip = 'attacker';\n");
    } finally { hostile.restore(); rmSync(root, { recursive: true, force: true }); }
  });

  test('fails closed when the authenticated repository root or .git directory is replaced between Git operations', () => {
    for (const component of ['root', '.git'] as const) {
      const trusted = committedGitFixture("export const ip = 'trusted';\n");
      const attacker = committedGitFixture("export const ip = 'attacker';\n");
      const originalRoot = `${trusted.root}-authenticated`; const originalGit = path.join(trusted.root, '.git-authenticated');
      let swapped = false;
      const swap = (operation: number) => {
        if (operation !== 1 || swapped) return; swapped = true;
        if (component === 'root') { renameSync(trusted.root, originalRoot); renameSync(attacker.root, trusted.root); }
        else { renameSync(path.join(trusted.root, '.git'), originalGit); renameSync(path.join(attacker.root, '.git'), path.join(trusted.root, '.git')); }
      };
      const restore = () => {
        if (!swapped) return;
        if (component === 'root') { renameSync(trusted.root, attacker.root); renameSync(originalRoot, trusted.root); }
        else { renameSync(path.join(trusted.root, '.git'), path.join(attacker.root, '.git')); renameSync(originalGit, path.join(trusted.root, '.git')); }
        swapped = false;
      };
      try {
        expect(() => trackedHeadFiles(trusted.root, swap)).toThrow('c1-a mutations: snapshot unavailable');
        expect(swapped).toBe(true);
        expect(readFileSync(component === 'root' ? path.join(trusted.root, 'src/platform/identity.ts') : attacker.target, 'utf8')).toBe("export const ip = 'attacker';\n");
        restore(); writeFileSync(trusted.target, "export const ip = 'dirty trusted';\n");
        expect(defaultDirtyTarget(trusted.root, 'src/platform/identity.ts', swap)).toBe(true);
        expect(swapped).toBe(true);
        expect(readFileSync(component === 'root' ? path.join(trusted.root, 'src/platform/identity.ts') : attacker.target, 'utf8')).toBe("export const ip = 'attacker';\n");
      } finally {
        restore();
        rmSync(trusted.root, { recursive: true, force: true }); rmSync(attacker.root, { recursive: true, force: true });
      }
    }
  });

  test('binds tracked Git blobs to the inherited repository descriptor before the first operation', () => {
    const trusted = committedGitFixture("export const ip = 'trusted';\n");
    const attacker = committedGitFixture("export const ip = 'attacker';\n");
    const moved = `${trusted.root}-authenticated`; const descriptor = openSync(trusted.root, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      renameSync(trusted.root, moved); renameSync(attacker.root, trusted.root);
      expect(() => trackedHeadFiles(trusted.root, undefined, descriptor)).toThrow('c1-a mutations: snapshot unavailable');
    } finally {
      closeSync(descriptor); renameSync(trusted.root, attacker.root); renameSync(moved, trusted.root);
      rmSync(trusted.root, { recursive: true, force: true }); rmSync(attacker.root, { recursive: true, force: true });
    }
  });

  test('binds the dirty-target Git check to the inherited repository descriptor before the first operation', () => {
    const trusted = committedGitFixture("export const ip = 'trusted';\n");
    const attacker = committedGitFixture("export const ip = 'attacker';\n");
    const moved = `${trusted.root}-authenticated`; const descriptor = openSync(trusted.root, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      renameSync(trusted.root, moved); renameSync(attacker.root, trusted.root);
      expect(defaultDirtyTarget(trusted.root, 'src/platform/identity.ts', undefined, descriptor)).toBe(true);
    } finally {
      closeSync(descriptor); renameSync(trusted.root, attacker.root); renameSync(moved, trusted.root);
      rmSync(trusted.root, { recursive: true, force: true }); rmSync(attacker.root, { recursive: true, force: true });
    }
  });

  test('rejects a hard-linked target before an external alias can observe mutation', () => {
    const { root, target } = fixtureRoot(); const outside = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-hardlink-')); const alias = path.join(outside, 'identity-alias.ts');
    try {
      linkSync(target, alias); const before = readFileSync(alias, 'utf8'); const observedDuringChild: string[] = [];
      const runner = execution(root, { run: () => {
        observedDuringChild.push(readFileSync(alias, 'utf8'));
        return { exitCode: 2, stdout: new Uint8Array(), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: target unsafe');
      expect(observedDuringChild).toEqual([]);
      expect(readFileSync(alias, 'utf8')).toBe(before);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });

  test('keeps production bytes isolated when a hard-link adversary arrives during RED', () => {
    const { root, target } = fixtureRoot(); const outside = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-late-hardlink-')); const alias = path.join(outside, 'identity-alias.ts');
    try {
      const before = readFileSync(target, 'utf8'); let behavior = 0; let commandRoot = ''; let aliasDuringRed = ''; let mutationDuringRed = '';
      const runner = execution(root, { run: (argv, options) => {
        commandRoot = options.cwd;
        if (argv.join(' ').includes('typescript/bin/tsc')) return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
        behavior += 1;
        if (behavior === 1) {
          linkSync(target, alias);
          aliasDuringRed = readFileSync(alias, 'utf8');
          mutationDuringRed = readFileSync(path.join(options.cwd, 'src/platform/identity.ts'), 'utf8');
        }
        return { exitCode: behavior === 1 ? 1 : 0, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: target unsafe');
      expect(aliasDuringRed).toBe(before);
      expect(mutationDuringRed).toContain("request.headers.get('x-forwarded-for')");
      expect(commandRoot).not.toBe(root);
      expect(existsSync(commandRoot)).toBe(false);
      expect(readFileSync(alias, 'utf8')).toBe(before);
      expect(readFileSync(target, 'utf8')).toBe(before);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });

  test('rejects concurrent edits and restores the original bytes in finally', () => {
    const { root, target } = fixtureRoot();
    try {
      const before = readFileSync(target, 'utf8');
      const runner = execution(root, { run: (argv) => {
        if (argv.join(' ').includes('typescript/bin/tsc')) return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
        writeFileSync(target, 'concurrent edit');
        return { exitCode: 1, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: concurrent edit');
      expect(before).not.toBe('concurrent edit');
      expect(readFileSync(target, 'utf8')).toBe('concurrent edit');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects compile failure, false green, and a RED without its named assertion', () => {
    const { root } = fixtureRoot();
    try {
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { run: () => ({ exitCode: 2, stdout: new Uint8Array(), stderr: new Uint8Array() }) }))).toThrow('c1-a mutations: compile failed');
      let command = 0;
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { run: () => ({ exitCode: ++command === 1 ? 0 : 0, stdout: encoder.encode('not red'), stderr: new Uint8Array() }) }))).toThrow('c1-a mutations: expected RED');
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { run: (argv) => ({ exitCode: argv.join(' ').includes('typescript') ? 0 : 1, stdout: encoder.encode('different assertion'), stderr: new Uint8Array() }) }))).toThrow('c1-a mutations: red assertion not observed');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('requires exact one-time anchors and rejects target escape', () => {
    const { root, target } = fixtureRoot();
    try {
      writeFileSync(target, "request.headers.get('cf-connecting-ip')\nrequest.headers.get('cf-connecting-ip')\n");
      trackFixtureFile(root, target);
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root))).toThrow('c1-a mutations: anchor');
      const escaped = { ...C1_A_MUTATIONS[0], target: '../outside.ts' };
      expect(() => renderMutationLedger([{ ...escaped, restoredSha256: 'a'.repeat(64) }])).toThrow('c1-a mutations: target');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('accepts an exact mutator whose inverse text is necessarily nested inside it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-nested-inverse-'));
    const target = path.join(root, 'src/platform/resolver/capability.ts'); mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'export const deadline = Math.min(input.nowMs + 120_000, blackoutStartMs);\n'); trackFixtureFile(root, target);
    let behavior = 0;
    try {
      const runner = execution(root, { run: (argv) => {
        if (argv.join(' ').includes('typescript/bin/tsc')) return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
        behavior += 1; return { exitCode: behavior === 1 ? 1 : 0, stdout: encoder.encode('capability expires before blackout'), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M11'] }, runner)).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('creates deterministic secret-free output only through canonical ledger publication', () => {
    const { root } = completeMutationFixture();
    try {
      const runner = completeExecution(root); const result = writeFixtureMutations(runner);
      const ledger = readFileSync(runner.ledgerPath, 'utf8');
      expect(ledger).toBe(renderMutationLedger(result));
      expect(ledger).toContain('| C1A-M01 | Task 4 |');
      expect(ledger).toContain("request.headers.get('x-forwarded-for') → request.headers.get('cf-connecting-ip')");
      expect(ledger).not.toContain('synthetic-output-canary');
      expect(ledger).not.toContain('must-not-reach-child');
      expect(() => writeFixtureMutations(completeExecution(root))).toThrow('c1-a mutations: ledger already exists');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('CLI composition rejects focused write before mutation or ledger publication', () => {
    const { root, target } = fixtureRoot();
    try {
      const before = readFileSync(target, 'utf8'); const runner = execution(root);
      expect(() => runMutations(parseMutationArguments(['--write-ledger', 'C1A-M01']), runner)).toThrow('c1-a mutations: expected --write-ledger --all or --verify-ledger --all|ID');
      expect(runner.calls).toHaveLength(0);
      expect(existsSync(runner.ledgerPath)).toBe(false);
      expect(readFileSync(target, 'utf8')).toBe(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('exported runMutations rejects every noncanonical write set before mutation or publication', () => {
    const all = C1_A_MUTATIONS.map(({ id }) => id);
    for (const ids of [['C1A-M01'], [...all].reverse(), [...all.slice(0, -1), all[0]]]) {
      const { root, target } = fixtureRoot();
      try {
        const before = readFileSync(target, 'utf8'); const runner = execution(root);
        expect(() => runMutations({ mode: 'write', ids }, runner)).toThrow('c1-a mutations: write requires exact registry');
        expect(runner.calls).toHaveLength(0);
        expect(existsSync(runner.ledgerPath)).toBe(false);
        expect(readFileSync(target, 'utf8')).toBe(before);
      } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  test('rejects an unrelated RED when the named assertion only passed', () => {
    const { root } = fixtureRoot();
    try {
      let behavioralRun = 0;
      const runner = execution(root, { run: (argv) => {
        if (argv.join(' ').includes('typescript/bin/tsc')) return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
        behavioralRun += 1;
        return behavioralRun === 1
          ? { exitCode: 1, stdout: encoder.encode('(pass) forged forwarding header is ignored\n(fail) unrelated failure\n'), stderr: new Uint8Array() }
          : { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: red assertion not observed');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('exported execution injection cannot consume the production ledger with fake all-45 proofs', () => {
    const productionRoot = path.resolve(import.meta.dir, '..'); const productionLedger = path.join(productionRoot, 'docs/testing/c1-a-mutation-ledger.md');
    const snapshotsBefore = new Set(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-'))); let childCalls = 0; let publicationReached = false;
    expect(existsSync(productionLedger)).toBe(false);
    const files = new Map<string, Uint8Array>();
    for (const row of C1_A_MUTATIONS) if (!files.has(row.target)) files.set(row.target, readFileSync(path.join(productionRoot, row.target)));
    const injected: MutationExecution & { beforeLedgerPublish: () => void } = {
      root: productionRoot, ledgerPath: productionLedger, now: Date.now, pid: process.pid, isProcessAlive: () => true,
      hasDirtyTarget: () => false, allowMissingLedger: true,
      trackedSnapshotFiles: () => [...files].map(([file, bytes]) => ({ path: file, bytes })),
      run: (argv) => {
        childCalls += 1; const compile = argv.join(' ').includes('typescript/bin/tsc');
        return { exitCode: compile || childCalls % 3 === 0 ? 0 : 1, stdout: encoder.encode(allRedAssertions), stderr: new Uint8Array() };
      },
      beforeLedgerPublish: () => { publicationReached = true; throw new Error('publication must be unreachable'); },
    };
    expect(() => runMutations({ mode: 'write', ids: C1_A_MUTATIONS.map(({ id }) => id) }, injected)).toThrow('c1-a mutations: write requires private lifecycle');
    expect(childCalls).toBe(0); expect(publicationReached).toBe(false); expect(existsSync(productionLedger)).toBe(false);
    expect(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-') && !snapshotsBefore.has(name))).toEqual([]);
  });

  test('fixture write authority remains bound when its caller retargets execution after authentication', () => {
    const { root } = completeMutationFixture(); const productionRoot = path.resolve(import.meta.dir, '..');
    const productionLedger = path.join(productionRoot, 'docs/testing/c1-a-mutation-ledger.md');
    try {
      const execution = completeExecution(root); const capability = createTestFixtureWriteCapability(execution);
      const retargeted = execution as unknown as { root: string; ledgerPath: string; run: MutationExecution['run']; hasDirtyTarget: MutationExecution['hasDirtyTarget'] };
      retargeted.root = productionRoot; retargeted.ledgerPath = productionLedger;
      retargeted.run = () => ({ exitCode: 0, stdout: encoder.encode(allRedAssertions), stderr: new Uint8Array() }); retargeted.hasDirtyTarget = () => false;
      runTestFixtureMutations({ mode: 'write', ids: C1_A_MUTATIONS.map(({ id }) => id) }, execution, capability);
      expect(existsSync(productionLedger)).toBe(false); expect(existsSync(path.join(root, 'docs/testing/c1-a-mutation-ledger.md'))).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('fixture callbacks cannot replace the authenticated root after capability binding', () => {
    const { root } = completeMutationFixture(); const moved = `${root}-moved`; const productionRoot = path.resolve(import.meta.dir, '..');
    const productionLedger = path.join(productionRoot, 'docs/testing/c1-a-mutation-ledger.md'); const base = completeExecution(root); const tracked = base.trackedSnapshotFiles!;
    const execution = completeExecution(root, { trackedSnapshotFiles: () => { renameSync(root, moved); symlinkSync(productionRoot, root, 'dir'); return tracked(); } });
    try {
      const capability = createTestFixtureWriteCapability(execution);
      expect(() => runTestFixtureMutations({ mode: 'write', ids: C1_A_MUTATIONS.map(({ id }) => id) }, execution, capability)).toThrow('c1-a mutations: target unsafe');
      expect(existsSync(productionLedger)).toBe(false);
    } finally { rmSync(root, { force: true }); rmSync(moved, { recursive: true, force: true }); }
  });

  test('rejects altered, copied, and fabricated proofs before publication without consuming the ledger', () => {
    const variants = [
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof, index) => index === 0 ? { ...proof, ownerTask: 5 as const } : proof),
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof, index) => index === 0 ? { ...proof, target: 'src/platform/admission.ts' } : proof),
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof, index) => index === 0 ? { ...proof, oldText: `${proof.oldText} altered` } : proof),
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof, index) => index === 0 ? { ...proof, newText: `${proof.newText} altered` } : proof),
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof, index) => index === 0 ? { ...proof, redAssertion: `${proof.redAssertion} altered` } : proof),
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof, index) => index === 0 ? { ...proof, command: 'MUT-B' as const } : proof),
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof, index) => index === 0 ? { ...proof, restoredSha256: 'b'.repeat(64) } : proof),
      (proofs: readonly ReturnType<typeof completeProofs>[number][]) => proofs.map((proof) => ({ ...proof })),
      () => completeProofs(),
    ];
    for (const [variant, transformProofsBeforePublication] of variants.entries()) {
      const { root } = completeMutationFixture();
      try {
        const injected = completeExecution(root);
        let message = ''; try { writeFixtureMutations(injected, { transformProofsBeforePublication }); } catch (error) { message = (error as Error).message; }
        expect({ variant, message }).toEqual({ variant, message: 'c1-a mutations: proof provenance' });
        expect(existsSync(injected.ledgerPath)).toBe(false);
        const authentic = completeExecution(root); writeFixtureMutations(authentic);
        expect(existsSync(authentic.ledgerPath)).toBe(true);
      } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });

  test('verify mode compares a pre-existing ledger without writing it', () => {
    const { root } = fixtureRoot();
    try {
      const runner = execution(root); const expected = renderMutationLedger(C1_A_MUTATIONS.map((row) => ({ ...row, restoredSha256: row.id === 'C1A-M01' ? sha256(readFileSync(path.join(root, 'src/platform/identity.ts'), 'utf8')) : 'a'.repeat(64) })));
      mkdirSync(path.dirname(runner.ledgerPath), { recursive: true });
      writeFileSync(runner.ledgerPath, expected);
      runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner);
      writeFileSync(runner.ledgerPath, 'bad ledger');
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: ledger mismatch');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('focused verification checks its selected row within a complete authoritative ledger', () => {
    const { root } = fixtureRoot();
    try {
      const runner = execution(root);
      const fullLedger = renderMutationLedger(C1_A_MUTATIONS.map((row) => ({ ...row, restoredSha256: row.id === 'C1A-M01' ? sha256(readFileSync(path.join(root, 'src/platform/identity.ts'), 'utf8')) : 'a'.repeat(64) })));
      mkdirSync(path.dirname(runner.ledgerPath), { recursive: true }); writeFileSync(runner.ledgerPath, fullLedger);
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).not.toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects a symlinked parent component before it can reach an outside target', () => {
    const { root } = fixtureRoot(); const outside = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-outside-'));
    try {
      mkdirSync(path.join(outside, 'platform'), { recursive: true }); writeFileSync(path.join(outside, 'platform/identity.ts'), "request.headers.get('cf-connecting-ip')\n");
      rmSync(path.join(root, 'src'), { recursive: true }); mkdirSync(path.join(root, 'src')); symlinkSync(outside, path.join(root, 'src/platform'));
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root))).toThrow('c1-a mutations: target unsafe');
      expect(readFileSync(path.join(outside, 'platform/identity.ts'), 'utf8')).toContain("request.headers.get('cf-connecting-ip')");
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });

  test('anchors every target parent descriptor across a check-to-open component swap', () => {
    const { root } = fixtureRoot(); const outside = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-swap-outside-'));
    try {
      writeFileSync(path.join(outside, 'identity.ts'), "export const ip = request.headers.get('cf-connecting-ip');\n");
      const runner = execution(root, { afterTargetParentOpened: () => {
        renameSync(path.join(root, 'src/platform'), path.join(root, 'src/platform-authenticated'));
        symlinkSync(outside, path.join(root, 'src/platform'));
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: concurrent edit');
      expect(readFileSync(path.join(outside, 'identity.ts'), 'utf8')).toBe("export const ip = request.headers.get('cf-connecting-ip');\n");
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });

  test('rejects a target edit made during restored GREEN', () => {
    const { root, target } = fixtureRoot();
    try {
      let behavior = 0;
      const runner = execution(root, { run: (argv) => {
        if (argv.join(' ').includes('typescript')) return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
        behavior += 1;
        if (behavior === 2) writeFileSync(target, 'edited during green');
        return { exitCode: behavior === 1 ? 1 : 0, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: concurrent edit');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('retains target identity through restored GREEN and rejects a same-byte inode replacement', () => {
    const { root, target } = fixtureRoot();
    try {
      const original = readFileSync(target, 'utf8'); let behavior = 0;
      const runner = execution(root, { run: (argv) => {
        if (argv.join(' ').includes('typescript')) return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
        behavior += 1;
        if (behavior === 2) {
          renameSync(target, `${target}.replaced`);
          writeFileSync(target, original);
        }
        return { exitCode: behavior === 1 ? 1 : 0, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: concurrent edit');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects a canonical full ledger with a trailer or substituted unselected row', () => {
    const { root } = fixtureRoot();
    try {
      const runner = execution(root); const hash = sha256(readFileSync(path.join(root, 'src/platform/identity.ts'), 'utf8'));
      const ledger = renderMutationLedger(C1_A_MUTATIONS.map((row) => ({ ...row, restoredSha256: row.id === 'C1A-M01' ? hash : 'a'.repeat(64) })));
      writeFileSync(runner.ledgerPath, `${ledger}raw fixture trailer`);
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: ledger mismatch');
      writeFileSync(runner.ledgerPath, ledger.replace('C1A-M02', 'C1A-M99'));
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: ledger mismatch');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('refuses a ledger symlink without replacing its external bytes', () => {
    const { root } = completeMutationFixture(); const runner = completeExecution(root); const outside = path.join(root, 'outside-ledger');
    try {
      writeFileSync(outside, 'outside'); symlinkSync(outside, runner.ledgerPath);
      expect(() => writeFixtureMutations(runner)).toThrow('c1-a mutations: ledger unsafe');
      expect(readFileSync(outside, 'utf8')).toBe('outside');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('anchors the ledger directory through publication and cleans its temp after a component swap', () => {
    const { root } = completeMutationFixture(); const outside = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-ledger-outside-'));
    try {
      const runner = completeExecution(root); const beforeLedgerPublish = () => {
        renameSync(path.join(root, 'docs/testing'), path.join(root, 'docs/testing-authenticated'));
        symlinkSync(outside, path.join(root, 'docs/testing'));
      };
      expect(() => writeFixtureMutations(runner, { beforeLedgerPublish })).toThrow('c1-a mutations: ledger unsafe');
      expect(readdirSync(outside)).toEqual([]);
      expect(readdirSync(path.join(root, 'docs/testing-authenticated')).filter((name) => name.includes('c1-a-mutation-ledger'))).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });

  test('uses atomic no-overwrite ledger publication when a competitor wins the final name', () => {
    const { root } = completeMutationFixture(); const runner = completeExecution(root);
    try {
      const competitor = 'competitor bytes';
      const beforeLedgerPublish = () => writeFileSync(runner.ledgerPath, competitor);
      expect(() => writeFixtureMutations(runner, { beforeLedgerPublish })).toThrow('c1-a mutations: ledger already exists');
      expect(readFileSync(runner.ledgerPath, 'utf8')).toBe(competitor);
      expect(readdirSync(path.dirname(runner.ledgerPath)).filter((name) => name.startsWith('.c1-a-mutation-ledger.tmp-'))).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('an interruption at the final publication seam cannot consume the ledger', () => {
    const { root } = completeMutationFixture(); let interrupt: (() => void) | undefined;
    try {
      const runner = completeExecution(root, { subscribeAbort: (handler) => { interrupt = handler; return () => undefined; } });
      expect(() => writeFixtureMutations(runner, { beforeLedgerPublish: () => interrupt?.() })).toThrow('c1-a mutations: interrupted');
      expect(existsSync(runner.ledgerPath)).toBe(false);
      expect(readdirSync(path.dirname(runner.ledgerPath)).filter((name) => name.startsWith('.c1-a-mutation-ledger.tmp-'))).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('lock-authority loss at the final publication seam cannot consume the ledger', () => {
    const { root } = completeMutationFixture(); const authority = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    try {
      const runner = completeExecution(root, { lockAuthorityPid: authority.pid });
      expect(() => writeFixtureMutations(runner, { beforeLedgerPublish: () => { authority.kill('SIGKILL'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); } })).toThrow('c1-a mutations: lock authority lost');
      expect(existsSync(runner.ledgerPath)).toBe(false);
      expect(readdirSync(path.dirname(runner.ledgerPath)).filter((name) => name.startsWith('.c1-a-mutation-ledger.tmp-'))).toEqual([]);
    } finally { try { authority.kill('SIGKILL'); } catch { /* already exited */ } rmSync(root, { recursive: true, force: true }); }
  });

  test('applies a bounded build budget and the absolute behavior-test budget', () => {
    const { root } = fixtureRoot(); const timeouts: number[] = [];
    try {
      const runner = execution(root, { run: (argv, options) => {
        timeouts.push(options.timeoutMs); const compile = argv.join(' ').includes('typescript/bin/tsc');
        return { exitCode: compile ? 0 : timeouts.filter((_, index) => index > 0).length === 1 ? 1 : 0, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() };
      } });
      runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner);
      expect(timeouts).toEqual([COMPILE_TIMEOUT_MS, CHILD_TIMEOUT_MS, CHILD_TIMEOUT_MS]);
      expect(COMPILE_TIMEOUT_MS).toBe(300_000);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('returns a normal bounded child only after its process group is extinct', () => {
    const result = runBoundedChild([process.execPath, '-e', "process.stdout.write('ok')"], { cwd: import.meta.dir, env: process.env, shell: false, timeoutMs: 1_000 });
    expect(result).toMatchObject({ exitCode: 0, timedOut: false, authorityLost: false, groupExtinct: true });
    expect(new TextDecoder().decode(result.stdout)).toBe('ok');
  });

  test('kills a real timed-out process group before its descendant can write an owned output', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-child-')); const output = path.join(root, 'late-output');
    try {
      const script = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(output)},'late'),200)`)}],{detached:false});setTimeout(()=>{},1000)`;
      const result = runBoundedChild([process.execPath, '-e', script], { cwd: root, env: process.env, shell: false, timeoutMs: 50 });
      expect(result.timedOut).toBe(true); await Bun.sleep(300); expect(existsSync(output)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('kills a detached descendant process group before reporting timeout cleanup complete', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-detached-child-'));
    const output = path.join(root, 'late-output'); const pidPath = path.join(root, 'detached-pid'); let detachedPid = 0;
    try {
      const descendant = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setTimeout(()=>fs.writeFileSync(${JSON.stringify(output)},'late'),400);setInterval(()=>{},1000)`;
      const leader = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'});child.unref();setInterval(()=>{},1000)`;
      const result = runBoundedChild([process.execPath, '-e', leader], { cwd: root, env: process.env, shell: false, timeoutMs: 100 });
      detachedPid = Number(readFileSync(pidPath, 'utf8'));
      expect(result).toMatchObject({ timedOut: true, groupExtinct: true });
      expect(() => process.kill(detachedPid, 0)).toThrow();
      await Bun.sleep(450); expect(existsSync(output)).toBe(false);
    } finally {
      if (detachedPid > 1) { try { process.kill(-detachedPid, 'SIGKILL'); } catch { /* already extinct */ } try { process.kill(detachedPid, 'SIGKILL'); } catch { /* already extinct */ } }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('waits through referenced TERM grace, SIGKILLs a TERM-ignoring descendant, and proves group extinction', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-stubborn-child-'));
    const output = path.join(root, 'late-output'); const descendantPid = path.join(root, 'descendant-pid');
    try {
      const descendant = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(descendantPid)},String(process.pid));setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(output)},'late'),400);setInterval(()=>{},1000)`;
      const leader = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:false});setInterval(()=>{},1000)`;
      const started = Date.now();
      const result = runBoundedChild([process.execPath, '-e', leader], { cwd: root, env: process.env, shell: false, timeoutMs: 200 });
      expect(result.timedOut).toBe(true);
      expect(result.groupExtinct).toBe(true);
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
      const pid = Number(readFileSync(descendantPid, 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow();
      await Bun.sleep(450);
      expect(existsSync(output)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('kills and drains a child group when lock authority dies', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-authority-death-')); const output = path.join(root, 'late-output');
    const authority = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60)'], { stdio: 'ignore' }); const authorityClosed = once(authority, 'close');
    try {
      const child = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(output)},'late'),400);setInterval(()=>{},1000)`;
      const result = runBoundedChild([process.execPath, '-e', child], { cwd: root, env: process.env, shell: false, timeoutMs: 1_000, authorityPid: authority.pid, runnerPid: process.pid });
      await authorityClosed;
      expect(result.authorityLost).toBe(true);
      expect(result.groupExtinct).toBe(true);
      await Bun.sleep(450); expect(existsSync(output)).toBe(false);
    } finally { try { authority.kill('SIGKILL'); } catch { /* already exited */ } rmSync(root, { recursive: true, force: true }); }
  });

  test('a killed runner cannot leave its supervised mutation group running', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-runner-death-')); const output = path.join(root, 'late-output'); const childPid = path.join(root, 'child-pid');
    const modulePath = path.join(import.meta.dir, 'run-c1-a-mutations.ts');
    const mutationChild = `require('node:fs').writeFileSync(${JSON.stringify(childPid)},String(process.pid));setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(output)},'late'),400);setInterval(()=>{},1000)`;
    const helperSource = `import {runBoundedChild} from ${JSON.stringify(modulePath)};runBoundedChild([process.execPath,'-e',${JSON.stringify(mutationChild)}],{cwd:${JSON.stringify(root)},env:process.env,shell:false,timeoutMs:1000,runnerPid:process.pid});`;
    const helper = spawn('bun', ['-e', helperSource], { cwd: root, stdio: 'ignore' }); const helperClosed = once(helper, 'close');
    try {
      for (let attempt = 0; attempt < 50 && !existsSync(childPid); attempt += 1) await Bun.sleep(10);
      expect(existsSync(childPid)).toBe(true); helper.kill('SIGKILL'); await helperClosed; await Bun.sleep(500);
      expect(existsSync(output)).toBe(false);
      expect(() => process.kill(Number(readFileSync(childPid, 'utf8')), 0)).toThrow();
    } finally { try { helper.kill('SIGKILL'); } catch { /* already exited */ } rmSync(root, { recursive: true, force: true }); }
  });

  test('a killed supervisor is detected by the runner, which kills and drains the recorded group', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-supervisor-death-')); const output = path.join(root, 'late-output');
    try {
      const child = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(output)},'late'),300);process.kill(Number(process.env.C1_A_TEST_SUPERVISOR_PID),'SIGKILL');setInterval(()=>{},1000)`;
      const result = runBoundedChild([process.execPath, '-e', child], { cwd: root, env: { ...process.env, NODE_ENV: 'test' }, shell: false, timeoutMs: 1_000 });
      expect(result.groupExtinct).toBe(true);
      await Bun.sleep(350); expect(existsSync(output)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('supervisor death before PGID persistence closes the registration pipe and cannot orphan its detached leader', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-pre-record-death-')); const output = path.join(root, 'late-output'); const resultPath = path.join(root, 'result.json');
    const modulePath = path.join(import.meta.dir, 'run-c1-a-mutations.ts'); const command = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(output)},'late'),200);setInterval(()=>{},1000)`;
    const helperSource = `import {writeFileSync} from 'node:fs';import {runBoundedChild} from ${JSON.stringify(modulePath)};const result=runBoundedChild([process.execPath,'-e',${JSON.stringify(command)}],{cwd:${JSON.stringify(root)},env:{...process.env,NODE_ENV:'test',C1_A_TEST_SUPERVISOR_BEFORE_RECORD_DELAY_MS:'1000'},shell:false,timeoutMs:2000});writeFileSync(${JSON.stringify(resultPath)},JSON.stringify({groupExtinct:result.groupExtinct,timedOut:result.timedOut}));`;
    const helper = spawn('bun', ['-e', helperSource], { cwd: root, stdio: 'ignore' }); const closed = once(helper, 'close'); let supervisorPid = 0; let leaderPid = 0;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const descendants = descendantPids(helper.pid!); supervisorPid = descendants.find((pid) => processParent(pid) === helper.pid) ?? 0;
        leaderPid = supervisorPid ? descendants.find((pid) => processParent(pid) === supervisorPid) ?? 0 : 0;
        if (supervisorPid && leaderPid) break; await Bun.sleep(10);
      }
      expect(supervisorPid).toBeGreaterThan(1); expect(leaderPid).toBeGreaterThan(1); process.kill(supervisorPid, 'SIGKILL');
      await Promise.race([closed, Bun.sleep(3_000).then(() => { throw new Error('pre-record runner did not terminate'); })]); await Bun.sleep(300);
      expect(existsSync(output)).toBe(false); expect(existsSync(resultPath)).toBe(true); expect(() => process.kill(leaderPid, 0)).toThrow();
    } finally { try { helper.kill('SIGKILL'); } catch { /* already exited */ } try { process.kill(leaderPid, 'SIGKILL'); } catch { /* already exited */ } rmSync(root, { recursive: true, force: true }); }
  }, 8_000);

  test('denies direct internal lifecycle mode without its inherited private capability', () => {
    const result = spawnSync('bun', [path.join(import.meta.dir, 'run-c1-a-mutations.ts'), '--internal-lifecycle', '--verify-ledger', 'C1A-M01'], { cwd: path.resolve(import.meta.dir, '..'), encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toBe('c1-a mutations: internal denied\n');
  });

  test('a real public CLI SIGINT during snapshot-allocation startup cleans its authenticated artifacts', async () => {
    const script = path.join(import.meta.dir, 'run-c1-a-mutations.ts'); const root = path.resolve(import.meta.dir, '..');
    const snapshotsBefore = new Set(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-')));
    const readinessBefore = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('event-every-c1-a-lock-ready-')));
    const child = spawn('bun', [script, '--verify-ledger', 'C1A-M01'], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', C1_A_TEST_PUBLIC_STARTUP_DELAY_MS: '1000' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderr = collectProcess(child.stderr);
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const current = readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-') && !snapshotsBefore.has(name));
        if (current.length === 1) break;
        await Bun.sleep(10);
      }
      expect(readdirSync('/private/tmp').some((name) => name.startsWith('event-every-c1-a-snapshot-') && !snapshotsBefore.has(name))).toBe(true);
      child.kill('SIGINT'); const [status] = await once(child, 'close');
      expect(status).toBe(1); expect((await stderr).toString()).toBe('c1-a mutations: interrupted\n');
      expect(() => process.kill(child.pid!, 0)).toThrow();
      expect(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-') && !snapshotsBefore.has(name))).toEqual([]);
      expect(readdirSync(tmpdir()).filter((name) => name.startsWith('event-every-c1-a-lock-ready-') && !readinessBefore.has(name))).toEqual([]);
      expect(runLockfProbe(root)).toBe('completed');
    } finally { try { child.kill('SIGKILL'); } catch { /* already exited */ } }
  });

  test('a pre-registration public signal cannot release or strand the gated command group', async () => {
    const started = path.join(tmpdir(), `event-every-c1-a-pre-registration-started-${process.pid}-${Date.now()}`);
    const lateOutput = path.join(tmpdir(), `event-every-c1-a-pre-registration-late-${process.pid}-${Date.now()}`);
    const supervisorDebug = path.join(tmpdir(), `event-every-c1-a-pre-registration-debug-${process.pid}-${Date.now()}`);
    const command = `printf started > ${JSON.stringify(started)}\n(/bin/sleep 0.4; printf escaped > ${JSON.stringify(lateOutput)}) &\nwhile :; do /bin/sleep 1; done\n`;
    const { root, script, target } = derivedCliFixture(command); const before = readFileSync(target, 'utf8');
    const source = readFileSync(script, 'utf8')
      .replace("const COMPILE_COMMAND = ['/usr/bin/true'] as const;", `const COMPILE_COMMAND = ${JSON.stringify(['/bin/sh', '-c', command])} as const;`)
      .replace("const a=process.argv.slice(1),dependency=Number(a.shift()),command=a.shift(),args=a;", `require('node:fs').writeFileSync(${JSON.stringify(supervisorDebug)},JSON.stringify({stage:'leader',argv:process.argv})+'\\n',{flag:'a'});const a=process.argv.slice(1),dependency=Number(a.shift()),command=a.shift(),args=a;`)
      .replace("child.once('spawn',()=>{", `child.once('spawn',()=>{fs.writeFileSync(${JSON.stringify(supervisorDebug)},JSON.stringify({stage:'supervisor',delay:process.env.C1_A_TEST_SUPERVISOR_BEFORE_START_DELAY_MS,argv:a,child:child.pid})+'\\n',{flag:'a'});`)
      .replace("function defaultRun(argv: readonly string[], options: Parameters<MutationExecution['run']>[1]): SpawnResult { return runBoundedChild(argv, options); }", `function defaultRun(argv: readonly string[], options: Parameters<MutationExecution['run']>[1]): SpawnResult { const result=runBoundedChild(argv, options);writeFileSync(${JSON.stringify(supervisorDebug)},JSON.stringify({stage:'runner',execPath:process.execPath,nodeEnv:process.env.NODE_ENV,supervisorLength:SUPERVISOR.length,argv,cwd:options.cwd,result:{...result,stdout:new TextDecoder().decode(result.stdout),stderr:new TextDecoder().decode(result.stderr)}})+'\\n',{flag:'a'});return result; }`);
    expect(source).toContain(JSON.stringify(['/bin/sh', '-c', command]));
    expect(source).toContain("'MUT-A': ['/bin/sh', 'scripts/derived-behavior.sh']");
    expect(readFileSync(path.join(root, 'scripts/derived-behavior.sh'), 'utf8')).toContain(command);
    expect(source).toContain(supervisorDebug);
    writeFileSync(script, source); git(root, ['add', '.']); git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--amend', '--no-edit']);
    const snapshotsBefore = new Set(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-'))); const observed = new Set<number>();
    const child = spawn('bun', [script, '--verify-ledger', 'C1A-M01'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', C1_A_TEST_SUPERVISOR_BEFORE_START_DELAY_MS: '1000', C1_A_TEST_PUBLIC_BEFORE_RELEASE_DELAY_MS: '1000' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const stderr = collectProcess(child.stderr);
    try {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        for (const pid of descendantPids(child.pid!)) observed.add(pid);
        if ([...observed].filter((pid) => testLibc.symbols.getpgid(pid) === pid).length >= 2) break;
        if (child.exitCode !== null) break;
        await Bun.sleep(10);
      }
      const detachedLeaders = [...observed].filter((pid) => testLibc.symbols.getpgid(pid) === pid);
      if (detachedLeaders.length < 2) throw new Error(`pre-registration topology not reached: status=${child.exitCode} stderr=${(await stderr).toString()} debug=${existsSync(supervisorDebug) ? readFileSync(supervisorDebug, 'utf8') : 'missing'}`);
      expect(detachedLeaders.length).toBeGreaterThanOrEqual(2); await Bun.sleep(150); expect(existsSync(started)).toBe(false);
      child.kill('SIGTERM'); const [status] = await Promise.race([once(child, 'close'), Bun.sleep(3_000).then(() => { throw new Error('pre-registration cleanup did not terminate'); })]);
      expect(status).toBe(1); expect((await stderr).toString()).toBe('c1-a mutations: interrupted\n'); await Bun.sleep(500);
      expect(readFileSync(target, 'utf8')).toBe(before); expect(existsSync(started)).toBe(false); expect(existsSync(lateOutput)).toBe(false);
      for (const pid of observed) expect(() => process.kill(pid, 0)).toThrow();
      expect(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-') && !snapshotsBefore.has(name))).toEqual([]);
      expect(runLockfProbe(root)).toBe('completed');
    } finally {
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      for (const pid of [...observed].reverse()) { try { process.kill(-pid, 'SIGKILL'); } catch { /* not a group */ } try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
      rmSync(started, { force: true }); rmSync(lateOutput, { force: true }); rmSync(supervisorDebug, { force: true }); rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  test('a post-ACK public SIGTERM authoritatively extinguishes the detached command topology and releases every artifact', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-public-topology-'));
    const script = path.join(root, 'scripts/run-c1-a-mutations.ts'); const target = path.join(root, 'src/platform/identity.ts');
    const infoPath = path.join(root, 'active-command.json'); const lateOutput = path.join(root, 'late-output');
    const snapshotsBefore = new Set(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-')));
    let commandPid = 0; let observedTopology: number[] = [];
    mkdirSync(path.dirname(script), { recursive: true }); mkdirSync(path.dirname(target), { recursive: true }); mkdirSync(path.join(root, 'node_modules'));
    const commandSource = `process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(infoPath)},JSON.stringify({pid:process.pid,ppid:process.ppid,cwd:process.cwd(),target:fs.readFileSync('src/platform/identity.ts','utf8')}));setTimeout(()=>fs.writeFileSync(${JSON.stringify(lateOutput)},'stranded'),600);setInterval(()=>{},1000)`;
    const originalSource = readFileSync(path.join(import.meta.dir, 'run-c1-a-mutations.ts'), 'utf8');
    const fixtureSource = originalSource
      .replace(/const COMPILE_COMMAND = \[[^\n]+\] as const;/, "const COMPILE_COMMAND = ['/usr/bin/true'] as const;")
      .replace(/  'MUT-A': \[[^\n]+\],/, `  'MUT-A': ${JSON.stringify([process.execPath, '-e', commandSource])},`);
    writeFileSync(script, fixtureSource); writeFileSync(path.join(root, 'scripts/c1-a-offline-preload.cjs'), '');
    writeFileSync(target, "export const ip = request.headers.get('cf-connecting-ip');\n");
    git(root, ['init', '--quiet']); git(root, ['add', '.']);
    git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
    const before = readFileSync(target, 'utf8');
    const child = spawn('bun', [script, '--verify-ledger', 'C1A-M01'], { cwd: root, env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const stderr = collectProcess(child.stderr);
    try {
      for (let attempt = 0; attempt < 500 && !existsSync(infoPath); attempt += 1) await Bun.sleep(10);
      if (!existsSync(infoPath)) throw new Error(`active command not reached: ${(await stderr).toString()}`);
      const info = JSON.parse(readFileSync(infoPath, 'utf8')) as { pid: number; ppid: number; cwd: string; target: string };
      commandPid = info.pid; observedTopology = ancestryFrom(commandPid, child.pid!);
      expect(observedTopology).toContain(child.pid!);
      expect(observedTopology.length).toBeGreaterThanOrEqual(4);
      expect(info.target).toContain("request.headers.get('x-forwarded-for')");
      expect(info.cwd).not.toBe(root); expect(existsSync(info.cwd)).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe(before);
      process.kill(observedTopology[2], 'SIGSTOP');
      child.kill('SIGTERM');
      const [status] = await Promise.race([once(child, 'close'), Bun.sleep(3_000).then(() => { throw new Error('public wrapper did not terminate'); })]);
      expect(status).toBe(1); expect((await stderr).toString()).toBe('c1-a mutations: interrupted\n');
      await Bun.sleep(700);
      expect(readFileSync(target, 'utf8')).toBe(before);
      expect(existsSync(info.cwd)).toBe(false); expect(existsSync(lateOutput)).toBe(false);
      for (const pid of observedTopology) expect(() => process.kill(pid, 0)).toThrow();
      expect(readdirSync('/private/tmp').filter((name) => name.startsWith('event-every-c1-a-snapshot-') && !snapshotsBefore.has(name))).toEqual([]);
      expect(runLockfProbe(root)).toBe('completed');
    } finally {
      for (const pid of observedTopology) { try { process.kill(pid, 'SIGCONT'); } catch { /* already extinct */ } }
      if (commandPid > 0) { try { process.kill(-commandPid, 'SIGKILL'); } catch { /* already extinct */ } }
      for (const pid of observedTopology) { try { process.kill(pid, 'SIGKILL'); } catch { /* already extinct */ } }
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);

  test('retains dependency bytes through child execution when the dependency pathname is replaced', async () => {
    const outside = path.join(tmpdir(), `event-every-c1-a-dependency-escape-${process.pid}-${Date.now()}`);
    const compileStarted = path.join(tmpdir(), `event-every-c1-a-dependency-compile-${process.pid}-${Date.now()}`);
    const commandLog = path.join(tmpdir(), `event-every-c1-a-dependency-command-${process.pid}-${Date.now()}`);
    const behaviorCommand = `/usr/bin/grep -Fq "value:'original'" node_modules/pinned/index.js || exit 2\nif /usr/bin/grep -Fq "request.headers.get('x-forwarded-for')" src/platform/identity.ts; then printf '(fail) forged forwarding header is ignored' >&2; exit 1; fi\nexit 0\n`;
    const compileCommand = `printf started > ${JSON.stringify(compileStarted)}\n/bin/sleep 0.5\n/usr/bin/grep -Fq "value:'original'" node_modules/pinned/index.js || exit 2\nexit 0\n`;
    const { root, script, target } = derivedCliFixture(behaviorCommand); const dependency = path.join(root, 'node_modules'); const originalDependency = path.join(root, 'node_modules-original');
    mkdirSync(path.join(dependency, 'pinned')); writeFileSync(path.join(dependency, 'pinned/index.js'), "module.exports={value:'original'};\n");
    let source = readFileSync(script, 'utf8');
    source = source.replace("const COMPILE_COMMAND = ['/usr/bin/true'] as const;", `const COMPILE_COMMAND = ${JSON.stringify(['/bin/sh', '-c', compileCommand])} as const;`)
      .replace(/  'MUT-A': \[[^\n]+\],/, `  'MUT-A': ${JSON.stringify(['/bin/sh', '-c', behaviorCommand])},`)
      .replace("function defaultRun(argv: readonly string[], options: Parameters<MutationExecution['run']>[1]): SpawnResult { return runBoundedChild(argv, options); }", `function defaultRun(argv: readonly string[], options: Parameters<MutationExecution['run']>[1]): SpawnResult { writeFileSync(${JSON.stringify(commandLog)}, JSON.stringify({argv,cwd:options.cwd})+'\\n', { flag: 'a' }); return runBoundedChild(argv, options); }`);
    expect(source).toContain(JSON.stringify(['/bin/sh', '-c', compileCommand]));
    expect(source).toContain(JSON.stringify(['/bin/sh', '-c', behaviorCommand]));
    writeFileSync(script, source); git(root, ['add', '.']); git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--amend', '--no-edit']);
    const committedSource = spawnSync('/usr/bin/git', ['show', 'HEAD:scripts/run-c1-a-mutations.ts'], { cwd: root, encoding: 'utf8' }).stdout;
    expect(committedSource).toContain(compileStarted); expect(committedSource).toContain(JSON.stringify(['/bin/sh', '-c', behaviorCommand]));
    const hash = sha256(readFileSync(target, 'utf8')); mkdirSync(path.join(root, 'docs/testing'), { recursive: true });
    writeFileSync(path.join(root, 'docs/testing/c1-a-mutation-ledger.md'), renderMutationLedger(C1_A_MUTATIONS.map((row) => ({ ...row, restoredSha256: row.id === 'C1A-M01' ? hash : 'a'.repeat(64) }))));
    const child = spawn('bun', [script, '--verify-ledger', 'C1A-M01'], { cwd: root, env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] }); const stderr = collectProcess(child.stderr);
    const observed = new Set<number>();
    try {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        for (const pid of descendantPids(child.pid!)) observed.add(pid);
        if (existsSync(compileStarted)) break;
        if (child.exitCode !== null) break;
        await Bun.sleep(10);
      }
      if (!existsSync(compileStarted)) throw new Error(`dependency compile not reached: status=${child.exitCode} stderr=${(await stderr).toString()} argv=${existsSync(commandLog) ? readFileSync(commandLog, 'utf8') : 'missing'}`);
      expect(observed.size).toBeGreaterThanOrEqual(3);
      const snapshotRoot = (JSON.parse(readFileSync(commandLog, 'utf8').split('\n')[0]) as { cwd: string }).cwd;
      expect(() => renameSync(path.join(snapshotRoot, 'node_modules'), path.join(snapshotRoot, 'node_modules-original'))).toThrow();
      expect(() => renameSync(path.join(snapshotRoot, 'node_modules/pinned/index.js'), path.join(snapshotRoot, 'node_modules/pinned/index-old.js'))).toThrow();
      expect(() => writeFileSync(path.join(snapshotRoot, 'node_modules/pinned/index.js'), "module.exports={value:'attacker'};\n")).toThrow();
      renameSync(dependency, originalDependency); mkdirSync(path.join(dependency, 'pinned'), { recursive: true });
      writeFileSync(path.join(dependency, 'pinned/index.js'), `require('node:fs').writeFileSync(${JSON.stringify(outside)},'escaped');module.exports={value:'attacker'};\n`);
      const [status] = await Promise.race([once(child, 'close'), Bun.sleep(6_000).then(() => { throw new Error('dependency replacement run did not terminate'); })]);
      expect({ status, stderr: (await stderr).toString(), escaped: existsSync(outside) }).toEqual({ status: 0, stderr: '', escaped: false });
      expect(readFileSync(target, 'utf8')).toBe("export const ip = request.headers.get('cf-connecting-ip');\n");
    } finally {
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      for (const pid of [...observed].reverse()) { try { process.kill(-pid, 'SIGKILL'); } catch { /* not a group */ } try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
      rmSync(outside, { force: true }); rmSync(compileStarted, { force: true }); rmSync(commandLog, { force: true }); rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  test('rejects a dependency entry swapped to a symlink during descriptor-relative acquisition', () => {
    const { root, target } = fixtureRoot(); const dependency = path.join(root, 'dependency'); const entry = path.join(dependency, 'pinned/index.js');
    const outside = path.join(root, 'outside-dependency.js'); let swapped = false;
    mkdirSync(path.dirname(entry), { recursive: true }); writeFileSync(entry, 'module.exports="trusted";\n'); writeFileSync(outside, 'module.exports="substituted";\n');
    try {
      const options = {
        dependencyRoot: realpathSync(dependency),
        beforeDependencyEntryCopy: (relative: string) => {
          if (relative !== 'pinned/index.js' || swapped) return; swapped = true; renameSync(entry, `${entry}.trusted`); symlinkSync(outside, entry);
        },
      } as Partial<MutationExecution>;
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, options))).toThrow('c1-a mutations: snapshot unsafe');
      expect(swapped).toBe(true); expect(readFileSync(target, 'utf8')).toContain("request.headers.get('cf-connecting-ip')");
      expect(readFileSync(outside, 'utf8')).toBe('module.exports="substituted";\n');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('accepts stable hard-linked dependency files while sealing their exact bytes', () => {
    const { root } = fixtureRoot(); const dependency = path.join(root, 'dependency');
    const source = path.join(dependency, 'pinned/index.js'); const alias = path.join(dependency, 'pinned/PROVENANCE.json');
    mkdirSync(path.dirname(source), { recursive: true }); writeFileSync(source, 'module.exports="trusted";\n'); linkSync(source, alias);
    try {
      const proofs = runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { dependencyRoot: realpathSync(dependency) }));
      expect(proofs).toHaveLength(1); expect(readFileSync(alias, 'utf8')).toBe('module.exports="trusted";\n');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('retains internal dependency symlinks without following their pathname during acquisition', () => {
    const { root } = fixtureRoot(); const dependency = path.join(root, 'dependency');
    const source = path.join(dependency, 'pinned/index.js'); const linked = path.join(dependency, '.bin/pinned');
    mkdirSync(path.dirname(source), { recursive: true }); mkdirSync(path.dirname(linked), { recursive: true });
    writeFileSync(source, 'module.exports="trusted";\n'); symlinkSync('../pinned/index.js', linked);
    try {
      const proofs = runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { dependencyRoot: realpathSync(dependency) }));
      expect(proofs).toHaveLength(1); expect(readFileSync(linked, 'utf8')).toBe('module.exports="trusted";\n');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects dependency symlinks whose normalized target escapes the retained root', () => {
    const { root } = fixtureRoot(); const dependency = path.join(root, 'dependency'); const linked = path.join(dependency, '.bin/escape');
    mkdirSync(path.dirname(linked), { recursive: true }); writeFileSync(path.join(root, 'outside.js'), 'outside\n'); symlinkSync('../../outside.js', linked);
    try {
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { dependencyRoot: realpathSync(dependency) }))).toThrow('c1-a mutations: snapshot unsafe');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects an owner-unsealed nested dependency swap even when bytes and flags are restored', () => {
    const { root, target } = fixtureRoot(); const dependency = path.join(root, 'dependency');
    mkdirSync(path.join(dependency, 'pinned'), { recursive: true }); writeFileSync(path.join(dependency, 'pinned/index.js'), 'original\n');
    const before = readFileSync(target, 'utf8'); let snapshotRoot = ''; let swaps = 0;
    try {
      const runner = execution(root, { dependencyRoot: realpathSync(dependency), run: (_argv, options) => {
        snapshotRoot = options.cwd; const modules = path.join(snapshotRoot, 'node_modules'); const pinned = path.join(modules, 'pinned');
        const file = path.join(pinned, 'index.js'); const backup = `${file}.trusted`;
        expect(spawnSync('/usr/bin/chflags', ['nouchg', modules, pinned, file]).status).toBe(0);
        chmodSync(modules, 0o700); chmodSync(pinned, 0o700); chmodSync(file, 0o600);
        renameSync(file, backup); writeFileSync(file, 'attacker\n'); rmSync(file); renameSync(backup, file);
        chmodSync(file, 0o400); chmodSync(pinned, 0o500); chmodSync(modules, 0o500);
        expect(spawnSync('/usr/bin/chflags', ['uchg', file, pinned, modules]).status).toBe(0); swaps += 1;
        return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
      } });
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: dependency snapshot unavailable');
      expect(swaps).toBe(1); expect(existsSync(snapshotRoot)).toBe(false); expect(readFileSync(target, 'utf8')).toBe(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects symlinked production targets before any external write', () => {
    const { root, target } = fixtureRoot(); const outside = path.join(root, 'outside.ts');
    try {
      writeFileSync(outside, "request.headers.get('cf-connecting-ip')\n"); rmSync(target); symlinkSync(outside, target);
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root))).toThrow('c1-a mutations: target unsafe');
      expect(readFileSync(outside, 'utf8')).toContain("request.headers.get('cf-connecting-ip')");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('maps native target failures and bounded child timeout to fixed errors after restoration', () => {
    const { root, target } = fixtureRoot();
    try {
      rmSync(target); mkdirSync(target);
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root))).toThrow('c1-a mutations: target unavailable');
      rmSync(target, { recursive: true }); writeFileSync(target, "export const ip = request.headers.get('cf-connecting-ip');\n");
      const before = readFileSync(target, 'utf8'); let timeoutSnapshot = ''; let authoritySnapshot = '';
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { run: (_argv, options) => { timeoutSnapshot = options.cwd; return ({ exitCode: null, stdout: new Uint8Array(), stderr: new Uint8Array(), timedOut: true }) as never; } }))).toThrow('c1-a mutations: child timeout');
      expect(existsSync(timeoutSnapshot)).toBe(false);
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, execution(root, { run: (_argv, options) => { authoritySnapshot = options.cwd; return ({ exitCode: null, stdout: new Uint8Array(), stderr: new Uint8Array(), authorityLost: true, groupExtinct: true }) as never; } }))).toThrow('c1-a mutations: lock authority lost');
      expect(existsSync(authoritySnapshot)).toBe(false);
      expect(readFileSync(target, 'utf8')).toBe(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('restores before reporting an injected termination signal', () => {
    const { root, target } = fixtureRoot();
    try {
      const before = readFileSync(target, 'utf8'); let signalHandler: (() => void) | undefined; let signalSnapshot = '';
      const runner = execution(root, {
        subscribeAbort: (handler: () => void) => { signalHandler = handler; return () => undefined; },
        run: (_argv, options) => { signalSnapshot = options.cwd; signalHandler?.(); return { exitCode: 1, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() }; },
      } as Partial<MutationExecution>);
      expect(() => runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner)).toThrow('c1-a mutations: interrupted');
      expect(existsSync(signalSnapshot)).toBe(false);
      expect(readFileSync(target, 'utf8')).toBe(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });


  test('uses fixed, secret-free failures', () => {
    expect(new MutationRunnerError('dirty target').message).toBe('c1-a mutations: dirty target');
  });

  test('scrubs credential-shaped values and installs the offline preload for every child', () => {
    const { root } = fixtureRoot();
    try {
      let observed: NodeJS.ProcessEnv | undefined; let observedCwd = ''; let observedArgv0 = '';
      let behavioralRuns = 0;
      const runner = execution(root, { run: (argv, options) => {
        observed = options.env; observedCwd = options.cwd; observedArgv0 = argv[0];
        const compile = argv.join(' ').includes('typescript/bin/tsc');
        if (compile) { behavioralRuns = 0; return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }; }
        behavioralRuns += 1;
        return { exitCode: behavioralRuns === 1 ? 1 : 0, stdout: encoder.encode('forged forwarding header is ignored'), stderr: new Uint8Array() };
      } });
      const original = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = 'must-not-reach-child';
      try { runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner); } finally { if (original === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = original; }
      expect(observed?.OPENROUTER_API_KEY).toBe('');
      expect(observed?.NODE_OPTIONS).toBe(`--require=${path.join(observedCwd, 'scripts/c1-a-offline-preload.cjs')}`);
      expect(observedCwd).not.toBe(root);
      expect(existsSync(observedCwd)).toBe(false);
      expect(observed?.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV).toBe('false');
      expect(observedArgv0).toBe(process.execPath); expect(observed?.PATH).toBe(`${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('closes target and hierarchy descriptors after repeated mutation and ledger verification', () => {
    const { root } = fixtureRoot();
    try {
      const runner = execution(root); const before = new Set(readdirSync('/dev/fd'));
      for (let attempt = 0; attempt < 20; attempt += 1) runMutations({ mode: 'verify', ids: ['C1A-M01'] }, runner);
      expect(new Set(readdirSync('/dev/fd'))).toEqual(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
