import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_DEPENDENCIES = {
  '@opennextjs/cloudflare': '1.20.2',
  wrangler: '4.118.0',
  vitest: '4.1.10',
  '@cloudflare/vitest-pool-workers': '0.20.1',
  msw: '2.15.0',
} as const;

const REQUIRED_SCRIPTS = {
  'build:cloudflare': 'opennextjs-cloudflare build',
  'cf:types': 'bun scripts/run-c1-a-cloudflare.ts app-types',
  'cf:types:keepalive': 'bun scripts/run-c1-a-cloudflare.ts keepalive-types',
  'test:workers': 'bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts',
  'assert:c1:a-config': 'bun scripts/assert-c1-a-config.ts',
  'assert:c1:a-paths': 'bun scripts/assert-c1-a-paths.ts',
  'test:c1:a-mutations': 'bun scripts/run-c1-a-mutations.ts --verify-ledger --all',
  'validate:c1:a-evidence': 'bun scripts/validate-c1-a-evidence.ts docs/testing/c1-a-terminal-evidence.json',
  'test:e2e:c1:a': 'playwright test --config playwright.c1-a.config.ts',
  'verify:c1:a': 'bun scripts/run-c1-a-offline.ts',
} as const;

const CREDENTIAL_ASSIGNMENT = /(?:OPENROUTER|ANTHROPIC|CLOUDFLARE|RESEND|KV_REST|AUTH_PATTERN)[A-Z0-9_.-]*\s*[:=]\s*\S+|(?:[A-Z][A-Z0-9_]*_)?(?:API_KEY|TOKEN|SECRET|D1|R2)\s*[:=]\s*\S+/;
const DEPLOY_CAPABLE = /\b(?:deploy|publish|upload)\b/i;
const ORDINARY_INSTALL = /\b(?:bun(?:\s+--[\w-]+(?:=\S+)?)*\s+(?:install|i|add|update)|npm\s+(?:install|i|ci)|pnpm\s+(?:install|i|add)|yarn\s+(?:install|add))\b/i;

function fail(field: string): never {
  throw new Error(`c1-a config: ${field}`);
}

function read(root: string, file: string): string {
  const target = path.join(root, file);
  if (!existsSync(target)) fail(`missing ${file}`);
  return readFileSync(target, 'utf8');
}

export function assertC1AConfig(root = process.cwd()): void {
  let packageJson: { scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
  try {
    packageJson = JSON.parse(read(root, 'package.json'));
  } catch {
    fail('package.json');
  }

  for (const [name, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
    if (packageJson.devDependencies?.[name] !== version || packageJson.dependencies?.[name] !== undefined) fail(`dependency ${name}`);
  }
  for (const [name, value] of Object.entries(REQUIRED_SCRIPTS)) {
    if (packageJson.scripts?.[name] !== value) fail(`script ${name}`);
  }
  for (const [name, value] of Object.entries(packageJson.scripts ?? {})) {
    if (typeof value === 'string' && (DEPLOY_CAPABLE.test(value) || ORDINARY_INSTALL.test(value))) fail(`install/deploy script ${name}`);
  }

  const ignore = read(root, '.gitignore');
  for (const required of ['.dev.vars', '.dev.vars.*', '.open-next/', '.wrangler/']) {
    if (!ignore.split(/\r?\n/).includes(required)) fail(`ignore ${required}`);
  }
  for (const file of ['bun.lock', 'package.json', '.gitignore']) {
    if (CREDENTIAL_ASSIGNMENT.test(read(root, file))) fail('credential evidence');
  }
  if (existsSync(path.join(root, '.npmrc'))) fail('registry auth');
  const bunfig = path.join(root, 'bunfig.toml');
  if (existsSync(bunfig) && /(?:auth|token|registry)/i.test(readFileSync(bunfig, 'utf8'))) fail('registry auth');
}

if (import.meta.main) {
  assertC1AConfig();
  console.log('c1-a config: Task 1 package/offline boundary accepted');
}
