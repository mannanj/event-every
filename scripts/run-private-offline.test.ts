import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import * as runner from './run-private-offline';

const bytes = (value = '') => new TextEncoder().encode(value);

describe('private offline runner', () => {
  test('the real CLI requires Bun to have received an actual separator', async () => {
    const root = path.resolve(import.meta.dir, '..');
    const invoke = async (args: string[]) => {
      const cliArgs = args[0] === '--' ? ['--', 'scripts/run-private-offline.ts', '--', ...args.slice(1)] : ['scripts/run-private-offline.ts', ...args];
      const child = Bun.spawn(['bun', ...cliArgs], { cwd: root, env: runner.createPrivateOfflineEnvironment(process.env, root), stdout: 'pipe', stderr: 'pipe' });
      return { exitCode: await child.exited, stdout: await new Response(child.stdout).text(), stderr: await new Response(child.stderr).text() };
    };
    const withoutSeparator = await invoke(['bun', '-e', 'process.exit(0)']);
    expect(withoutSeparator.exitCode).not.toBe(0);
    expect(withoutSeparator.stdout).toBe('');
    expect(withoutSeparator.stderr.trim()).toBe('private offline: command failed');
    const strippedScriptSeparator = Bun.spawn(['bun', 'scripts/run-private-offline.ts', '--', 'bun', '-e', 'process.exit(0)'], { cwd: root, env: runner.createPrivateOfflineEnvironment(process.env, root), stdout: 'pipe', stderr: 'pipe' });
    const strippedResult = await Promise.all([strippedScriptSeparator.exited, new Response(strippedScriptSeparator.stdout).text(), new Response(strippedScriptSeparator.stderr).text()]);
    expect(strippedResult[0]).not.toBe(0);
    expect(strippedResult[1]).toBe('');
    expect(strippedResult[2].trim()).toBe('private offline: command failed');
    const withSeparator = await invoke(['--', 'bun', '-e', 'process.exit(0)']);
    expect(withSeparator).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  test('maps real nonexistent executables to the fixed error without hanging or leaking spawn details', async () => {
    const root = path.resolve(import.meta.dir, '..');
    const missing = 'private-offline-command-that-does-not-exist';
    await expect(Promise.race([
      runner.runPrivateOffline(root, runner.createPrivateOfflineEnvironment(process.env, root), ['--', missing]),
      Bun.sleep(250).then(() => Promise.reject(new Error('spawn hung'))),
    ])).rejects.toThrow('private offline: command failed');
    const child = Bun.spawn(['bun', '--', 'scripts/run-private-offline.ts', '--', missing], { cwd: root, env: runner.createPrivateOfflineEnvironment(process.env, root), stdout: 'pipe', stderr: 'pipe' });
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr.trim()).toBe('private offline: command failed');
    expect(`${stdout}${stderr}`).not.toContain(missing);
    expect(`${stdout}${stderr}`).not.toContain('ENOENT');
    await expect(runner.runPrivateOffline(root, {}, ['--', 'bun'], async () => {
      throw new Error('sensitive spawn detail');
    })).rejects.toThrow('private offline: command failed');
  });

  test('requires a command after -- and installs both descendant preloads', () => {
    expect(() => runner.parsePrivateOfflineArguments([])).toThrow('private offline: expected -- <command>');
    expect(() => runner.parsePrivateOfflineArguments(['bun', 'test'])).toThrow('private offline: expected -- <command>');
    expect(runner.parsePrivateOfflineArguments(['--', 'bun', 'test'])).toEqual(['bun', 'test']);
    const env = runner.createPrivateOfflineEnvironment({ OPENROUTER_OWNER_KEY: 'injected-secret', PATH: '/bin', SAFE: 'yes' }, '/work');
    expect(env.OPENROUTER_OWNER_KEY).toBeUndefined();
    expect(env.SAFE).toBeUndefined();
    expect(env.NODE_OPTIONS).toContain('private-offline-preload.cjs');
    expect(env.BUN_OPTIONS).toContain('private-offline-preload.cjs');
  });

  test('uses a fixed error, bounds output, and passes a scrubbed environment', async () => {
    let received: Record<string, string | undefined> | undefined;
    await expect(runner.runPrivateOffline('/work', { TOKEN: 'injected-secret' }, ['--', 'bun', 'test'], (_argv, options) => {
      received = options.env;
      return { exitCode: 1, stdout: bytes('injected-secret' + 'x'.repeat(70_000)), stderr: bytes('injected-secret') };
    })).rejects.toThrow('private offline: command failed');
    expect(received?.TOKEN).toBeUndefined();
  });

  test('treats timeout and signal exits as the same fixed stage error', async () => {
    for (const result of [{ exitCode: null, signalCode: 'SIGTERM' }, { exitCode: 124 }]) {
      await expect(runner.runPrivateOffline('/work', {}, ['--', 'bun', 'test'], () => ({ ...result, stdout: bytes(), stderr: bytes() }))).rejects.toThrow('private offline: command failed');
    }
  });

  test('kills a real timed-out subprocess and bounds its output', async () => {
    const result = await runner.spawnPrivateOffline(['bun', '-e', 'console.log("x".repeat(200000)); setInterval(() => {}, 1000)'], { cwd: path.resolve(import.meta.dir, '..'), env: runner.createPrivateOfflineEnvironment(process.env, path.resolve(import.meta.dir, '..')) }, 25);
    expect(result.exitCode).toBe(124);
    expect(result.stdout.byteLength).toBeLessThanOrEqual(65_536);
  });

  test('scrubs credential families and blocks an unhandled provider fetch before native egress', async () => {
    const root = path.resolve(import.meta.dir, '..');
    const result = await runner.spawnPrivateOffline(['bun', '-e', 'if (process.env.GITHUB_PAT || process.env.DATABASE_URL) process.exit(9); try { fetch("https://openrouter.ai/api/v1/chat/completions"); process.exit(8) } catch (error) { process.exit(error.code === "PRIVATE_OFFLINE_EGRESS_BLOCKED" ? 0 : 7) }'], { cwd: root, env: { ...runner.createPrivateOfflineEnvironment({ PATH: process.env.PATH, GITHUB_PAT: 'x', DATABASE_URL: 'y' }, root), GITHUB_PAT: 'x', DATABASE_URL: 'y' } }, 2_000);
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  });

  test('keeps descendant preload controls after the first preload runs', async () => {
    const root = path.resolve(import.meta.dir, '..');
    const descendant = "if (process.env.OPENROUTER_OWNER_KEY || process.env.PRIVATE_OUTPUT_SUFFIX !== 'abcdef123456' || process.env.PRIVATE_PRIVACY_CANARY !== '1' || !process.env.BUN_OPTIONS?.includes('private-offline-preload') || !process.env.NODE_OPTIONS?.includes('private-offline-preload') || process.env.BUN_CONFIG_NO_LOAD_DOTENV !== '1') process.exit(1); try { fetch('https://example.invalid'); process.exit(2) } catch (error) { process.exit(error.code === 'PRIVATE_OFFLINE_EGRESS_BLOCKED' ? 0 : 3) }";
    const result = await runner.spawnPrivateOffline(['bun', '-e', `const child=Bun.spawnSync(['bun','-e',${JSON.stringify(descendant)}]); process.exit(child.exitCode ?? 9);`], { cwd: root, env: { ...runner.createPrivateOfflineEnvironment({ PATH: process.env.PATH, OPENROUTER_OWNER_KEY: 'secret' }, root), OPENROUTER_OWNER_KEY: 'secret', PRIVATE_OUTPUT_SUFFIX: 'abcdef123456', PRIVATE_PRIVACY_CANARY: '1' } }, 2_000);
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  });

  test('blocks DNS and UDP egress before native transports are created', async () => {
    const root = path.resolve(import.meta.dir, '..');
    const program = `const dns=require('node:dns'); const dgram=require('node:dgram'); let blocked=0; for (const action of [()=>dns.resolve('example.invalid',()=>{}),()=>dgram.createSocket('udp4'),()=>Bun.udpSocket({socket:{data(){}}})]) { try { action() } catch (error) { if (error.code==='PRIVATE_OFFLINE_EGRESS_BLOCKED') blocked+=1 } } process.exit(blocked===3?0:1)`;
    const result = await runner.spawnPrivateOffline(['bun', '-e', program], { cwd: root, env: runner.createPrivateOfflineEnvironment(process.env, root) }, 2_000);
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  });

  test('blocks a custom DNS Resolver before its captured native seam', async () => {
    const root = path.resolve(import.meta.dir, '..'); const preload = path.join(root, 'scripts', 'private-offline-preload.cjs');
    const program = `const dns=require('node:dns'); let calls=0; class FakeResolver { resolve(){calls+=1} } dns.Resolver=FakeResolver; delete require.cache[${JSON.stringify(preload)}]; require(${JSON.stringify(preload)}); try { new dns.Resolver().resolve('example.invalid'); process.exit(2) } catch (error) { process.exit(error.code==='PRIVATE_OFFLINE_EGRESS_BLOCKED' && calls===0 ? 0 : 1) }`;
    const result = await runner.spawnPrivateOffline(['bun', '-e', program], { cwd: root, env: { PATH: process.env.PATH } }, 2_000);
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  });

  test('blocks an unhandled provider request before the captured native fetch seam', async () => {
    const root = path.resolve(import.meta.dir, '..'); const preload = path.join(root, 'scripts', 'private-offline-preload.cjs');
    const program = `let calls=0; global.fetch=()=>{calls+=1; return Promise.resolve()}; delete require.cache[${JSON.stringify(preload)}]; require(${JSON.stringify(preload)}); try { fetch('https://openrouter.ai/api/v1/chat/completions'); process.exit(2) } catch (error) { process.exit(error.code==='PRIVATE_OFFLINE_EGRESS_BLOCKED' && calls===0 ? 0 : 1) }`;
    const result = await runner.spawnPrivateOffline(['bun', '-e', program], { cwd: root, env: runner.createPrivateOfflineEnvironment(process.env, root) }, 2_000);
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  });

  test('treats forwarded SIGTERM as failure even when the child exits zero', async () => {
    const root = path.resolve(import.meta.dir, '..'); const directory = mkdtempSync(path.join(tmpdir(), 'private-offline-')); const ready = path.join(directory, 'signal-ready');
    try {
      const program = `require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready'); process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000)`;
      const child = Bun.spawn(['bun', '--', 'scripts/run-private-offline.ts', '--', 'bun', '-e', program], { cwd: root, env: runner.createPrivateOfflineEnvironment(process.env, root), stdout: 'pipe', stderr: 'pipe' });
      const stdout = new Response(child.stdout).text(); const stderr = new Response(child.stderr).text();
      for (let attempt = 0; attempt < 200 && !existsSync(ready); attempt += 1) await Bun.sleep(10);
      expect(existsSync(ready)).toBeTrue();
      process.kill(child.pid, 'SIGTERM');
      const [exitCode, capturedStdout, capturedStderr] = await Promise.all([child.exited, stdout, stderr]);
      expect(exitCode).not.toBe(0);
      expect(capturedStdout).toBe('');
      expect(capturedStderr.trim()).toBe('private offline: command failed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('terminates a SIGTERM-ignoring descendant process group', async () => {
    const root = path.resolve(import.meta.dir, '..'); const directory = mkdtempSync(path.join(tmpdir(), 'private-offline-')); const ready = path.join(directory, 'descendant-ready'); const marker = path.join(directory, 'descendant-alive');
    try {
      const grandchild = `const fs=require('node:fs'); process.on('SIGTERM',()=>{}); fs.writeFileSync(${JSON.stringify(ready)},'ready'); setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'alive'),1500); setInterval(()=>{},1000)`;
      const parent = `Bun.spawn(['bun','-e',${JSON.stringify(grandchild)}],{stdout:'ignore',stderr:'ignore'}); setInterval(()=>{},1000)`;
      const result = await runner.spawnPrivateOffline(['bun', '-e', parent], { cwd: root, env: runner.createPrivateOfflineEnvironment(process.env, root) }, 250);
      expect(existsSync(ready)).toBeTrue();
      expect(result.exitCode).toBe(124); await Bun.sleep(1_500); expect(existsSync(marker)).toBeFalse();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('permits an exact MSW provider handler in-process while the guard remains installed', async () => {
    const server = setupServer(http.post('https://openrouter.ai/api/v1/chat/completions', () => HttpResponse.json({ ok: true })));
    server.listen({ onUnhandledRequest: () => { throw new Error('MSW_UNHANDLED'); } });
    try {
      expect((await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' })).status).toBe(200);
      expect((await fetch('https://openrouter.ai/api/v1/unhandled', { method: 'POST' })).status).toBe(500);
    } finally { server.close(); }
  });
});
