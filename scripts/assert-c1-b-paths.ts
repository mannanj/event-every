import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const MANIFEST = path.join(ROOT, 'scripts/c1-b-owned-paths.txt');
const PROTECTED = ['docs/testing/e1-mutation-ledger.md', '.claude', 'scripts/run-c1-a-mutations.ts', 'scripts/run-c1-a-mutations.test.ts', 'tasks/task-192.md', 'tasks/task-193.md'] as const;
const GENERATED = /^(?:\.open-next|\.wrangler|\.next|coverage|dist|out|build|playwright-report|test-results)(?:\/|$)/;
const CREDENTIAL = /(?:openrouter|anthropic|api[_-]?key|token|secret|resend|kv[_-]?rest|auth[_-]?pattern|password|credential)/i;
const MANIFEST_SHA256 = '94b3e73979fc423baa1be63f1b90114ddcf40493a2fde974f86c0d7c88ab235d';
type Observation = Readonly<{ status: string; paths: readonly string[] }>;
const fail = (kind: 'protected path' | 'invalid manifest' | 'observed path mismatch'): never => { throw new Error(`c1-b paths: ${kind}`); };
const protectedPath = (file: string) => file === '.claude' || file.startsWith('.claude/') || PROTECTED.slice(0, 1).includes(file as never) || PROTECTED.slice(2).includes(file as never);
const invalid = (file: string) => !file || file.includes('\n') || file.includes('\r') || path.isAbsolute(file) || file.includes('\\') || file.split('/').includes('..') || /[*?\[\]{}]/.test(file) || GENERATED.test(file) || (file !== '.env.example' && (file === '.env' || file.startsWith('.env.') || file.startsWith('.dev.vars'))) || CREDENTIAL.test(path.basename(file));

export function validateOwnedPaths(bytes: string): readonly string[] {
  if (!bytes.endsWith('\n') || createHash('sha256').update(bytes).digest('hex') !== MANIFEST_SHA256) fail('invalid manifest');
  const paths = bytes.slice(0, -1).split('\n');
  if (!paths.length || new Set(paths).size !== paths.length || paths.some((value) => invalid(value)) || paths.some((value, index) => index > 0 && paths[index - 1]! >= value)) fail('invalid manifest');
  return paths;
}
export function readOwnedPaths(): readonly string[] { if (!existsSync(MANIFEST)) fail('invalid manifest'); return validateOwnedPaths(readFileSync(MANIFEST, 'utf8')); }
export function parseNameStatusNul(raw: Uint8Array): Observation[] { const fields = new TextDecoder().decode(raw).split('\0'); if (fields.pop() !== '') fail('observed path mismatch'); const output: Observation[] = []; for (let index = 0; index < fields.length;) { const status = fields[index++]; if (!status) fail('observed path mismatch'); const count = /^[RC]/.test(status) ? 2 : 1; const paths = fields.slice(index, index + count); index += count; if (paths.length !== count || paths.some((item) => !item)) fail('observed path mismatch'); output.push({ status, paths }); } return output; }
export function assertAuthorizedPaths(committed: readonly string[], staged: readonly string[], unstaged: readonly string[] = [], untracked: readonly string[] = []): void { const owned = new Set(readOwnedPaths()); for (const file of [...committed, ...staged]) if (protectedPath(file)) fail('protected path'); const ordinary = [...unstaged, ...untracked].filter((file) => !protectedPath(file)); for (const file of [...committed, ...staged, ...ordinary]) if (invalid(file) || !owned.has(file)) fail('observed path mismatch'); if (new Set(committed).size !== committed.length || new Set(staged).size !== staged.length || new Set(ordinary).size !== ordinary.length || staged.some((file) => !owned.has(file)) || committed.some((file) => !owned.has(file))) fail('observed path mismatch'); }
function git(root: string, args: string[]): Uint8Array { const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' }); if (result.exitCode !== 0) fail('observed path mismatch'); return new Uint8Array(result.stdout); }
const names = (args: string[]) => parseNameStatusNul(git(ROOT, args)).flatMap((entry) => entry.paths);
const untracked = () => { const raw = new TextDecoder().decode(git(ROOT, ['ls-files', '--others', '--exclude-standard', '-z'])); return raw.split('\0').slice(0, -1); };
if (import.meta.main) { const [mode, ...extra] = process.argv.slice(2); if (extra.length || mode !== 'terminal') fail('invalid manifest'); const committed = names(['diff', '--name-status', '-z', '7e51cef...HEAD']); const staged = names(['diff', '--cached', '--name-status', '-z']); const dirty = names(['diff', '--name-status', '-z']); const extras = untracked(); for (const file of [...committed, ...staged]) if (protectedPath(file)) fail('protected path'); const ordinary = [...dirty, ...extras].filter((file) => !protectedPath(file)); if (staged.length || ordinary.length || new Set(committed).size !== committed.length || committed.some((file) => !readOwnedPaths().includes(file))) fail('observed path mismatch'); console.log('c1-b paths: accepted'); }
