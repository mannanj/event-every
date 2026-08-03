import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseOpenNextChild, runWithOpenNext } from './run-with-open-next';
import type { C1AEnvironment } from './run-c1-a-cloudflare';

type ManagedSignal = 'SIGINT' | 'SIGTERM' | 'SIGHUP';

class FakeSignals {
  private readonly listeners = new Map<ManagedSignal, Set<() => void>>();
  on(signal: ManagedSignal, listener: () => void): void {
    const set = this.listeners.get(signal) ?? new Set(); set.add(listener); this.listeners.set(signal, set);
  }
  off(signal: ManagedSignal, listener: () => void): void { this.listeners.get(signal)?.delete(listener); }
  emit(signal: ManagedSignal): void { for (const listener of this.listeners.get(signal) ?? []) listener(); }
  count(): number { return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0); }
}

function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });
}

function child(exitCode = 0, stdout: string[] = [], stderr: string[] = []) {
  return { exited: Promise.resolve(exitCode), stdout: stream(...stdout), stderr: stream(...stderr), kill() {} };
}

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-open-next-'));
  mkdirSync(path.join(directory, 'scripts'));
  writeFileSync(path.join(directory, 'scripts', 'run-with-open-next.ts'), 'wrapper');
  writeFileSync(path.join(directory, 'scripts', 'c1-a-offline-preload.cjs'), '');
  writeFileSync(path.join(directory, 'open-next.config.ts'), 'config');
  return directory;
}

function createBundle(directory: string, wrangler = false): void {
  mkdirSync(path.join(directory, '.open-next')); writeFileSync(path.join(directory, '.open-next', 'worker.js'), 'worker');
  if (wrangler) mkdirSync(path.join(directory, '.wrangler'));
}

function messages(error: unknown): string[] {
  if (error instanceof AggregateError) return [error.message, ...error.errors.flatMap(messages)];
  return [error instanceof Error ? error.message : String(error)];
}

async function rejection(action: () => Promise<unknown>): Promise<string[]> {
  try { await action(); } catch (error) { return messages(error); }
  throw new Error('expected rejection');
}

describe('OpenNext output owner', () => {
  test('accepts the post-separator argv forwarded by bun run', () => {
    expect(parseOpenNextChild(['node'])).toEqual(['node']);
    expect(parseOpenNextChild(['node', 'child'])).toEqual(['node', 'child']);
    expect(parseOpenNextChild(['--', 'node', 'child'])).toEqual(['node', 'child']);
  });

  test('rejects malformed, deploy/upload/preview, and recursive commands before a build', () => {
    for (const argv of [[], ['--'], [''], ['--', 'wrangler', 'deploy'], ['--', 'x', 'preview'], ['--', 'bun', 'scripts/run-with-open-next.ts']]) {
      expect(() => parseOpenNextChild(argv)).toThrow('c1-a OpenNext owner:');
    }
  });

  test('requires both authored files and refuses either generated-output collision before spawn', async () => {
    for (const missing of ['scripts/run-with-open-next.ts', 'open-next.config.ts']) {
      const directory = root(); let spawned = 0;
      try {
        rmSync(path.join(directory, missing));
        const found = await rejection(() => runWithOpenNext(directory, ['node', 'child'], {}, { spawn: () => { spawned += 1; return child(); } }));
        expect(found.some((message) => message.includes(missing.startsWith('scripts') ? 'authored wrapper missing' : 'authored config missing'))).toBe(true);
        expect(spawned).toBe(0);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
    for (const collision of ['.open-next', '.wrangler']) {
      const directory = root(); let spawned = 0;
      try {
        mkdirSync(path.join(directory, collision));
        const found = await rejection(() => runWithOpenNext(directory, ['node', 'child'], {}, { spawn: () => { spawned += 1; return child(); } }));
        expect(found).toContain(`c1-a OpenNext owner: ${collision} already exists`); expect(spawned).toBe(0);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  });

  test('builds before child under one scrubbed environment, caps/redacts output, and removes both owned outputs', async () => {
    const directory = root();
    try {
      for (const [index, file] of ['.env.production.local', '.env.local', '.env.production', '.env'].entries()) {
        writeFileSync(path.join(directory, file), `C1_A_DOTENV_TOKEN_${index}=dotenv-canary-${index}\n`);
      }
      const seen: Array<{ argv: readonly string[]; env: C1AEnvironment }> = [];
      const result = await runWithOpenNext(directory, ['node', 'child'], {
        C1_A_PARENT_TOKEN: 'synthetic-parent-canary', NODE_OPTIONS: '--require=/tmp/foreign', BUN_OPTIONS: '--preload=/tmp/foreign', HTTPS_PROXY: 'http://proxy.invalid',
      }, {
        spawn(argv, options) {
          seen.push({ argv, env: options.env });
          if (seen.length === 1) { createBundle(directory, true); return child(); }
          return child(0, [`C1_A_PARENT_TOKEN synthetic-parent-canary ${'x'.repeat(70_000)}`], ['safe']);
        },
      });
      expect(seen.map((entry) => entry.argv)).toEqual([
        ['node', 'node_modules/@opennextjs/cloudflare/dist/cli/index.js', 'build'], ['node', 'child'],
      ]);
      for (const entry of seen) {
        expect(entry.env.C1_A_PARENT_TOKEN).toBe('');
        for (let index = 0; index < 4; index += 1) expect(entry.env[`C1_A_DOTENV_TOKEN_${index}`]).toBe('');
        expect(entry.env.NODE_OPTIONS).toBe(`--require=${path.join(directory, 'scripts', 'c1-a-offline-preload.cjs')}`);
        expect(entry.env.BUN_OPTIONS).toBeUndefined(); expect(entry.env.HTTPS_PROXY).toBeUndefined();
      }
      expect(result.stdout.length).toBeLessThanOrEqual(65_536);
      expect(result.stdout).not.toContain('C1_A_PARENT_TOKEN'); expect(result.stdout).not.toContain('synthetic-parent-canary');
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(directory, '.open-next'))).toBe(false);
      expect(existsSync(path.join(directory, '.wrangler'))).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('fails before child on build failure or missing bundle and returns fixed child failure', async () => {
    const buildRoot = root();
    try {
      let calls = 0;
      expect(await rejection(() => runWithOpenNext(buildRoot, ['node', 'child'], {}, { spawn: () => { calls += 1; return child(2, ['native-build-canary']); } }))).toContain('c1-a OpenNext owner: build failed (2)');
      expect(calls).toBe(1);
    } finally { rmSync(buildRoot, { recursive: true, force: true }); }

    const missingRoot = root();
    try {
      let calls = 0;
      expect(await rejection(() => runWithOpenNext(missingRoot, ['node', 'child'], {}, { spawn: () => { calls += 1; return child(); } }))).toContain('c1-a OpenNext owner: missing .open-next/worker.js');
      expect(calls).toBe(1);
    } finally { rmSync(missingRoot, { recursive: true, force: true }); }

    const childRoot = root();
    try {
      let calls = 0;
      const found = await rejection(() => runWithOpenNext(childRoot, ['node', 'child'], {}, { spawn: () => { calls += 1; if (calls === 1) { createBundle(childRoot); return child(); } return child(7, ['credential-canary']); } }));
      expect(found).toContain('c1-a OpenNext owner: child failed (7)'); expect(found.join(' ')).not.toContain('credential-canary');
    } finally { rmSync(childRoot, { recursive: true, force: true }); }
  });

  test('handles signals through the async lifecycle with TERM then bounded KILL and guaranteed cleanup', async () => {
    const directory = root(); const signals = new FakeSignals(); const kills: string[] = [];
    try {
      let calls = 0; let resolveExit!: (code: number) => void;
      const found = await rejection(() => runWithOpenNext(directory, ['node', 'child'], {}, {
        signals, terminateTimeoutMs: 1,
        spawn() {
          calls += 1;
          if (calls === 1) { createBundle(directory, true); return child(); }
          const exited = new Promise<number>((resolve) => { resolveExit = resolve; });
          queueMicrotask(() => signals.emit('SIGTERM'));
          return { exited, stdout: stream(), stderr: stream(), kill(signal) { kills.push(signal); if (signal === 'SIGKILL') resolveExit(137); } };
        },
      }));
      expect(found).toContain('c1-a OpenNext owner: interrupted');
      expect(kills).toEqual(['SIGTERM', 'SIGKILL']); expect(signals.count()).toBe(0);
      expect(existsSync(path.join(directory, '.open-next'))).toBe(false);
      expect(existsSync(path.join(directory, '.wrangler'))).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('drives a real spawned child through TERM then KILL without network or installation', async () => {
    const directory = root(); const signals = new FakeSignals(); const marker = path.join(directory, 'term-observed');
    try {
      const cli = path.join(directory, 'node_modules', '@opennextjs', 'cloudflare', 'dist', 'cli');
      mkdirSync(cli, { recursive: true });
      writeFileSync(path.join(cli, 'index.js'), "const fs=require('node:fs');fs.mkdirSync('.open-next',{recursive:true});fs.writeFileSync('.open-next/worker.js','worker');");
      const timer = setTimeout(() => signals.emit('SIGTERM'), 300);
      const found = await rejection(() => runWithOpenNext(directory, [
        'node', '-e', `const fs=require('node:fs');process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(marker)},'term'));setInterval(()=>{},1000);`,
      ], { PATH: process.env.PATH }, { signals, terminateTimeoutMs: 50 }));
      clearTimeout(timer);
      expect(found).toContain('c1-a OpenNext owner: interrupted');
      expect(existsSync(marker)).toBe(true); expect(signals.count()).toBe(0);
      expect(existsSync(path.join(directory, '.open-next'))).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('detects both authored hash changes and aggregates partial cleanup without masking primary failure', async () => {
    const hashRoot = root();
    try {
      let calls = 0;
      const found = await rejection(() => runWithOpenNext(hashRoot, ['node', 'child'], {}, {
        spawn() {
          calls += 1;
          if (calls === 1) { createBundle(hashRoot); return child(); }
          writeFileSync(path.join(hashRoot, 'scripts', 'run-with-open-next.ts'), 'changed');
          writeFileSync(path.join(hashRoot, 'open-next.config.ts'), 'changed');
          return child();
        },
      }));
      expect(found).toContain('c1-a OpenNext owner: authored input changed: run-with-open-next.ts');
      expect(found).toContain('c1-a OpenNext owner: authored input changed: open-next.config.ts');
    } finally { rmSync(hashRoot, { recursive: true, force: true }); }

    const cleanupRoot = root();
    try {
      let calls = 0; const attempted: string[] = [];
      const found = await rejection(() => runWithOpenNext(cleanupRoot, ['node', 'child'], {}, {
        spawn() { calls += 1; if (calls === 1) { createBundle(cleanupRoot, true); return child(); } return child(9); },
        remove(target) { attempted.push(path.basename(target)); if (target.endsWith('.open-next')) throw new Error('native-canary'); rmSync(target, { recursive: true, force: true }); },
      }));
      expect(found[1]).toBe('c1-a OpenNext owner: child failed (9)');
      expect(found).toContain('c1-a OpenNext owner: cleanup failed for .open-next');
      expect(found.join(' ')).not.toContain('native-canary'); expect(attempted).toEqual(['.open-next', '.wrangler']);
    } finally { rmSync(cleanupRoot, { recursive: true, force: true }); }
  });
});
