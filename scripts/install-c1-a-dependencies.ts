import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_NAME, collectNextProductionDotenvNames, assertNoWranglerLocalFiles, type C1AEnvironment } from './run-c1-a-cloudflare';

export type InstallMode = 'add' | 'frozen';

const REGISTRY = 'https://registry.npmjs.org';
const OUTPUT_LIMIT = 64 * 1024;
const LIFECYCLE_OUTPUT = /postinstall|preinstall|prepare|lifecycle/i;
const PACKAGES = {
  '@opennextjs/cloudflare': '1.20.2',
  wrangler: '4.118.0',
  vitest: '4.1.10',
  '@cloudflare/vitest-pool-workers': '0.20.1',
  msw: '2.15.0',
} as const;
const PACKAGE_ARGUMENTS = Object.entries(PACKAGES).map(([name, version]) => `${name}@${version}`);
const CHILD_INJECTION_CONTROLS = [
  'NODE_OPTIONS', 'BUN_OPTIONS', 'BUN_CONFIG_FILE', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE',
  'XDG_CONFIG_HOME',
  'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
] as const;

type FileIdentity = Readonly<{ dev: number; ino: number; mode: number; size: number }>;
type OwnedFiles = Readonly<{ npmrc: string; bunfig: string; npmrcIdentity: FileIdentity; bunfigIdentity: FileIdentity }>;
type OwnedDirectory = Readonly<{
  identity: FileIdentity;
  files?: OwnedFiles;
}>;
const OWNED = new Map<string, OwnedDirectory>();

type Child = Readonly<{
  exited: Promise<number>;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
}>;
type Spawn = (
  argv: readonly string[],
  options: { cwd: string; env: C1AEnvironment; stdout: 'pipe'; stderr: 'pipe'; shell: false },
) => Child;

function errorValue(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function identity(path: string): FileIdentity {
  const stat = lstatSync(path);
  return { dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, size: stat.size };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

export function createOwnedInstallDirectory(base = tmpdir()): string {
  const directory = mkdtempSync(join(base, 'event-every-c1-a-install-'));
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
    throw new Error('c1-a installer: owned directory mode invalid');
  }
  OWNED.set(directory, { identity: identity(directory) });
  return directory;
}

function assertOwned(directory: string): OwnedDirectory {
  const owned = OWNED.get(directory);
  const requiredPrefix = `${resolve(tmpdir(), 'event-every-c1-a-install-')}`;
  if (!owned || !resolve(directory).startsWith(requiredPrefix)) {
    throw new Error('c1-a installer: owned directory required');
  }
  const stat = lstatSync(directory);
  const current = identity(directory);
  if (!stat.isDirectory() || current.mode !== 0o700 || !sameIdentity(current, owned.identity)) {
    throw new Error('c1-a installer: owned directory changed');
  }
  return owned;
}

function writeOwnedFiles(directory: string): OwnedFiles {
  const owned = assertOwned(directory);
  if (owned.files) throw new Error('c1-a installer: owned file collision');
  const npmrc = join(directory, '.npmrc');
  const bunfig = join(directory, '.bunfig.toml');
  if (existsSync(npmrc) || existsSync(bunfig)) throw new Error('c1-a installer: owned file collision');
  writeFileSync(npmrc, '', { flag: 'wx', mode: 0o600 });
  writeFileSync(bunfig, `[install]\nregistry = "${REGISTRY}"\n`, { flag: 'wx', mode: 0o600 });
  const npmrcStat = lstatSync(npmrc);
  const bunfigStat = lstatSync(bunfig);
  if (!npmrcStat.isFile() || !bunfigStat.isFile() || (npmrcStat.mode & 0o777) !== 0o600 || (bunfigStat.mode & 0o777) !== 0o600) {
    throw new Error('c1-a installer: owned file mode invalid');
  }
  const files = { npmrc, bunfig, npmrcIdentity: identity(npmrc), bunfigIdentity: identity(bunfig) };
  OWNED.set(directory, { ...owned, files });
  return files;
}

export function buildInstallInvocation(
  mode: InstallMode,
  sourceEnv: C1AEnvironment,
  dotenvNames: readonly string[],
  ownedDirectory: string,
): { argv: readonly string[]; env: C1AEnvironment } {
  if (mode !== 'add' && mode !== 'frozen') throw new Error('c1-a installer: expected add|frozen');
  const files = writeOwnedFiles(ownedDirectory);
  const env: C1AEnvironment = Object.fromEntries(
    Object.entries(sourceEnv).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  for (const name of new Set([...Object.keys(env), ...dotenvNames])) {
    if (CREDENTIAL_NAME.test(name)) env[name] = '';
  }
  for (const name of Object.keys(env)) {
    if (
      /^npm_.*(?:auth|token).*$/i.test(name)
      || /^(?:bun_auth_token|node_auth_token)$/i.test(name)
      || /registry/i.test(name)
      || CHILD_INJECTION_CONTROLS.some((control) => control.toLowerCase() === name.toLowerCase())
    ) delete env[name];
  }
  env.NPM_CONFIG_USERCONFIG = files.npmrc;
  env.npm_config_userconfig = files.npmrc;
  env.XDG_CONFIG_HOME = ownedDirectory;
  env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  for (const [name, value] of Object.entries(env)) {
    if (CREDENTIAL_NAME.test(name) && value !== '') {
      throw new Error('c1-a installer: credential environment not empty');
    }
  }
  const base = ['bun', '--no-env-file'];
  return {
    argv: mode === 'add'
      ? [...base, 'add', '--registry', REGISTRY, '--ignore-scripts', '--dev', '--exact', ...PACKAGE_ARGUMENTS]
      : [...base, 'install', '--registry', REGISTRY, '--frozen-lockfile', '--ignore-scripts'],
    env,
  };
}

function assertRepositoryAuthFree(root: string): void {
  if (existsSync(join(root, '.npmrc'))) throw new Error('c1-a installer: repository .npmrc present');
  const bunfig = join(root, 'bunfig.toml');
  if (existsSync(bunfig) && /(?:auth|token|registry)/i.test(readFileSync(bunfig, 'utf8'))) {
    throw new Error('c1-a installer: repository bunfig auth or registry present');
  }
}

class JsoncParser {
  private index = 0;
  constructor(private readonly source: string) {}

  parse(): unknown {
    const value = this.value();
    this.space();
    if (this.index !== this.source.length) throw new Error('trailing content');
    return value;
  }

  private space(): void {
    while (this.index < this.source.length) {
      if (/\s/.test(this.source[this.index]!)) { this.index += 1; continue; }
      if (this.source.startsWith('//', this.index)) {
        this.index += 2;
        while (this.index < this.source.length && this.source[this.index] !== '\n') this.index += 1;
        continue;
      }
      if (this.source.startsWith('/*', this.index)) {
        const end = this.source.indexOf('*/', this.index + 2);
        if (end < 0) throw new Error('unterminated comment');
        this.index = end + 2;
        continue;
      }
      break;
    }
  }

  private value(): unknown {
    this.space();
    const char = this.source[this.index];
    if (char === '{') return this.object();
    if (char === '[') return this.array();
    if (char === '"') return this.string();
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (this.source.startsWith(literal, this.index)) { this.index += literal.length; return value; }
    }
    const number = this.source.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
    if (!number) throw new Error('invalid value');
    this.index += number.length;
    return Number(number);
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const char = this.source[this.index++];
      if (char === '\\') { this.index += 1; continue; }
      if (char === '"') return JSON.parse(this.source.slice(start, this.index)) as string;
      if (char === '\n' || char === '\r') throw new Error('invalid string');
    }
    throw new Error('unterminated string');
  }

  private object(): Record<string, unknown> {
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.index += 1;
    this.space();
    if (this.source[this.index] === '}') { this.index += 1; return output; }
    while (true) {
      this.space();
      if (this.source[this.index] !== '"') throw new Error('object key required');
      const key = this.string();
      if (keys.has(key)) throw new Error('duplicate key');
      keys.add(key);
      this.space();
      if (this.source[this.index++] !== ':') throw new Error('colon required');
      output[key] = this.value();
      this.space();
      const separator = this.source[this.index++];
      if (separator === '}') return output;
      if (separator !== ',') throw new Error('comma required');
      this.space();
      if (this.source[this.index] === '}') { this.index += 1; return output; }
    }
  }

  private array(): unknown[] {
    const output: unknown[] = [];
    this.index += 1;
    this.space();
    if (this.source[this.index] === ']') { this.index += 1; return output; }
    while (true) {
      output.push(this.value());
      this.space();
      const separator = this.source[this.index++];
      if (separator === ']') return output;
      if (separator !== ',') throw new Error('comma required');
      this.space();
      if (this.source[this.index] === ']') { this.index += 1; return output; }
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validSha512(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const encoded = value.match(/^sha512-([A-Za-z0-9+/]{86}==)$/)?.[1];
  if (!encoded) return false;
  const bytes = Buffer.from(encoded, 'base64');
  return bytes.byteLength === 64 && bytes.toString('base64') === encoded;
}

function validRegistryResolution(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 256) return false;
  const separator = value.lastIndexOf('@');
  if (separator < 1) return false;
  const name = value.slice(0, separator);
  const version = value.slice(separator + 1);
  const segment = /^[a-z0-9][a-z0-9._~-]*$/;
  const validName = name.startsWith('@')
    ? (() => {
        const parts = name.slice(1).split('/');
        return parts.length === 2 && parts.every((part) => segment.test(part));
      })()
    : segment.test(name);
  if (!validName || name.length > 214) return false;

  const buildSplit = version.split('+');
  if (buildSplit.length > 2 || (buildSplit.length === 2 && !buildSplit[1])) return false;
  if (buildSplit[1] && !buildSplit[1].split('.').every((part) => /^[0-9A-Za-z-]+$/.test(part))) return false;
  const coreAndPre = buildSplit[0]!;
  const dash = coreAndPre.indexOf('-');
  const core = dash < 0 ? coreAndPre : coreAndPre.slice(0, dash);
  const prerelease = dash < 0 ? undefined : coreAndPre.slice(dash + 1);
  const numeric = /^(?:0|[1-9]\d*)$/;
  if (!core.split('.').every((part) => numeric.test(part)) || core.split('.').length !== 3) return false;
  if (prerelease !== undefined) {
    if (!prerelease) return false;
    for (const part of prerelease.split('.')) {
      if (!/^[0-9A-Za-z-]+$/.test(part)) return false;
      if (/^\d+$/.test(part) && !numeric.test(part)) return false;
    }
  }
  return true;
}

export function validateInstalledLock(root: string): void {
  let parsed: unknown;
  try {
    parsed = new JsoncParser(readFileSync(join(root, 'bun.lock'), 'utf8')).parse();
  } catch {
    throw new Error('c1-a installer: lock validation failed for syntax');
  }
  if (!record(parsed) || parsed.lockfileVersion !== 1 || !record(parsed.workspaces) || !record(parsed.packages)) {
    throw new Error('c1-a installer: lock validation failed for structure');
  }
  const workspace = parsed.workspaces[''];
  if (!record(workspace) || !record(workspace.devDependencies)) {
    throw new Error('c1-a installer: lock validation failed for workspace');
  }
  const production = record(workspace.dependencies) ? workspace.dependencies : Object.create(null) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(parsed.packages)) {
    if (key === '@event-every/scanner') {
      if (
        !Array.isArray(entry)
        || entry.length !== 2
        || entry[0] !== '@event-every/scanner@file:vendor/event-every-scanner'
        || !record(entry[1])
      ) throw new Error('c1-a installer: lock validation failed for registry source');
      continue;
    }
    if (
      !Array.isArray(entry)
      || entry.length !== 4
      || !validRegistryResolution(entry[0])
      || entry[1] !== ''
      || !record(entry[2])
      || !validSha512(entry[3])
    ) throw new Error('c1-a installer: lock validation failed for registry source');
  }
  for (const [name, version] of Object.entries(PACKAGES)) {
    if (workspace.devDependencies[name] !== version || production[name] !== undefined) {
      throw new Error(`c1-a installer: lock validation failed for ${name}`);
    }
    const entry = parsed.packages[name];
    if (
      !Array.isArray(entry)
      || entry.length !== 4
      || entry[0] !== `${name}@${version}`
      || entry[1] !== ''
      || !record(entry[2])
      || !validSha512(entry[3])
    ) throw new Error(`c1-a installer: lock validation failed for ${name}`);
    for (const [key, candidate] of Object.entries(parsed.packages)) {
      if (key !== name && Array.isArray(candidate) && typeof candidate[0] === 'string' && candidate[0].startsWith(`${name}@`)) {
        throw new Error(`c1-a installer: lock validation failed for ${name}`);
      }
    }
  }
}

function trustedDependenciesSource(packageJson: Uint8Array): Uint8Array {
  const source = new TextDecoder().decode(packageJson);
  let index = 0;
  const skip = () => { while (/\s/.test(source[index] ?? '')) index += 1; };
  const stringEnd = (start: number): number => {
    let cursor = start + 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') cursor += 2;
      else if (source[cursor++] === '"') return cursor;
    }
    throw new Error('invalid package.json');
  };
  const valueEnd = (start: number): number => {
    let cursor = start; let depth = 0; let quoted = false;
    while (cursor < source.length) {
      const char = source[cursor];
      if (quoted) {
        if (char === '\\') cursor += 2;
        else { cursor += 1; if (char === '"') quoted = false; }
        continue;
      }
      if (char === '"') { quoted = true; cursor += 1; continue; }
      if (char === '[' || char === '{') depth += 1;
      else if (char === ']' || char === '}') {
        if (depth === 0) return cursor;
        depth -= 1;
      } else if (char === ',' && depth === 0) return cursor;
      cursor += 1;
    }
    return cursor;
  };
  skip();
  if (source[index++] !== '{') throw new Error('invalid package.json');
  let found: Uint8Array | undefined;
  while (index < source.length) {
    skip();
    if (source[index] === '}') break;
    const start = index;
    if (source[index] !== '"') throw new Error('invalid package.json');
    const end = stringEnd(index);
    const key = JSON.parse(source.slice(index, end)) as string;
    index = end; skip();
    if (source[index++] !== ':') throw new Error('invalid package.json');
    skip();
    const finish = valueEnd(index);
    if (key === 'trustedDependencies') {
      if (found) throw new Error('invalid package.json');
      found = packageJson.slice(new TextEncoder().encode(source.slice(0, start)).byteLength, new TextEncoder().encode(source.slice(0, finish)).byteLength);
    }
    index = finish; skip();
    if (source[index] === ',') index += 1;
  }
  return found ?? new Uint8Array();
}

type Captured = Readonly<{ retained: Uint8Array; overflow: boolean; lifecycle: boolean }>;

export function classifyInstallFailure(
  output: string,
  paths?: Readonly<{ ownedBunfig: string; repositoryBunfig: string }>,
): string {
  if (/unknown (?:option|flag)|unrecognized (?:option|flag)|unexpected argument/i.test(output)) return 'cli';
  if (/package|version|manifest/i.test(output) && /not found|no matching|failed to resolve|could not resolve/i.test(output)) return 'package-resolution';
  if (/network|connect|dns|timed? ?out|socket|certificate|tls|fetch/i.test(output)) return 'network';
  if (/permission|access denied|read-only|eacces|eperm/i.test(output)) return 'filesystem';
  if (/lockfile|frozen[- ]?lock/i.test(output)) return 'lock-state';
  if (/config|bunfig|npmrc/i.test(output)) {
    const markers = ['bunfig', 'config', 'expected', 'failed', 'found', 'global', 'invalid', 'load', 'lockfile', 'missing', 'npmrc', 'open', 'parse', 'read', 'registry', 'toml', 'unsupported']
      .filter((marker) => output.toLowerCase().includes(marker));
    const pathMarker = paths
      ? output.includes(paths.ownedBunfig) ? 'owned-bunfig'
        : output.includes(paths.repositoryBunfig) ? 'repository-bunfig'
          : 'unidentified-bunfig'
      : undefined;
    return `configuration[${markers.join(',')}${pathMarker ? `;${pathMarker}` : ''}]`;
  }
  return 'unknown';
}

async function capture(stream: ReadableStream<Uint8Array> | null): Promise<Captured> {
  if (!stream) return { retained: new Uint8Array(), overflow: false, lifecycle: false };
  const reader = stream.getReader();
  const retained: Uint8Array[] = [];
  let retainedBytes = 0; let total = 0; let tail = ''; let lifecycle = false;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (retainedBytes < OUTPUT_LIMIT) {
        const piece = value.slice(0, OUTPUT_LIMIT - retainedBytes);
        retained.push(piece); retainedBytes += piece.byteLength;
      }
      const text = tail + decoder.decode(value, { stream: true });
      if (LIFECYCLE_OUTPUT.test(text)) lifecycle = true;
      tail = text.slice(-32);
    }
    const final = tail + decoder.decode();
    if (LIFECYCLE_OUTPUT.test(final)) lifecycle = true;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(retainedBytes);
  let offset = 0;
  for (const piece of retained) { bytes.set(piece, offset); offset += piece.byteLength; }
  return { retained: bytes, overflow: total > OUTPUT_LIMIT, lifecycle };
}

function zeroAndUnlink(file: string, expected: FileIdentity): Error[] {
  const errors: Error[] = [];
  let descriptor: number | undefined;
  try {
    const before = lstatSync(file);
    const current = identity(file);
    if (!before.isFile() || current.mode !== 0o600 || !sameIdentity(current, expected) || current.size !== expected.size) {
      throw new Error('c1-a installer: owned file changed');
    }
    descriptor = openSync(file, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino || (opened.mode & 0o777) !== 0o600) {
      throw new Error('c1-a installer: owned file changed');
    }
    const zeros = Buffer.alloc(Math.min(4096, Math.max(1, opened.size)));
    for (let offset = 0; offset < opened.size; offset += zeros.byteLength) {
      writeSync(descriptor, zeros, 0, Math.min(zeros.byteLength, opened.size - offset), offset);
    }
    fsyncSync(descriptor);
  } catch (error) {
    errors.push(errorValue(error));
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch (error) { errors.push(errorValue(error)); }
    }
  }
  if (errors.length === 0) {
    try {
      const current = identity(file);
      if (!sameIdentity(current, expected)) throw new Error('c1-a installer: owned file changed');
      unlinkSync(file);
    } catch (error) { errors.push(errorValue(error)); }
  }
  return errors;
}

function cleanup(directory: string): Error[] {
  const errors: Error[] = [];
  const owned = OWNED.get(directory);
  if (!owned) return [new Error('c1-a installer: owned directory required')];
  try {
    const stat = lstatSync(directory);
    const current = identity(directory);
    if (!stat.isDirectory() || current.mode !== 0o700 || !sameIdentity(current, owned.identity)) {
      throw new Error('c1-a installer: owned directory changed');
    }
  } catch (error) {
    errors.push(errorValue(error));
    return errors;
  }
  if (owned.files) {
    errors.push(...zeroAndUnlink(owned.files.npmrc, owned.files.npmrcIdentity));
    errors.push(...zeroAndUnlink(owned.files.bunfig, owned.files.bunfigIdentity));
  }
  try { rmdirSync(directory); OWNED.delete(directory); } catch (error) { errors.push(errorValue(error)); }
  return errors;
}

function defaultSpawn(argv: readonly string[], options: Parameters<Spawn>[1]): Child {
  return Bun.spawn([...argv], { cwd: options.cwd, env: options.env, stdout: options.stdout, stderr: options.stderr }) as unknown as Child;
}

export async function executeInstaller(
  mode: InstallMode,
  root: string,
  sourceEnv: C1AEnvironment,
  spawn: Spawn = defaultSpawn,
): Promise<{ summary: string }> {
  assertNoWranglerLocalFiles(root);
  assertRepositoryAuthFree(root);
  const packagePath = join(root, 'package.json');
  const trustedBefore = trustedDependenciesSource(readFileSync(packagePath));
  const directory = createOwnedInstallDirectory();
  let primary: Error | undefined;
  const finalErrors: Error[] = [];
  try {
    const invocation = buildInstallInvocation(mode, sourceEnv, collectNextProductionDotenvNames(root), directory);
    const child = spawn(invocation.argv, { cwd: root, env: invocation.env, stdout: 'pipe', stderr: 'pipe', shell: false });
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, capture(child.stdout), capture(child.stderr)]);
    if (stdout.lifecycle || stderr.lifecycle) throw new Error('c1-a installer: lifecycle output observed');
    if (stdout.overflow || stderr.overflow) throw new Error('c1-a installer: output limit exceeded');
    if (exitCode !== 0) {
      const retained = `${new TextDecoder().decode(stdout.retained)}\n${new TextDecoder().decode(stderr.retained)}`;
      throw new Error(`c1-a installer: child failed (${exitCode || 1}; ${classifyInstallFailure(retained, {
        ownedBunfig: join(directory, '.bunfig.toml'),
        repositoryBunfig: join(root, 'bunfig.toml'),
      })})`);
    }
  } catch (error) {
    primary = errorValue(error);
  } finally {
    try {
      const trustedAfter = trustedDependenciesSource(readFileSync(packagePath));
      if (!Buffer.from(trustedAfter).equals(Buffer.from(trustedBefore))) {
        throw new Error('c1-a installer: trustedDependencies changed');
      }
    } catch (error) { finalErrors.push(errorValue(error)); }
    try { validateInstalledLock(root); } catch (error) { finalErrors.push(errorValue(error)); }
    finalErrors.push(...cleanup(directory));
  }
  if (primary && finalErrors.length) throw new AggregateError([primary, ...finalErrors], 'c1-a installer failed');
  if (primary) throw primary;
  if (finalErrors.length) throw new AggregateError(finalErrors, 'c1-a installer cleanup failed');
  return { summary: `c1-a installer: mode=${mode} packages=${PACKAGE_ARGUMENTS.join(',')} exit=0` };
}

if (import.meta.main) {
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length || (mode !== 'add' && mode !== 'frozen')) throw new Error('c1-a installer: expected add|frozen');
  console.log((await executeInstaller(mode, process.cwd(), process.env)).summary);
}
