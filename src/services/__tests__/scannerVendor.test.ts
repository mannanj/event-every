import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { createE1OfflineEnvironment } from '../../../scripts/run-e1-offline';
import {
  assertExactBuildInventory,
  credentialFreeEnvironment,
  installVendorArtifactTransaction,
  stageContainedScannerPack,
  verifyInstalledVendorArtifact,
  verifyVendorArtifact,
} from '../../../scripts/vendor-event-scanner';
import {
  EventCandidateSchema,
  generateIcs,
  validateForIcs,
} from '@event-every/scanner';
import { createOpenRouterTextLinkProvider } from '@event-every/scanner/openrouter';

const vendorRoot = path.resolve(import.meta.dir, '../../../vendor/event-every-scanner');
const pinnedCommit = 'c03cf1a79d0d1f2151ee602d67aa0a2eede673e4';
const pinnedPackDigest = '1f3d909e17c71706fd6c41a4e16a094dd4ef577a933ca58b9219cc38e60a27e8';

type Provenance = Readonly<{
  schemaVersion: number;
  packageName: string;
  sourceCommit: string;
  pack: Readonly<{
    filename: string;
    integrity: string;
    entryCount: number;
    sha256: string;
  }>;
  tools: Readonly<{ node: string; bun: string; npm: string }>;
  packPolicy: Readonly<{ offline: boolean; ignoreScripts: boolean; audit: boolean; fund: boolean }>;
  artifactSha256: string;
  files: readonly Readonly<{ path: string; sha256: string }>[];
}>;

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(absolute);
    if (entry.isFile()) return [absolute];
    throw new Error(`Unsupported vendor artifact entry: ${absolute}`);
  }));
  return files.flat();
}

async function vendorEntries(): Promise<string[]> {
  const entries = await filesUnder(vendorRoot);
  const rootEntries = await readdir(vendorRoot, { withFileTypes: true });
  const directories = rootEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return [...entries.map((entry) => path.relative(vendorRoot, entry)), ...directories]
    .sort();
}

async function canonicalArtifactDigest(root: string): Promise<string> {
  const files = (await filesUnder(root))
    .map((file) => path.relative(root, file))
    .filter((file) => file !== 'PROVENANCE.json')
    .sort((left, right) => Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8')));
  const digest = createHash('sha256');
  for (const file of files) {
    const pathBytes = Buffer.from(file, 'utf8');
    const fileBytes = await readFile(path.join(root, file));
    const pathLength = Buffer.alloc(4);
    const fileLength = Buffer.alloc(8);
    pathLength.writeUInt32BE(pathBytes.length);
    fileLength.writeBigUInt64BE(BigInt(fileBytes.length));
    digest.update(pathLength).update(pathBytes).update(fileLength).update(fileBytes);
  }
  return digest.digest('hex');
}

const fixturePackPolicy = {
  sourceCommit: pinnedCommit,
  pack: {
    filename: 'event-every-scanner-fixture.tgz',
    integrity: 'sha512-fixture',
    entryCount: 138,
    sha256: '787bde7bb0279636549342518b143397ca83698ae1ef592ca939362641eee6f2',
  },
  artifactSha256: 'f5b7af00b5d0bdd938c9392057b8f43b50876ca833da5084f24e5c3fdbb9d4f8',
  tools: { node: 'v25.2.1', bun: '1.3.13', npm: '11.6.2' },
  packPolicy: { offline: true, ignoreScripts: true, audit: false, fund: false },
} as const;

async function containedFixturePack(mutate: (files: Map<string, Uint8Array>) => void = () => {}): Promise<{
  filename: string;
  integrity: string;
  entryCount: number;
  sha256: string;
  files: readonly { path: string; bytes: Uint8Array }[];
}> {
  const files = new Map<string, Uint8Array>();
  for (const absolute of await filesUnder(vendorRoot)) {
    const relative = path.relative(vendorRoot, absolute);
    if (relative !== 'PROVENANCE.json') files.set(relative, await readFile(absolute));
  }
  const packageJson = files.get('package.json');
  if (!packageJson) throw new Error('fixture scanner package is missing package.json');
  const packageMetadata = JSON.parse(new TextDecoder().decode(packageJson)) as Record<string, unknown>;
  packageMetadata.files = ['dist', 'README.md'];
  files.set('package.json', Buffer.from(`${JSON.stringify(packageMetadata, null, 2)}\n`, 'utf8'));
  mutate(files);
  return {
    ...fixturePackPolicy.pack,
    files: [...files].map(([path, bytes]) => ({ path, bytes })),
  };
}

function runBunInstall(arguments_: string[], cwd: string, env: Record<string, string | undefined>) {
  return Bun.spawnSync([
    'node',
    '--eval',
    "const { spawnSync } = require('node:child_process'); const [command, ...args] = process.argv.slice(1); const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env }); if (result.stdout) process.stdout.write(result.stdout); if (result.stderr) process.stderr.write(result.stderr); process.exit(result.status ?? 1);",
    'bun',
    ...arguments_,
  ], { cwd, env, stdout: 'pipe', stderr: 'pipe' });
}

describe('vendored Event Scanner package', () => {
  test('scrubs credential-shaped values from nested Scanner installer children', () => {
    const childEnvironment = credentialFreeEnvironment({
      OPENROUTER_API_KEY: 'fake-openrouter-key',
      API_TOKEN: 'fake-api-token',
      AUTH_PASSWORD: 'fake-password',
      SAFE_VALUE: 'preserved',
      PATH: '/safe/bin',
    });

    expect(childEnvironment.OPENROUTER_API_KEY).toBe('');
    expect(childEnvironment.API_TOKEN).toBe('');
    expect(childEnvironment.AUTH_PASSWORD).toBe('');
    expect(childEnvironment.SAFE_VALUE).toBe('preserved');
    expect(childEnvironment.PATH).toBe('/safe/bin');
  });

  test('keeps the checked-in manifest to the runtime-only UTF-8 package projection', async () => {
    const manifestBytes = await readFile(path.join(vendorRoot, 'package.json'));
    expect(manifestBytes).toEqual(Buffer.from(`${JSON.stringify({
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
    }, null, 2)}\n`, 'utf8'));
  });

  test('records the pinned source and exact digests for its constrained package root', async () => {
    const provenance = JSON.parse(
      await readFile(path.join(vendorRoot, 'PROVENANCE.json'), 'utf8'),
    ) as Provenance;

    expect(provenance.schemaVersion).toBe(2);
    expect(provenance.sourceCommit).toBe(pinnedCommit);
    expect(provenance.packageName).toBe('@event-every/scanner');
    expect(provenance.pack).toEqual({
      filename: 'event-every-scanner-0.0.0.tgz',
      integrity: 'sha512-e7SSq/sZm9PhQhps/RhoUYKaXHxTJFz2sm58fRivAstBrMeZx5UmZWmurfDVyUyskNw8nDEVFzsnb/IzLVPl7Q==',
      entryCount: 138,
      sha256: pinnedPackDigest,
    });
    expect(provenance.tools).toEqual({ node: 'v25.2.1', bun: '1.3.13', npm: '11.6.2' });
    expect(provenance.packPolicy).toEqual({ offline: true, ignoreScripts: true, audit: false, fund: false });
    expect(provenance.artifactSha256).toBe('f5b7af00b5d0bdd938c9392057b8f43b50876ca833da5084f24e5c3fdbb9d4f8');

    const listedPaths = provenance.files.map((entry) => entry.path);
    expect(listedPaths).toEqual([...listedPaths].sort());
    expect(listedPaths).toContain('package.json');
    expect(listedPaths).toContain('README.md');
    expect(listedPaths.every((entry) => entry === 'package.json' || entry === 'README.md' || entry.startsWith('dist/'))).toBe(true);

    for (const file of provenance.files) {
      const absolute = path.join(vendorRoot, file.path);
      expect((await stat(absolute)).isFile()).toBe(true);
      const digest = createHash('sha256').update(await readFile(absolute)).digest('hex');
      expect(digest).toBe(file.sha256);
    }

    const actualEntries = await vendorEntries();
    expect(actualEntries.every((entry) => (
      entry === 'PROVENANCE.json'
      || entry === 'package.json'
      || entry === 'README.md'
      || entry === 'dist'
      || entry.startsWith('dist/')
    ))).toBe(true);
    const artifactFiles = actualEntries.filter((entry) => entry !== 'PROVENANCE.json' && entry !== 'dist');
    expect(artifactFiles).toEqual(listedPaths);
  });

  test('resolves Scanner candidate, ICS, and OpenRouter public exports', () => {
    expect(EventCandidateSchema).toBeDefined();
    expect(validateForIcs).toBeDefined();
    expect(generateIcs).toBeDefined();
    expect(createOpenRouterTextLinkProvider).toBeDefined();
  });

  test('rejects stale ignored files that were not emitted by the current Scanner build', async () => {
    const scannerRoot = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-inventory-'));
    try {
      const dist = path.join(scannerRoot, 'dist');
      await mkdir(dist);
      const emitted = path.join(dist, 'index.js');
      await writeFile(emitted, 'export {};\n');
      await writeFile(path.join(dist, 'stale.js'), 'stale\n');

      await expect(
        assertExactBuildInventory(scannerRoot, `TSFILE: ${emitted}\n`),
      ).rejects.toThrow('unexpected: stale.js');
    } finally {
      await rm(scannerRoot, { recursive: true, force: true });
    }
  });

  test('fails closed when a Scanner artifact changes after contained-pack provenance is recorded', async () => {
    const copiedVendorRoot = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-provenance-'));
    try {
      await cp(vendorRoot, copiedVendorRoot, { recursive: true });
      await writeFile(path.join(copiedVendorRoot, 'dist/index.js'), '\n// deliberate Scanner artifact mutation\n', {
        flag: 'a',
      });

      await expect(verifyVendorArtifact(copiedVendorRoot)).rejects.toThrow('digest mismatch');
    } finally {
      await rm(copiedVendorRoot, { recursive: true, force: true });
    }
  });

  test('rejects coordinated artifact and provenance-manifest tampering against the pinned canonical digest', async () => {
    const copiedVendorRoot = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-coordinated-tamper-'));
    try {
      await cp(vendorRoot, copiedVendorRoot, { recursive: true });
      const changedPath = 'dist/index.js';
      await writeFile(path.join(copiedVendorRoot, changedPath), '\n// coordinated mutation\n', { flag: 'a' });
      const provenancePath = path.join(copiedVendorRoot, 'PROVENANCE.json');
      const provenance = JSON.parse(await readFile(provenancePath, 'utf8')) as Provenance;
      const changedFile = provenance.files.find((file) => file.path === changedPath);
      if (!changedFile) throw new Error('test fixture lacks dist/index.js');
      (changedFile as { sha256: string }).sha256 = createHash('sha256')
        .update(await readFile(path.join(copiedVendorRoot, changedPath)))
        .digest('hex');
      (provenance as { artifactSha256: string }).artifactSha256 = await canonicalArtifactDigest(copiedVendorRoot);
      await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

      await expect(verifyVendorArtifact(copiedVendorRoot)).rejects.toThrow('canonical digest mismatch');
    } finally {
      await rm(copiedVendorRoot, { recursive: true, force: true });
    }
  });

  test('rejects a stale frozen-offline installed Scanner package selected by import resolution', async () => {
    const installation = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-installed-'));
    try {
      const installedRoot = path.join(installation, 'node_modules/@event-every/scanner');
      await mkdir(path.dirname(installedRoot), { recursive: true });
      await cp(vendorRoot, installedRoot, { recursive: true });
      const resolvedEntry = path.join(installedRoot, 'dist/index.js');
      await writeFile(resolvedEntry, '\n// stale frozen-offline copy\n', { flag: 'a' });

      await expect(verifyInstalledVendorArtifact(resolvedEntry, vendorRoot)).rejects.toThrow('installed artifact');
    } finally {
      await rm(installation, { recursive: true, force: true });
    }
  });

  test('binds the frozen-offline installed Scanner bytes before a consumer uses its public schema', async () => {
    await expect(verifyInstalledVendorArtifact()).resolves.toBeUndefined();
    expect(EventCandidateSchema.safeParse({ candidateId: 'consumer-observes-installed-artifact' }).success).toBe(false);
  });

  test('verifies installed Scanner bytes in a fresh subprocess before evaluating the consumer module', () => {
    const environment = Object.fromEntries(
      Object.entries(credentialFreeEnvironment(process.env)).filter(([name]) => !name.startsWith('BUN_TEST')),
    );
    const result = Bun.spawnSync([
      'bun', '--eval', "import { verifyInstalledVendorArtifact } from './scripts/vendor-event-scanner.ts'; await verifyInstalledVendorArtifact(); const { EventCandidateSchema } = await import('@event-every/scanner'); if (!EventCandidateSchema) throw new Error('consumer module was not evaluated'); console.log('verified-before-consumer');",
    ], {
      cwd: path.resolve(vendorRoot, '../..'),
      env: environment,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    expect(new TextDecoder().decode(result.stdout).trim()).toBe('verified-before-consumer');
  });

  test('rejects a changed Scanner pack byte through the production staging seam before vendoring', async () => {
    const staging = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-pack-reject-'));
    try {
      const pack = await containedFixturePack((files) => {
        files.set('dist/index.js', Buffer.from(`${new TextDecoder().decode(files.get('dist/index.js'))}\nexport const EVENT_EVERY_VENDOR_PROBE = 'rejected';\n`, 'utf8'));
      });

      await expect(stageContainedScannerPack(staging, pack, fixturePackPolicy)).rejects.toThrow('normalized digest');
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });

  test('rolls back the swapped vendor and frozen installed Scanner package after late verification failure', async () => {
    const consumer = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-transaction-'));
    try {
      const transactionVendor = path.join(consumer, 'vendor/event-every-scanner');
      const staging = await mkdtemp(path.join(consumer, 'event-every-scanner-staging-'));
      await mkdir(path.dirname(transactionVendor), { recursive: true });
      await cp(vendorRoot, transactionVendor, { recursive: true });
      await cp(vendorRoot, staging, { recursive: true });
      await writeFile(path.join(staging, 'dist/index.js'), "\nexport const EVENT_EVERY_TRANSACTION_PROBE = 'swapped';\n", { flag: 'a' });
      await writeFile(path.join(consumer, 'package.json'), `${JSON.stringify({
        name: 'event-every-transaction-consumer',
        private: true,
        type: 'module',
        dependencies: { '@event-every/scanner': 'file:vendor/event-every-scanner' },
      }, null, 2)}\n`);
      await cp(path.resolve(vendorRoot, '../../bun.lock'), path.join(consumer, 'bun.lock'));
      const cacheDirectory = process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'install/cache') : undefined;
      const installerEnvironment = {
        ...Object.fromEntries(Object.entries(credentialFreeEnvironment(process.env)).filter(([name]) => !name.startsWith('BUN_TEST'))),
        TMPDIR: consumer,
        TMP: consumer,
        TEMP: consumer,
        BUN_TMPDIR: consumer,
        ...(cacheDirectory ? { BUN_INSTALL_CACHE_DIR: cacheDirectory } : {}),
      };
      const cacheArguments = cacheDirectory ? ['--cache-dir', cacheDirectory] : [];
      const lock = runBunInstall([
        'install', '--lockfile-only', '--ignore-scripts', '--registry', 'http://127.0.0.1:9', ...cacheArguments,
      ], consumer, installerEnvironment);
      expect(lock.exitCode, new TextDecoder().decode(lock.stderr)).toBe(0);
      const firstInstall = runBunInstall([
        'install', '--frozen-lockfile', '--ignore-scripts', '--registry', 'http://127.0.0.1:9', ...cacheArguments,
      ], consumer, installerEnvironment);
      expect(firstInstall.exitCode, new TextDecoder().decode(firstInstall.stderr)).toBe(0);
      const installedEntry = path.join(consumer, 'node_modules/@event-every/scanner/dist/index.js');
      const oldVendorEntry = await readFile(path.join(transactionVendor, 'dist/index.js'));
      await expect(verifyInstalledVendorArtifact(installedEntry, transactionVendor)).resolves.toBeUndefined();

      await expect(installVendorArtifactTransaction(staging, {
        artifactRoot: transactionVendor,
        installFrozenOffline: () => {
          const result = runBunInstall([
            'install', '--frozen-lockfile', '--ignore-scripts', '--registry', 'http://127.0.0.1:9', ...cacheArguments,
          ], consumer, installerEnvironment);
          if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
        },
        verifyInstalled: async (currentVendorRoot) => {
          const currentEntry = await readFile(path.join(currentVendorRoot, 'dist/index.js'), 'utf8');
          if (currentEntry.includes("EVENT_EVERY_TRANSACTION_PROBE = 'swapped'")) {
            expect(await readFile(installedEntry, 'utf8')).toContain("EVENT_EVERY_TRANSACTION_PROBE = 'swapped'");
            throw new Error('deliberate late verification failure');
          }
          await verifyInstalledVendorArtifact(installedEntry, currentVendorRoot);
        },
      })).rejects.toThrow('deliberate late verification failure');

      expect(await readFile(path.join(transactionVendor, 'dist/index.js'))).toEqual(oldVendorEntry);
      await expect(verifyInstalledVendorArtifact(installedEntry, transactionVendor)).resolves.toBeUndefined();
    } finally {
      await rm(consumer, { recursive: true, force: true });
    }
  });

  test('propagates a deliberately pinned Scanner behavior change through staging and frozen installation to an Event Every consumer', async () => {
    const staging = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-pack-accept-'));
    const consumer = await mkdtemp(path.join(os.tmpdir(), 'event-every-scanner-consumer-'));
    try {
      const pack = await containedFixturePack((files) => {
        files.set('dist/index.js', Buffer.from(`${new TextDecoder().decode(files.get('dist/index.js'))}\nexport const EVENT_EVERY_VENDOR_PROBE = 'r82-propagated';\n`, 'utf8'));
      });
      const changedPolicy = {
        ...fixturePackPolicy,
        pack: { ...fixturePackPolicy.pack, sha256: 'c62a793d0ff7f36fc53aebce1e2190eb35f44e31b10aa4d7ee7cef1009045a07' },
        artifactSha256: '76b2714d2c247ae6edbfa5cdd5317cb4edf578d90ce9e0346d1fecfe6dbab214',
      };

      await stageContainedScannerPack(staging, { ...pack, sha256: changedPolicy.pack.sha256 }, changedPolicy);
      await mkdir(path.join(consumer, 'vendor'));
      await cp(staging, path.join(consumer, 'vendor/event-every-scanner'), { recursive: true });
      await writeFile(path.join(consumer, 'package.json'), `${JSON.stringify({
        name: 'event-every-frozen-consumer',
        private: true,
        type: 'module',
        dependencies: { '@event-every/scanner': 'file:vendor/event-every-scanner' },
      }, null, 2)}\n`);
      await cp(path.resolve(vendorRoot, '../../bun.lock'), path.join(consumer, 'bun.lock'));
      const cacheDirectory = process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'install/cache') : undefined;
      const installerEnvironment = {
        ...Object.fromEntries(Object.entries(credentialFreeEnvironment(process.env)).filter(([name]) => !name.startsWith('BUN_TEST'))),
        TMPDIR: consumer,
        TMP: consumer,
        TEMP: consumer,
        BUN_TMPDIR: consumer,
        ...(cacheDirectory ? { BUN_INSTALL_CACHE_DIR: cacheDirectory } : {}),
      };
      const cacheArguments = cacheDirectory ? ['--cache-dir', cacheDirectory] : [];
      const lock = runBunInstall([
        'install', '--lockfile-only', '--ignore-scripts', '--registry', 'http://127.0.0.1:9', ...cacheArguments,
      ], consumer, installerEnvironment);
      expect(lock.exitCode, new TextDecoder().decode(lock.stderr)).toBe(0);
      const generatedLock = await readFile(path.join(consumer, 'bun.lock'), 'utf8');
      expect(generatedLock).toMatch(/"dependencies": \{\s*"@event-every\/scanner": "file:vendor\/event-every-scanner",?\s*\}/);
      expect(generatedLock).not.toContain('"devDependencies"');
      await rm(path.join(consumer, 'node_modules'), { recursive: true, force: true });
      const frozenInstall = runBunInstall([
        'install', '--frozen-lockfile', '--ignore-scripts', '--registry', 'http://127.0.0.1:9', ...cacheArguments,
      ], consumer, installerEnvironment);
      expect(frozenInstall.exitCode, new TextDecoder().decode(frozenInstall.stderr)).toBe(0);
      const observed = Bun.spawnSync([
        'node', '--input-type=module', '--eval', "import { EVENT_EVERY_VENDOR_PROBE } from '@event-every/scanner'; if (EVENT_EVERY_VENDOR_PROBE !== 'r82-propagated') throw new Error('Event Every did not receive the packaged Scanner behavior change'); console.log(EVENT_EVERY_VENDOR_PROBE);",
      ], { cwd: consumer, env: installerEnvironment, stdout: 'pipe', stderr: 'pipe' });
      expect(observed.exitCode, new TextDecoder().decode(observed.stderr)).toBe(0);
      expect(new TextDecoder().decode(observed.stdout).trim()).toBe('r82-propagated');
    } finally {
      await rm(staging, { recursive: true, force: true });
      await rm(consumer, { recursive: true, force: true });
    }
  });

  test('keeps E1 test children local, preload-guarded, and credential-scrubbed', async () => {
    const preload = path.resolve(vendorRoot, '../../scripts/e1-offline-preload.cjs');
    const childEnvironment = createE1OfflineEnvironment({
      OPENROUTER_API_KEY: 'not-a-real-value',
      API_TOKEN: 'not-a-real-value',
      SAFE_VALUE: 'preserved',
    });
    expect(childEnvironment.OPENROUTER_API_KEY).toBe('');
    expect(childEnvironment.API_TOKEN).toBe('');
    expect(childEnvironment.SAFE_VALUE).toBe('preserved');
    expect(childEnvironment.E2E_TARGET).toBe('');
    expect(childEnvironment.E2E_PROD_URL).toBe('');
    expect(childEnvironment.E1_OFFLINE).toBe('1');
    expect(childEnvironment.E1_OFFLINE_PRELOAD).toBe(preload);
    expect(childEnvironment.NODE_OPTIONS).toBe(`--require=${preload}`);

    const layout = await readFile(path.resolve(vendorRoot, '../../src/app/layout.tsx'), 'utf8');
    expect(layout).not.toContain('next/font/google');

    const previousOffline = process.env.E1_OFFLINE;
    const previousPreload = process.env.E1_OFFLINE_PRELOAD;
    process.env.E1_OFFLINE = '1';
    process.env.E1_OFFLINE_PRELOAD = preload;
    try {
      const configuration = (await import('../../../playwright.config')).default;
      expect(configuration.use?.baseURL).toBe('http://localhost:3777');
      expect(configuration.use?.proxy).toEqual({
        server: 'http://127.0.0.1:9',
        bypass: 'localhost,127.0.0.1,::1',
      });
      expect(configuration.webServer).toMatchObject({
        command: `node --require=${preload} node_modules/next/dist/bin/next dev -p 3777`,
        url: 'http://localhost:3777',
        reuseExistingServer: false,
      });
    } finally {
      if (previousOffline === undefined) delete process.env.E1_OFFLINE;
      else process.env.E1_OFFLINE = previousOffline;
      if (previousPreload === undefined) delete process.env.E1_OFFLINE_PRELOAD;
      else process.env.E1_OFFLINE_PRELOAD = previousPreload;
    }
  });

  test('preload permits loopback and rejects public egress before connection', () => {
    const preload = path.resolve(vendorRoot, '../../scripts/e1-offline-preload.cjs');
    const probe = `
      const http = require('node:http');
      const net = require('node:net');
      const tls = require('node:tls');
      if (globalThis.__E1_OFFLINE_GUARD__ !== true) process.exit(2);
      const request = http.get('http://127.0.0.1:1');
      request.on('error', () => {});
      for (const attempt of [
        () => http.get('http://192.0.2.1'),
        () => http.get('http://example.com'),
        () => net.connect({ host: '198.51.100.1', port: 80 }),
        () => net.connect(80, '203.0.113.1'),
        () => tls.connect(443, { host: '198.51.100.1' }),
        () => tls.connect(443, undefined, { host: '203.0.113.1' }),
      ]) {
        try { attempt(); process.exit(3); }
        catch (error) { if (!error || error.code !== 'E1_OFFLINE_EGRESS_BLOCKED') process.exit(4); }
      }
    `;
    const result = Bun.spawnSync(['node', '--require', preload, '--eval', probe], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
  });
});
