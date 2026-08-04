import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createE1OfflineEnvironment } from './run-e1-offline';

const PORT = 3794;
const TEMP_PREFIX = '/private/tmp/e1-t8-focus.';
const TASK8_PATHS = new Set([
  'community-limit.spec.ts', 'event-extraction.spec.ts', 'recent-input.spec.ts',
  'timezone-resolution.spec.ts', 'url-scrape.spec.ts', 'scanner-product-loop.spec.ts',
  'calendar-event-regression.spec.ts',
]);

const RETIRED_PATTERN_TOKEN_PARTS = [
  ['VALID_L_', 'PATTERNS'],
  ['AUTH_COOKIE_', 'NAME'],
  ['AUTH_', 'SECRET'],
  ['generateAuth', 'Token'],
  ['verifyAuth', 'Token'],
  ['Pattern', 'Lock'],
  ['?', 'unlock'],
  ['NEXT_PUBLIC_DISABLE_', 'AUTH'],
] as const;

export function assertPatternAdminRetired(sources: Readonly<Record<string, string>>): void {
  for (const [file, source] of Object.entries(sources)) {
    for (const parts of RETIRED_PATTERN_TOKEN_PARTS) {
      const token = parts.join('');
      if (source.includes(token)) throw new Error(`retired pattern token remains in ${file}`);
    }
  }
}

export function assertCommunityKeySourceGuard(source: string): void {
  const signature = 'export function getLlmKey';
  const start = source.indexOf(signature);
  const openBrace = start === -1 ? -1 : source.indexOf('{', start + signature.length);
  if (start === -1 || openBrace === -1) throw new Error('community-key source region could not be identified');

  let depth = 0;
  let quote: 'single' | 'double' | 'template' | undefined;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  let end = -1;
  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if ((quote === 'single' && character === "'") || (quote === 'double' && character === '"') || (quote === 'template' && character === '`')) quote = undefined;
      continue;
    }
    if (character === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (character === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (character === "'") { quote = 'single'; continue; }
    if (character === '"') { quote = 'double'; continue; }
    if (character === '`') { quote = 'template'; continue; }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) { end = index + 1; break; }
  }
  if (end === -1 || quote || blockComment) throw new Error('community-key source region could not be identified');

  const adminKeyName = ['OPENROUTER', '_API_KEY'].join('');
  if (source.slice(start, end).includes(adminKeyName)) throw new Error('community-key source region contains the admin key name');
}

type Project = 'chromium' | 'webkit';
type DiscoveryScope = 'task8' | 'complete';
type ConfigTexts = { playwright: string; next: string; tsconfig: string };
type ConfigHashes = Record<keyof ConfigTexts, string>;
type Environment = Record<string, string | undefined>;

export type E1FocusedArguments =
  | { kind: 'focused'; listOnly: boolean; tail: [string, '--project=chromium', '--workers=1', '--grep', string] }
  | { kind: 'discovery'; listOnly: boolean; projects: Project[]; scope: DiscoveryScope };

export type InvocationPaths = {
  tempDirectory: string;
  suffix: string;
  distDirectory: string;
  resultsDirectory: string;
  reportDirectory: string;
};

export type ProcessHandle = { pid: number; kill(signal?: number | NodeJS.Signals): void; exited: Promise<unknown> };
type ExitStatus = 'settled' | 'failed' | 'timeout';

export function parseE1FocusedArguments(argv: string[]): E1FocusedArguments {
  const separator = argv.indexOf('--');
  const before = separator === -1 ? argv : argv.slice(0, separator);
  const tail = separator === -1 ? [] : argv.slice(separator + 1);
  const listOnly = before.filter((argument) => argument === '--list').length === 1;
  if (before.some((argument) => argument !== '--list' && argument !== '--task8-subset' && !argument.startsWith('--projects='))) throw new Error('Only --list, --task8-subset, and --projects=… are accepted before --.');
  if (before.filter((argument) => argument === '--list').length > 1 || before.filter((argument) => argument === '--task8-subset').length > 1) throw new Error('Repeated launcher flags are not accepted.');

  if (separator !== -1) {
    if (before.some((argument) => argument !== '--list')) throw new Error('Focused tails cannot select discovery projects or scope.');
    if (tail.length !== 5) throw new Error('Focused mode accepts exactly five ledger argv tokens.');
    const [specPath, project, workers, grepFlag, title] = tail;
    if (!TASK8_PATHS.has(path.basename(specPath)) || specPath !== `e2e/${path.basename(specPath)}`) throw new Error('Focused mode requires one authorized Task 8 E2E path.');
    if (project !== '--project=chromium' || workers !== '--workers=1' || grepFlag !== '--grep' || !title.endsWith('$')) throw new Error('Focused mode requires literal --project=chromium, --workers=1, --grep, and an end-anchored title.');
    return { kind: 'focused', listOnly, tail: [specPath, project, workers, grepFlag, title] };
  }

  if (tail.length !== 0) throw new Error('Discovery mode does not accept a ledger argv tail.');
  const projectArgs = before.filter((argument) => argument.startsWith('--projects='));
  if (projectArgs.length !== 1) throw new Error('Discovery mode requires exactly one --projects selection.');
  const value = projectArgs[0].slice('--projects='.length);
  if (!['chromium', 'webkit', 'chromium,webkit'].includes(value)) throw new Error('Discovery projects must be chromium, webkit, or chromium,webkit.');
  return { kind: 'discovery', listOnly, projects: value.split(',') as Project[], scope: before.includes('--task8-subset') ? 'task8' : 'complete' };
}

function listedLines(output: string, project: Project): string[] { return output.split(/\r?\n/).filter((line) => line.includes(`[${project}]`)); }
export function validateFocusedListing(output: string): number {
  const lines = listedLines(output, 'chromium');
  if (lines.length !== 1 || output.split(/\r?\n/).some((line) => line.includes('[webkit]'))) throw new Error('Focused preflight must list exactly one Chromium title.');
  return 1;
}
function pathFromListLine(line: string): string | undefined {
  return line.match(/›\s+(?:e2e\/)?([^:\s]+\.spec\.ts):/)?.[1];
}
export function validateDiscoveryListing(output: string, project: Project, scope: DiscoveryScope): { titles: number; paths: number } {
  const lines = listedLines(output, project);
  const paths = new Set(lines.map(pathFromListLine).filter((value): value is string => Boolean(value)));
  const expected = new Set(TASK8_PATHS);
  const titleCount = 56;
  if (lines.length !== titleCount || paths.size !== expected.size || [...paths].some((file) => !expected.has(file)) || [...expected].some((file) => !paths.has(file))) {
    throw new Error(
      `Expected ${titleCount} ${project} titles across exact ${scope} paths; observed ${lines.length} title(s) across ${paths.size} path(s): ${[...paths].sort().join(', ') || '(none)'}.`,
    );
  }
  return { titles: lines.length, paths: paths.size };
}

export function deriveInvocationPaths(tempDirectory: string, cwd = process.cwd()): InvocationPaths {
  if (!tempDirectory.startsWith(TEMP_PREFIX) || path.dirname(tempDirectory) !== '/private/tmp') throw new Error('mktemp returned an unowned path.');
  const suffix = tempDirectory.slice(TEMP_PREFIX.length);
  if (!/^[A-Za-z0-9]+$/.test(suffix)) throw new Error('mktemp suffix is invalid.');
  return { tempDirectory, suffix, distDirectory: path.join(cwd, `.next-e1-t8-focus-${suffix}`), resultsDirectory: path.join(cwd, `test-results-e1-t8-focus-${suffix}`), reportDirectory: path.join(cwd, `playwright-report-e1-t8-focus-${suffix}`) };
}

export function authorizeInvocationOutputs(paths: InvocationPaths, exists: (file: string) => boolean): InvocationPaths {
  const collisions = [paths.distDirectory, paths.resultsDirectory, paths.reportDirectory].filter(exists);
  if (collisions.length > 0) throw new Error(`Invocation-owned outputs already exist:\n${collisions.join('\n')}`);
  return paths;
}

export function hashText(text: string): string { return createHash('sha256').update(text).digest('hex'); }
export function createFocusedEnvironment(environment: Environment = process.env): Environment {
  return createE1OfflineEnvironment(environment);
}
function replaceExactly(source: string, oldText: string, newText: string, label: string): string {
  if (source.split(oldText).length !== 2) throw new Error(`Expected exactly one ${label} literal.`);
  return source.replace(oldText, newText);
}
const WEB_SERVER = `  webServer: isProd\n    ? undefined\n    : {\n        command: devCommand,\n        url: localUrl,\n        reuseExistingServer: !isOffline && !process.env.CI,\n        timeout: 120000,\n      },`;
export function forwardConfigPatches(configs: ConfigTexts, paths: InvocationPaths): ConfigTexts {
  let playwright = replaceExactly(configs.playwright, "const localUrl = 'http://localhost:3777';", "const localUrl = 'http://localhost:3794';", 'local URL');
  playwright = replaceExactly(playwright, 'node_modules/next/dist/bin/next dev -p 3777', 'node_modules/next/dist/bin/next dev -p 3794', 'offline dev port');
  playwright = replaceExactly(playwright, "  reporter: 'html',", `  outputDir: 'test-results-e1-t8-focus-${paths.suffix}',\n  reporter: [['html', { outputFolder: 'playwright-report-e1-t8-focus-${paths.suffix}', open: 'never' }]],`, 'reporter');
  playwright = replaceExactly(playwright, WEB_SERVER, '  webServer: undefined,', 'webServer');
  const next = replaceExactly(configs.next, 'const nextConfig = {', `const nextConfig = {\n  distDir: '.next-e1-t8-focus-${paths.suffix}',`, 'Next config object');
  return { playwright, next, tsconfig: configs.tsconfig };
}
export function inverseConfigPatches(configs: ConfigTexts, paths: InvocationPaths): ConfigTexts {
  return { playwright: inversePlaywrightConfig(configs.playwright, paths), next: inverseNextConfig(configs.next, paths), tsconfig: configs.tsconfig };
}
function inversePlaywrightConfig(source: string, paths: InvocationPaths): string {
  let playwright = replaceExactly(source, "const localUrl = 'http://localhost:3794';", "const localUrl = 'http://localhost:3777';", 'inverse local URL');
  playwright = replaceExactly(playwright, 'node_modules/next/dist/bin/next dev -p 3794', 'node_modules/next/dist/bin/next dev -p 3777', 'inverse offline dev port');
  playwright = replaceExactly(playwright, `  outputDir: 'test-results-e1-t8-focus-${paths.suffix}',\n  reporter: [['html', { outputFolder: 'playwright-report-e1-t8-focus-${paths.suffix}', open: 'never' }]],`, "  reporter: 'html',", 'inverse reporter');
  return replaceExactly(playwright, '  webServer: undefined,', WEB_SERVER, 'inverse webServer');
}
function inverseNextConfig(source: string, paths: InvocationPaths): string { return replaceExactly(source, `const nextConfig = {\n  distDir: '.next-e1-t8-focus-${paths.suffix}',`, 'const nextConfig = {', 'inverse Next config'); }
export function inverseTsconfigMutation(source: string, pristine: string, paths: InvocationPaths): string {
  if (source === pristine) return pristine;
  let parsed: { include?: unknown };
  try { parsed = JSON.parse(pristine) as { include?: unknown }; } catch { throw new Error('Pristine tsconfig is not valid JSON.'); }
  if (!Array.isArray(parsed.include) || parsed.include.some((entry) => typeof entry !== 'string')) throw new Error('Pristine tsconfig include array was not recognized.');
  const generatedInclude = `${path.basename(paths.distDirectory)}/types/**/*.ts`;
  if (parsed.include.includes(generatedInclude)) throw new Error('Pristine tsconfig already contains the invocation include.');
  parsed.include = [...parsed.include].sort().concat(generatedInclude);
  const expected = `${JSON.stringify(parsed, null, 2)}\n`;
  if (source !== expected) throw new Error('Generated tsconfig mutation did not match the literal Next shape.');
  return pristine;
}
export function restoreConfigTexts(configs: ConfigTexts, hashes: ConfigHashes, paths: InvocationPaths): ConfigTexts {
  const restored = inverseConfigPatches(configs, paths);
  for (const name of Object.keys(hashes) as (keyof ConfigTexts)[]) if (hashText(restored[name]) !== hashes[name]) throw new Error(`Configuration hash mismatch after literal inverse: ${name}`);
  return restored;
}
export function removeOwnedPaths(paths: InvocationPaths, outputs: InvocationPaths | undefined, exists: (file: string) => boolean, remove: (file: string) => void): void {
  const targets = [...(outputs ? [outputs.distDirectory, outputs.resultsDirectory, outputs.reportDirectory] : []), paths.tempDirectory];
  const failures: Error[] = [];
  for (const file of targets) {
    if (!exists(file)) continue;
    try { remove(file); } catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))); }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'Owned path removal failed.');
}
export function renderGateError(error: unknown): string {
  if (error instanceof AggregateError) return [error.message, ...error.errors.map((cause) => renderGateError(cause).split('\n').map((line) => `- ${line.replace(/^- /, '')}`).join('\n'))].join('\n');
  return error instanceof Error ? error.message : 'Unknown runner failure.';
}

export type TerminationSentinel = { terminate(signal: NodeJS.Signals): void; isTerminated(): boolean; check(): void; wait(): Promise<NodeJS.Signals> };
export function createTerminationSentinel(): TerminationSentinel {
  let signal: NodeJS.Signals | undefined;
  let resolve!: (value: NodeJS.Signals) => void;
  const waiting = new Promise<NodeJS.Signals>((done) => { resolve = done; });
  return { terminate(value) { if (!signal) { signal = value; resolve(value); } }, isTerminated: () => Boolean(signal), check() { if (signal) throw new Error(`Received ${signal}.`); }, wait: () => waiting };
}

export type TeardownResult = { events: string[]; settled: boolean; failures: Error[] };
export async function teardownRecordedChildren(children: { playwright?: ProcessHandle; next?: ProcessHandle }, waitForExit: (child: ProcessHandle, timeoutMs: number) => Promise<ExitStatus> = defaultWaitForExit): Promise<TeardownResult> {
  const events: string[] = []; const failures: Error[] = []; let settled = true;
  for (const [name, child] of [['playwright', children.playwright], ['next', children.next]] as const) {
    if (!child) { events.push(`skip:${name}`); continue; }
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      try { child.kill(signal); events.push(`kill:${name}:${signal}`); } catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))); }
      const status = await waitForExit(child, 3000);
      events.push(`await:${name}:${status}`);
      if (status === 'settled') break;
      if (status === 'failed') { settled = false; failures.push(new Error(`${name} child exit rejected.`)); break; }
      if (signal === 'SIGKILL') { settled = false; failures.push(new Error(`${name} child remained unsettled after SIGKILL.`)); }
    }
  }
  return { events, settled, failures };
}
async function defaultWaitForExit(child: ProcessHandle, timeoutMs: number): Promise<ExitStatus> {
  return Promise.race([child.exited.then(() => 'settled' as const, () => 'failed' as const), Bun.sleep(timeoutMs).then(() => 'timeout' as const)]);
}

export type LifecycleActions = {
  prePatch(): Promise<void>; startNext(): Promise<void>; waitForNext(): Promise<void>; list(): Promise<void>; run(): Promise<void>;
  cleanup: { children(): Promise<TeardownResult | void>; inverse(): Promise<void>; hash(): Promise<void>; port(): Promise<void>; remove(): Promise<void> };
};
export async function runLifecyclePhases(actions: LifecycleActions, termination: TerminationSentinel): Promise<void> {
  let primary: Error | undefined;
  try {
    termination.check(); await actions.prePatch(); termination.check(); await actions.startNext(); termination.check(); await actions.waitForNext(); termination.check(); await actions.list(); termination.check(); await actions.run(); termination.check();
  } catch (error) { primary = error instanceof Error ? error : new Error(String(error)); }
  const failures = primary ? [primary] : [];
  let childrenSettled = true;
  try { const result = await actions.cleanup.children(); if (result) { failures.push(...result.failures); childrenSettled = result.settled; } } catch (error) { childrenSettled = false; failures.push(error instanceof Error ? error : new Error(String(error))); }
  if (!childrenSettled) {
    failures.push(new Error('Recorded children remain unsettled; configuration restore and owned-path removal were skipped.'));
  } else {
    for (const phase of [actions.cleanup.inverse, actions.cleanup.hash, actions.cleanup.port, actions.cleanup.remove]) {
      try { await phase(); } catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))); }
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'E1 focused runner lifecycle failed.');
}

function runSync(command: string[], env?: Record<string, string | undefined>) { const result = Bun.spawnSync(command, { env, stdout: 'pipe', stderr: 'pipe' }); return { exitCode: result.exitCode ?? 1, stdout: new TextDecoder().decode(result.stdout), stderr: new TextDecoder().decode(result.stderr) }; }
function ensurePortClosed(): void { const result = runSync(['lsof', '-nP', '-iTCP:3794', '-sTCP:LISTEN']); if (result.exitCode === 0 && result.stdout.trim()) throw new Error(`Port ${PORT} is already listening.`); if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(`lsof failed: ${result.stderr.trim()}`); }
function createTempDirectory(): string { const result = runSync(['mktemp', '-d', '/private/tmp/e1-t8-focus.XXXXXX']); const directory = result.stdout.trim(); if (result.exitCode !== 0 || result.stdout !== `${directory}\n` || !existsSync(directory) || readdirSync(directory).length !== 0) throw new Error('mktemp must return one exact empty invocation directory.'); return directory; }
function spawn(command: string[], env: Record<string, string | undefined>, output: 'inherit' | 'pipe' = 'inherit') { const child = Bun.spawn(command, { env, stdout: output, stderr: output }); return { pid: child.pid, kill: (signal?: number | NodeJS.Signals) => child.kill(signal), exited: child.exited, stdout: child.stdout }; }
async function childExitOrSignal(child: ProcessHandle, termination: TerminationSentinel): Promise<unknown> { const result = await Promise.race([child.exited.then((exit) => ({ exit })), termination.wait().then((signal) => ({ signal }))]); if ('signal' in result) throw new Error(`Received ${result.signal}.`); return result.exit; }
async function readChildOutput(stream: ReadableStream<Uint8Array> | null | undefined): Promise<string> { if (!stream) throw new Error('Playwright list output stream was unavailable.'); return new TextDecoder().decode(await new Response(stream).arrayBuffer()); }

export async function runE1Focused(argv = process.argv.slice(2)): Promise<void> {
  const request = parseE1FocusedArguments(argv);
  const environment = createFocusedEnvironment();
  const termination = createTerminationSentinel();
  const onSigint = () => termination.terminate('SIGINT'); const onSigterm = () => termination.terminate('SIGTERM');
  process.on('SIGINT', onSigint); process.on('SIGTERM', onSigterm);
  const files = { playwright: 'playwright.config.ts', next: 'next.config.js', tsconfig: 'tsconfig.json' } as const;
  let paths: InvocationPaths | undefined; let outputs: InvocationPaths | undefined; const children: { playwright?: ProcessHandle; next?: ProcessHandle } = {};
  let snapshots: ConfigTexts | undefined; let hashes: ConfigHashes | undefined;
  try {
    await runLifecyclePhases({
      async prePatch() {
        ensurePortClosed(); paths = deriveInvocationPaths(createTempDirectory()); outputs = authorizeInvocationOutputs(paths, existsSync);
        snapshots = { playwright: readFileSync(files.playwright, 'utf8'), next: readFileSync(files.next, 'utf8'), tsconfig: readFileSync(files.tsconfig, 'utf8') };
        hashes = { playwright: hashText(snapshots.playwright), next: hashText(snapshots.next), tsconfig: hashText(snapshots.tsconfig) };
        const patched = forwardConfigPatches(snapshots, paths); writeFileSync(files.playwright, patched.playwright); writeFileSync(files.next, patched.next);
      },
      async startNext() { children.next = spawn(['node', '--require', environment.E1_OFFLINE_PRELOAD!, 'node_modules/next/dist/bin/next', 'dev', '-p', String(PORT)], environment); },
      async waitForNext() { for (let attempt = 0; attempt < 120; attempt += 1) { termination.check(); try { if ((await fetch(`http://127.0.0.1:${PORT}`, { signal: AbortSignal.timeout(1000) })).status === 200) return; } catch { /* loopback retry */ } await Bun.sleep(500); } throw new Error(`Next did not return loopback HTTP 200 on ${PORT}.`); },
      async list() {
        const projects: Project[] = request.kind === 'focused' ? ['chromium'] : request.projects;
        for (const project of projects) {
          const args = request.kind === 'focused' ? [...request.tail, '--list'] : ['--list', `--project=${project}`, ...[...TASK8_PATHS].map((file) => `e2e/${file}`)];
          const child = spawn(['node', '--require', environment.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', ...args], environment, 'pipe'); children.playwright = child; const exit = await childExitOrSignal(child, termination); const output = await readChildOutput(child.stdout); if (exit !== 0) throw new Error('Playwright list failed.'); children.playwright = undefined;
          if (request.kind === 'focused') validateFocusedListing(output); else validateDiscoveryListing(output, project, request.scope);
        }
      },
      async run() {
        if (request.listOnly) return;
        const projects: Project[] = request.kind === 'focused' ? ['chromium'] : request.projects;
        for (const project of projects) {
          const specs = request.kind === 'focused' ? request.tail : [`--project=${project}`, ...[...TASK8_PATHS].map((file) => `e2e/${file}`)];
          const child = spawn(['node', '--require', environment.E1_OFFLINE_PRELOAD!, 'node_modules/@playwright/test/cli.js', 'test', ...specs], environment); children.playwright = child; const exit = await childExitOrSignal(child, termination); if (exit !== 0) throw new Error(`Playwright failed with exit ${exit}.`); children.playwright = undefined;
        }
      },
      cleanup: {
        async children() { return teardownRecordedChildren(children); },
        async inverse() { if (!snapshots || !paths) return; const failures: Error[] = []; try { writeFileSync(files.playwright, inversePlaywrightConfig(readFileSync(files.playwright, 'utf8'), paths)); } catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))); } try { writeFileSync(files.next, inverseNextConfig(readFileSync(files.next, 'utf8'), paths)); } catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))); } try { writeFileSync(files.tsconfig, inverseTsconfigMutation(readFileSync(files.tsconfig, 'utf8'), snapshots.tsconfig, paths)); } catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))); } if (failures.length === 1) throw failures[0]; if (failures.length > 1) throw new AggregateError(failures, 'Literal inverse failed.'); },
        async hash() { if (!hashes) return; const failures: Error[] = []; for (const [name, file] of Object.entries(files) as [keyof ConfigTexts, string][]) { try { if (hashText(readFileSync(file, 'utf8')) !== hashes[name]) throw new Error(`Configuration hash mismatch after inverse: ${file}`); } catch (error) { failures.push(error instanceof Error ? error : new Error(String(error))); } } if (failures.length === 1) throw failures[0]; if (failures.length > 1) throw new AggregateError(failures, 'Configuration hash verification failed.'); },
        async port() { ensurePortClosed(); },
        async remove() { if (paths) removeOwnedPaths(paths, outputs, existsSync, (file) => rmSync(file, { recursive: true, force: false })); },
      },
    }, termination);
  } finally { process.off('SIGINT', onSigint); process.off('SIGTERM', onSigterm); }
}

if (import.meta.main) runE1Focused().catch((error: unknown) => { console.error(renderGateError(error)); process.exitCode = 1; });
