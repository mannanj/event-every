import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const SCANNER_COMMIT = '98aec60cf9d87544196bfd0fa702c8170453bfd8';
const CREDENTIAL_NAME = /OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV_REST/i;
const artifactRoot = path.resolve(import.meta.dir, '../vendor/event-every-scanner');

type StagedPackage = Readonly<{
  name: string;
  version: string;
  private: boolean;
  type: string;
  sideEffects: boolean;
  exports: unknown;
  dependencies: Record<string, string>;
}>;

type Environment = Record<string, string | undefined>;

function commandOutput(command: string, args: string[], cwd: string, env: Environment = process.env): string {
  const result = Bun.spawnSync([command, ...args], {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function credentialFreeEnvironment(environment: Environment): Environment {
  return Object.fromEntries(
    Object.entries(environment).map(([name, value]) => [name, CREDENTIAL_NAME.test(name) ? '' : value]),
  );
}

async function regularFiles(directory: string, relative = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const nextRelative = path.posix.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await regularFiles(absolute, nextRelative));
    } else if (entry.isFile()) {
      files.push(nextRelative);
    } else {
      throw new Error(`Unsupported staged Scanner artifact entry: ${nextRelative}`);
    }
  }
  return files;
}

export async function assertExactBuildInventory(
  scannerRoot: string,
  compilerOutput: string,
): Promise<void> {
  const distRoot = path.join(scannerRoot, 'dist');
  const emitted = compilerOutput
    .split(/\r?\n/)
    .filter((line) => line.startsWith('TSFILE: '))
    .map((line) => path.resolve(line.slice('TSFILE: '.length)))
    .map((absolute) => {
      const relative = path.relative(distRoot, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Scanner build emitted outside dist: ${absolute}`);
      }
      return relative.split(path.sep).join('/');
    })
    .sort();
  if (emitted.length === 0) {
    throw new Error('Scanner build did not report any emitted dist files');
  }

  const actual = (await regularFiles(distRoot)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(emitted)) {
    const unexpected = actual.filter((file) => !emitted.includes(file));
    const missing = emitted.filter((file) => !actual.includes(file));
    throw new Error(
      `Scanner dist inventory differs from this build`
      + `${unexpected.length ? `; unexpected: ${unexpected.join(', ')}` : ''}`
      + `${missing.length ? `; missing: ${missing.join(', ')}` : ''}`,
    );
  }
}

async function writeProvenance(staging: string): Promise<void> {
  const files = (await regularFiles(staging))
    .filter((file) => file === 'package.json' || file === 'README.md' || file.startsWith('dist/'))
    .sort();
  const entries = await Promise.all(files.map(async (file) => ({
    path: file,
    sha256: createHash('sha256')
      .update(await readFile(path.join(staging, file)))
      .digest('hex'),
  })));
  await writeFile(path.join(staging, 'PROVENANCE.json'), `${JSON.stringify({
    schemaVersion: 1,
    packageName: '@event-every/scanner',
    sourceCommit: SCANNER_COMMIT,
    files: entries,
  }, null, 2)}\n`);
}

async function installAtomically(staging: string): Promise<void> {
  const parent = path.dirname(artifactRoot);
  const backup = path.join(parent, `.event-every-scanner-backup-${randomUUID()}`);
  let previousMoved = false;
  try {
    try {
      await rename(artifactRoot, backup);
      previousMoved = true;
    } catch (error: unknown) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(staging, artifactRoot);
    } catch (error) {
      if (previousMoved) await rename(backup, artifactRoot);
      throw error;
    }
    if (previousMoved) await rm(backup, { recursive: true, force: false });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 1) {
    throw new Error('Usage: bun scripts/vendor-event-scanner.ts <scanner-checkout-path>');
  }

  const scannerRoot = path.resolve(arguments_[0]);
  const commit = commandOutput('git', ['rev-parse', 'HEAD'], scannerRoot);
  if (commit !== SCANNER_COMMIT) {
    throw new Error(`Scanner checkout must be exactly ${SCANNER_COMMIT}`);
  }
  if (commandOutput('git', ['status', '--porcelain'], scannerRoot) !== '') {
    throw new Error('Scanner checkout must have a clean working tree');
  }
  const cleanEnvironment = credentialFreeEnvironment(process.env);
  commandOutput('bun', ['run', 'verify'], scannerRoot, cleanEnvironment);
  const emitted = commandOutput(
    'bun',
    [
      path.join(scannerRoot, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.build.json',
      '--listEmittedFiles',
      '--pretty',
      'false',
    ],
    scannerRoot,
    cleanEnvironment,
  );
  await assertExactBuildInventory(scannerRoot, emitted);

  await mkdir(path.dirname(artifactRoot), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(artifactRoot), '.event-every-scanner-staging-'));
  try {
    await cp(path.join(scannerRoot, 'package.json'), path.join(staging, 'package.json'));
    await cp(path.join(scannerRoot, 'README.md'), path.join(staging, 'README.md'));
    await cp(path.join(scannerRoot, 'dist'), path.join(staging, 'dist'), { recursive: true });
    const sourcePackage = JSON.parse(await readFile(path.join(staging, 'package.json'), 'utf8')) as StagedPackage;
    const stagedPackage: StagedPackage = {
      name: sourcePackage.name,
      version: sourcePackage.version,
      private: sourcePackage.private,
      type: sourcePackage.type,
      sideEffects: sourcePackage.sideEffects,
      exports: sourcePackage.exports,
      dependencies: sourcePackage.dependencies,
    };
    await writeFile(path.join(staging, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`);
    await writeProvenance(staging);
    await installAtomically(staging);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (import.meta.main) await main();
