import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const SCANNER_COMMIT = 'c03cf1a79d0d1f2151ee602d67aa0a2eede673e4';
const ACCEPTED_PACK = {
  filename: 'event-every-scanner-0.0.0.tgz',
  integrity: 'sha512-e7SSq/sZm9PhQhps/RhoUYKaXHxTJFz2sm58fRivAstBrMeZx5UmZWmurfDVyUyskNw8nDEVFzsnb/IzLVPl7Q==',
  entryCount: 138,
  sha256: '1f3d909e17c71706fd6c41a4e16a094dd4ef577a933ca58b9219cc38e60a27e8',
} as const;
const ACCEPTED_ARTIFACT_SHA256 = 'f5b7af00b5d0bdd938c9392057b8f43b50876ca833da5084f24e5c3fdbb9d4f8';
const ACCEPTED_TOOLS = { node: 'v25.2.1', bun: '1.3.13', npm: '11.6.2' } as const;
const PACK_POLICY = { offline: true, ignoreScripts: true, audit: false, fund: false } as const;
const UPSTREAM_PACK_FILES = ['dist', 'README.md'] as const;
const CREDENTIAL_NAME = /OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|AUTH|PASSWORD|CLOUDFLARE|RESEND|KV_REST/i;
const artifactRoot = path.resolve(import.meta.dir, '../vendor/event-every-scanner');
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

type Environment = Record<string, string | undefined>;
export type ContainedScannerPackFile = Readonly<{ path: string; bytes: Uint8Array }>;
export type ContainedScannerPackMetadata = Readonly<{ filename: string; integrity: string; entryCount: number; sha256: string }>;
export type ContainedScannerPack = ContainedScannerPackMetadata & Readonly<{ files: readonly ContainedScannerPackFile[] }>;
export type ScannerArtifactPolicy = Readonly<{
  sourceCommit: string;
  pack: ContainedScannerPackMetadata;
  artifactSha256: string;
  tools: Readonly<{ node: string; bun: string; npm: string }>;
  packPolicy: Readonly<{ offline: boolean; ignoreScripts: boolean; audit: boolean; fund: boolean }>;
}>;
type PackFile = ContainedScannerPackFile;
type PackMetadata = ContainedScannerPackMetadata;
type PackReport = ContainedScannerPack;
type Provenance = Readonly<{
  schemaVersion: number;
  packageName: string;
  sourceCommit: string;
  pack: PackMetadata;
  tools: Readonly<{ node: string; bun: string; npm: string }>;
  packPolicy: Readonly<{ offline: boolean; ignoreScripts: boolean; audit: boolean; fund: boolean }>;
  artifactSha256: string;
  files: readonly Readonly<{ path: string; sha256: string }>[];
}>;

const RUNTIME_PACKAGE_PROJECTION = {
  name: '@event-every/scanner',
  version: '0.0.0',
  private: true,
  type: 'module',
  sideEffects: false,
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    './openrouter': { types: './dist/openrouter/index.d.ts', import: './dist/openrouter/index.js' },
    './eval': { types: './dist/eval/index.d.ts', import: './dist/eval/index.js' },
    './capture': { types: './dist/capture/index.d.ts', import: './dist/capture/index.js' },
  },
  dependencies: { '@js-temporal/polyfill': '0.5.1', 'ical.js': '2.2.1', zod: '4.4.3' },
} as const;

const ACCEPTED_ARTIFACT_POLICY: ScannerArtifactPolicy = {
  sourceCommit: SCANNER_COMMIT,
  pack: ACCEPTED_PACK,
  artifactSha256: ACCEPTED_ARTIFACT_SHA256,
  tools: ACCEPTED_TOOLS,
  packPolicy: PACK_POLICY,
};

function commandOutput(command: string, args: string[], cwd: string, env: Environment): string {
  const result = Bun.spawnSync([command, ...args], { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    const stderr = textDecoder.decode(result.stderr).trim();
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return textDecoder.decode(result.stdout).trim();
}

export function credentialFreeEnvironment(environment: Environment): Environment {
  return Object.fromEntries(
    Object.entries(environment).map(([name, value]) => [name, CREDENTIAL_NAME.test(name) ? '' : value]),
  );
}

function assertToolPolicy(scannerRoot: string, environment: Environment): typeof ACCEPTED_TOOLS {
  for (const [tool, expected] of Object.entries(ACCEPTED_TOOLS)) {
    if (commandOutput(tool, ['--version'], scannerRoot, environment) !== expected) throw new Error(`Unsupported ${tool} version for contained Scanner pack`);
  }
  return ACCEPTED_TOOLS;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'));
}

function canonicalPackagePath(value: string): boolean {
  if (!value || value.normalize('NFC') !== value || value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value)) return false;
  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..' && !/[<>:"|?*]/.test(segment));
}

function decodeTarString(bytes: Uint8Array): string {
  return textDecoder.decode(bytes).replace(/\0[\s\S]*$/, '');
}

function readTarOctal(bytes: Uint8Array, label: string): number {
  const value = decodeTarString(bytes).trim();
  if (!/^[0-7]*$/.test(value)) throw new Error(`Scanner pack has an invalid ${label}`);
  const parsed = Number.parseInt(value || '0', 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Scanner pack has an invalid ${label}`);
  return parsed;
}

function assertTarChecksum(header: Uint8Array): void {
  const expected = readTarOctal(header.subarray(148, 156), 'header checksum');
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) actual += index >= 148 && index < 156 ? 32 : header[index]!;
  if (actual !== expected) throw new Error('Scanner pack has an invalid header checksum');
}

function readContainedPack(tarball: Uint8Array): PackFile[] {
  let archive: Uint8Array;
  try {
    archive = gunzipSync(tarball, { maxOutputLength: 64 * 1024 * 1024 });
  } catch {
    throw new Error('Scanner pack cannot be decompressed');
  }
  if (archive.length < 1024 || archive.length > 64 * 1024 * 1024) throw new Error('Scanner pack has an invalid expanded size');

  const entries: PackFile[] = [];
  let terminated = false;
  for (let offset = 0; offset < archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.length !== 512) throw new Error('Scanner pack has a truncated header');
    if (header.every((byte) => byte === 0)) {
      if (!archive.subarray(offset + 512, offset + 1024).every((byte) => byte === 0) || offset + 1024 !== archive.length) throw new Error('Scanner pack has invalid trailing data');
      terminated = true;
      break;
    }
    assertTarChecksum(header);
    if (decodeTarString(header.subarray(257, 263)) !== 'ustar' || textDecoder.decode(header.subarray(263, 265)) !== '00') throw new Error('Scanner pack is not a ustar archive');
    const type = decodeTarString(header.subarray(156, 157));
    if (type !== '' && type !== '0') throw new Error('Scanner pack contains a non-file entry');
    const prefix = decodeTarString(header.subarray(345, 500));
    const name = `${prefix ? `${prefix}/` : ''}${decodeTarString(header.subarray(0, 100))}`;
    if (!name.startsWith('package/') || !canonicalPackagePath(name) || name === 'package/') throw new Error('Scanner pack contains an unsafe entry path');
    const size = readTarOctal(header.subarray(124, 136), 'entry size');
    if (size > 8 * 1024 * 1024 || entries.length >= 512) throw new Error('Scanner pack exceeds accepted limits');
    const start = offset + 512;
    const end = start + size;
    const next = start + Math.ceil(size / 512) * 512;
    if (end > archive.length || next > archive.length) throw new Error('Scanner pack has a truncated file entry');
    entries.push({ path: name.slice('package/'.length), bytes: archive.slice(start, end) });
    offset = next;
  }
  if (!terminated || entries.length === 0) throw new Error('Scanner pack is missing terminator blocks');
  const uniquePaths = new Set(entries.map((entry) => entry.path.toLocaleLowerCase('en-US')));
  if (uniquePaths.size !== entries.length) throw new Error('Scanner pack contains duplicate paths');
  return entries;
}

function digestPackEntries(entries: readonly PackFile[]): string {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => compareUtf8(left.path, right.path))) {
    const pathBytes = textEncoder.encode(entry.path);
    const pathLength = Buffer.allocUnsafe(4);
    const bytesLength = Buffer.allocUnsafe(8);
    pathLength.writeUInt32BE(pathBytes.length);
    bytesLength.writeBigUInt64BE(BigInt(entry.bytes.length));
    hash.update(pathLength).update(pathBytes).update(bytesLength).update(entry.bytes);
  }
  return hash.digest('hex');
}

function parsePackageMetadata(bytes: Uint8Array): Record<string, unknown> {
  try {
    const metadata = JSON.parse(textDecoder.decode(bytes)) as unknown;
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error();
    return metadata as Record<string, unknown>;
  } catch {
    throw new Error('Scanner package metadata is not valid JSON');
  }
}

function assertAcceptedSourcePackageMetadata(bytes: Uint8Array): void {
  const metadata = parsePackageMetadata(bytes);
  if (
    metadata.name !== '@event-every/scanner'
    || metadata.private !== true
    || JSON.stringify(metadata.files) !== JSON.stringify(UPSTREAM_PACK_FILES)
    || JSON.stringify(metadata.dependencies) !== JSON.stringify(RUNTIME_PACKAGE_PROJECTION.dependencies)
  ) throw new Error('Scanner pack package metadata is not the accepted public package');
}

export function projectRuntimePackageManifest(bytes: Uint8Array): Uint8Array {
  assertAcceptedSourcePackageMetadata(bytes);
  return textEncoder.encode(`${JSON.stringify(RUNTIME_PACKAGE_PROJECTION, null, 2)}\n`);
}

function assertAcceptedRuntimePackageMetadata(bytes: Uint8Array): void {
  const projection = textEncoder.encode(`${JSON.stringify(RUNTIME_PACKAGE_PROJECTION, null, 2)}\n`);
  if (!Buffer.from(bytes).equals(Buffer.from(projection))) {
    throw new Error('Scanner artifact package metadata is not the accepted runtime-only UTF-8 projection');
  }
}

function assertPackMatchesPolicy(files: readonly PackFile[], pack: Omit<PackReport, 'files'>, policy: ScannerArtifactPolicy): void {
  if (pack.filename !== policy.pack.filename || pack.integrity !== policy.pack.integrity || pack.entryCount !== policy.pack.entryCount || pack.sha256 !== policy.pack.sha256) {
    throw new Error('Scanner pack metadata does not match the accepted package policy');
  }
  const paths = files.map((file) => file.path).sort(compareUtf8);
  if (paths.length !== policy.pack.entryCount || paths.some((file) => file !== 'package.json' && file !== 'README.md' && !file.startsWith('dist/'))) throw new Error('Scanner pack inventory is not the accepted package root');
  const packageJson = files.find((file) => file.path === 'package.json');
  if (!packageJson) throw new Error('Scanner pack is missing package.json');
  assertAcceptedSourcePackageMetadata(packageJson.bytes);
  if (digestPackEntries(files) !== policy.pack.sha256) throw new Error('Scanner pack normalized digest does not match the accepted package policy');
}

async function regularFiles(directory: string, relative = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const nextRelative = path.posix.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await regularFiles(absolute, nextRelative));
    else if (entry.isFile()) files.push(nextRelative);
    else throw new Error(`Unsupported Scanner artifact entry: ${nextRelative}`);
  }
  return files;
}

export async function assertExactBuildInventory(scannerRoot: string, compilerOutput: string): Promise<void> {
  const distRoot = path.join(scannerRoot, 'dist');
  const emitted = compilerOutput
    .split(/\r?\n/)
    .filter((line) => line.startsWith('TSFILE: '))
    .map((line) => path.resolve(line.slice('TSFILE: '.length)))
    .map((absolute) => {
      const relative = path.relative(distRoot, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Scanner build emitted outside dist: ${absolute}`);
      return relative.split(path.sep).join('/');
    })
    .sort(compareUtf8);
  if (emitted.length === 0) throw new Error('Scanner build did not report any emitted dist files');
  const actual = (await regularFiles(distRoot)).sort(compareUtf8);
  if (JSON.stringify(actual) !== JSON.stringify(emitted)) {
    const unexpected = actual.filter((file) => !emitted.includes(file));
    const missing = emitted.filter((file) => !actual.includes(file));
    throw new Error(`Scanner dist inventory differs from this build${unexpected.length ? `; unexpected: ${unexpected.join(', ')}` : ''}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
  }
}

async function assertPackedDistMatchesCleanBuild(files: readonly PackFile[], cleanDist: string): Promise<void> {
  const expected = (await regularFiles(cleanDist)).map((file) => `dist/${file}`).sort(compareUtf8);
  const packed = files.filter((file) => file.path.startsWith('dist/')).sort((left, right) => compareUtf8(left.path, right.path));
  if (JSON.stringify(packed.map((file) => file.path)) !== JSON.stringify(expected)) throw new Error('Scanner pack dist inventory differs from its independent clean build');
  for (const file of packed) {
    const expectedBytes = await readFile(path.join(cleanDist, file.path.slice('dist/'.length)));
    if (!Buffer.from(file.bytes).equals(expectedBytes)) throw new Error(`Scanner pack dist differs from its independent clean build: ${file.path}`);
  }
}

function parseNpmPackReport(output: string): Omit<PackReport, 'files'> {
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0] === null || typeof parsed[0] !== 'object') throw new Error('npm pack did not return one package report');
  const report = parsed[0] as Record<string, unknown>;
  if (
    typeof report.filename !== 'string'
    || typeof report.integrity !== 'string'
    || !Array.isArray(report.files)
    || report.files.length !== ACCEPTED_PACK.entryCount
  ) throw new Error('npm pack report is incomplete');
  return {
    filename: report.filename,
    integrity: report.integrity,
    entryCount: report.files.length,
    sha256: ACCEPTED_PACK.sha256,
  };
}

async function buildContainedPack(scannerRoot: string, workspace: string, label: string, environment: Environment): Promise<PackReport> {
  const cleanDist = await mkdtemp(path.join(scannerRoot, '.event-every-clean-dist-'));
  const cache = path.join(workspace, `${label}-npm-cache`);
  const destination = path.join(workspace, `${label}-tarballs`);
  try {
    await Promise.all([mkdir(cache), mkdir(destination)]);
    commandOutput('node', [path.join(scannerRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--outDir', cleanDist], scannerRoot, environment);
    const packEnvironment = {
      ...environment,
      NPM_CONFIG_CACHE: cache,
      NPM_CONFIG_OFFLINE: 'true',
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_AUDIT: 'false',
      NPM_CONFIG_FUND: 'false',
    };
    const report = parseNpmPackReport(commandOutput('npm', ['pack', '--json', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--pack-destination', destination], scannerRoot, packEnvironment));
    const tarballPath = path.join(destination, report.filename);
    const tarball = await readFile(tarballPath);
    const expectedIntegrity = Buffer.from(ACCEPTED_PACK.integrity.slice('sha512-'.length), 'base64');
    const actualIntegrity = createHash('sha512').update(tarball).digest();
    if (expectedIntegrity.length !== actualIntegrity.length || !timingSafeEqual(expectedIntegrity, actualIntegrity)) throw new Error('Scanner pack SRI does not match the accepted package');
    const files = readContainedPack(tarball);
    const acceptedReport = { ...report, integrity: ACCEPTED_PACK.integrity };
    assertPackMatchesPolicy(files, acceptedReport, ACCEPTED_ARTIFACT_POLICY);
    await assertPackedDistMatchesCleanBuild(files, cleanDist);
    return { ...acceptedReport, files };
  } finally {
    await rm(cleanDist, { recursive: true, force: true });
  }
}

async function writeProvenance(staging: string, pack: PackReport, policy: ScannerArtifactPolicy): Promise<void> {
  const files = (await regularFiles(staging)).sort(compareUtf8);
  const artifactSha256 = digestPackEntries(await Promise.all(files.map(async (file) => ({
    path: file,
    bytes: await readFile(path.join(staging, file)),
  }))));
  const manifest = await Promise.all(files.map(async (file) => ({
    path: file,
    sha256: createHash('sha256').update(await readFile(path.join(staging, file))).digest('hex'),
  })));
  const provenance: Provenance = {
    schemaVersion: 2,
    packageName: '@event-every/scanner',
    sourceCommit: policy.sourceCommit,
    pack: {
      filename: pack.filename,
      integrity: pack.integrity,
      entryCount: pack.entryCount,
      sha256: pack.sha256,
    },
    tools: policy.tools,
    packPolicy: policy.packPolicy,
    artifactSha256,
    files: manifest,
  };
  await writeFile(path.join(staging, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`);
}

async function verifyArtifactAgainstPolicy(root: string, policy: ScannerArtifactPolicy): Promise<void> {
  const provenance = JSON.parse(await readFile(path.join(root, 'PROVENANCE.json'), 'utf8')) as Provenance;
  if (provenance.schemaVersion !== 2 || provenance.packageName !== '@event-every/scanner' || provenance.sourceCommit !== policy.sourceCommit) throw new Error('Scanner provenance is not the accepted schema-2 source binding');
  if (JSON.stringify(provenance.pack) !== JSON.stringify(policy.pack)) throw new Error('Scanner provenance pack metadata does not match the accepted package policy');
  if (JSON.stringify(provenance.tools) !== JSON.stringify(policy.tools) || JSON.stringify(provenance.packPolicy) !== JSON.stringify(policy.packPolicy)) throw new Error('Scanner provenance pack tool policy is not accepted');
  const listedPaths = provenance.files.map((file) => file.path);
  if (JSON.stringify(listedPaths) !== JSON.stringify([...listedPaths].sort(compareUtf8))) throw new Error('Scanner provenance files are not sorted');
  if (listedPaths.some((file) => file !== 'package.json' && file !== 'README.md' && !file.startsWith('dist/'))) throw new Error('Scanner provenance contains an unallowed path');
  const actual = (await regularFiles(root)).filter((file) => file !== 'PROVENANCE.json').sort(compareUtf8);
  if (JSON.stringify(actual) !== JSON.stringify(listedPaths)) throw new Error('Scanner provenance file inventory mismatch');
  const artifactFiles = await Promise.all(actual.map(async (file) => ({
    path: file,
    bytes: await readFile(path.join(root, file)),
  })));
  const canonicalDigest = digestPackEntries(artifactFiles);
  if (canonicalDigest !== policy.artifactSha256) throw new Error('Scanner artifact canonical digest mismatch');
  if (provenance.artifactSha256 !== policy.artifactSha256 || canonicalDigest !== provenance.artifactSha256) throw new Error('Scanner provenance artifact digest does not match the accepted package');
  const packageJson = artifactFiles.find((file) => file.path === 'package.json');
  if (!packageJson) throw new Error('Scanner artifact is missing package.json');
  assertAcceptedRuntimePackageMetadata(packageJson.bytes);
  for (const file of provenance.files) {
    const digest = createHash('sha256').update(await readFile(path.join(root, file.path))).digest('hex');
    if (digest !== file.sha256) throw new Error(`Scanner provenance digest mismatch: ${file.path}`);
  }
}

export async function verifyVendorArtifact(root = artifactRoot): Promise<void> {
  await verifyArtifactAgainstPolicy(root, ACCEPTED_ARTIFACT_POLICY);
}

async function installedPackageRoot(resolvedEntry: string): Promise<string> {
  const resolved = path.resolve(resolvedEntry);
  if (!resolved.split(path.sep).includes('node_modules')) throw new Error('Scanner import resolution is not under node_modules');
  for (let candidate = path.dirname(resolved);;) {
    try {
      const metadata = parsePackageMetadata(await readFile(path.join(candidate, 'package.json')));
      if (metadata.name === '@event-every/scanner') return candidate;
    } catch {
      // Keep walking to the package boundary; non-package directories are expected.
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error('Scanner import resolution has no @event-every/scanner package boundary');
}

export async function verifyInstalledVendorArtifact(
  resolvedEntry?: string,
  vendorRoot = artifactRoot,
): Promise<void> {
  await verifyVendorArtifact(vendorRoot);
  const entry = resolvedEntry ?? await Bun.resolve('@event-every/scanner', path.resolve(import.meta.dir, '..'));
  const installedRoot = await installedPackageRoot(entry);
  const expectedFiles = (await regularFiles(vendorRoot)).filter((file) => file !== 'PROVENANCE.json').sort(compareUtf8);
  const installedFiles = (await regularFiles(installedRoot)).filter((file) => file !== 'PROVENANCE.json').sort(compareUtf8);
  if (JSON.stringify(installedFiles) !== JSON.stringify(expectedFiles)) throw new Error('Scanner installed artifact inventory differs from the verified vendor artifact');
  const installedEntries = await Promise.all(installedFiles.map(async (file) => ({
    path: file,
    bytes: await readFile(path.join(installedRoot, file)),
  })));
  if (digestPackEntries(installedEntries) !== ACCEPTED_ARTIFACT_SHA256) throw new Error('Scanner installed artifact canonical digest differs from the verified vendor artifact');
  for (const file of expectedFiles) {
    const expected = await readFile(path.join(vendorRoot, file));
    const installed = await readFile(path.join(installedRoot, file));
    if (!Buffer.from(installed).equals(expected)) throw new Error(`Scanner installed artifact differs from the verified vendor artifact: ${file}`);
  }
}

export async function stageContainedScannerPack(
  staging: string,
  pack: ContainedScannerPack,
  policy: ScannerArtifactPolicy,
): Promise<void> {
  assertPackMatchesPolicy(pack.files, pack, policy);
  for (const file of pack.files) {
    const destination = path.resolve(staging, file.path);
    if (!destination.startsWith(`${staging}${path.sep}`)) throw new Error(`Scanner pack path escapes staging: ${file.path}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.path === 'package.json' ? projectRuntimePackageManifest(file.bytes) : file.bytes, { flag: 'wx' });
  }
  await writeProvenance(staging, pack, policy);
  await verifyArtifactAgainstPolicy(staging, policy);
}

async function stageAcceptedPack(staging: string, pack: PackReport): Promise<void> {
  await stageContainedScannerPack(staging, pack, ACCEPTED_ARTIFACT_POLICY);
}

export type VendorArtifactTransaction = Readonly<{
  artifactRoot?: string;
  installFrozenOffline: () => void | Promise<void>;
  verifyInstalled: (vendorRoot: string) => void | Promise<void>;
}>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function transactionFailure(primary: unknown, rollback: unknown): Error {
  return new Error(`Scanner vendor transaction failed: ${errorMessage(primary)}; rollback failed: ${errorMessage(rollback)}`);
}

export async function installVendorArtifactTransaction(
  staging: string,
  transaction: VendorArtifactTransaction,
): Promise<void> {
  const destination = transaction.artifactRoot ?? artifactRoot;
  const parent = path.dirname(destination);
  const backup = path.join(parent, `.event-every-scanner-backup-${randomUUID()}`);
  let swapped = false;
  try {
    await rename(destination, backup);
    try {
      await rename(staging, destination);
      swapped = true;
    } catch (primary) {
      try {
        await rename(backup, destination);
      } catch (rollback) {
        throw transactionFailure(primary, rollback);
      }
      throw primary;
    }
    await transaction.installFrozenOffline();
    await transaction.verifyInstalled(destination);
    await rm(backup, { recursive: true, force: false });
  } catch (primary) {
    if (!swapped) {
      await rm(staging, { recursive: true, force: true });
      throw primary;
    }

    const failed = path.join(parent, `.event-every-scanner-failed-${randomUUID()}`);
    try {
      await rename(destination, failed);
      try {
        await rename(backup, destination);
      } catch (rollback) {
        try {
          await rename(failed, destination);
        } catch {
          // Preserve the backup and surface the original rollback failure below.
        }
        throw rollback;
      }
      await transaction.installFrozenOffline();
      await transaction.verifyInstalled(destination);
      await rm(failed, { recursive: true, force: false });
    } catch (rollback) {
      throw transactionFailure(primary, rollback);
    }
    throw primary;
  }
}

function installFrozenOfflineVendorArtifact(environment: Environment): void {
  commandOutput(
    'bun',
    ['install', '--frozen-lockfile', '--ignore-scripts', '--registry', 'http://127.0.0.1:9'],
    path.resolve(import.meta.dir, '..'),
    environment,
  );
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 1) throw new Error('Usage: bun scripts/vendor-event-scanner.ts <scanner-checkout-path>');
  const scannerRoot = path.resolve(arguments_[0]);
  const environment = credentialFreeEnvironment(process.env);
  assertToolPolicy(scannerRoot, environment);
  if (commandOutput('git', ['rev-parse', 'HEAD'], scannerRoot, environment) !== SCANNER_COMMIT) throw new Error(`Scanner checkout must be exactly ${SCANNER_COMMIT}`);
  if (commandOutput('git', ['status', '--porcelain'], scannerRoot, environment) !== '') throw new Error('Scanner checkout must have a clean working tree');
  commandOutput('bun', ['run', 'verify'], scannerRoot, environment);
  const emitted = commandOutput('bun', [path.join(scannerRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--listEmittedFiles', '--pretty', 'false'], scannerRoot, environment);
  await assertExactBuildInventory(scannerRoot, emitted);

  const workspace = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-pack-'));
  try {
    const first = await buildContainedPack(scannerRoot, workspace, 'first', environment);
    const second = await buildContainedPack(scannerRoot, workspace, 'second', environment);
    if (first.integrity !== second.integrity || first.sha256 !== second.sha256 || JSON.stringify(first.files.map((file) => file.path)) !== JSON.stringify(second.files.map((file) => file.path))) throw new Error('Two independent Scanner packs did not match');
    if (commandOutput('git', ['status', '--porcelain'], scannerRoot, environment) !== '') throw new Error('Scanner checkout changed during contained pack generation');

    await mkdir(path.dirname(artifactRoot), { recursive: true });
    const staging = await mkdtemp(path.join(path.dirname(artifactRoot), '.event-every-scanner-staging-'));
    try {
      await stageAcceptedPack(staging, first);
      await installVendorArtifactTransaction(staging, {
        installFrozenOffline: () => installFrozenOfflineVendorArtifact(environment),
        verifyInstalled: (vendorRoot) => verifyInstalledVendorArtifact(undefined, vendorRoot),
      });
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
