import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertAuthorizedPaths, observeGitPaths, parseNameStatusNul, readTaskManifest, validateTaskManifestBytes } from './assert-c1-a-paths';

const task1 = readTaskManifest(1);

function git(root: string, ...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}

function repository(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'event-every-c1-a-git-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'c1-a@example.invalid');
  git(root, 'config', 'user.name', 'C1 A');
  writeFileSync(path.join(root, 'base.txt'), 'base\n');
  git(root, 'add', 'base.txt'); git(root, 'commit', '-q', '-m', 'base');
  return root;
}

describe('C1-A task path authority', () => {
  test('requires the full active Task 1 staged manifest and an ordinary-clean post-staging worktree', () => {
    expect(() => assertAuthorizedPaths('base', 'head', 1, [], task1, ['.claude/preserved'], ['tasks/task-192.md'])).not.toThrow();
    expect(() => assertAuthorizedPaths('base', 'head', 1, [], task1.slice(1), [], task1)).toThrow('c1-a paths: observed path mismatch');
    expect(() => assertAuthorizedPaths('base', 'head', 1, [], [...task1, 'src/extra.ts'], [], task1)).toThrow('c1-a paths: observed path mismatch');
    expect(() => assertAuthorizedPaths('base', 'head', 1, [], task1, [task1[0]!], [])).toThrow('c1-a paths: observed path mismatch');
    expect(() => assertAuthorizedPaths('base', 'head', 1, [], task1, [], [task1[0]!])).toThrow('c1-a paths: observed path mismatch');
  });

  test('permits only prior committed ownership and gives protected paths precedence', () => {
    const prior = readTaskManifest(1);
    const task2 = readTaskManifest(2);
    expect(() => assertAuthorizedPaths('base', 'head', 2, prior, task2, [], [])).not.toThrow();
    expect(() => assertAuthorizedPaths('base', 'head', 2, ['src/nope.ts'], task2)).toThrow('c1-a paths: observed path mismatch');
    expect(() => assertAuthorizedPaths('base', 'head', 2, ['.claude/private'], task2)).toThrow('c1-a paths: protected path');
    expect(() => assertAuthorizedPaths('base', 'head', 2, ['tasks/task-192.md'], task2)).toThrow('c1-a paths: protected path');
    expect(() => assertAuthorizedPaths('base', 'head', 2, prior, [...task2, '.claude/staged'])).toThrow('c1-a paths: protected path');
  });

  test('pins every manifest to its accepted bytes rather than trusting its parsed paths', () => {
    for (let task = 1; task <= 11; task += 1) {
      const bytes = `${readTaskManifest(task).join('\n')}\n`;
      expect(validateTaskManifestBytes(task, bytes)).toEqual(readTaskManifest(task));
      expect(() => validateTaskManifestBytes(task, `${bytes}src/self-authorized.ts\n`)).toThrow('c1-a paths: invalid manifest');
    }
  });

  test('assigns the closed browser inventory guard to Task 8 while preserving the terminal union', () => {
    const inventoryPaths = ['scripts/assert-c1-a-e2e-inventory.ts', 'scripts/assert-c1-a-e2e-inventory.test.ts'];
    const task8 = readTaskManifest(8);
    const task11 = readTaskManifest(11);
    for (const file of inventoryPaths) {
      expect(task8).toContain(file);
      expect(task11).not.toContain(file);
    }
    const terminal = new Set(Array.from({ length: 11 }, (_, index) => readTaskManifest(index + 1)).flat());
    expect(terminal.size).toBe(150);
    for (const file of inventoryPaths) expect(terminal.has(file)).toBeTrue();
  });

  test('requires the committed scanner vendor test in Task 7 prior ownership for Task 8 and the terminal union', () => {
    const scannerVendorTest = 'src/services/__tests__/scannerVendor.test.ts';
    const task8 = readTaskManifest(8);
    const terminal = new Set(Array.from({ length: 11 }, (_, index) => readTaskManifest(index + 1)).flat());
    const digest = createHash('sha256').update(`${[...terminal].sort().join('\n')}\n`).digest('hex');

    expect(readTaskManifest(7)).toContain(scannerVendorTest);
    expect(() => assertAuthorizedPaths('base', 'head', 8, [scannerVendorTest], task8)).not.toThrow();
    expect(() => assertAuthorizedPaths('base', 'head', 8, ['src/services/__tests__/unowned-control.test.ts'], task8)).toThrow('c1-a paths: observed path mismatch');
    expect(terminal.size).toBe(150);
    expect(digest).toBe('0ee3eb10031279ebd0fb9de22b9c97cb335e6738a991111256ad48e2187c2a6a');
  });

  test('keeps .env.example exclusively Task 8 provenance and rejects all runtime dotenv names', () => {
    const task8 = readTaskManifest(8);
    expect(() => assertAuthorizedPaths('base', 'head', 8, task1, task8)).not.toThrow();
    for (const file of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.any', '.dev.vars', '.dev.vars.test']) {
      expect(() => assertAuthorizedPaths('base', 'head', 1, [], [...task1.slice(1), file])).toThrow('c1-a paths: observed path mismatch');
    }
    expect(() => assertAuthorizedPaths('base', 'head', 1, [], [...task1, '.env.example'])).toThrow('c1-a paths: observed path mismatch');
    expect(() => assertAuthorizedPaths('base', 'head', 9, [...readTaskManifest(8)], readTaskManifest(9))).not.toThrow();
  });

  test('parses NUL name-status records including both sides of rename/delete records', () => {
    const raw = new TextEncoder().encode('R100\0old.ts\0new.ts\0D\0gone.ts\0');
    expect(parseNameStatusNul(raw)).toEqual([{ status: 'R100', paths: ['old.ts', 'new.ts'] }, { status: 'D', paths: ['gone.ts'] }]);
    expect(() => parseNameStatusNul(new TextEncoder().encode('R100\0old.ts\0'))).toThrow('c1-a paths: observed path mismatch');
  });

  test('rejects malformed, absolute, parent, glob, backslash, newline, generated, and credential-shaped paths', () => {
    const invalid = ['', '/absolute', 'a/../b', 'a\\b', 'a*.ts', 'a\nb', '.open-next/worker.js', 'secret-token.txt'];
    for (const file of invalid) {
      expect(() => assertAuthorizedPaths('base', 'head', 1, [], [...task1.slice(1), file])).toThrow('c1-a paths: observed path mismatch');
    }
  });

  test('observes real post-staging semantics without retaining unstaged or untracked copies', () => {
    const root = repository();
    try {
      const baseline = git(root, 'rev-parse', 'HEAD');
      writeFileSync(path.join(root, 'base.txt'), 'changed\n');
      writeFileSync(path.join(root, 'reviewed-plan.md'), 'plan\n');
      const before = observeGitPaths(root, baseline, 'HEAD');
      expect(before.unstaged).toEqual(['base.txt']); expect(before.untracked).toEqual(['reviewed-plan.md']); expect(before.staged).toEqual([]);
      git(root, 'add', 'base.txt', 'reviewed-plan.md');
      const after = observeGitPaths(root, baseline, 'HEAD');
      expect(after.staged).toEqual(['base.txt', 'reviewed-plan.md']); expect(after.unstaged).toEqual([]); expect(after.untracked).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test('uses merge-base triple-dot committed ownership in a real diverged repository', () => {
    const root = repository();
    try {
      const common = git(root, 'rev-parse', 'HEAD');
      git(root, 'checkout', '-q', '-b', 'head-side');
      writeFileSync(path.join(root, 'head-only.txt'), 'head\n'); git(root, 'add', 'head-only.txt'); git(root, 'commit', '-q', '-m', 'head');
      const head = git(root, 'rev-parse', 'HEAD');
      git(root, 'checkout', '-q', '-b', 'baseline-side', common);
      writeFileSync(path.join(root, 'baseline-only.txt'), 'baseline\n'); git(root, 'add', 'baseline-only.txt'); git(root, 'commit', '-q', '-m', 'baseline');
      const baseline = git(root, 'rev-parse', 'HEAD');
      expect(observeGitPaths(root, baseline, head).committed).toEqual(['head-only.txt']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
