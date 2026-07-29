import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { createE1OfflineEnvironment } from '../../../scripts/run-e1-offline';
import { assertExactBuildInventory } from '../../../scripts/vendor-event-scanner';
import {
  EventCandidateSchema,
  generateIcs,
  validateForIcs,
} from '@event-every/scanner';
import { createOpenRouterTextLinkProvider } from '@event-every/scanner/openrouter';

const vendorRoot = path.resolve(import.meta.dir, '../../../vendor/event-every-scanner');
const pinnedCommit = '98aec60cf9d87544196bfd0fa702c8170453bfd8';

type Provenance = Readonly<{
  schemaVersion: number;
  packageName: string;
  sourceCommit: string;
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

describe('vendored Event Scanner package', () => {
  test('records the pinned source and exact digests for its constrained package root', async () => {
    const provenance = JSON.parse(
      await readFile(path.join(vendorRoot, 'PROVENANCE.json'), 'utf8'),
    ) as Provenance;

    expect(provenance.schemaVersion).toBe(1);
    expect(provenance.sourceCommit).toBe(pinnedCommit);
    expect(provenance.packageName).toBe('@event-every/scanner');

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
