import { describe, expect, test } from 'bun:test';
import { assertAuthorizedPaths, parseNameStatusNul, readOwnedPaths, validateOwnedPaths } from './assert-c1-b-paths';

describe('C1-B path authority', () => {
  test('pins the exact sorted manifest and accepts only its owned paths', () => {
    const owned = readOwnedPaths();
    expect(owned).toEqual([...owned].sort());
    expect(() => validateOwnedPaths(`${owned.join('\n')}\n`)).not.toThrow();
    expect(() => validateOwnedPaths(`${owned.join('\n')}\nextra.ts\n`)).toThrow('c1-b paths: invalid manifest');
    const taskOne = ['scripts/c1-b-owned-paths.txt', 'scripts/assert-c1-b-paths.ts', 'scripts/assert-c1-b-paths.test.ts', 'scripts/private-offline-preload.cjs', 'scripts/run-private-offline.ts', 'scripts/run-private-offline.test.ts', 'src/platform/provider/contracts.ts', 'src/platform/provider/policy.ts', 'src/platform/provider/request-binding.ts', 'src/platform/provider/cost.ts', 'src/platform/provider/replay.ts', 'src/platform/provider/__tests__/policy.test.ts', 'src/platform/provider/__tests__/request-binding.test.ts', 'src/platform/provider/__tests__/cost.test.ts', 'src/platform/provider/__tests__/replay.test.ts'];
    expect(taskOne).toHaveLength(15);
    expect(() => assertAuthorizedPaths([], taskOne, [], [])).not.toThrow();
    expect(() => assertAuthorizedPaths([], [], [taskOne[0]!], [taskOne[1]!])).not.toThrow();
    expect(() => assertAuthorizedPaths([], [...taskOne, taskOne[0]!], [], [])).toThrow('c1-b paths: observed path mismatch');
  });

  test('preserves only the six named protected working entries and rejects protected staging', () => {
    const owned = readOwnedPaths();
    expect(() => assertAuthorizedPaths([], owned, ['.claude/local'], ['tasks/task-192.md'])).not.toThrow();
    expect(() => assertAuthorizedPaths(['tasks/task-193.md'], owned, [], [])).toThrow('c1-b paths: protected path');
    expect(() => assertAuthorizedPaths([], [...owned, '.claude/local'], [], [])).toThrow('c1-b paths: protected path');
    expect(() => assertAuthorizedPaths([], owned.slice(0, 1), ['tasks/task-192.md/hidden'], [])).toThrow('c1-b paths: observed path mismatch');
  });

  test('is NUL-safe for rename records and rejects traversal, generated, and credential paths', () => {
    expect(parseNameStatusNul(new TextEncoder().encode('R100\0old.ts\0new.ts\0D\0gone.ts\0'))).toEqual([
      { status: 'R100', paths: ['old.ts', 'new.ts'] }, { status: 'D', paths: ['gone.ts'] },
    ]);
    for (const value of ['/tmp/x', 'a/../b', 'a\\b', '*.ts', '.open-next/worker.js', 'owner-secret.txt']) {
      expect(() => validateOwnedPaths(`${readOwnedPaths().join('\n')}\n${value}\n`)).toThrow('c1-b paths: invalid manifest');
    }
  });
});
