import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createC1AOfflineEnvironment, TASK_1_OFFLINE_COMMANDS, runTask1Offline } from './run-c1-a-offline';
function bytes(value = ''): Uint8Array { return new TextEncoder().encode(value); }

describe('C1-A offline runner', () => {
  test('empties parent/four-dotenv canaries and preserves fixed controls', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-'));
    try { for (const [i, file] of ['.env.production.local', '.env.local', '.env.production', '.env'].entries()) writeFileSync(path.join(root, file), `RESEND_TOKEN_${i}=canary`); const env = createC1AOfflineEnvironment({ OPENROUTER_API_KEY: 'parent' }, root); expect(env).toMatchObject({ OPENROUTER_API_KEY: '', RESEND_TOKEN_0: '', RESEND_TOKEN_1: '', RESEND_TOKEN_2: '', RESEND_TOKEN_3: '', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' }); } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test('runs the exact ordered Task 1 local-only command arrays with shell false and stops at first failure', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-run-'));
    try {
      const seen: unknown[] = [];
      let failure: Error | undefined;
      try {
        runTask1Offline(root, { C1_A_TEST_TOKEN: 'synthetic-output-canary' }, (argv, options) => {
          seen.push([argv, options]);
          return { exitCode: seen.length === 2 ? 4 : 0, stdout: bytes('C1_A_TEST_TOKEN synthetic-output-canary'), stderr: bytes() };
        });
      } catch (error) { failure = error as Error; }
      expect(failure?.message).toContain('c1-a offline step 2 failed (4)');
      expect(failure?.message).not.toContain('C1_A_TEST_TOKEN'); expect(failure?.message).not.toContain('synthetic-output-canary');
      expect(seen).toHaveLength(2); expect((seen[0] as [readonly string[]])[0]).toEqual(TASK_1_OFFLINE_COMMANDS[0]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('rejects root-only local vars before dispatch', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-offline-vars-')); let dispatched = 0;
    try {
      writeFileSync(path.join(root, '.dev.vars.test'), 'unread');
      expect(() => runTask1Offline(root, {}, () => { dispatched += 1; return { exitCode: 0, stdout: bytes(), stderr: bytes() }; })).toThrow('local vars file present');
      expect(dispatched).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
