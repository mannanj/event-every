import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertC1AConfig } from './assert-c1-a-config';

const roots: string[] = [];
const scripts = {
  'build:cloudflare': 'opennextjs-cloudflare build', 'cf:types': 'bun scripts/run-c1-a-cloudflare.ts app-types', 'cf:types:keepalive': 'bun scripts/run-c1-a-cloudflare.ts keepalive-types',
  'test:workers': 'bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts', 'assert:c1:a-config': 'bun scripts/assert-c1-a-config.ts', 'assert:c1:a-paths': 'bun scripts/assert-c1-a-paths.ts', 'test:c1:a-mutations': 'bun scripts/run-c1-a-mutations.ts --verify-ledger --all', 'validate:c1:a-evidence': 'bun scripts/validate-c1-a-evidence.ts docs/testing/c1-a-terminal-evidence.json', 'test:e2e:c1:a': 'playwright test --config playwright.c1-a.config.ts', 'verify:c1:a': 'bun scripts/run-c1-a-offline.ts',
} as const;
const dependencies = { '@opennextjs/cloudflare': '1.20.2', wrangler: '4.118.0', vitest: '4.1.10', '@cloudflare/vitest-pool-workers': '0.20.1', msw: '2.15.0' } as const;
function fixture(changes: Record<string, string> = {}): string { const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-config-')); roots.push(root); const files = { 'package.json': JSON.stringify({ name: 'fixture', scripts, devDependencies: dependencies }), '.gitignore': '.dev.vars\n.dev.vars.*\n.open-next/\n.wrangler/\ndist-c1-a-*\ntest-results-c1-a-*\nplaywright-report-c1-a-*\n', 'bun.lock': 'lock', ...changes }; for (const [file, content] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content); } return root; }
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('C1-A Task 1 package/offline config boundary', () => {
  test('accepts the preserved Task 1 package boundary with the Task 2 app scaffold', () => { expect(() => assertC1AConfig(fixture(task2Files))).not.toThrow(); });
  test('rejects each exact dependency independently', () => { for (const name of Object.keys(dependencies)) { const copy = { ...dependencies }; delete copy[name as keyof typeof copy]; expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, devDependencies: copy }) }))).toThrow(`c1-a config: dependency ${name}`); } });
  test('requires all five exact C1-A devDependency versions and rejects production ownership', () => { for (const [name, version] of Object.entries(dependencies)) { expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, dependencies: { [name]: version }, devDependencies: dependencies }) }))).toThrow(`c1-a config: dependency ${name}`); expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, devDependencies: { ...dependencies, [name]: `^${version}` } }) }))).toThrow(`c1-a config: dependency ${name}`); } });
  test('rejects each missing or altered required script independently', () => { for (const [name, command] of Object.entries(scripts)) { const copy = { ...scripts, [name]: `${command} altered` }; expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts: copy, devDependencies: dependencies }) }))).toThrow(`c1-a config: script ${name}`); } });
  test('rejects every generated ignore omission independently', () => { for (const missing of ['.dev.vars', '.dev.vars.*', '.open-next/', '.wrangler/']) { const ignore = ['.dev.vars', '.dev.vars.*', '.open-next/', '.wrangler/'].filter((line) => line !== missing).join('\n'); expect(() => assertC1AConfig(fixture({ '.gitignore': ignore }))).toThrow(`c1-a config: ignore ${missing}`); } });
  test('rejects deploy/upload/publish commands, repository auth, and credential evidence independently', () => {
    for (const [files, message] of [
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, deploy: 'wrangler deploy' }, devDependencies: dependencies }) }, 'install/deploy script deploy'],
      [{ '.npmrc': '//registry.npmjs.org/:_authToken=canary' }, 'registry auth'],
      [{ 'bunfig.toml': '[install]\nregistry = "https://bad.invalid"' }, 'registry auth'],
      [{ 'bun.lock': 'OPENROUTER_API_KEY=canary' }, 'credential evidence'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'bun install' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, add: 'bun add msw' }, devDependencies: dependencies }) }, 'install/deploy script add'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'bun --no-env-file install --frozen-lockfile' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'npm ci' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'pnpm add msw' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'yarn install' }, devDependencies: dependencies }) }, 'install/deploy script i'],
    ] as const) expect(() => assertC1AConfig(fixture(files))).toThrow(`c1-a config: ${message}`);
  });
});

const task2Files = {
  'open-next.config.ts': "import { defineCloudflareConfig } from '@opennextjs/cloudflare';\n\nexport default defineCloudflareConfig();\n",
  'next.config.js': "import('@opennextjs/cloudflare').then((module) => module.initOpenNextCloudflareForDev());\nconst nextConfig = { devIndicators: false, reactStrictMode: true, allowedDevOrigins: ['event-every.local'], images: { unoptimized: true }, }\nmodule.exports = nextConfig\n",
  'cloudflare/app-worker.ts': "import handler from '../.open-next/worker.js';\nimport { admitEdgeRequest } from '../src/platform/admission';\nimport { cloudflareTrustedEdgeAddress } from '../src/platform/identity';\nexport { DailyCounter } from '../src/platform/cloudflare/daily-counter';\nexport { IdentityDayPolicy } from '../src/platform/cloudflare/identity-day-policy';\nexport { ResolverRequestAuthority } from '../src/platform/cloudflare/resolver-request-authority';\ntype ExportedHandler<Env> = Readonly<{ fetch(request: Request, env: Env, ctx: unknown): Response | Promise<Response>; }>;\nexport default { async fetch(request: Request, env: CloudflareEnv, ctx: unknown) { const admitted = await admitEdgeRequest(request, env, ctx, cloudflareTrustedEdgeAddress); if (admitted.status === 'failure') return admitted.response; return handler.fetch(admitted.request, env, ctx); }, } satisfies ExportedHandler<CloudflareEnv>;\n",
  'wrangler.jsonc': JSON.stringify({
    $schema: 'node_modules/wrangler/config-schema.json', name: 'event-every', main: 'cloudflare/app-worker.ts', compatibility_date: '2026-08-02',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'], workers_dev: false, preview_urls: false,
    assets: { directory: '.open-next/assets', binding: 'ASSETS' }, services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'event-every' }],
    d1_databases: [{ binding: 'EVENT_EVERY_DB', database_name: 'event-every-local-disabled', database_id: '11111111-1111-4111-8111-111111111111' }],
    durable_objects: { bindings: [{ name: 'IDENTITY_DAY_POLICY', class_name: 'IdentityDayPolicy' }, { name: 'RESOLVER_REQUEST_AUTHORITY', class_name: 'ResolverRequestAuthority' }, { name: 'RESOLVER_DAILY_COUNTER', class_name: 'DailyCounter' }] },
    migrations: [{ tag: 'c1-a-v1', new_sqlite_classes: ['IdentityDayPolicy', 'ResolverRequestAuthority', 'DailyCounter'] }],
    vars: { C1_DEPLOYMENT_DISABLED: '1', STATE_AUTHORITY_MODE: 'legacy', IDENTITY_KEY_CURRENT_VERSION: 'local-v1', IDENTITY_KEY_NEXT_VERSION: '', IDENTITY_KEY_ACTIVATES_AT: '', IDENTITY_KEY_SCHEDULE_DIGEST: 'local-v1-no-rotation', IDENTITY_HMAC_CURRENT: '', IDENTITY_HMAC_NEXT: '', RESOLVER_CAPABILITY_HMAC: '' },
  }),
  'vitest.config.workers.ts': "import { defineConfig } from 'vitest/config';\nexport default defineConfig(async () => { const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers'); return { plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { IDENTITY_HMAC_CURRENT: 'synthetic-c1-a-identity-key', RESOLVER_CAPABILITY_HMAC: 'synthetic-c1-a-capability-key', }, }, }),], test: { include: ['test/worker/app-worker.test.ts', 'test/worker/admission.integration.test.ts', 'test/worker/resolver.integration.test.ts', 'test/worker/deny-egress.integration.test.ts',], setupFiles: ['./test/worker/deny-egress.setup.ts'], }, }; });\n",
  'playwright.c1-a.config.ts': "import { defineConfig, devices } from '@playwright/test';\nconst suffix = process.env.C1_A_OUTPUT_SUFFIX;\nif (!suffix || !/^[a-f0-9]{12}$/.test(suffix)) { throw new Error('C1_A_OUTPUT_SUFFIX must be 12 lowercase hex characters'); }\nexport default defineConfig({ testDir: './e2e', testMatch: /c1-a-runtime-admission\\.spec\\.ts/, outputDir: `test-results-c1-a-${suffix}`, reporter: [['html', { outputFolder: `playwright-report-c1-a-${suffix}`, open: 'never' }]], use: { baseURL: 'http://127.0.0.1:8788' }, webServer: undefined, projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } },], });\n",
  'playwright.config.ts': "import { defineConfig } from '@playwright/test'; export default defineConfig({ testIgnore: /c1-a-runtime-admission\\.spec\\.ts/ });\n",
  'worker-configuration.d.ts': 'interface CloudflareEnv { EVENT_EVERY_DB: D1Database; ASSETS: Fetcher; C1_DEPLOYMENT_DISABLED: "1"; STATE_AUTHORITY_MODE: "legacy"; IDENTITY_KEY_CURRENT_VERSION: "local-v1"; IDENTITY_KEY_NEXT_VERSION: ""; IDENTITY_KEY_ACTIVATES_AT: ""; IDENTITY_KEY_SCHEDULE_DIGEST: "local-v1-no-rotation"; IDENTITY_HMAC_CURRENT: ""; IDENTITY_HMAC_NEXT: ""; RESOLVER_CAPABILITY_HMAC: ""; IDENTITY_DAY_POLICY: DurableObjectNamespace<IdentityDayPolicy>; RESOLVER_REQUEST_AUTHORITY: DurableObjectNamespace<ResolverRequestAuthority>; RESOLVER_DAILY_COUNTER: DurableObjectNamespace<DailyCounter>; WORKER_SELF_REFERENCE: Fetcher; }\n',
} as const;

describe('C1-A Task 2 nondeployable app configuration boundary', () => {
  test('rejects the Task 1-only fixture until the app scaffold is present', () => {
    expect(() => assertC1AConfig(fixture())).toThrow('c1-a config: missing open-next.config.ts');
  });

  test('accepts the exact local app scaffold and generated type surface', () => {
    expect(() => assertC1AConfig(fixture(task2Files))).not.toThrow();
    expect(() => assertC1AConfig(fixture({ ...task2Files, 'wrangler.jsonc': task2Files['wrangler.jsonc'].replace('{', '{\n// installed Wrangler JSONC parser accepts this comment\n') }))).not.toThrow();
  });

  test('rejects public deployment, non-sentinel D1, remote worker config, and malformed DO ownership', () => {
    const wrangler = JSON.parse(task2Files['wrangler.jsonc']);
    for (const [file, value, message] of [
      ['wrangler.jsonc', JSON.stringify({ ...wrangler, workers_dev: true }), 'wrangler.workers_dev'],
      ['wrangler.jsonc', JSON.stringify(Object.fromEntries(Object.entries(wrangler).filter(([key]) => key !== '$schema'))), 'wrangler.$schema'],
      ['wrangler.jsonc', JSON.stringify({ ...wrangler, preview_urls: true }), 'wrangler.preview_urls'],
      ['wrangler.jsonc', JSON.stringify({ ...wrangler, d1_databases: [{ ...wrangler.d1_databases[0], database_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] }), 'wrangler.d1_databases'],
      ['wrangler.jsonc', JSON.stringify({ ...wrangler, durable_objects: { bindings: [] } }), 'wrangler.durable_objects'],
      ['vitest.config.workers.ts', task2Files['vitest.config.workers.ts'].replace("configPath: './wrangler.jsonc'", "configPath: './wrangler.jsonc', remote: true"), 'vitest.config.workers remote'],
      ['vitest.config.workers.ts', task2Files['vitest.config.workers.ts'].replace('./wrangler.jsonc', './wrangler. jsonc'), 'vitest.config.workers remote'],
      ['vitest.config.workers.ts', task2Files['vitest.config.workers.ts'].replace("const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');", "const { defineWorkersConfig } = await import('@cloudflare/vitest-pool-workers/config');"), 'vitest.config.workers remote'],
      ['vitest.config.workers.ts', task2Files['vitest.config.workers.ts'].replace('cloudflareTest({', 'legacyWorkersConfig({'), 'vitest.config.workers remote'],
      ['next.config.js', 'module.exports = {};\n', 'next.config.js'],
      ['next.config.js', `// ${task2Files['next.config.js']}\nmodule.exports = {};\n`, 'next.config.js'],
      ['next.config.js', task2Files['next.config.js'].replace('initOpenNextCloudflareForDev()', 'initOpenNextCloudflareForProduction()'), 'next.config.js'],
      ['cloudflare/app-worker.ts', `${task2Files['cloudflare/app-worker.ts']}\nexport const scheduled = () => undefined;`, 'cloudflare/app-worker exports'],
      ['playwright.config.ts', 'const dead = /c1-a-runtime-admission\\.spec\\.ts/; export default { testIgnore: /prod\\.spec\\.ts/ };', 'playwright.config.ts'],
      ['playwright.config.ts', "import { defineConfig } from '@playwright/test'; export default defineConfig({ testIgnore: /prod\\.spec\\.ts/ }); const deadConfig = { testIgnore: /c1-a-runtime-admission\\.spec\\.ts/ };", 'playwright.config.ts'],
    ] as const) expect(() => assertC1AConfig(fixture({ ...task2Files, [file]: value }))).toThrow(`c1-a config: ${message}`);
  }, 40_000);

  test.each(['EVENT_EVERY_DB', 'ASSETS', 'C1_DEPLOYMENT_DISABLED', 'STATE_AUTHORITY_MODE', 'IDENTITY_KEY_CURRENT_VERSION', 'IDENTITY_KEY_NEXT_VERSION', 'IDENTITY_KEY_ACTIVATES_AT', 'IDENTITY_KEY_SCHEDULE_DIGEST', 'IDENTITY_HMAC_CURRENT', 'IDENTITY_HMAC_NEXT', 'RESOLVER_CAPABILITY_HMAC', 'IDENTITY_DAY_POLICY', 'RESOLVER_REQUEST_AUTHORITY', 'RESOLVER_DAILY_COUNTER', 'WORKER_SELF_REFERENCE'])(
    'requires generated binding %s',
    (binding) => {
      expect(() => assertC1AConfig(fixture({ ...task2Files, 'worker-configuration.d.ts': task2Files['worker-configuration.d.ts'].replace(binding, 'REMOVED_BINDING') }))).toThrow('c1-a config: worker-configuration.d.ts');
    },
    10_000,
  );
});
