import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PRIVATE_PRIVACY_COMMANDS,
  PRIVATE_PRIVACY_STATES,
  createPrivatePrivacyEnvironment,
  runPrivatePrivacy,
  scanPrivateOutputs,
  type PrivatePrivacySeams,
} from './run-private-privacy';

const root = '/repo';

function fixture(overrides: Partial<PrivatePrivacySeams> = {}) {
  const calls: string[] = [];
  const removed: string[][] = [];
  let signal: ((name: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => void) | undefined;
  const seams: PrivatePrivacySeams = {
    suffix: () => 'abcdef123456',
    exists: () => false,
    hash: (file) => `hash:${file}`,
    spawn: async (argv, options) => {
      calls.push(JSON.stringify(argv));
      expect(options.signal.aborted).toBe(false);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    deadline: () => new Promise(() => undefined),
    prepareTemp: (target) => calls.push(`temp:${target}`),
    scanOutputs: (paths) => calls.push(`scan:${paths.length}`),
    removeOwned: (paths) => removed.push([...paths]),
    subscribeSignals: (listener) => { signal = listener; return () => calls.push('signals-removed'); },
    ...overrides,
  };
  return { seams, calls, removed, sendSignal: (name: 'SIGINT' | 'SIGTERM' | 'SIGHUP') => signal?.(name) };
}

describe('private privacy orchestrator', () => {
  test('runs the exact bounded offline stages and cleans every owned output', async () => {
    const f = fixture();
    await expect(runPrivatePrivacy(root, { OPENROUTER_API_KEY: 'parent-secret', SAFE: 'yes' }, f.seams))
      .resolves.toEqual(PRIVATE_PRIVACY_STATES);
    expect(f.calls.filter((value) => value.startsWith('['))).toEqual(PRIVATE_PRIVACY_COMMANDS.map((value) => JSON.stringify(value)));
    expect(f.calls).toContain('temp:/repo/.private-privacy-abcdef123456');
    expect(f.calls.filter((value) => value.startsWith('scan:'))).toEqual(['scan:5', 'scan:5']);
    expect(f.removed).toHaveLength(1);
    expect(f.removed[0]).toHaveLength(5);
    expect(f.calls.at(-1)).toBe('signals-removed');
  });

  test('scrubs inherited credentials, installs both offline preloads, and keeps only synthetic bindings', () => {
    const env = createPrivatePrivacyEnvironment({
      PATH: '/bin', HOME: '/safe-home', SAFE: 'yes', OPENROUTER_API_KEY: 'real',
      CLOUDFLARE_API_TOKEN: 'real-cloudflare', NODE_OPTIONS: '--require=/unsafe',
    }, root, 'abcdef123456');
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(env.SAFE).toBeUndefined();
    expect(env.OPENROUTER_OWNER_KEY).toBe('private-secret-marker-7e13f0');
    expect(env.PROVIDER_REQUEST_HMAC_CURRENT).toBe('synthetic-private-request-hmac');
    expect(env.NODE_OPTIONS).toBe(`--require=${root}/scripts/private-offline-preload.cjs`);
    expect(env.BUN_OPTIONS).toBe(`--preload=${root}/scripts/private-offline-preload.cjs`);
    expect(env.PRIVATE_OUTPUT_SUFFIX).toBe('abcdef123456');
    expect(env.PRIVATE_PRIVACY_CANARY).toBe('1');
    expect(env.TMPDIR).toBe('/repo/.private-privacy-abcdef123456');
    expect(env.TMP).toBe('/repo/.private-privacy-abcdef123456');
    expect(env.TEMP).toBe('/repo/.private-privacy-abcdef123456');
  });

  test('fails closed before children for collisions and after children for leaks or authored-input drift', async () => {
    const collision = fixture({ exists: (file) => file.endsWith('.open-next') });
    await expect(runPrivatePrivacy(root, {}, collision.seams)).rejects.toThrow('private privacy: owned output collision');
    expect(collision.calls.some((value) => value.startsWith('['))).toBe(false);

    const leaked = fixture({ spawn: async () => ({ exitCode: 0, stdout: 'raw-only-marker-2f84d1', stderr: '' }) });
    await expect(runPrivatePrivacy(root, {}, leaked.seams)).rejects.toThrow('private privacy: marker leak');
    expect(leaked.removed).toHaveLength(1);

    let reads = 0;
    const changed = fixture({ hash: (file) => `${reads++ >= 10 ? 'changed' : 'same'}:${file}` });
    await expect(runPrivatePrivacy(root, {}, changed.seams)).rejects.toThrow('private privacy: authored input changed');
    expect(changed.removed).toHaveLength(1);
  });

  test('fails closed on a child failure, timeout, or signal and still cleans outputs', async () => {
    const failed = fixture({ spawn: async () => ({ exitCode: 1, stdout: 'safe', stderr: 'safe' }) });
    await expect(runPrivatePrivacy(root, {}, failed.seams)).rejects.toThrow('private privacy: unit stage failed');
    expect(failed.removed).toHaveLength(1);

    const timed = fixture({ deadline: async () => undefined, spawn: async (_argv, { signal }) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      return { exitCode: 143, stdout: '', stderr: '' };
    } });
    await expect(runPrivatePrivacy(root, {}, timed.seams)).rejects.toThrow('private privacy: timeout');
    expect(timed.removed).toHaveLength(1);

    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const interrupted = fixture({ spawn: async (_argv, { signal }) => {
      entered();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      return { exitCode: 143, stdout: '', stderr: '' };
    } });
    const running = runPrivatePrivacy(root, {}, interrupted.seams);
    await started;
    interrupted.sendSignal('SIGTERM');
    await expect(running).rejects.toThrow('private privacy: aborted (SIGTERM)');
    expect(interrupted.removed).toHaveLength(1);
  });

  test('waits for an aborted stage to exit before scanning or removing outputs', async () => {
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const exited = new Promise<void>((resolve) => { release = resolve; });
    const f = fixture({
      deadline: async () => undefined,
      spawn: async (_argv, { signal }) => {
        entered();
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
        await exited;
        return { exitCode: 143, stdout: '', stderr: '' };
      },
    });
    const running = runPrivatePrivacy(root, {}, f.seams);
    await started; await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.removed).toEqual([]);
    expect(f.calls.some((value) => value.startsWith('scan:'))).toBe(false);
    release();
    await expect(running).rejects.toThrow('private privacy: timeout');
    expect(f.removed).toHaveLength(1);
  });

  test('does not let a completed stage deadline cancel a later stage', async () => {
    let releaseFirstDeadline!: () => void;
    const firstDeadline = new Promise<void>((resolve) => { releaseFirstDeadline = resolve; });
    let releaseSecondStage!: () => void;
    const secondStage = new Promise<void>((resolve) => { releaseSecondStage = resolve; });
    let spawnCount = 0;
    let deadlineCount = 0;
    const f = fixture({
      deadline: () => deadlineCount++ === 0 ? firstDeadline : new Promise(() => undefined),
      spawn: async () => {
        spawnCount += 1;
        if (spawnCount === 2) await secondStage;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    });
    const running = runPrivatePrivacy(root, {}, f.seams);
    while (spawnCount < 2) await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirstDeadline();
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseSecondStage();
    await expect(running).resolves.toEqual(PRIVATE_PRIVACY_STATES);
  });

  test('scans internal generated symlinks but rejects links outside the owned output', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'private-privacy-scan-'));
    try {
      const owned = path.join(directory, '.open-next'); mkdirSync(owned);
      const target = path.join(owned, 'target.js'); writeFileSync(target, 'safe');
      symlinkSync('target.js', path.join(owned, 'internal.js'));
      expect(() => scanPrivateOutputs([owned])).not.toThrow();
      writeFileSync(target, 'private-secret-marker-7e13f0');
      expect(() => scanPrivateOutputs([owned])).toThrow('private privacy: marker leak');
      writeFileSync(target, 'safe');
      const outside = path.join(directory, 'outside.js'); writeFileSync(outside, 'safe');
      symlinkSync(outside, path.join(owned, 'external.js'));
      expect(() => scanPrivateOutputs([owned])).toThrow('private privacy: generated output type');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
