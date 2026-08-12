import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as offline from './run-c1-a-offline';

function bytes(value = ''): Uint8Array { return new TextEncoder().encode(value); }

const EXPECTED_FULL_COMMANDS = [
  ['bun', 'test', 'scripts/assert-c1-a-config.test.ts', 'scripts/assert-c1-a-e2e-inventory.test.ts', 'scripts/install-c1-a-dependencies.test.ts', 'scripts/c1-a-offline-preload.test.ts', 'scripts/run-c1-a-cloudflare.test.ts', 'scripts/run-c1-a-offline.test.ts', 'scripts/run-c1-a-worker-e2e.test.ts', 'scripts/run-e1-focused.test.ts', 'scripts/run-with-open-next.test.ts', '--isolate'],
  ['bun', 'scripts/run-e1-offline.ts'],
  ['bun', 'scripts/run-with-open-next.ts', '--', 'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.workers.ts', 'test/worker/app-worker.test.ts', 'test/worker/admission.integration.test.ts', 'test/worker/resolver.integration.test.ts', 'test/worker/deny-egress.integration.test.ts'],
  ['bun', 'scripts/run-c1-a-cloudflare.ts', 'keepalive-tests'],
  ['bun', 'scripts/assert-c1-a-e2e-inventory.ts', '58'],
  ['bun', 'scripts/run-c1-a-worker-e2e.ts'],
  ['bun', 'scripts/assert-e1-protected.ts'],
  ['bun', 'scripts/assert-c1-a-config.ts'],
  ['git', 'diff', '--check'],
] as const;

type OfflineModule = typeof offline & {
  C1_A_FULL_COMMANDS: typeof EXPECTED_FULL_COMMANDS;
  parseC1AOfflineArguments(argv: readonly string[]): Readonly<{ kind: 'full' } | { kind: 'focus'; id: string }>;
  createC1AFocusCommand(root: string, id: string): readonly string[];
  runC1AOffline(
    root: string,
    sourceEnv: Record<string, string | undefined>,
    argv?: readonly string[],
    spawn?: (argv: readonly string[], options: { cwd: string; env: Record<string, string | undefined>; stdout: 'pipe'; stderr: 'pipe'; shell: false }) => Readonly<{ exitCode: number | null | undefined; stdout: Uint8Array; stderr: Uint8Array }>,
  ): void;
};
const lean = offline as OfflineModule;

describe('C1-A lean offline runner', () => {
  test('empties parent/four-dotenv canaries and preserves fixed controls', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-'));
    try {
      for (const [i, file] of ['.env.production.local', '.env.local', '.env.production', '.env'].entries()) writeFileSync(path.join(root, file), `RESEND_TOKEN_${i}=canary`);
      const env = offline.createC1AOfflineEnvironment({ OPENROUTER_API_KEY: 'parent' }, root);
      expect(env).toMatchObject({ OPENROUTER_API_KEY: '', RESEND_TOKEN_0: '', RESEND_TOKEN_1: '', RESEND_TOKEN_2: '', RESEND_TOKEN_3: '', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('accepts only no arguments or one closed retained mutation ID', () => {
    expect(typeof lean.parseC1AOfflineArguments).toBe('function');
    expect(lean.parseC1AOfflineArguments([])).toEqual({ kind: 'full' });
    for (const id of ['C1A-M01', 'C1A-M02', 'C1A-M03', 'C1A-M06', 'C1A-M08', 'C1A-M09', 'C1A-M16', 'C1A-M19', 'C1A-M21', 'C1A-M30'] as const) {
      expect(lean.parseC1AOfflineArguments(['--focus', id])).toEqual({ kind: 'focus', id });
    }
    for (const argv of [['--focus'], ['--focus', 'C1A-M04'], ['--focus', 'C1A-M01', 'extra'], ['--all'], ['--verify-ledger']]) {
      expect(() => lean.parseC1AOfflineArguments(argv)).toThrow('c1-a offline: expected no arguments or --focus <retained-id>');
    }
  });

  test('defines the exact ordered full gate without Task 11 evidence commands', () => {
    expect(lean.C1_A_FULL_COMMANDS).toEqual(EXPECTED_FULL_COMMANDS);
    expect(JSON.stringify(lean.C1_A_FULL_COMMANDS)).not.toMatch(/run-c1-a-mutations|validate-c1-a-evidence|c1-a-terminal-evidence|--write-ledger|--verify-ledger|--write-evidence/);
  });

  test('maps all ten retained IDs onto the exact eight preloaded focused commands', () => {
    expect(typeof lean.createC1AFocusCommand).toBe('function');
    const preload = '--preload=/repo/scripts/c1-a-offline-preload.cjs';
    const expected = {
      'C1A-M01': ['bun', preload, 'test', 'src/platform/__tests__/identity.test.ts', 'src/platform/__tests__/admission.test.ts', 'src/app/api/scan/__tests__/route.test.ts', '--isolate'],
      'C1A-M02': ['bun', preload, 'test', 'src/platform/__tests__/identity.test.ts', 'src/platform/__tests__/admission.test.ts', 'src/app/api/scan/__tests__/route.test.ts', '--isolate'],
      'C1A-M03': ['bun', preload, 'test', 'src/platform/__tests__/identity.test.ts', 'src/platform/__tests__/admission.test.ts', 'src/app/api/scan/__tests__/route.test.ts', '--isolate'],
      'C1A-M06': ['bun', preload, 'test', 'src/server/scanner/__tests__/image.test.ts', '--isolate'],
      'C1A-M08': ['bun', preload, 'test', 'src/platform/legacy/__tests__/dispatch.test.ts', 'src/server/scanner/__tests__/transport.test.ts', 'src/app/api/scan/__tests__/route.test.ts', '--isolate'],
      'C1A-M09': ['bun', preload, 'test', 'src/lib/__tests__/llm.test.ts', '--isolate'],
      'C1A-M16': ['bun', preload, 'test', 'src/platform/resolver/__tests__/url-policy.test.ts', 'src/app/api/scrape-url/__tests__/route.test.ts', '--isolate'],
      'C1A-M19': ['bun', preload, 'test', 'src/lib/__tests__/llm.test.ts', 'src/lib/__tests__/limits.test.ts', '--isolate'],
      'C1A-M21': ['bun', preload, 'test', 'src/services/__tests__/reviewStorage.test.ts', '--isolate'],
      'C1A-M30': ['bun', preload, 'test', 'src/platform/__tests__/runtime.test.ts', '--isolate'],
    } as const;
    for (const [id, command] of Object.entries(expected)) expect(lean.createC1AFocusCommand('/repo', id)).toEqual(command);
  });

  test('runs the full gate with shell false, redacts bounded output, and stops at first failure', () => {
    expect(typeof lean.runC1AOffline).toBe('function');
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-run-'));
    try {
      const seen: unknown[] = [];
      let failure: Error | undefined;
      try {
        lean.runC1AOffline(root, { C1_A_TEST_TOKEN: 'synthetic-output-canary' }, [], (argv, options) => {
          seen.push([argv, options]);
          return { exitCode: seen.length === 2 ? 4 : 0, stdout: bytes(`C1_A_TEST_TOKEN synthetic-output-canary ${'x'.repeat(70_000)}`), stderr: bytes() };
        });
      } catch (error) { failure = error as Error; }
      expect(failure?.message).toContain('c1-a offline step 2 failed (4)');
      expect(failure?.message).not.toContain('C1_A_TEST_TOKEN');
      expect(failure?.message).not.toContain('synthetic-output-canary');
      expect(failure?.message.length).toBeLessThan(66_000);
      expect(seen).toHaveLength(2);
      expect((seen[0] as [readonly string[]])[0]).toEqual(EXPECTED_FULL_COMMANDS[0]);
      expect((seen[0] as [unknown, { shell: boolean }])[1].shell).toBeFalse();
      expect((seen[0] as [unknown, { env: Record<string, string | undefined> }])[1].env.NODE_OPTIONS).toBeUndefined();
      expect((seen[1] as [unknown, { env: Record<string, string | undefined> }])[1].env.NODE_OPTIONS).toBe(`--require=${path.join(root, 'scripts', 'c1-a-offline-preload.cjs')}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('owns and removes only the .wrangler output created by the E1 step', () => {
    expect(typeof lean.runC1AOffline).toBe('function');
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-owner-'));
    try {
      const seen: (readonly string[])[] = [];
      lean.runC1AOffline(root, {}, [], (argv) => {
        seen.push([...argv]);
        if (seen.length === 2) {
          mkdirSync(path.join(root, '.wrangler'));
          writeFileSync(path.join(root, '.wrangler', 'e1-owned'), 'generated');
        }
        if (seen.length === 3) expect(existsSync(path.join(root, '.wrangler'))).toBeFalse();
        return { exitCode: 0, stdout: bytes(), stderr: bytes() };
      });
      expect(seen).toEqual([...EXPECTED_FULL_COMMANDS]);
      expect(existsSync(path.join(root, '.wrangler'))).toBeFalse();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects and preserves a pre-existing .wrangler output before dispatch', () => {
    expect(typeof lean.runC1AOffline).toBe('function');
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-collision-'));
    try {
      const marker = path.join(root, '.wrangler', 'pre-existing');
      mkdirSync(path.dirname(marker)); writeFileSync(marker, 'preserve');
      let dispatched = 0;
      expect(() => lean.runC1AOffline(root, {}, [], () => {
        dispatched += 1;
        return { exitCode: 0, stdout: bytes(), stderr: bytes() };
      })).toThrow('c1-a offline: .wrangler already exists');
      expect(dispatched).toBe(0);
      expect(existsSync(marker)).toBeTrue();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('runs exactly one focused command and propagates its named RED output', () => {
    expect(typeof lean.runC1AOffline).toBe('function');
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-focus-'));
    try {
      const seen: (readonly string[])[] = [];
      let failure: Error | undefined;
      try {
        lean.runC1AOffline(root, {}, ['--focus', 'C1A-M30'], (argv) => {
          seen.push([...argv]);
          return { exitCode: 1, stdout: bytes('shadow fails closed for every legacy port'), stderr: bytes() };
        });
      } catch (error) { failure = error as Error; }
      expect(seen).toEqual([lean.createC1AFocusCommand(root, 'C1A-M30')]);
      expect(failure?.message).toContain('shadow fails closed for every legacy port');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects root-only local vars before parsing or dispatch', () => {
    expect(typeof lean.runC1AOffline).toBe('function');
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-vars-')); let dispatched = 0;
    try {
      writeFileSync(path.join(root, '.dev.vars.test'), 'unread');
      expect(() => lean.runC1AOffline(root, {}, ['--focus', 'C1A-M01'], () => { dispatched += 1; return { exitCode: 0, stdout: bytes(), stderr: bytes() }; })).toThrow('local vars file present');
      expect(dispatched).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
