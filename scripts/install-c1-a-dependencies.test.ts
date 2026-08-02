import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildInstallInvocation,
  classifyInstallFailure,
  createOwnedInstallDirectory,
  executeInstaller,
  validateInstalledLock,
} from './install-c1-a-dependencies';

test('classifies child failures without returning child output', () => {
  expect(classifyInstallFailure('error: unknown option --config')).toBe('cli');
  expect(classifyInstallFailure('package version not found')).toBe('package-resolution');
  expect(classifyInstallFailure('unable to connect to registry')).toBe('network');
  expect(classifyInstallFailure('permission denied')).toBe('filesystem');
  expect(classifyInstallFailure('lockfile had changes, but lockfile is frozen')).toBe('lock-state');
  expect(classifyInstallFailure('invalid bunfig configuration for registry')).toBe('configuration[bunfig,config,invalid,registry]');
  expect(classifyInstallFailure('failed to load bunfig.toml: file not found')).toBe('configuration[bunfig,failed,found,load,toml]');
  expect(classifyInstallFailure('reading global config: failed to load bunfig.toml')).toBe('configuration[bunfig,config,failed,global,load,read,toml]');
  expect(classifyInstallFailure('failed to load /private/tmp/owned/bunfig.toml', {
    ownedBunfig: '/private/tmp/owned/bunfig.toml',
    repositoryBunfig: '/repo/bunfig.toml',
  })).toBe('configuration[bunfig,failed,load,toml;owned-bunfig]');
  expect(classifyInstallFailure('arbitrary canary detail')).toBe('unknown');
});

const versions = {
  '@opennextjs/cloudflare': '1.20.2',
  wrangler: '4.118.0',
  vitest: '4.1.10',
  '@cloudflare/vitest-pool-workers': '0.20.1',
  msw: '2.15.0',
} as const;
const integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;

type LockFixture = {
  lockfileVersion: number;
  configVersion: number;
  workspaces: { '': { dependencies: Record<string, string>; devDependencies: Record<string, string> } };
  packages: Record<string, unknown[]>;
};

function validLock(): LockFixture {
  return {
    lockfileVersion: 1,
    configVersion: 1,
    workspaces: { '': { dependencies: {}, devDependencies: { ...versions } } },
    packages: Object.fromEntries(Object.entries(versions).map(([name, version]) => [name, [`${name}@${version}`, '', {}, integrity]])),
  };
}

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-install-root-'));
  writeFileSync(path.join(directory, 'package.json'), '{\n  "trustedDependencies": []\n}\n');
  writeFileSync(path.join(directory, 'bun.lock'), JSON.stringify(validLock(), null, 2));
  return directory;
}

function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}

function child(exitCode = 0, stdout: string[] = [], stderr: string[] = []) {
  return { exited: Promise.resolve(exitCode), stdout: stream(...stdout), stderr: stream(...stderr) };
}

function messages(error: unknown): string[] {
  if (error instanceof AggregateError) return [error.message, ...error.errors.flatMap(messages)];
  return [error instanceof Error ? error.message : String(error)];
}

async function rejection(action: () => Promise<unknown>): Promise<string[]> {
  try { await action(); } catch (error) { return messages(error); }
  throw new Error('expected rejection');
}

describe('C1-A dependency installer', () => {
  test('requires an authenticated 0700 owned directory and builds exact add/frozen argv under a scrubbed environment', () => {
    const addOwned = createOwnedInstallDirectory();
    const frozenOwned = createOwnedInstallDirectory();
    try {
      const add = buildInstallInvocation('add', {
        OPENROUTER_API_KEY: 'canary', npm_config_registry: 'bad', NPM_TOKEN: 'bad', SAFE: 'yes',
        NODE_OPTIONS: '--require=/tmp/foreign', BUN_OPTIONS: '--preload=/tmp/foreign', HTTPS_PROXY: 'http://proxy.invalid',
        BUN_CONFIG_FILE: '/tmp/foreign-bunfig.toml', XDG_CONFIG_HOME: '/tmp/foreign-config',
      }, ['ANTHROPIC_TOKEN'], addOwned);
      expect(add.argv).toEqual([
        'bun', '--no-env-file', 'add', '--registry', 'https://registry.npmjs.org',
        '--ignore-scripts', '--dev', '--exact', '@opennextjs/cloudflare@1.20.2', 'wrangler@4.118.0', 'vitest@4.1.10',
        '@cloudflare/vitest-pool-workers@0.20.1', 'msw@2.15.0',
      ]);
      expect(add.env).toEqual({
        OPENROUTER_API_KEY: '', ANTHROPIC_TOKEN: '', SAFE: 'yes', BUN_CONFIG_NO_LOAD_DOTENV: '1',
        XDG_CONFIG_HOME: addOwned,
        NPM_CONFIG_USERCONFIG: path.join(addOwned, '.npmrc'),
        npm_config_userconfig: path.join(addOwned, '.npmrc'),
      });
      expect(add.env.NPM_CONFIG_USERCONFIG).toBe(path.join(addOwned, '.npmrc'));
      expect(add.env.npm_config_userconfig).toBe(path.join(addOwned, '.npmrc'));
      expect(readFileSync(path.join(addOwned, '.npmrc'), 'utf8')).toBe('');
      expect(readFileSync(path.join(addOwned, '.bunfig.toml'), 'utf8')).toBe('[install]\nregistry = "https://registry.npmjs.org"\n');
      expect(lstatSync(path.join(addOwned, '.npmrc')).mode & 0o777).toBe(0o600);
      expect(lstatSync(path.join(addOwned, '.bunfig.toml')).mode & 0o777).toBe(0o600);
      for (const name of ['npm_config_registry', 'NPM_TOKEN', 'NODE_OPTIONS', 'BUN_OPTIONS', 'HTTPS_PROXY', 'BUN_CONFIG_FILE']) expect(add.env[name]).toBeUndefined();
      const frozen = buildInstallInvocation('frozen', {}, [], frozenOwned);
      expect(frozen.argv).toEqual(['bun', '--no-env-file', 'install', '--registry', 'https://registry.npmjs.org', '--frozen-lockfile', '--ignore-scripts']);
      expect(frozen.env.XDG_CONFIG_HOME).toBe(frozenOwned);

      const other = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-install-'));
      expect(() => buildInstallInvocation('frozen', {}, [], other)).toThrow('owned directory required');
      rmSync(other, { recursive: true, force: true });
      const changed = createOwnedInstallDirectory();
      chmodSync(changed, 0o755);
      expect(() => buildInstallInvocation('frozen', {}, [], changed)).toThrow('owned directory changed');
      rmSync(changed, { recursive: true, force: true });
      const collision = createOwnedInstallDirectory();
      writeFileSync(path.join(collision, '.npmrc'), 'collision', { mode: 0o600 });
      expect(() => buildInstallInvocation('frozen', {}, [], collision)).toThrow('owned file collision');
      rmSync(collision, { recursive: true, force: true });
    } finally {
      rmSync(addOwned, { recursive: true, force: true });
      rmSync(frozenOwned, { recursive: true, force: true });
    }
  });

  test('streams a successful child with shell false and returns only the fixed bounded summary', async () => {
    const directory = root();
    let ownedDirectory = '';
    try {
      const seen: unknown[] = [];
      const result = await executeInstaller('frozen', directory, { TOKEN: 'canary' }, (argv, options) => {
        seen.push([argv, options]);
        ownedDirectory = options.env.XDG_CONFIG_HOME!;
        return child(0, ['safe output']);
      });
      expect(seen).toHaveLength(1);
      const [argv, options] = seen[0] as [readonly string[], {
        cwd: string; env: Record<string, string>; stdout: string; stderr: string; shell: boolean;
      }];
      expect(argv).toEqual(['bun', '--no-env-file', 'install', '--registry', 'https://registry.npmjs.org', '--frozen-lockfile', '--ignore-scripts']);
      expect(options).toEqual({
        cwd: directory,
        env: {
          TOKEN: '',
          NPM_CONFIG_USERCONFIG: path.join(ownedDirectory, '.npmrc'),
          npm_config_userconfig: path.join(ownedDirectory, '.npmrc'),
          XDG_CONFIG_HOME: ownedDirectory,
          BUN_CONFIG_NO_LOAD_DOTENV: '1',
        },
        stdout: 'pipe', stderr: 'pipe', shell: false,
      });
      expect(result.summary).toContain('exit=0');
      expect(result.summary).not.toContain('canary');
      expect(existsSync(ownedDirectory)).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('fails closed on real retained-output overflow and scans lifecycle markers across chunks beyond the cap', async () => {
    const overflowRoot = root();
    try {
      const found = await rejection(() => executeInstaller('frozen', overflowRoot, {}, () => child(0, ['x'.repeat(65_537)])));
      expect(found).toContain('c1-a installer: output limit exceeded');
    } finally { rmSync(overflowRoot, { recursive: true, force: true }); }

    const lifecycleRoot = root();
    try {
      const found = await rejection(() => executeInstaller('frozen', lifecycleRoot, {}, () => child(0, ['x'.repeat(70_000), 'posti', 'nstall'])));
      expect(found).toContain('c1-a installer: lifecycle output observed');
    } finally { rmSync(lifecycleRoot, { recursive: true, force: true }); }
  });

  test('validates the Bun-v1 lock structurally and rejects duplicate, malformed, alternate-source, and integrity variants', () => {
    const cases: Array<[string, (lock: LockFixture) => string]> = [
      ['workspace version', (lock) => { lock.workspaces[''].devDependencies.msw = '^2.15.0'; return JSON.stringify(lock); }],
      ['production ownership', (lock) => { lock.workspaces[''].dependencies.msw = '2.15.0'; return JSON.stringify(lock); }],
      ['resolved version', (lock) => { lock.packages.msw[0] = 'msw@2.14.0'; return JSON.stringify(lock); }],
      ['alternate source', (lock) => { lock.packages.msw[1] = 'https://registry.npmjs.org'; return JSON.stringify(lock); }],
      ['malformed array', (lock) => { lock.packages.msw.push('extra'); return JSON.stringify(lock); }],
      ['invalid integrity', (lock) => { lock.packages.msw[3] = 'sha512-a'; return JSON.stringify(lock); }],
      ['alternate resolved key', (lock) => { lock.packages['msw@2.15.0'] = [...lock.packages.msw]; return JSON.stringify(lock); }],
      ['alternate transitive source', (lock) => {
        lock.packages.transitive = ['transitive@1.0.0', 'https://foreign.invalid/transitive.tgz', {}, integrity];
        return JSON.stringify(lock);
      }],
      ['alternate transitive resolution', (lock) => {
        lock.packages.transitive = ['transitive@file:../foreign', '', {}, integrity];
        return JSON.stringify(lock);
      }],
      ['leading-zero major', (lock) => {
        lock.packages.transitive = ['transitive@01.0.0', '', {}, integrity];
        return JSON.stringify(lock);
      }],
      ['leading-zero numeric prerelease', (lock) => {
        lock.packages.transitive = ['transitive@1.0.0-01', '', {}, integrity];
        return JSON.stringify(lock);
      }],
      ['invalid npm package name', (lock) => {
        lock.packages.transitive = ['.@1.0.0', '', {}, integrity];
        return JSON.stringify(lock);
      }],
      ['alternate vendored source', (lock) => {
        lock.packages['@event-every/scanner'] = ['@event-every/scanner@file:../foreign', {}];
        return JSON.stringify(lock);
      }],
      ['duplicate key', (lock) => {
        const entry = JSON.stringify(lock.packages.msw);
        const packages = JSON.stringify(lock.packages).replace(/}$/, `,"msw":${entry}}`);
        return `{"lockfileVersion":1,"workspaces":${JSON.stringify(lock.workspaces)},"packages":${packages}}`;
      }],
    ];
    for (const [name, mutate] of cases) {
      const directory = root();
      try {
        writeFileSync(path.join(directory, 'bun.lock'), mutate(validLock()));
        expect(() => validateInstalledLock(directory), name).toThrow('c1-a installer: lock validation failed');
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
    const validExtended = root();
    try {
      const lock = validLock();
      lock.packages['@scope/pkg'] = ['@scope/pkg@1.0.0-rc.1+build.5', '', {}, integrity];
      writeFileSync(path.join(validExtended, 'bun.lock'), JSON.stringify(lock));
      expect(() => validateInstalledLock(validExtended)).not.toThrow();
    } finally { rmSync(validExtended, { recursive: true, force: true }); }
  });

  test('validates trustedDependencies source bytes and the lock in finally while preserving child failure as primary', async () => {
    const directory = root();
    try {
      const found = await rejection(() => executeInstaller('frozen', directory, {}, () => {
        writeFileSync(path.join(directory, 'package.json'), '{\n  "trustedDependencies" : [ ]\n}\n');
        writeFileSync(path.join(directory, 'bun.lock'), '{}');
        return child(9);
      }));
      expect(found[1]).toBe('c1-a installer: child failed (9; unknown)');
      expect(found).toContain('c1-a installer: trustedDependencies changed');
      expect(found.some((message) => message.includes('lock validation failed'))).toBe(true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('authenticates owned file and directory inode/type/mode during cleanup and still attempts every owned cleanup', async () => {
    for (const target of ['npmrc-mode', 'bunfig-inode', 'directory-mode'] as const) {
      const directory = root();
      let ownedDirectory = '';
      let npmrc = '';
      let bunfig = '';
      try {
        const found = await rejection(() => executeInstaller('frozen', directory, {}, (argv, options) => {
          npmrc = options.env.NPM_CONFIG_USERCONFIG!;
          bunfig = path.join(options.env.XDG_CONFIG_HOME!, '.bunfig.toml');
          ownedDirectory = path.dirname(npmrc);
          if (target === 'npmrc-mode') chmodSync(npmrc, 0o644);
          if (target === 'bunfig-inode') { unlinkSync(bunfig); writeFileSync(bunfig, 'replacement', { mode: 0o600 }); }
          if (target === 'directory-mode') chmodSync(ownedDirectory, 0o755);
          return child(0);
        }));
        expect(found.some((message) => message.includes(target === 'directory-mode' ? 'owned directory changed' : 'owned file changed'))).toBe(true);
        if (target === 'npmrc-mode') {
          expect(existsSync(npmrc)).toBe(true);
          expect(existsSync(bunfig)).toBe(false);
        } else if (target === 'bunfig-inode') {
          expect(existsSync(npmrc)).toBe(false);
          expect(existsSync(bunfig)).toBe(true);
        } else {
          expect(existsSync(npmrc)).toBe(true);
          expect(existsSync(bunfig)).toBe(true);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
        if (ownedDirectory) rmSync(ownedDirectory, { recursive: true, force: true });
      }
    }
  });

  test('rejects repository auth and root-only local vars before setup or child dispatch', async () => {
    for (const [file, value, expected] of [
      ['.npmrc', 'auth', 'repository .npmrc present'],
      ['bunfig.toml', '[install]\nregistry = "https://bad.invalid"', 'repository bunfig auth or registry present'],
      ['.dev.vars', 'unread', 'local vars file present'],
    ] as const) {
      const directory = root(); let dispatched = 0;
      try {
        writeFileSync(path.join(directory, file), value);
        const found = await rejection(() => executeInstaller('frozen', directory, {}, () => { dispatched += 1; return child(); }));
        expect(found.some((message) => message.includes(expected))).toBe(true);
        expect(dispatched).toBe(0);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  });
});
