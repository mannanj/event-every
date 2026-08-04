import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const PROTECTED = ['.claude', 'tasks/task-192.md', 'tasks/task-193.md'];
const GENERATED = /^(?:\.open-next|\.wrangler|\.next|coverage|dist|out|build)(?:\/|$)|^(?:playwright-report|test-results)(?:\/|$)/;
const CREDENTIAL_FILE = /(?:openrouter|anthropic|api[_-]?key|token|secret|resend|kv[_-]?rest|auth[_-]?pattern)/i;
type Observation = Readonly<{ status: string; paths: readonly string[] }>;
const ACCEPTED_MANIFEST_SHA256 = [
  '5cf33b23410c08b7d984f5285f91cb59a0f61cfa09d4d40a6b62700a8f046016', '3ac2d5901a7a8d188096273d4ee94fd168983b78a334e14131a5f88e53b85487', '736daaab9c90b7c10769172365d286e454530caeb922e10d19a5f49e9c6469ab', '3384b8e31888ecd25f0a78731cd458f36dd665c7cc13c7ddd8c20d067f1fabf4', 'ef2cd01854a851394526fed3dbbe97cc01fac2855fc9524ca027f7b8ae7c4ba7', 'b6de6c9af913e07926c448e7bf814992174c18f90817c559948d70259e459b12', '74b7d0732c0fdc7807bc8195df62b981d45719cbd133d471ee362858ce74b1a9', '128103dcd0d5b466a41485d819258417c3049b4a97432743cddd622befaaf2c4', '2a8559a3f9ac83eb3936563fda6ea693c8d1e1170a24cc86f11d35f23fb10309', '0357ddcf103be7c0305e5200d5785ba996b73f5c61b44724ea865d6e6024da00', 'fb91cca5bacacf32fc0c2085ccca666f3bdbdbab2e604e6535846b7791aa08ff',
] as const;

function fail(kind: 'protected path' | 'invalid manifest' | 'observed path mismatch'): never { throw new Error(`c1-a paths: ${kind}`); }
function protectedPath(file: string): boolean { return PROTECTED.some((prefix) => file === prefix || file.startsWith(`${prefix}/`)); }
function invalidPath(file: string, task: number): boolean {
  if (!file || file.includes('\n') || file.includes('\r') || path.isAbsolute(file) || file.includes('\\') || file.split('/').includes('..') || /[*?\[\]{}]/.test(file)) return true;
  if (protectedPath(file) || GENERATED.test(file) || file === '.env' || file.startsWith('.env.') || file.startsWith('.dev.vars')) return file !== '.env.example' || task !== 8;
  return CREDENTIAL_FILE.test(path.basename(file));
}

export function readTaskManifest(task: number): readonly string[] {
  if (!Number.isInteger(task) || task < 1 || task > 11) fail('invalid manifest');
  const manifest = path.join(ROOT, 'scripts/c1-a-task-paths', `task-${String(task).padStart(2, '0')}.txt`);
  if (!existsSync(manifest)) fail('invalid manifest');
  return validateTaskManifestBytes(task, readFileSync(manifest, 'utf8'));
}

export function validateTaskManifestBytes(task: number, bytes: string): readonly string[] {
  if (!Number.isInteger(task) || task < 1 || task > 11) fail('invalid manifest');
  if (createHash('sha256').update(bytes).digest('hex') !== ACCEPTED_MANIFEST_SHA256[task - 1]) fail('invalid manifest');
  if (!bytes.endsWith('\n')) fail('invalid manifest');
  const paths = bytes.slice(0, -1).split('\n');
  if (paths.length === 0 || new Set(paths).size !== paths.length || paths.some((entry) => invalidPath(entry, task))) fail('invalid manifest');
  return paths;
}

function manifestUnion(last: number): Set<string> { return new Set(Array.from({ length: last }, (_, i) => readTaskManifest(i + 1)).flat()); }
function assertSafeObserved(paths: readonly string[], task: number, allowed: ReadonlySet<string>): void {
  for (const file of paths) {
    if (file === '.env.example') { if (!allowed.has(file)) fail('observed path mismatch'); continue; }
    if (invalidPath(file, task) || !allowed.has(file)) fail('observed path mismatch');
  }
}

export function assertAuthorizedPaths(baseline: string, head: string, task: number, committed: readonly string[], staged: readonly string[], unstaged: readonly string[] = [], untracked: readonly string[] = []): void {
  if (!baseline || !head) fail('observed path mismatch');
  const active = new Set(readTaskManifest(task));
  const prior = manifestUnion(task - 1);
  for (const file of [...committed, ...staged]) if (protectedPath(file)) fail('protected path');
  const ordinaryUnstaged = unstaged.filter((file) => !protectedPath(file));
  const ordinaryUntracked = untracked.filter((file) => !protectedPath(file));
  assertSafeObserved(committed, task, prior);
  assertSafeObserved(ordinaryUnstaged, task, active);
  assertSafeObserved(ordinaryUntracked, task, active);
  assertSafeObserved(staged, task, active);
  if (ordinaryUnstaged.length || ordinaryUntracked.length) fail('observed path mismatch');
  if (new Set(staged).size !== staged.length || staged.length !== active.size || staged.some((entry) => !active.has(entry))) fail('observed path mismatch');
}

export function parseNameStatusNul(raw: Uint8Array): Observation[] {
  const fields = new TextDecoder().decode(raw).split('\0').slice(0, -1);
  const output: Observation[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) fail('observed path mismatch');
    const count = status.startsWith('R') || status.startsWith('C') ? 2 : 1;
    const paths = fields.slice(index, index + count); index += count;
    if (paths.length !== count || paths.some((entry) => !entry)) fail('observed path mismatch');
    output.push({ status, paths });
  }
  return output;
}

function gitBytes(root: string, args: string[]): Uint8Array {
  const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) fail('observed path mismatch');
  return new Uint8Array(result.stdout);
}
function names(root: string, args: string[]): string[] { return parseNameStatusNul(gitBytes(root, args)).flatMap((record) => record.paths); }
function untracked(root: string): string[] { return new TextDecoder().decode(gitBytes(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').slice(0, -1); }

export type GitPathObservation = Readonly<{
  committed: readonly string[];
  staged: readonly string[];
  unstaged: readonly string[];
  untracked: readonly string[];
}>;

export function observeGitPaths(root: string, baseline: string, head: string): GitPathObservation {
  return {
    committed: names(root, ['diff', '--name-status', '-z', `${baseline}...${head}`]),
    staged: names(root, ['diff', '--cached', '--name-status', '-z']),
    unstaged: names(root, ['diff', '--name-status', '-z']),
    untracked: untracked(root),
  };
}

function terminal(baseline: string, head: string): void {
  const expected = manifestUnion(11);
  const { committed, staged, unstaged: dirty, untracked: extras } = observeGitPaths(ROOT, baseline, head);
  for (const file of [...committed, ...staged]) if (protectedPath(file)) fail('protected path');
  const ordinaryDirty = dirty.filter((file) => !protectedPath(file)); const ordinaryExtras = extras.filter((file) => !protectedPath(file));
  if (staged.length || ordinaryDirty.length || ordinaryExtras.length || committed.length !== expected.size || committed.some((file) => !expected.has(file))) fail('observed path mismatch');
}

if (import.meta.main) {
  const [baseline, head, mode, ...extra] = process.argv.slice(2);
  if (!baseline || !head || extra.length) fail('invalid manifest');
  if (mode === '--terminal') terminal(baseline, head);
  else {
    const found = mode?.match(/^--task=(0[1-9]|1[01])$/); if (!found) fail('invalid manifest');
    const task = Number(found[1]);
    const observed = observeGitPaths(ROOT, baseline, head);
    assertAuthorizedPaths(baseline, head, task, observed.committed, observed.staged, observed.unstaged, observed.untracked);
  }
  console.log('c1-a paths: accepted');
}
