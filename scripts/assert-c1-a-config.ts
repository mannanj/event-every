import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createCloudflareChildEnvironment } from './run-c1-a-cloudflare';

const TOOL_ROOT = path.resolve(import.meta.dir, '..');

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

function readWranglerConfig(root: string): Record<string, unknown> {
  const target = path.join(root, 'wrangler.jsonc');
  if (!existsSync(target)) fail('missing wrangler.jsonc');
  const source = [
    "import { cloudflareTest } from '@cloudflare/vitest-pool-workers';",
    "import { experimental_readRawConfig } from 'wrangler';",
    "if (typeof cloudflareTest !== 'function') process.exit(2);",
    "const result = experimental_readRawConfig({ config: process.argv[1] });",
    "process.stdout.write(JSON.stringify(result.rawConfig));",
  ].join('\n');
  const result = Bun.spawnSync(['node', '--input-type=module', '-e', source, target], {
    cwd: TOOL_ROOT,
    env: createCloudflareChildEnvironment(process.env, TOOL_ROOT),
    stdout: 'pipe',
    stderr: 'ignore',
  });
  if (result.exitCode !== 0 || result.stdout.byteLength > 64 * 1024) fail('wrangler.jsonc');
  try {
    return JSON.parse(new TextDecoder().decode(result.stdout)) as Record<string, unknown>;
  } catch {
    fail('wrangler.jsonc');
  }
}

function exact(value: unknown, expected: unknown, field: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(field);
}

function executable(value: string, file: string): string {
  const kind = file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, value, ts.ScriptTarget.Latest, true, kind);
  const output: string[] = [];
  const visit = (node: ts.Node): void => {
    output.push(String(node.kind));
    let hasChild = false;
    ts.forEachChild(node, (child) => { hasChild = true; visit(child); });
    if (!hasChild) output.push(node.getText(source));
  };
  visit(source);
  return output.join('\u0000');
}

function exactExecutable(root: string, file: string, expected: string, field = file): void {
  if (executable(read(root, file), file) !== executable(expected, file)) fail(field);
}

const EXACT_NEXT_CONFIG = `
import('@opennextjs/cloudflare').then((module) => module.initOpenNextCloudflareForDev());
const nextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  allowedDevOrigins: ['event-every.local'],
  images: { unoptimized: true },
}
module.exports = nextConfig
`;
const EXACT_APP_WORKER = `
import handler from '../.open-next/worker.js';
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    return handler.fetch(request, env, ctx);
  },
};
`;
const EXACT_WORKERS_CONFIG = `
import { defineConfig } from 'vitest/config';
export default defineConfig(async () => {
  const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            IDENTITY_HMAC_CURRENT: 'synthetic-c1-a-identity-key',
            RESOLVER_CAPABILITY_HMAC: 'synthetic-c1-a-capability-key',
          },
        },
      }),
    ],
    test: {
      include: [
        'test/worker/app-worker.test.ts',
        'test/worker/admission.integration.test.ts',
        'test/worker/resolver.integration.test.ts',
        'test/worker/deny-egress.integration.test.ts',
      ],
      setupFiles: ['./test/worker/deny-egress.setup.ts'],
    },
  };
});
`;
const EXACT_C1_PLAYWRIGHT = `
import { defineConfig, devices } from '@playwright/test';
const suffix = process.env.C1_A_OUTPUT_SUFFIX;
if (!suffix || !/^[a-f0-9]{12}$/.test(suffix)) {
  throw new Error('C1_A_OUTPUT_SUFFIX must be 12 lowercase hex characters');
}
export default defineConfig({
  testDir: './e2e',
  testMatch: /c1-a-runtime-admission\\.spec\\.ts/,
  outputDir: \`test-results-c1-a-\${suffix}\`,
  reporter: [['html', { outputFolder: \`playwright-report-c1-a-\${suffix}\`, open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:8788' },
  webServer: undefined,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
`;

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
  for (const required of ['.dev.vars', '.dev.vars.*', '.open-next/', '.wrangler/', 'dist-c1-a-*', 'test-results-c1-a-*', 'playwright-report-c1-a-*']) {
    if (!ignore.split(/\r?\n/).includes(required)) fail(`ignore ${required}`);
  }
  for (const file of ['bun.lock', 'package.json', '.gitignore']) {
    if (CREDENTIAL_ASSIGNMENT.test(read(root, file))) fail('credential evidence');
  }
  if (existsSync(path.join(root, '.npmrc'))) fail('registry auth');
  const bunfig = path.join(root, 'bunfig.toml');
  if (existsSync(bunfig) && /(?:auth|token|registry)/i.test(readFileSync(bunfig, 'utf8'))) fail('registry auth');

  const openNext = read(root, 'open-next.config.ts').trim();
  if (openNext !== "import { defineCloudflareConfig } from '@opennextjs/cloudflare';\n\nexport default defineCloudflareConfig();") fail('open-next.config.ts');
  exactExecutable(root, 'next.config.js', EXACT_NEXT_CONFIG);

  const worker = read(root, 'cloudflare/app-worker.ts');
  if (/\b(?:scheduled|durable_objects|IdentityDayPolicy|ResolverRequestAuthority|DailyCounter)\b/.test(worker)) fail('cloudflare/app-worker exports');
  exactExecutable(root, 'cloudflare/app-worker.ts', EXACT_APP_WORKER, 'cloudflare/app-worker');

  const wrangler = readWranglerConfig(root);
  exact(wrangler.$schema, 'node_modules/wrangler/config-schema.json', 'wrangler.$schema');
  exact(wrangler.name, 'event-every', 'wrangler.name');
  exact(wrangler.main, 'cloudflare/app-worker.ts', 'wrangler.main');
  exact(wrangler.compatibility_date, '2026-08-02', 'wrangler.compatibility_date');
  exact(wrangler.compatibility_flags, ['nodejs_compat', 'global_fetch_strictly_public'], 'wrangler.compatibility_flags');
  exact(wrangler.workers_dev, false, 'wrangler.workers_dev');
  exact(wrangler.preview_urls, false, 'wrangler.preview_urls');
  exact(wrangler.assets, { directory: '.open-next/assets', binding: 'ASSETS' }, 'wrangler.assets');
  exact(wrangler.services, [{ binding: 'WORKER_SELF_REFERENCE', service: 'event-every' }], 'wrangler.services');
  exact(wrangler.d1_databases, [{ binding: 'EVENT_EVERY_DB', database_name: 'event-every-local-disabled', database_id: '11111111-1111-4111-8111-111111111111' }], 'wrangler.d1_databases');
  if ('durable_objects' in wrangler || 'migrations' in wrangler) fail('wrangler.durable_objects');
  if ('routes' in wrangler || 'triggers' in wrangler || wrangler.remote === true) fail('wrangler deployment');
  exact(wrangler.vars, {
    C1_DEPLOYMENT_DISABLED: '1', STATE_AUTHORITY_MODE: 'legacy', IDENTITY_KEY_CURRENT_VERSION: 'local-v1', IDENTITY_KEY_NEXT_VERSION: '', IDENTITY_KEY_ACTIVATES_AT: '', IDENTITY_KEY_SCHEDULE_DIGEST: 'local-v1-no-rotation', IDENTITY_HMAC_CURRENT: '', IDENTITY_HMAC_NEXT: '', RESOLVER_CAPABILITY_HMAC: '',
  }, 'wrangler.vars');

  exactExecutable(root, 'vitest.config.workers.ts', EXACT_WORKERS_CONFIG, 'vitest.config.workers remote');
  const generatedTypes = read(root, 'worker-configuration.d.ts');
  for (const binding of ['EVENT_EVERY_DB', 'ASSETS', 'C1_DEPLOYMENT_DISABLED', 'STATE_AUTHORITY_MODE', 'IDENTITY_KEY_CURRENT_VERSION', 'IDENTITY_KEY_NEXT_VERSION', 'IDENTITY_KEY_ACTIVATES_AT', 'IDENTITY_KEY_SCHEDULE_DIGEST', 'IDENTITY_HMAC_CURRENT', 'IDENTITY_HMAC_NEXT', 'RESOLVER_CAPABILITY_HMAC', 'WORKER_SELF_REFERENCE']) if (!generatedTypes.includes(binding)) fail('worker-configuration.d.ts');
  exactExecutable(root, 'playwright.c1-a.config.ts', EXACT_C1_PLAYWRIGHT);
  const ordinaryPlaywright = ts.createSourceFile('playwright.config.ts', read(root, 'playwright.config.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let ignoresC1A = false;
  const exported = ordinaryPlaywright.statements.find((statement): statement is ts.ExportAssignment => ts.isExportAssignment(statement) && !statement.isExportEquals);
  if (exported && ts.isCallExpression(exported.expression) && ts.isIdentifier(exported.expression.expression) && exported.expression.expression.text === 'defineConfig' && exported.expression.arguments.length === 1) {
    const config = exported.expression.arguments[0];
    if (ts.isObjectLiteralExpression(config)) {
      const testIgnore = config.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText(ordinaryPlaywright) === 'testIgnore');
      if (testIgnore) {
        const inspectIgnore = (value: ts.Node): void => {
          if (ts.isRegularExpressionLiteral(value) && value.text === '/c1-a-runtime-admission\\.spec\\.ts/') ignoresC1A = true;
          ts.forEachChild(value, inspectIgnore);
        };
        inspectIgnore(testIgnore.initializer);
      }
    }
  }
  if (!ignoresC1A) fail('playwright.config.ts');
}

if (import.meta.main) {
  assertC1AConfig();
  console.log('c1-a config: Task 2 app boundary accepted');
}
