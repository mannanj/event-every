import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertC1AConfig } from './assert-c1-a-config';

const roots: string[] = [];
const scripts = {
  'build:cloudflare': 'opennextjs-cloudflare build', 'cf:types': 'bun scripts/run-c1-a-cloudflare.ts app-types', 'cf:types:keepalive': 'bun scripts/run-c1-a-cloudflare.ts keepalive-types',
  'test:workers': 'bun scripts/run-with-open-next.ts -- node node_modules/vitest/vitest.mjs run --config vitest.config.workers.ts', 'assert:c1:a-config': 'bun scripts/assert-c1-a-config.ts', 'assert:c1:a-paths': 'bun scripts/assert-c1-a-paths.ts', 'test:c1:a-mutations': 'bun scripts/run-c1-a-mutations.ts --verify-ledger --all', 'validate:c1:a-evidence': 'bun scripts/validate-c1-a-evidence.ts docs/testing/c1-a-terminal-evidence.json', 'test:e2e:c1:a': 'playwright test --config playwright.c1-a.config.ts', 'verify:c1:a': 'bun scripts/run-c1-a-offline.ts',
} as const;
const dependencies = { '@opennextjs/cloudflare': '1.20.2', wrangler: '4.118.0', vitest: '4.1.10', '@cloudflare/vitest-pool-workers': '0.20.1', msw: '2.15.0' } as const;
function fixture(changes: Record<string, string> = {}): string { const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-config-')); roots.push(root); const files = { 'package.json': JSON.stringify({ name: 'fixture', scripts, devDependencies: dependencies }), '.gitignore': '.dev.vars\n.dev.vars.*\n.open-next/\n.wrangler/\n', 'bun.lock': 'lock', ...changes }; for (const [file, content] of Object.entries(files)) writeFileSync(path.join(root, file), content); return root; }
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('C1-A Task 1 package/offline config boundary', () => {
  test('accepts exactly the Task 1 package subset and generated-output ignores', () => { expect(() => assertC1AConfig(fixture())).not.toThrow(); });
  test('rejects each exact dependency independently', () => { for (const name of Object.keys(dependencies)) { const copy = { ...dependencies }; delete copy[name as keyof typeof copy]; expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, devDependencies: copy }) }))).toThrow(`c1-a config: dependency ${name}`); } });
  test('requires all five exact C1-A devDependency versions and rejects production ownership', () => { for (const [name, version] of Object.entries(dependencies)) { expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, dependencies: { [name]: version }, devDependencies: dependencies }) }))).toThrow(`c1-a config: dependency ${name}`); expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts, devDependencies: { ...dependencies, [name]: `^${version}` } }) }))).toThrow(`c1-a config: dependency ${name}`); } });
  test('rejects each missing or altered required script independently', () => { for (const [name, command] of Object.entries(scripts)) { const copy = { ...scripts, [name]: `${command} altered` }; expect(() => assertC1AConfig(fixture({ 'package.json': JSON.stringify({ scripts: copy, devDependencies: dependencies }) }))).toThrow(`c1-a config: script ${name}`); } });
  test('rejects every generated ignore omission independently', () => { for (const missing of ['.dev.vars', '.dev.vars.*', '.open-next/', '.wrangler/']) { const ignore = ['.dev.vars', '.dev.vars.*', '.open-next/', '.wrangler/'].filter((line) => line !== missing).join('\n'); expect(() => assertC1AConfig(fixture({ '.gitignore': ignore }))).toThrow(`c1-a config: ignore ${missing}`); } });
  test('rejects deploy/upload/publish commands, repository auth, and credential evidence independently', () => {
    for (const [files, message] of [
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, deploy: 'wrangler deploy' }, devDependencies: dependencies }) }, 'install/deploy script deploy'],
      [{ '.npmrc': '//registry.npmjs.org/:_authToken=canary' }, 'registry auth'],
      [{ 'bunfig.toml': '[install]\nregistry = "https://bad.invalid"' }, 'registry auth'],
      [{ 'bun.lock': 'OPENROUTER_API_KEY=canary' }, 'credential evidence'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'bun install' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, add: 'bun add msw' }, devDependencies: dependencies }) }, 'install/deploy script add'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'bun --no-env-file install --frozen-lockfile' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'npm ci' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'pnpm add msw' }, devDependencies: dependencies }) }, 'install/deploy script i'],
      [{ 'package.json': JSON.stringify({ scripts: { ...scripts, i: 'yarn install' }, devDependencies: dependencies }) }, 'install/deploy script i'],
    ] as const) expect(() => assertC1AConfig(fixture(files))).toThrow(`c1-a config: ${message}`);
  });
});
