import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertPrivateWorkerArtifact,
  runPrivateWorkerAssertion,
  type PrivateWorkerAssertionSeams,
} from './assert-private-worker';

const roots: string[] = [];
const REQUIRED = [
  "const origin = 'https://openrouter.ai/api/v1/chat/completions';",
  "const budget = 'OwnerBudgetAuthority';",
  "const requests = 'ProviderRequestAuthority';",
].join('\n');

function fixture(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'event-every-private-worker-'));
  roots.push(root);
  const all = {
    '.open-next/worker.js': `${REQUIRED}\nimport './chunks/app.js';\n`,
    '.open-next/chunks/app.js': 'export const app = true;\n',
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('private Worker artifact graph', () => {
  test('accepts a closed reachable graph with the fixed provider origin and both authorities', () => {
    expect(() => assertPrivateWorkerArtifact(fixture())).not.toThrow();
  });

  test('follows statically imported and literal dynamic child chunks', () => {
    const staticRoot = fixture({ '.open-next/chunks/app.js': "const legacy = 'OPENROUTER_COMMUNITY_KEY';\n" });
    expect(() => assertPrivateWorkerArtifact(staticRoot)).toThrow('private worker: forbidden artifact');

    const dynamicRoot = fixture({
      '.open-next/worker.js': `${REQUIRED}\nimport('./chunks/lazy.js');\n`,
      '.open-next/chunks/lazy.js': "const legacy = 'OPENROUTER_BASE_URL';\n",
    });
    expect(() => assertPrivateWorkerArtifact(dynamicRoot)).toThrow('private worker: forbidden artifact');
  });

  test('scans source-map source names and embedded source content', () => {
    const sourceNameRoot = fixture({
      '.open-next/chunks/app.js': 'export const app = true;\n//# sourceMappingURL=app.js.map\n',
      '.open-next/chunks/app.js.map': JSON.stringify({ version: 3, sources: ['src/platform/legacy/dispatch.ts'], sourcesContent: ['export {};'], names: [], mappings: '' }),
    });
    expect(() => assertPrivateWorkerArtifact(sourceNameRoot)).toThrow('private worker: forbidden artifact');

    const sourceContentRoot = fixture({
      '.open-next/chunks/app.js': 'export const app = true;\n//# sourceMappingURL=app.js.map\n',
      '.open-next/chunks/app.js.map': JSON.stringify({ version: 3, sources: ['app.ts'], sourcesContent: ['Join the waitlist'], names: [], mappings: '' }),
    });
    expect(() => assertPrivateWorkerArtifact(sourceContentRoot)).toThrow('private worker: forbidden artifact');
  });

  test('rejects unresolved local imports and non-literal dynamic reachability', () => {
    expect(() => assertPrivateWorkerArtifact(fixture({
      '.open-next/worker.js': `${REQUIRED}\nimport './chunks/missing.js';\n`,
    }))).toThrow('private worker: unresolved import');
    expect(() => assertPrivateWorkerArtifact(fixture({
      '.open-next/worker.js': `${REQUIRED}\nconst target = './chunks/app.js'; import(target);\n`,
    }))).toThrow('private worker: non-literal dynamic import');
  });
});

describe('private Worker build lifecycle', () => {
  function seams(root: string, overrides: Partial<PrivateWorkerAssertionSeams> = {}): PrivateWorkerAssertionSeams {
    return {
      authoredInputs: () => [path.join(root, 'package.json')],
      hash: (file) => readFileSync(file, 'utf8'),
      build: async () => {
        mkdirSync(path.join(root, '.open-next', 'chunks'), { recursive: true });
        writeFileSync(path.join(root, '.open-next', 'worker.js'), `${REQUIRED}\nimport './chunks/app.js';\n`);
        writeFileSync(path.join(root, '.open-next', 'chunks', 'app.js'), 'export const app = true;\n');
        mkdirSync(path.join(root, '.wrangler'), { recursive: true });
      },
      ...overrides,
    };
  }

  test('refuses pre-existing output and never deletes output it did not create', async () => {
    const root = fixture({ 'package.json': '{}' });
    let built = false;
    await expect(runPrivateWorkerAssertion(root, seams(root, { build: async () => { built = true; } })))
      .rejects.toThrow('private worker: output already exists');
    expect(built).toBeFalse();
    expect(existsSync(path.join(root, '.open-next', 'worker.js'))).toBeTrue();
  });

  test('authenticates authored inputs after scanning and cleans only owned outputs on drift', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'event-every-private-worker-lifecycle-'));
    roots.push(root);
    writeFileSync(path.join(root, 'package.json'), '{"name":"before"}');
    await expect(runPrivateWorkerAssertion(root, seams(root, {
      build: async () => {
        await seams(root).build(root);
        writeFileSync(path.join(root, 'package.json'), '{"name":"after"}');
      },
    }))).rejects.toThrow('private worker: authored input changed');
    expect(existsSync(path.join(root, '.open-next'))).toBeFalse();
    expect(existsSync(path.join(root, '.wrangler'))).toBeFalse();
    expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe('{"name":"after"}');
  });
});
