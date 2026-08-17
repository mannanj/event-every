import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createCloudflareChildEnvironment } from './run-c1-a-cloudflare';

const TOOL_ROOT = path.resolve(import.meta.dir, '..');
const WRANGLER_CONFIG_CACHE = new Map<string, Record<string, unknown>>();

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
  'assert:private-worker': 'bun scripts/assert-private-worker.ts',
  'test:e2e:c1:a': 'playwright test --config playwright.c1-a.config.ts',
  'verify:c1:a': 'bun scripts/run-c1-a-offline.ts',
} as const;

const CREDENTIAL_ASSIGNMENT = /(?:OPENROUTER|ANTHROPIC|CLOUDFLARE|RESEND|KV_REST|AUTH_PATTERN)[A-Z0-9_.-]*\s*[:=]\s*\S+|(?:[A-Z][A-Z0-9_]*_)?(?:API_KEY|TOKEN|SECRET|D1|R2)\s*[:=]\s*\S+/;
const DEPLOY_CAPABLE = /\b(?:deploy|publish|upload)\b/i;
const ORDINARY_INSTALL = /\b(?:bun(?:\s+--[\w-]+(?:=\S+)?)*\s+(?:install|i|add|update)|npm\s+(?:install|i|ci)|pnpm\s+(?:install|i|add)|yarn\s+(?:install|add))\b/i;
const OBSOLETE_TASK_11_EVIDENCE = /run-c1-a-mutations|validate-c1-a-evidence|c1-a-terminal-evidence|--write-ledger|--verify-ledger|--write-evidence/;
const C1_B_MUTATION_SCRIPT = 'bun -- scripts/run-private-offline.ts -- bun scripts/run-c1-b-mutations.ts --verify-ledger';

type SourceFileWithParseDiagnostics = ts.SourceFile & {
  readonly parseDiagnostics?: readonly ts.Diagnostic[];
};

function hasParseDiagnostics(source: ts.SourceFile): boolean {
  const diagnostics = (source as SourceFileWithParseDiagnostics).parseDiagnostics;
  return !diagnostics || diagnostics.length > 0;
}

function fail(field: string): never {
  throw new Error(`c1-a config: ${field}`);
}

function read(root: string, file: string): string {
  const target = path.join(root, file);
  if (!existsSync(target)) fail(`missing ${file}`);
  return readFileSync(target, 'utf8');
}

function readWranglerConfig(root: string, file = 'wrangler.jsonc'): Record<string, unknown> {
  const target = path.join(root, file);
  if (!existsSync(target)) fail(`missing ${file}`);
  const cacheKey = `${file}\u0000${readFileSync(target, 'utf8')}`;
  const cached = WRANGLER_CONFIG_CACHE.get(cacheKey);
  if (cached) return cached;
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
  if (result.exitCode !== 0 || result.stdout.byteLength > 64 * 1024) fail(file);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(result.stdout)) as Record<string, unknown>;
    WRANGLER_CONFIG_CACHE.set(cacheKey, parsed);
    return parsed;
  } catch {
    fail(file);
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

function hasExactParameters(parameters: readonly ts.ParameterDeclaration[], names: readonly string[]): boolean {
  return parameters.length === names.length && parameters.every((parameter, index) => ts.isIdentifier(parameter.name) && parameter.name.text === names[index]
    && !parameter.initializer && !parameter.dotDotDotToken && !parameter.questionToken && !(parameter.modifiers?.length));
}

function isScheduledOnlyDefaultWorker(value: string): boolean {
  const source = ts.createSourceFile('legacy-keepalive-worker.ts', value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (hasParseDiagnostics(source)) return false;
  const expectedTypes = ['LegacyKeepAliveEnv', 'ScheduledController', 'ExecutionContext', 'ExportedHandler'];
  if (source.statements.length !== 7 || !source.statements.slice(0, 4).every((statement, index) => ts.isTypeAliasDeclaration(statement) && statement.name.text === expectedTypes[index])
    || !ts.isFunctionDeclaration(source.statements[4]) || source.statements[4].name?.text !== 'mapKeepAliveFailure'
    || !ts.isFunctionDeclaration(source.statements[5]) || source.statements[5].name?.text !== 'runLegacyKeepAlive'
    || !ts.isExportAssignment(source.statements[6])) return false;
  if (source.statements.some(ts.isExportDeclaration)) return false;
  const assignments = source.statements.filter(ts.isExportAssignment);
  if (assignments.length !== 1 || assignments[0].isExportEquals) return false;
  let expression = assignments[0].expression;
  while (ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (!ts.isObjectLiteralExpression(expression)) return false;
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) continue;
    if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false;
  }
  const properties = expression.properties;
  if (properties.length !== 1 || !ts.isMethodDeclaration(properties[0]) || !ts.isIdentifier(properties[0].name) || properties[0].name.text !== 'scheduled') return false;
  const scheduled = properties[0];
  if (!scheduled.body || !hasExactParameters(scheduled.parameters, ['controller', 'env', 'ctx']) || scheduled.body.statements.length !== 1) return false;
  const [waitUntil] = scheduled.body.statements;
  if (!ts.isExpressionStatement(waitUntil) || !ts.isCallExpression(waitUntil.expression) || waitUntil.expression.questionDotToken || !ts.isPropertyAccessExpression(waitUntil.expression.expression) || waitUntil.expression.expression.questionDotToken
    || !ts.isIdentifier(waitUntil.expression.expression.expression) || waitUntil.expression.expression.expression.text !== 'ctx'
    || waitUntil.expression.expression.name.text !== 'waitUntil' || waitUntil.expression.arguments.length !== 1 || !ts.isCallExpression(waitUntil.expression.arguments[0])) return false;
  const runnerCall = waitUntil.expression.arguments[0];
  if (runnerCall.questionDotToken || !ts.isIdentifier(runnerCall.expression) || runnerCall.expression.text !== 'runLegacyKeepAlive' || runnerCall.arguments.length !== 2
    || !ts.isIdentifier(runnerCall.arguments[0]) || runnerCall.arguments[0].text !== 'env' || !ts.isPropertyAccessExpression(runnerCall.arguments[1])
    || runnerCall.arguments[1].questionDotToken || !ts.isIdentifier(runnerCall.arguments[1].expression) || runnerCall.arguments[1].expression.text !== 'controller' || runnerCall.arguments[1].name.text !== 'scheduledTime') return false;
  const runners = source.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === 'runLegacyKeepAlive');
  if (runners.length !== 1 || !runners[0].name) return false;
  let exactRunnerUses = true;
  const inspectRunnerUse = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'runLegacyKeepAlive') exactRunnerUses &&= node === runners[0].name || node === runnerCall.expression;
    ts.forEachChild(node, inspectRunnerUse);
  };
  inspectRunnerUse(source);
  return exactRunnerUses;
}

function contentFreeKeepAliveMapper(source: ts.SourceFile): ts.FunctionDeclaration | undefined {
  const mappers = source.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement)
    && statement.name?.text === 'mapKeepAliveFailure');
  if (mappers.length !== 1) return undefined;
  const [mapper] = mappers;
  if (!mapper.body || !hasExactParameters(mapper.parameters, ['_error']) || mapper.body.statements.length !== 1) return undefined;
  const [returned] = mapper.body.statements;
  if (!ts.isReturnStatement(returned) || !returned.expression || !ts.isIdentifier(returned.expression) || returned.expression.text !== 'undefined') return undefined;
  const [parameter] = mapper.parameters;
  if (!ts.isIdentifier(parameter.name)) return undefined;
  const parameterName = parameter.name.text;
  let contentFree = true;
  const inspect = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === parameterName) contentFree = false;
    ts.forEachChild(node, inspect);
  };
  mapper.body.forEachChild(inspect);
  return contentFree ? mapper : undefined;
}

function isStatusOnlyKeepAliveFailure(value: string): boolean {
  const source = ts.createSourceFile('legacy-keepalive-worker.ts', value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const mapper = contentFreeKeepAliveMapper(source);
  if (hasParseDiagnostics(source) || !mapper?.name) return false;
  const catches: ts.CatchClause[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCatchClause(node)) catches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (catches.length !== 1) return false;
  const runners = source.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === 'runLegacyKeepAlive');
  if (runners.length !== 1 || !runners[0].body || !hasExactParameters(runners[0].parameters, ['env', 'scheduledTime']) || runners[0].body.statements.length !== 2) return false;
  const [earlyReturn, guardedFetch] = runners[0].body.statements;
  if (!ts.isIfStatement(earlyReturn) || earlyReturn.elseStatement || !ts.isReturnStatement(earlyReturn.thenStatement) || earlyReturn.thenStatement.expression
    || !ts.isBinaryExpression(earlyReturn.expression) || earlyReturn.expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
    || !ts.isPropertyAccessExpression(earlyReturn.expression.left) || earlyReturn.expression.left.questionDotToken || !ts.isIdentifier(earlyReturn.expression.left.expression) || earlyReturn.expression.left.expression.text !== 'env'
    || earlyReturn.expression.left.name.text !== 'STATE_AUTHORITY_MODE' || !ts.isStringLiteral(earlyReturn.expression.right) || earlyReturn.expression.right.text !== 'cloudflare') return false;
  if (!ts.isTryStatement(guardedFetch) || guardedFetch.finallyBlock || !guardedFetch.catchClause || guardedFetch.catchClause !== catches[0] || guardedFetch.tryBlock.statements.length !== 2) return false;
  const [responseDeclaration, nonOkBranch] = guardedFetch.tryBlock.statements;
  if (!ts.isVariableStatement(responseDeclaration) || responseDeclaration.declarationList.declarations.length !== 1) return false;
  const response = responseDeclaration.declarationList.declarations[0];
  if (!ts.isIdentifier(response.name) || !response.initializer || !ts.isAwaitExpression(response.initializer) || !ts.isCallExpression(response.initializer.expression)
    || !ts.isIdentifier(response.initializer.expression.expression) || response.initializer.expression.expression.text !== 'fetch') return false;
  const fetchCallee = response.initializer.expression.expression;
  let exactFetchUse = true;
  const inspectFetchUse = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'fetch') exactFetchUse &&= node === fetchCallee;
    ts.forEachChild(node, inspectFetchUse);
  };
  inspectFetchUse(source);
  if (!exactFetchUse) return false;
  const isEnvProperty = (node: ts.Expression, name: string): boolean => ts.isPropertyAccessExpression(node) && !node.questionDotToken
    && ts.isIdentifier(node.expression) && node.expression.text === 'env' && node.name.text === name;
  const fetchCall = response.initializer.expression;
  if (fetchCall.questionDotToken || fetchCall.arguments.length !== 2 || !ts.isTemplateExpression(fetchCall.arguments[0])) return false;
  const url = fetchCall.arguments[0];
  if (url.head.text !== '' || url.templateSpans.length !== 2 || !isEnvProperty(url.templateSpans[0].expression, 'KV_REST_API_URL')
    || url.templateSpans[0].literal.text !== '/set/keep-alive/' || !ts.isIdentifier(url.templateSpans[1].expression) || url.templateSpans[1].expression.text !== 'scheduledTime'
    || url.templateSpans[1].literal.text !== '?EX=172800' || !ts.isObjectLiteralExpression(fetchCall.arguments[1]) || fetchCall.arguments[1].properties.length !== 2) return false;
  const [method, headers] = fetchCall.arguments[1].properties;
  if (!ts.isPropertyAssignment(method) || !ts.isIdentifier(method.name) || method.name.text !== 'method' || !ts.isStringLiteral(method.initializer) || method.initializer.text !== 'POST'
    || !ts.isPropertyAssignment(headers) || !ts.isIdentifier(headers.name) || headers.name.text !== 'headers' || !ts.isObjectLiteralExpression(headers.initializer) || headers.initializer.properties.length !== 1) return false;
  const [authorization] = headers.initializer.properties;
  if (!ts.isPropertyAssignment(authorization) || !ts.isIdentifier(authorization.name) || authorization.name.text !== 'Authorization' || !ts.isTemplateExpression(authorization.initializer)
    || authorization.initializer.head.text !== 'Bearer ' || authorization.initializer.templateSpans.length !== 1 || !isEnvProperty(authorization.initializer.templateSpans[0].expression, 'KV_REST_API_TOKEN')
    || authorization.initializer.templateSpans[0].literal.text !== '') return false;
  if (!ts.isIfStatement(nonOkBranch) || nonOkBranch.elseStatement || !ts.isPrefixUnaryExpression(nonOkBranch.expression)
    || nonOkBranch.expression.operator !== ts.SyntaxKind.ExclamationToken || !ts.isPropertyAccessExpression(nonOkBranch.expression.operand)
    || nonOkBranch.expression.operand.questionDotToken || !ts.isIdentifier(nonOkBranch.expression.operand.expression) || nonOkBranch.expression.operand.expression.text !== response.name.text
    || nonOkBranch.expression.operand.name.text !== 'ok' || !ts.isReturnStatement(nonOkBranch.thenStatement) || !nonOkBranch.thenStatement.expression
    || !ts.isCallExpression(nonOkBranch.thenStatement.expression)) return false;
  const nonOkCall = nonOkBranch.thenStatement.expression;
  if (nonOkCall.questionDotToken || !ts.isIdentifier(nonOkCall.expression) || nonOkCall.expression.text !== 'mapKeepAliveFailure' || nonOkCall.arguments.length !== 1
    || !ts.isIdentifier(nonOkCall.arguments[0]) || nonOkCall.arguments[0].text !== 'undefined') return false;
  const [caught] = catches;
  if (!caught.variableDeclaration || !ts.isIdentifier(caught.variableDeclaration.name) || caught.block.statements.length !== 1) return false;
  const returned = caught.block.statements[0];
  if (!ts.isReturnStatement(returned) || !returned.expression || !ts.isCallExpression(returned.expression)) return false;
  const call = returned.expression;
  if (call.questionDotToken || !ts.isIdentifier(call.expression) || call.expression.text !== 'mapKeepAliveFailure' || call.arguments.length !== 1) return false;
  const [argument] = call.arguments;
  if (!ts.isIdentifier(argument) || argument.text !== caught.variableDeclaration.name.text) return false;
  let validUses = true;
  const inspectUse = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === caught.variableDeclaration!.name.getText(source)) {
      validUses &&= node === argument && node.parent === call && call.parent === returned;
    }
    ts.forEachChild(node, inspectUse);
  };
  inspectUse(caught.block);
  let exactMapperUses = true;
  const inspectMapperUse = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'mapKeepAliveFailure') exactMapperUses &&= node === mapper.name || node === nonOkCall.expression || node === call.expression;
    ts.forEachChild(node, inspectMapperUse);
  };
  inspectMapperUse(source);
  return validUses && exactMapperUses;
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
import { admitEdgeRequest } from '../src/platform/admission';
import { cloudflareTrustedEdgeAddress } from '../src/platform/identity';
export { DailyCounter } from '../src/platform/cloudflare/daily-counter';
export { IdentityDayPolicy } from '../src/platform/cloudflare/identity-day-policy';
export { ResolverRequestAuthority } from '../src/platform/cloudflare/resolver-request-authority';
export { OwnerBudgetAuthority } from '../src/platform/cloudflare/owner-budget-authority';
export { ProviderRequestAuthority } from '../src/platform/cloudflare/provider-request-authority';
const PRIVATE_PROVIDER_PATHS = new Set([
  '/api/scan',
  '/api/resolve-timezone',
  '/api/summarize',
  '/api/provider-status',
]);
type PrivateCloudflareEnv = CloudflareEnv & Readonly<{
  STATE_AUTHORITY_MODE?: string;
  PROVIDER_POLICY_VERSION?: string;
  PROVIDER_REQUEST_HMAC_CURRENT_VERSION?: string;
  PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION?: string;
  OPENROUTER_OWNER_KEY?: string;
  PROVIDER_REQUEST_HMAC_CURRENT?: string;
  PROVIDER_REQUEST_HMAC_PREVIOUS?: string;
  OWNER_BUDGET_AUTHORITY?: unknown;
  PROVIDER_REQUEST_AUTHORITY?: unknown;
}>;
type ExportedHandler<Env> = Readonly<{
  fetch(request: Request, env: Env, ctx: unknown): Response | Promise<Response>;
}>;
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function privateProviderConfigurationAvailable(env: PrivateCloudflareEnv): boolean {
  const hasPreviousKey = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS);
  const hasPreviousVersion = nonempty(env.PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION);
  return env.STATE_AUTHORITY_MODE === 'cloudflare'
    && env.PROVIDER_POLICY_VERSION === 'owner-v1'
    && env.PROVIDER_REQUEST_HMAC_CURRENT_VERSION === 'c1-b-current-v1'
    && nonempty(env.OPENROUTER_OWNER_KEY)
    && nonempty(env.PROVIDER_REQUEST_HMAC_CURRENT)
    && Boolean(env.OWNER_BUDGET_AUTHORITY)
    && Boolean(env.PROVIDER_REQUEST_AUTHORITY)
    && hasPreviousKey === hasPreviousVersion;
}
function providerStateUnavailable(): Response {
  return Response.json(
    { error: 'Provider state unavailable.', code: 'provider_state_unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
export default {
  async fetch(request: Request, env: PrivateCloudflareEnv, ctx: unknown) {
    const admitted = await admitEdgeRequest(request, env, ctx, cloudflareTrustedEdgeAddress);
    if (admitted.status === 'failure') return admitted.response;
    if (PRIVATE_PROVIDER_PATHS.has(new URL(admitted.request.url).pathname)
      && !privateProviderConfigurationAvailable(env)) return providerStateUnavailable();
    return handler.fetch(admitted.request, env, ctx);
  },
} satisfies ExportedHandler<PrivateCloudflareEnv>;
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
            OPENROUTER_OWNER_KEY: 'deliberately-invalid-synthetic-owner-key',
            PROVIDER_REQUEST_HMAC_CURRENT: 'synthetic-c1-b-request-shape-key',
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
        'test/worker/owner-budget-authority.integration.test.ts',
        'test/worker/provider-request-authority.integration.test.ts',
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
const EXACT_KEEPALIVE_CONFIG = {
  $schema: 'node_modules/wrangler/config-schema.json',
  name: 'event-every-legacy-keepalive-private',
  main: 'cloudflare/legacy-keepalive-worker.ts',
  compatibility_date: '2026-08-02',
  compatibility_flags: ['nodejs_compat'],
  workers_dev: false,
  preview_urls: false,
  vars: {
    KEEPALIVE_DEPLOYMENT_DISABLED: '1',
    STATE_AUTHORITY_MODE: 'legacy',
    KV_REST_API_URL: '',
    KV_REST_API_TOKEN: '',
  },
};
const EXACT_KEEPALIVE_VITEST = `
import { defineConfig } from 'vitest/config';
export default defineConfig(async () => {
  const { cloudflareTest } = await import('@cloudflare/vitest-pool-workers');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './cloudflare/legacy-keepalive-wrangler.jsonc' },
        miniflare: {
          bindings: {
            KV_REST_API_URL: 'http://127.0.0.1:8799',
            KV_REST_API_TOKEN: 'synthetic-c1-a-token',
          },
        },
      }),
    ],
    test: {
      include: [
        'test/worker/legacy-keepalive.integration.test.ts',
        'test/worker/deny-egress.integration.test.ts',
      ],
      setupFiles: ['./test/worker/deny-egress.setup.ts'],
    },
  };
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
  const scriptsWithoutCurrentC1BMutationProof = Object.fromEntries(
    Object.entries(packageJson.scripts ?? {}).filter(([name, value]) => (
      name !== 'verify:c1:b:mutations' || value !== C1_B_MUTATION_SCRIPT
    )),
  );
  if (OBSOLETE_TASK_11_EVIDENCE.test(JSON.stringify(scriptsWithoutCurrentC1BMutationProof))
    || OBSOLETE_TASK_11_EVIDENCE.test(read(root, 'scripts/run-c1-a-offline.ts'))) fail('obsolete Task 11 evidence');
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
  const envExample = read(root, '.env.example');
  const envAssignments = envExample.split(/\r?\n/).filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line));
  exact(envAssignments, [
    'OPENROUTER_OWNER_KEY=',
    'PROVIDER_REQUEST_HMAC_CURRENT=',
    'PROVIDER_REQUEST_HMAC_PREVIOUS=',
  ], '.env.example');
  if (envExample.split(/\r?\n/).some((line) => CREDENTIAL_ASSIGNMENT.test(line))
    || /OPENROUTER_(?:COMMUNITY_KEY|API_KEY|BASE_URL)|(?:SUMMARY|TIMEZONE)_MODEL|KV_REST|UPSTASH|RESEND|WAITLIST/i.test(envExample)
    || !/real values are inputs to the later deployment/i.test(envExample)) fail('.env.example');
  if (existsSync(path.join(root, '.npmrc'))) fail('registry auth');
  const bunfig = path.join(root, 'bunfig.toml');
  if (existsSync(bunfig) && /(?:auth|token|registry)/i.test(readFileSync(bunfig, 'utf8'))) fail('registry auth');

  const openNext = read(root, 'open-next.config.ts').trim();
  if (openNext !== "import { defineCloudflareConfig } from '@opennextjs/cloudflare';\n\nexport default defineCloudflareConfig();") fail('open-next.config.ts');
  exactExecutable(root, 'next.config.js', EXACT_NEXT_CONFIG);

  const worker = read(root, 'cloudflare/app-worker.ts');
  if (/\b(?:scheduled|durable_objects)\b|KV_REST|upstash/i.test(worker)) fail('cloudflare/app-worker exports');
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
  if (Array.isArray(wrangler.services) && wrangler.services.some((service) => typeof service === 'object' && service !== null && (service as { service?: unknown }).service === 'event-every-legacy-keepalive-private')) fail('wrangler private keepalive service');
  exact(wrangler.services, [{ binding: 'WORKER_SELF_REFERENCE', service: 'event-every' }], 'wrangler.services');
  exact(wrangler.d1_databases, [{ binding: 'EVENT_EVERY_DB', database_name: 'event-every-local-disabled', database_id: '11111111-1111-4111-8111-111111111111' }], 'wrangler.d1_databases');
  exact(wrangler.durable_objects, { bindings: [
    { name: 'IDENTITY_DAY_POLICY', class_name: 'IdentityDayPolicy' },
    { name: 'RESOLVER_REQUEST_AUTHORITY', class_name: 'ResolverRequestAuthority' },
    { name: 'RESOLVER_DAILY_COUNTER', class_name: 'DailyCounter' },
    { name: 'OWNER_BUDGET_AUTHORITY', class_name: 'OwnerBudgetAuthority' },
    { name: 'PROVIDER_REQUEST_AUTHORITY', class_name: 'ProviderRequestAuthority' },
  ] }, 'wrangler.durable_objects');
  exact(wrangler.migrations, [
    { tag: 'c1-a-v1', new_sqlite_classes: ['IdentityDayPolicy', 'ResolverRequestAuthority', 'DailyCounter'] },
    { tag: 'c1-b-budget-v1', new_sqlite_classes: ['OwnerBudgetAuthority'] },
    { tag: 'c1-b-request-v1', new_sqlite_classes: ['ProviderRequestAuthority'] },
  ], 'wrangler.migrations');
  if ('routes' in wrangler || 'triggers' in wrangler || wrangler.remote === true) fail('wrangler deployment');
  exact(wrangler.vars, {
    C1_DEPLOYMENT_DISABLED: '1', STATE_AUTHORITY_MODE: 'cloudflare', IDENTITY_KEY_CURRENT_VERSION: 'local-v1', IDENTITY_KEY_NEXT_VERSION: '', IDENTITY_KEY_ACTIVATES_AT: '', IDENTITY_KEY_SCHEDULE_DIGEST: 'local-v1-no-rotation', PROVIDER_POLICY_VERSION: 'owner-v1', PROVIDER_REQUEST_HMAC_CURRENT_VERSION: 'c1-b-current-v1', PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION: '',
  }, 'wrangler.vars');

  const keepalive = readWranglerConfig(root, 'cloudflare/legacy-keepalive-wrangler.jsonc');
  if ('routes' in keepalive || 'triggers' in keepalive || 'services' in keepalive || keepalive.remote === true) fail('legacy keepalive deployment');
  exact(keepalive, EXACT_KEEPALIVE_CONFIG, 'legacy keepalive wrangler');
  if (!read(root, 'cloudflare/legacy-keepalive-wrangler.jsonc').includes('// Future P1 cron: 0 0 * * * (disabled until C1-A deployment controls are lifted).')) fail('legacy keepalive cron comment');
  if (/KV_REST|upstash/i.test(JSON.stringify(wrangler))) fail('wrangler keepalive capability');
  const keepaliveWorker = read(root, 'cloudflare/legacy-keepalive-worker.ts');
  if (!isScheduledOnlyDefaultWorker(keepaliveWorker)) fail('legacy keepalive worker');
  if (!keepaliveWorker.includes("if (env.STATE_AUTHORITY_MODE === 'cloudflare') return;")) fail('legacy keepalive cloudflare isolation');
  if (!isStatusOnlyKeepAliveFailure(keepaliveWorker)) fail('legacy keepalive status-only');
  const keepaliveTypes = read(root, 'cloudflare/legacy-keepalive-configuration.d.ts');
  for (const binding of ['KEEPALIVE_DEPLOYMENT_DISABLED', 'STATE_AUTHORITY_MODE', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) if (!keepaliveTypes.includes(binding)) fail('legacy keepalive types');
  exactExecutable(root, 'vitest.config.keepalive-workers.ts', EXACT_KEEPALIVE_VITEST, 'legacy keepalive vitest');

  exactExecutable(root, 'vitest.config.workers.ts', EXACT_WORKERS_CONFIG, 'vitest.config.workers remote');
  const generatedTypes = read(root, 'worker-configuration.d.ts');
  for (const binding of ['EVENT_EVERY_DB', 'ASSETS', 'C1_DEPLOYMENT_DISABLED', 'STATE_AUTHORITY_MODE', 'IDENTITY_KEY_CURRENT_VERSION', 'IDENTITY_KEY_NEXT_VERSION', 'IDENTITY_KEY_ACTIVATES_AT', 'IDENTITY_KEY_SCHEDULE_DIGEST', 'PROVIDER_POLICY_VERSION', 'PROVIDER_REQUEST_HMAC_CURRENT_VERSION', 'PROVIDER_REQUEST_HMAC_PREVIOUS_VERSION', 'IDENTITY_HMAC_CURRENT', 'IDENTITY_HMAC_NEXT', 'RESOLVER_CAPABILITY_HMAC', 'OPENROUTER_OWNER_KEY', 'PROVIDER_REQUEST_HMAC_CURRENT', 'PROVIDER_REQUEST_HMAC_PREVIOUS', 'IDENTITY_DAY_POLICY', 'RESOLVER_REQUEST_AUTHORITY', 'RESOLVER_DAILY_COUNTER', 'OWNER_BUDGET_AUTHORITY', 'PROVIDER_REQUEST_AUTHORITY', 'WORKER_SELF_REFERENCE']) if (!generatedTypes.includes(binding)) fail('worker-configuration.d.ts');
  for (const declaration of ['OPENROUTER_OWNER_KEY: string;', 'PROVIDER_REQUEST_HMAC_CURRENT: string;', 'PROVIDER_REQUEST_HMAC_PREVIOUS?: string;']) if (!generatedTypes.includes(declaration)) fail('worker-configuration.d.ts');
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
  console.log('c1-a config: Task 6 resolver boundary accepted');
}
