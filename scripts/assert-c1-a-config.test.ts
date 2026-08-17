import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertC1AConfig } from './assert-c1-a-config';

const roots: string[] = [];
const scripts = {
  'build:cloudflare': 'opennextjs-cloudflare build', 'cf:types': 'bun scripts/run-c1-a-cloudflare.ts app-types', 'cf:types:keepalive': 'bun scripts/run-c1-a-cloudflare.ts keepalive-types',
  'test:workers': 'bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts', 'assert:c1:a-config': 'bun scripts/assert-c1-a-config.ts', 'assert:c1:a-paths': 'bun scripts/assert-c1-a-paths.ts', 'assert:private-worker': 'bun scripts/assert-private-worker.ts', 'test:e2e:c1:a': 'playwright test --config playwright.c1-a.config.ts', 'verify:c1:a': 'bun scripts/run-c1-a-offline.ts',
} as const;
const dependencies = { '@opennextjs/cloudflare': '1.20.2', wrangler: '4.118.0', vitest: '4.1.10', '@cloudflare/vitest-pool-workers': '0.20.1', msw: '2.15.0' } as const;
const task9Files = {
  'cloudflare/legacy-keepalive-wrangler.jsonc': `{
  "$schema": "node_modules/wrangler/config-schema.json", "name": "event-every-legacy-keepalive-private", "main": "cloudflare/legacy-keepalive-worker.ts", "compatibility_date": "2026-08-02", "compatibility_flags": ["nodejs_compat"], "workers_dev": false, "preview_urls": false,
  // Future P1 cron: 0 0 * * * (disabled until C1-A deployment controls are lifted).
  "vars": { "KEEPALIVE_DEPLOYMENT_DISABLED": "1", "STATE_AUTHORITY_MODE": "legacy", "KV_REST_API_URL": "", "KV_REST_API_TOKEN": "" }
}`,
  'cloudflare/legacy-keepalive-worker.ts': "type LegacyKeepAliveEnv = unknown; type ScheduledController = unknown; type ExecutionContext = unknown; type ExportedHandler<Env> = unknown; function mapKeepAliveFailure(_error: unknown): undefined { return undefined; } async function runLegacyKeepAlive(env: LegacyKeepAliveEnv, scheduledTime: number): Promise<void> { if (env.STATE_AUTHORITY_MODE === 'cloudflare') return; try { const response = await fetch(`${env.KV_REST_API_URL}/set/keep-alive/${scheduledTime}?EX=172800`, { method: 'POST', headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}` } }); if (!response.ok) return mapKeepAliveFailure(undefined); } catch (error) { return mapKeepAliveFailure(error); } } export default { scheduled(controller, env, ctx) { ctx.waitUntil(runLegacyKeepAlive(env, controller.scheduledTime)); } } satisfies ExportedHandler<LegacyKeepAliveEnv>;\n",
  'cloudflare/legacy-keepalive-configuration.d.ts': 'interface LegacyKeepAliveEnv { KEEPALIVE_DEPLOYMENT_DISABLED: "1"; STATE_AUTHORITY_MODE: "legacy"; KV_REST_API_URL: ""; KV_REST_API_TOKEN: ""; }\n',
  'vitest.config.keepalive-workers.ts': "import { defineConfig } from 'vitest/config'; export default defineConfig(async () => { const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers'); return { plugins: [cloudflareTest({ wrangler: { configPath: './cloudflare/legacy-keepalive-wrangler.jsonc' }, miniflare: { bindings: { KV_REST_API_URL: 'http://127.0.0.1:8799', KV_REST_API_TOKEN: 'synthetic-c1-a-token', }, }, }),], test: { include: ['test/worker/legacy-keepalive.integration.test.ts', 'test/worker/deny-egress.integration.test.ts',], setupFiles: ['./test/worker/deny-egress.setup.ts'], }, }; });\n",
} as const;
function fixture(changes: Record<string, string> = {}): string { const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-config-')); roots.push(root); const files = { 'package.json': JSON.stringify({ name: 'fixture', scripts, devDependencies: dependencies }), 'scripts/run-c1-a-offline.ts': 'export const leanC1AOfflineGate = true;\n', '.gitignore': '.dev.vars\n.dev.vars.*\n.open-next/\n.wrangler/\ndist-c1-a-*\ntest-results-c1-a-*\nplaywright-report-c1-a-*\n', '.env.example': '# C1-B uses synthetic values only. Real values are inputs to the later deployment gate.\nOPENROUTER_OWNER_KEY=\nPROVIDER_REQUEST_HMAC_CURRENT=\nPROVIDER_REQUEST_HMAC_PREVIOUS=\n', 'bun.lock': 'lock', ...task9Files, ...changes }; for (const [file, content] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content); } return root; }
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('C1-A Task 1 package/offline config boundary', () => {
  test('accepts the preserved Task 1 package boundary with the Task 2 app scaffold', () => { expect(() => assertC1AConfig(fixture(task2Files))).not.toThrow(); });
  test('rejects each exact dependency independently', () => { for (const name of Object.keys(dependencies)) { const copy = { ...dependencies }; delete copy[name as keyof typeof copy]; expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, devDependencies: copy }) }))).toThrow(`c1-a config: dependency ${name}`); } });
  test('requires all five exact C1-A devDependency versions and rejects production ownership', () => { for (const [name, version] of Object.entries(dependencies)) { expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, dependencies: { [name]: version }, devDependencies: dependencies }) }))).toThrow(`c1-a config: dependency ${name}`); expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, devDependencies: { ...dependencies, [name]: `^${version}` } }) }))).toThrow(`c1-a config: dependency ${name}`); } });
  test('rejects each missing or altered required script independently', () => { for (const [name, command] of Object.entries(scripts)) { const copy = { ...scripts, [name]: `${command} altered` }; expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts: copy, devDependencies: dependencies }) }))).toThrow(`c1-a config: script ${name}`); } });
  test('rejects every obsolete Task 11 evidence command from package scripts and the active offline runner', () => {
    for (const token of ['run-c1-a-mutations', 'validate-c1-a-evidence', 'c1-a-terminal-evidence', '--write-ledger', '--verify-ledger', '--write-evidence']) {
      expect(() => assertC1AConfig(fixture({
        ...task2Files,
        'package.json': JSON.stringify({ scripts: { ...scripts, obsolete: `bun ${token}` }, devDependencies: dependencies }),
      }))).toThrow('c1-a config: obsolete Task 11 evidence');
      expect(() => assertC1AConfig(fixture({ ...task2Files, 'scripts/run-c1-a-offline.ts': `const obsolete = '${token}';\n` })))
        .toThrow('c1-a config: obsolete Task 11 evidence');
    }
  });
  test('accepts the exact C1-B mutation verification command without reopening obsolete Task 11 evidence', () => {
    expect(() => assertC1AConfig(fixture({
      ...task2Files,
      'package.json': JSON.stringify({
        scripts: {
          ...scripts,
          'verify:c1:b:mutations': 'bun -- scripts/run-private-offline.ts -- bun scripts/run-c1-b-mutations.ts --verify-ledger',
        },
        devDependencies: dependencies,
      }),
    }))).not.toThrow();
  });
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
  test('requires only empty private secret placeholders in .env.example', () => {
    const accepted = '# Real values are inputs to the later deployment gate.\nOPENROUTER_OWNER_KEY=\nPROVIDER_REQUEST_HMAC_CURRENT=\nPROVIDER_REQUEST_HMAC_PREVIOUS=\n';
    for (const value of [
      accepted.replace('OPENROUTER_OWNER_KEY=', 'OPENROUTER_OWNER_KEY=canary'),
      accepted.replace('PROVIDER_REQUEST_HMAC_PREVIOUS=\n', ''),
      `${accepted}OPENROUTER_BASE_URL=https://example.invalid\n`,
      accepted.replace('later deployment gate', 'this C1-B task'),
    ]) expect(() => assertC1AConfig(fixture({ ...task2Files, '.env.example': value }))).toThrow('c1-a config: .env.example');
  });
});

const task2Files = {
  'open-next.config.ts': "import { defineCloudflareConfig } from '@opennextjs/cloudflare';\n\nexport default defineCloudflareConfig();\n",
  'next.config.js': "import('@opennextjs/cloudflare').then((module) => module.initOpenNextCloudflareForDev());\nconst nextConfig = { devIndicators: false, reactStrictMode: true, allowedDevOrigins: ['event-every.local'], images: { unoptimized: true }, }\nmodule.exports = nextConfig\n",
  'cloudflare/app-worker.ts': "import handler from '../.open-next/worker.js';\nimport { admitEdgeRequest } from '../src/platform/admission';\nimport { cloudflareTrustedEdgeAddress } from '../src/platform/identity';\nexport { DailyCounter } from '../src/platform/cloudflare/daily-counter';\nexport { IdentityDayPolicy } from '../src/platform/cloudflare/identity-day-policy';\nexport { ResolverRequestAuthority } from '../src/platform/cloudflare/resolver-request-authority';\nexport { OwnerBudgetAuthority } from '../src/platform/cloudflare/owner-budget-authority';\nexport { ProviderRequestAuthority } from '../src/platform/cloudflare/provider-request-authority';\nconst PRIVATE_PROVIDER_PATHS = new Set(['/api/scan','/api/resolve-timezone','/api/summarize','/api/provider-status']);\ntype PrivateCloudflareEnv = CloudflareEnv & Readonly<{ STATE_AUTHORITY_MODE?: string; PROVIDER_POLICY_VERSION?: string; PROVIDER_REQUEST_HMAC_CURRENT_VERSION?: string; PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION?: string; OPENROUTER_OWNER_KEY?: string; PROVIDER_REQUEST_HMAC_CURRENT?: string; PROVIDER_REQUEST_HMAC_PREVIOUS?: string; OWNER_BUDGET_AUTHORITY?: unknown; PROVIDER_REQUEST_AUTHORITY?: unknown; }>;\ntype ExportedHandler<Env> = Readonly<{ fetch(request: Request, env: Env, ctx: unknown): Response | Promise<Response>; }>;\nfunction nonempty(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }\nfunction privateProviderConfigurationAvailable(env: PrivateCloudflareEnv): boolean { const hasPreviousKey = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS); const hasPreviousVersion = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION); return env.STATE_AUTHORITY_MODE === 'cloudflare' && env.PROVIDER_POLICY_VERSION === 'owner-v1' && env.PROVIDER_REQUEST_HMAC_CURRENT_VERSION === 'c1-b-current-v1' && nonempty(env.OPENROUTER_OWNER_KEY) && nonempty(env.PROVIDER_REQUEST_HMAC_CURRENT) && Boolean(env.OWNER_BUDGET_AUTHORITY) && Boolean(env.PROVIDER_REQUEST_AUTHORITY) && hasPreviousKey === hasPreviousVersion; }\nfunction providerStateUnavailable(): Response { return Response.json({ error: 'Provider state unavailable.', code: 'provider_state_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }\nexport default { async fetch(request: Request, env: PrivateCloudflareEnv, ctx: unknown) { const admitted = await admitEdgeRequest(request, env, ctx, cloudflareTrustedEdgeAddress); if (admitted.status === 'failure') return admitted.response; if (PRIVATE_PROVIDER_PATHS.has(new URL(admitted.request.url).pathname) && !privateProviderConfigurationAvailable(env)) return providerStateUnavailable(); return handler.fetch(admitted.request, env, ctx); }, } satisfies ExportedHandler<PrivateCloudflareEnv>;\n",
  'wrangler.jsonc': JSON.stringify({
    $schema: 'node_modules/wrangler/config-schema.json', name: 'event-every', main: 'cloudflare/app-worker.ts', compatibility_date: '2026-08-02',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'], workers_dev: false, preview_urls: false,
    assets: { directory: '.open-next/assets', binding: 'ASSETS' }, services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'event-every' }],
    d1_databases: [{ binding: 'EVENT_EVERY_DB', database_name: 'event-every-local-disabled', database_id: '11111111-1111-4111-8111-111111111111' }],
    durable_objects: { bindings: [{ name: 'IDENTITY_DAY_POLICY', class_name: 'IdentityDayPolicy' }, { name: 'RESOLVER_REQUEST_AUTHORITY', class_name: 'ResolverRequestAuthority' }, { name: 'RESOLVER_DAILY_COUNTER', class_name: 'DailyCounter' }, { name: 'OWNER_BUDGET_AUTHORITY', class_name: 'OwnerBudgetAuthority' }, { name: 'PROVIDER_REQUEST_AUTHORITY', class_name: 'ProviderRequestAuthority' }] },
    migrations: [{ tag: 'c1-a-v1', new_sqlite_classes: ['IdentityDayPolicy', 'ResolverRequestAuthority', 'DailyCounter'] }, { tag: 'c1-b-budget-v1', new_sqlite_classes: ['OwnerBudgetAuthority'] }, { tag: 'c1-b-request-v1', new_sqlite_classes: ['ProviderRequestAuthority'] }],
    vars: { C1_DEPLOYMENT_DISABLED: '1', STATE_AUTHORITY_MODE: 'cloudflare', IDENTITY_KEY_CURRENT_VERSION: 'local-v1', IDENTITY_KEY_NEXT_VERSION: '', IDENTITY_KEY_ACTIVATES_AT: '', IDENTITY_KEY_SCHEDULE_DIGEST: 'local-v1-no-rotation', PROVIDER_POLICY_VERSION: 'owner-v1', PROVIDER_REQUEST_HMAC_CURRENT_VERSION: 'c1-b-current-v1', PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION: '' },
  }),
  'vitest.config.workers.ts': "import { defineConfig } from 'vitest/config';\nexport default defineConfig(async () => { const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers'); return { plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { IDENTITY_HMAC_CURRENT: 'synthetic-c1-a-identity-key', RESOLVER_CAPABILITY_HMAC: 'synthetic-c1-a-capability-key', OPENROUTER_OWNER_KEY: 'deliberately-invalid-synthetic-owner-key', PROVIDER_REQUEST_HMAC_CURRENT: 'synthetic-c1-b-request-shape-key', }, }, }),], test: { include: ['test/worker/app-worker.test.ts', 'test/worker/admission.integration.test.ts', 'test/worker/resolver.integration.test.ts', 'test/worker/deny-egress.integration.test.ts', 'test/worker/owner-budget-authority.integration.test.ts', 'test/worker/provider-request-authority.integration.test.ts',], setupFiles: ['./test/worker/deny-egress.setup.ts'], }, }; });\n",
  'playwright.c1-a.config.ts': "import { defineConfig, devices } from '@playwright/test';\nconst suffix = process.env.C1_A_OUTPUT_SUFFIX;\nif (!suffix || !/^[a-f0-9]{12}$/.test(suffix)) { throw new Error('C1_A_OUTPUT_SUFFIX must be 12 lowercase hex characters'); }\nexport default defineConfig({ testDir: './e2e', testMatch: /c1-a-runtime-admission\\.spec\\.ts/, outputDir: `test-results-c1-a-${suffix}`, reporter: [['html', { outputFolder: `playwright-report-c1-a-${suffix}`, open: 'never' }]], use: { baseURL: 'http://127.0.0.1:8788' }, webServer: undefined, projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } },], });\n",
  'playwright.config.ts': "import { defineConfig } from '@playwright/test'; export default defineConfig({ testIgnore: /c1-a-runtime-admission\\.spec\\.ts/ });\n",
  'worker-configuration.d.ts': 'interface CloudflareEnv { EVENT_EVERY_DB: D1Database; ASSETS: Fetcher; C1_DEPLOYMENT_DISABLED: "1"; STATE_AUTHORITY_MODE: "cloudflare"; IDENTITY_KEY_CURRENT_VERSION: "local-v1"; IDENTITY_KEY_NEXT_VERSION: ""; IDENTITY_KEY_ACTIVATES_AT: ""; IDENTITY_KEY_SCHEDULE_DIGEST: "local-v1-no-rotation"; PROVIDER_POLICY_VERSION: "owner-v1"; PROVIDER_REQUEST_HMAC_CURRENT_VERSION: "c1-b-current-v1"; PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION: ""; IDENTITY_HMAC_CURRENT: string; IDENTITY_HMAC_NEXT?: string; RESOLVER_CAPABILITY_HMAC: string; OPENROUTER_OWNER_KEY: string; PROVIDER_REQUEST_HMAC_CURRENT: string; PROVIDER_REQUEST_HMAC_PREVIOUS?: string; IDENTITY_DAY_POLICY: DurableObjectNamespace<IdentityDayPolicy>; RESOLVER_REQUEST_AUTHORITY: DurableObjectNamespace<ResolverRequestAuthority>; RESOLVER_DAILY_COUNTER: DurableObjectNamespace<DailyCounter>; OWNER_BUDGET_AUTHORITY: DurableObjectNamespace<OwnerBudgetAuthority>; PROVIDER_REQUEST_AUTHORITY: DurableObjectNamespace<ProviderRequestAuthority>; WORKER_SELF_REFERENCE: Fetcher; }\n',
} as const;

describe('C1-A Task 2 nondeployable app configuration boundary', () => {
  test('rejects the Task 1-only fixture until the app scaffold is present', () => {
    expect(() => assertC1AConfig(fixture())).toThrow('c1-a config: missing open-next.config.ts');
  });

  test('accepts the exact local app scaffold and generated type surface', () => {
    expect(() => assertC1AConfig(fixture(task2Files))).not.toThrow();
    expect(() => assertC1AConfig(fixture({ ...task2Files, 'wrangler.jsonc': task2Files['wrangler.jsonc'].replace('{', '{\n// installed Wrangler JSONC parser accepts this comment\n') }))).not.toThrow();
  }, 10_000);

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

  test.each(['EVENT_EVERY_DB', 'ASSETS', 'C1_DEPLOYMENT_DISABLED', 'STATE_AUTHORITY_MODE', 'IDENTITY_KEY_CURRENT_VERSION', 'IDENTITY_KEY_NEXT_VERSION', 'IDENTITY_KEY_ACTIVATES_AT', 'IDENTITY_KEY_SCHEDULE_DIGEST', 'PROVIDER_POLICY_VERSION', 'PROVIDER_REQUEST_HMAC_CURRENT_VERSION', 'PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION', 'IDENTITY_HMAC_CURRENT', 'IDENTITY_HMAC_NEXT', 'RESOLVER_CAPABILITY_HMAC', 'OPENROUTER_OWNER_KEY', 'PROVIDER_REQUEST_HMAC_CURRENT', 'PROVIDER_REQUEST_HMAC_PREVIOUS', 'IDENTITY_DAY_POLICY', 'RESOLVER_REQUEST_AUTHORITY', 'RESOLVER_DAILY_COUNTER', 'OWNER_BUDGET_AUTHORITY', 'PROVIDER_REQUEST_AUTHORITY', 'WORKER_SELF_REFERENCE'])(
    'requires generated binding %s',
    (binding) => {
      expect(() => assertC1AConfig(fixture({ ...task2Files, 'worker-configuration.d.ts': task2Files['worker-configuration.d.ts'].replace(binding, 'REMOVED_BINDING') }))).toThrow('c1-a config: worker-configuration.d.ts');
    },
    10_000,
  );
});

describe('C1-A Task 9 private keep-alive configuration boundary', () => {
  test.each([
    ['cloudflare/legacy-keepalive-wrangler.jsonc', JSON.stringify({ name: 'event-every-legacy-keepalive-private', triggers: { crons: ['* * * * *'] } }), 'legacy keepalive deployment'],
    ['cloudflare/legacy-keepalive-wrangler.jsonc', task9Files['cloudflare/legacy-keepalive-wrangler.jsonc'].replace('"preview_urls": false', '"preview_urls": true'), 'legacy keepalive wrangler'],
    ['cloudflare/legacy-keepalive-wrangler.jsonc', task9Files['cloudflare/legacy-keepalive-wrangler.jsonc'].replace('"workers_dev": false', '"workers_dev": true'), 'legacy keepalive wrangler'],
    ['cloudflare/legacy-keepalive-wrangler.jsonc', task9Files['cloudflare/legacy-keepalive-wrangler.jsonc'].replace('"vars":', '"routes": ["example.invalid/*"], "vars":'), 'legacy keepalive deployment'],
    ['cloudflare/legacy-keepalive-wrangler.jsonc', task9Files['cloudflare/legacy-keepalive-wrangler.jsonc'].replace('"vars":', '"services": [{ "binding": "PRIVATE", "service": "event-every" }], "vars":'), 'legacy keepalive deployment'],
    ['cloudflare/legacy-keepalive-wrangler.jsonc', task9Files['cloudflare/legacy-keepalive-wrangler.jsonc'].replace('0 0 * * *', '0 0 */2 * *'), 'legacy keepalive cron comment'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace("if (env.STATE_AUTHORITY_MODE === 'cloudflare') return;", 'if (false) return;'), 'legacy keepalive cloudflare isolation'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return mapKeepAliveFailure(error);', 'throw error;'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nconst addedFetch = () => new Response(); export { addedFetch as fetch };`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nexport { runLegacyKeepAlive };`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nexport { addedFetch as fetch } from './added-fetch';`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nexport * from './added-fetch';`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nexport * as fetch from './added-fetch';`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nexport = { fetch() { return new Response(); } };`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return mapKeepAliveFailure(error);', 'console.error(error); return mapKeepAliveFailure(error);'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return mapKeepAliveFailure(error);', 'JSON.stringify(error); return mapKeepAliveFailure(error);'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return mapKeepAliveFailure(error);', 'throw error; return mapKeepAliveFailure(error);'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return mapKeepAliveFailure(error);', 'String(error); return mapKeepAliveFailure(error);'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return mapKeepAliveFailure(error);', 'const alias = error; return mapKeepAliveFailure(error);'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return mapKeepAliveFailure(error);', 'report(error); return mapKeepAliveFailure(error);'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return undefined;', 'console.error(_error); return undefined;'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('return undefined;', '_error; return undefined;'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nfunction mapKeepAliveFailure(_error: unknown): undefined { return undefined; }`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('try { const', 'function mapKeepAliveFailure(_error: unknown): undefined { return undefined; } try { const'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('try { const', 'function mapKeepAliveFailure(_error: unknown): undefined { console.error(_error); return undefined; } try { const'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('try { const', 'const mapKeepAliveFailure = (_error: unknown): undefined => undefined; try { const'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('try { const', 'const alias = mapKeepAliveFailure; try { const'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('try { const', 'mapKeepAliveFailure = () => undefined; try { const'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('if (!response.ok) return mapKeepAliveFailure(undefined);', 'if (!response.ok) return undefined;'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('if (!response.ok) return mapKeepAliveFailure(undefined);', 'const decoy = { ok: false }; if (!decoy.ok) return mapKeepAliveFailure(undefined); if (!response.ok) return undefined;'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('scheduled(controller, env, ctx) {', "scheduled(controller, env, ctx) { async function runLegacyKeepAlive() { console.error('leak'); }"), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nconst capturedError = console.error; const fetch = (...args: Parameters<typeof globalThis.fetch>) => { capturedError('leak'); return globalThis.fetch(...args); };`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', `${task9Files['cloudflare/legacy-keepalive-worker.ts']}\nconst capturedError = console.error; Object.prototype.toString = () => { capturedError('leak'); return ''; };`, 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('_error: unknown', "_error: unknown = console.error('leak')"), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('env: LegacyKeepAliveEnv', "env: LegacyKeepAliveEnv = (console.error('leak'), {} as LegacyKeepAliveEnv)"), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('scheduled(controller, env, ctx)', "scheduled(controller = console.error('leak'), env, ctx)"), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('scheduled(controller, env, ctx)', 'scheduled(...controller, env, ctx)'), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('env: LegacyKeepAliveEnv', 'env?: LegacyKeepAliveEnv'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('fetch(`${env.KV_REST_API_URL}', "fetch((console.error('leak'), `${env.KV_REST_API_URL}"), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace("method: 'POST'", "method: (console.error('leak'), 'POST')"), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('headers: {', "headers: { ...{ X: console.error('leak') },"), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('fetch(`', 'fetch?.(`'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('env.KV_REST_API_URL', 'env?.KV_REST_API_URL'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('env.KV_REST_API_TOKEN', 'env?.KV_REST_API_TOKEN'), 'legacy keepalive status-only'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('env.STATE_AUTHORITY_MODE', 'env?.STATE_AUTHORITY_MODE'), 'legacy keepalive cloudflare isolation'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('ctx.waitUntil(', 'ctx?.waitUntil('), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('ctx.waitUntil(', 'ctx.waitUntil?.('), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('ctx.waitUntil(runLegacyKeepAlive(env', 'ctx.waitUntil(runLegacyKeepAlive?.(env'), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('controller.scheduledTime', 'controller?.scheduledTime'), 'legacy keepalive worker'],
    ['cloudflare/legacy-keepalive-worker.ts', task9Files['cloudflare/legacy-keepalive-worker.ts'].replace('export default {', 'export default { fetch() { return new Response(); },'), 'legacy keepalive worker'],
    ['vitest.config.keepalive-workers.ts', task9Files['vitest.config.keepalive-workers.ts'].replace('cloudflareTest({', "cloudflareTest({ main: './cloudflare/legacy-keepalive-worker.ts',"), 'legacy keepalive vitest'],
    ['vitest.config.keepalive-workers.ts', task9Files['vitest.config.keepalive-workers.ts'].replace("'test/worker/deny-egress.integration.test.ts',", ''), 'legacy keepalive vitest'],
    ['vitest.config.keepalive-workers.ts', task9Files['vitest.config.keepalive-workers.ts'].replace("'test/worker/deny-egress.integration.test.ts',", "'test/worker/deny-egress.integration.test.ts', 'test/worker/extra.integration.test.ts',"), 'legacy keepalive vitest'],
    ['vitest.config.keepalive-workers.ts', task9Files['vitest.config.keepalive-workers.ts'].replace("setupFiles: ['./test/worker/deny-egress.setup.ts'],", 'setupFiles: [],'), 'legacy keepalive vitest'],
    ['wrangler.jsonc', task2Files['wrangler.jsonc'].replace('"migrations"', '"KV_REST_API_URL":"", "migrations"'), 'wrangler keepalive capability'],
    ['wrangler.jsonc', task2Files['wrangler.jsonc'].replace('"services":[{"binding":"WORKER_SELF_REFERENCE","service":"event-every"}]', '"services":[{"binding":"WORKER_SELF_REFERENCE","service":"event-every"},{"binding":"PRIVATE_KEEPALIVE","service":"event-every-legacy-keepalive-private"}]'), 'wrangler private keepalive service'],
    ['cloudflare/app-worker.ts', `${task2Files['cloudflare/app-worker.ts']}\nexport const scheduled = () => undefined;`, 'cloudflare/app-worker exports'],
    ['cloudflare/app-worker.ts', `${task2Files['cloudflare/app-worker.ts']}\nconst KV_REST_API_URL = '';`, 'cloudflare/app-worker exports'],
  ] as const)('rejects %s violation', (file, value, message) => {
    expect(() => assertC1AConfig(fixture({ ...task2Files, [file]: value }))).toThrow(`c1-a config: ${message}`);
  });
});
