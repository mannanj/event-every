import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CREDENTIAL_NAME = /OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV_REST/i;
const preloadPath = path.resolve(import.meta.dir, 'e1-offline-preload.cjs');
const repositoryRoot = path.resolve(import.meta.dir, '..');
type Environment = Record<string, string | undefined>;
const imageTest = 'src/server/scanner/__tests__/image.test.ts';
const bunTestFile = /\.(?:test|spec)\.(?:ts|tsx)$/;
const gitBunTestSuffixes = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];

function lexicalSort(paths: readonly string[]): string[] {
  return [...paths].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

export function normalizeSrcBunTestFiles(paths: readonly string[]): string[] {
  return lexicalSort(paths
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file.startsWith('src/') && bunTestFile.test(file)));
}

function normalizeGitSrcBunTestFiles(paths: readonly string[]): string[] {
  return lexicalSort(paths
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file.startsWith('src/') && gitBunTestSuffixes.some((suffix) => file.endsWith(suffix))));
}

export function discoverSrcBunTestFiles(repoRoot = repositoryRoot): string[] {
  const srcRoot = path.join(repoRoot, 'src');
  const discovered: string[] = [];
  if (lstatSync(srcRoot).isSymbolicLink()) {
    throw new Error(`E1 src discovery rejects symbolic link: ${srcRoot}`);
  }
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`E1 src discovery rejects symbolic link: ${absolute}`);
      }
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && bunTestFile.test(entry.name)) {
        discovered.push(path.relative(repoRoot, absolute).split(path.sep).join('/'));
      }
    }
  };
  visit(srcRoot);
  return lexicalSort(discovered);
}

export function discoverGitSrcBunTestFiles(repoRoot = repositoryRoot): string[] {
  const result = Bun.spawnSync(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'src'],
    { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
  );
  if (result.exitCode !== 0) {
    throw new Error(`E1 Git src inventory failed with exit code ${result.exitCode ?? 'unknown'}`);
  }
  return normalizeGitSrcBunTestFiles(Buffer.from(result.stdout).toString('utf8').split('\0').filter(Boolean));
}

export function assertMatchingSrcBunInventories(
  filesystemInventory: readonly string[],
  gitInventory: readonly string[],
): void {
  const filesystem = normalizeSrcBunTestFiles(filesystemInventory);
  const git = normalizeGitSrcBunTestFiles(gitInventory);
  if (filesystem.length !== git.length || filesystem.some((file, index) => file !== git[index])) {
    throw new Error('E1 Git and filesystem src test inventories do not match');
  }
}

export function partitionE1BunTests(
  inventory: readonly string[],
  completeInventory: readonly string[],
): {
  image: readonly [string];
  remaining: readonly string[];
} {
  const normalized = lexicalSort(inventory);
  if (normalized.length !== inventory.length || new Set(inventory).size !== inventory.length) {
    throw new Error('E1 test inventory contains duplicate paths');
  }
  if (!inventory.includes(imageTest)) {
    throw new Error(`E1 test inventory is missing required image suite: ${imageTest}`);
  }
  const expected = lexicalSort(completeInventory);
  if (expected.length !== completeInventory.length || new Set(completeInventory).size !== completeInventory.length) {
    throw new Error('E1 discovered test inventory contains duplicate paths');
  }
  if (normalized.length !== expected.length || normalized.some((file, index) => file !== expected[index])) {
    throw new Error('E1 test inventory does not exactly match recursive src discovery');
  }
  const partition = {
    image: [imageTest] as const,
    remaining: normalized.filter((file) => file !== imageTest),
  };
  const union = lexicalSort([...partition.image, ...partition.remaining]);
  if (union.length !== inventory.length || union.some((file, index) => file !== normalized[index])) {
    throw new Error('E1 test partition does not cover the complete inventory');
  }
  if (partition.remaining.length === 0) {
    throw new Error('E1 test partition must contain at least one remaining suite');
  }
  return partition;
}

export function createE1BunUnitCommandPlan(partition: {
  image: readonly [string];
  remaining: readonly string[];
}, completeInventory: readonly string[]): string[][] {
  if (partition.image.length !== 1 || partition.image[0] !== imageTest) {
    throw new Error(`E1 singleton command plan requires image path ${imageTest}`);
  }
  if (partition.remaining.length === 0) {
    throw new Error('E1 singleton command plan requires an image and remaining suites');
  }
  if (partition.remaining.includes(imageTest)) {
    throw new Error('E1 singleton command plan cannot repeat image path in remaining suites');
  }
  if (new Set(partition.remaining).size !== partition.remaining.length) {
    throw new Error('E1 singleton command plan contains duplicate remaining paths');
  }
  const lexicalRemaining = lexicalSort(partition.remaining);
  if (partition.remaining.some((file, index) => file !== lexicalRemaining[index])) {
    throw new Error('E1 singleton command plan requires lexical remaining suites');
  }
  const expected = lexicalSort(completeInventory);
  if (new Set(completeInventory).size !== completeInventory.length) {
    throw new Error('E1 singleton command plan complete inventory contains duplicates');
  }
  const files = [partition.image[0], ...partition.remaining];
  const union = lexicalSort(files);
  if (union.length !== expected.length || union.some((file, index) => file !== expected[index])) {
    throw new Error('E1 singleton command plan does not cover the exact inventory');
  }
  return files.map((file) => [
    'bun',
    `--preload=${preloadPath}`,
    'test',
    file,
    '--isolate',
  ]);
}

function envNamesFromDotenv(dotenvPath: string): string[] {
  if (!existsSync(dotenvPath)) return [];
  return readFileSync(dotenvPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
    .filter((name): name is string => Boolean(name));
}

export function createE1OfflineEnvironment(environment: Environment = process.env): Environment {
  const credentialNames = new Set([
    ...Object.keys(environment),
    ...envNamesFromDotenv(path.resolve(repositoryRoot, '.env.local')),
  ].filter((name) => CREDENTIAL_NAME.test(name)));
  const clean = { ...environment };
  for (const name of credentialNames) clean[name] = '';
  return {
    ...clean,
    E2E_TARGET: '',
    E2E_PROD_URL: '',
    E1_OFFLINE: '1',
    E1_OFFLINE_PRELOAD: preloadPath,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    NODE_OPTIONS: `--require=${preloadPath}`,
  };
}

function run(command: string[], environment: Environment): void {
  const result = Bun.spawnSync(command, { env: environment, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
}

const probe = `
if (!globalThis.__E1_OFFLINE_GUARD__) process.exit(2);
let blockedAttempt;
try { blockedAttempt = fetch('http://192.0.2.1'); }
catch (error) { process.exit(error && error.code === 'E1_OFFLINE_EGRESS_BLOCKED' ? 0 : 4); }
Promise.resolve(blockedAttempt).then(
  () => process.exit(3),
  (error) => process.exit(error && error.code === 'E1_OFFLINE_EGRESS_BLOCKED' ? 0 : 4),
);
`;

if (import.meta.main) {
  const environment = createE1OfflineEnvironment();
  const filesystemInventory = discoverSrcBunTestFiles(repositoryRoot);
  const gitInventory = discoverGitSrcBunTestFiles(repositoryRoot);
  assertMatchingSrcBunInventories(filesystemInventory, gitInventory);
  const partition = partitionE1BunTests(filesystemInventory, gitInventory);
  const unitCommandPlan = createE1BunUnitCommandPlan(partition, gitInventory);
  run(['bun', `--preload=${preloadPath}`, '--eval', probe], environment);
  run(['node', '--require', preloadPath, '--eval', probe], environment);
  for (const command of unitCommandPlan) run(command, environment);
  run(['node', '--require', preloadPath, 'node_modules/typescript/bin/tsc', '--noEmit'], environment);
  // The protected working-tree inventory may contain nested agent worktrees whose generated
  // outputs are intentionally preserved but are outside Event Every’s lint surface.
  run(['node', '--require', preloadPath, 'node_modules/eslint/bin/eslint.js', '.', '--ignore-pattern', '.claude/**'], environment);
  run(['node', '--require', preloadPath, 'node_modules/next/dist/bin/next', 'build'], environment);
  run(['node', '--require', preloadPath, 'node_modules/@playwright/test/cli.js', 'test'], environment);
}
