import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createE1OfflineEnvironment } from './run-e1-offline';
import {
  assertCommunityKeySourceGuard,
  assertPatternAdminRetired,
  authorizeInvocationOutputs,
  createFocusedEnvironment,
  createTerminationSentinel,
  deriveInvocationPaths,
  forwardConfigPatches,
  hashText,
  inverseConfigPatches,
  inverseTsconfigMutation,
  parseE1FocusedArguments,
  restoreConfigTexts,
  runLifecyclePhases,
  removeOwnedPaths,
  renderGateError,
  teardownRecordedChildren,
  validateDiscoveryListing,
  validateFocusedListing,
} from './run-e1-focused';

const TASK8_PATTERN_RETIREMENT_PATHS = [
  '.env.example',
  'README.md',
  'e2e/community-limit.spec.ts',
  'e2e/helpers.ts',
  'playwright.config.ts',
  'src/app/api/auth/check/route.ts',
  'src/app/api/auth/logout/route.ts',
  'src/app/api/auth/shared.ts',
  'src/app/api/auth/verify/route.ts',
  'src/app/layout.tsx',
  'src/app/spent/page.tsx',
  'src/components/AuthWrapper.tsx',
  'src/components/CommunityLimitScreen.tsx',
  'src/components/PatternLock.tsx',
  'src/components/SideDrawerLockButton.tsx',
  'src/hooks/useAuth.ts',
  'src/lib/limits.ts',
  'src/lib/llm.ts',
] as const;

describe('run-e1-focused argument and discovery seam', () => {
  test('keeps AuthWrapper at the interactive home-page boundary', () => {
    const root = path.resolve(import.meta.dir, '..');
    const layout = readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8');
    const page = readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');

    expect(layout).not.toContain("import AuthWrapper from '@/components/AuthWrapper'");
    expect(layout).not.toMatch(/<AuthWrapper[\s\S]*<\/AuthWrapper>/);
    expect(page).toContain("import AuthWrapper from '@/components/AuthWrapper'");
    expect(page).toMatch(/function Page\(\)[\s\S]*<AuthWrapper>\s*\{\(\{ processingDisabled \}\) => <Home processingDisabled=\{processingDisabled\} \/>\}\s*<\/AuthWrapper>/);
    expect(page).toMatch(/function Home\(\{ processingDisabled \}[\s\S]*<main\b[\s\S]*<\/main>/);
  });

  test('serializes real Playwright config workers only for offline mode', async () => {
    const configPath = path.resolve(import.meta.dir, '..', 'playwright.config.ts');
    const readWorkers = (environment: Record<string, string | undefined>) => {
      const result = Bun.spawnSync([
        'bun',
        '--eval',
        `const config = (await import(${JSON.stringify(configPath)})).default; process.stdout.write(String(config.workers ?? 'undefined'));`,
      ], { env: environment, stdout: 'pipe', stderr: 'pipe' });
      if (result.exitCode !== 0) throw new Error(`Playwright config evaluation failed: ${result.exitCode}`);
      return Buffer.from(result.stdout).toString('utf8');
    };

    const offline = createE1OfflineEnvironment({ ...process.env });
    expect(readWorkers(offline)).toBe('1');

    const local = { ...process.env, E1_OFFLINE: '', E1_OFFLINE_PRELOAD: '', E2E_TARGET: '' };
    expect(readWorkers(local)).toBe('undefined');

    const production = { ...local, E2E_TARGET: 'prod' };
    expect(readWorkers(production)).toBe('1');
  });

  test('rejects every retired pattern/admin token in an allowed Task 8 source fixture', () => {
    const tokens = [
      'VALID_L_PATTERNS', 'AUTH_COOKIE_NAME', 'AUTH_SECRET', 'generateAuthToken',
      'verifyAuthToken', 'PatternLock', '?unlock', 'NEXT_PUBLIC_DISABLE_AUTH',
    ];
    for (const token of tokens) {
      expect(() => assertPatternAdminRetired({ 'src/app/layout.tsx': `fixture ${token}` }))
        .toThrow('retired pattern token remains in src/app/layout.tsx');
    }
    expect(() => assertPatternAdminRetired({ 'src/app/layout.tsx': 'community only' })).not.toThrow();
  });

  test('contains no retired pattern/admin token in Task 8 product sources', () => {
    const root = path.resolve(import.meta.dir, '..');
    const sources = Object.fromEntries(TASK8_PATTERN_RETIREMENT_PATHS.filter((file) => existsSync(path.join(root, file))).map((file) => [
      file,
      readFileSync(path.join(root, file), 'utf8'),
    ]));
    assertPatternAdminRetired(sources);
    const retiredLlmSource = sources['src/lib/llm.ts'];
    if (retiredLlmSource === undefined) {
      expect(existsSync(path.join(root, 'src/lib/llm.ts'))).toBe(false);
    } else {
      assertCommunityKeySourceGuard(retiredLlmSource);
    }
  });

  test('fails closed when the live community-key region contains the admin key name', () => {
    const adminKeyName = ['OPENROUTER', '_API_KEY'].join('');
    const communityOnly = `export function getLlmKey(_mode: LlmMode): string {
  if (!process.env.OPENROUTER_COMMUNITY_KEY) throw new Error('community_key_unavailable');
  return process.env.OPENROUTER_COMMUNITY_KEY;
}

export class CommunityLimitError extends Error {}`;
    const behaviorNeutralLeak = communityOnly.replace(
      "  return process.env.OPENROUTER_COMMUNITY_KEY;",
      `  // ${adminKeyName} must never appear in this region.\n  return process.env.OPENROUTER_COMMUNITY_KEY;`,
    );

    expect(() => assertCommunityKeySourceGuard(communityOnly)).not.toThrow();
    expect(() => assertCommunityKeySourceGuard(behaviorNeutralLeak)).toThrow(/community-key source region/);
    expect(() => assertCommunityKeySourceGuard(`${adminKeyName}\n${communityOnly}`)).not.toThrow();
    expect(() => assertCommunityKeySourceGuard('export const unrelated = true;')).toThrow(/community-key source region/);
  });

  test('accepts exactly one Chromium, serial, end-anchored focused ledger tail', () => {
    expect(parseE1FocusedArguments([
      '--',
      'e2e/scanner-product-loop.spec.ts',
      '--project=chromium',
      '--workers=1',
      '--grep',
      'scanner submits text$',
    ])).toEqual({
      kind: 'focused',
      listOnly: false,
      tail: [
        'e2e/scanner-product-loop.spec.ts',
        '--project=chromium',
        '--workers=1',
        '--grep',
        'scanner submits text$',
      ],
    });
  });

  test('rejects non-Chromium, duplicate, non-serial, and unanchored focused shapes', () => {
    for (const tail of [
      ['e2e/x.spec.ts', '--project=webkit', '--workers=1', '--grep', 'one$'],
      ['e2e/x.spec.ts', '--project=chromium', '--project=chromium', '--workers=1', '--grep', 'one$'],
      ['e2e/x.spec.ts', '--project=chromium', '--workers=2', '--grep', 'one$'],
      ['e2e/x.spec.ts', '--project=chromium', '--workers=1', '--grep', 'one'],
      ['e2e/x.spec.ts', '--project=chromium', '--workers=1', '--grep', 'one$', '--grep', 'two$'],
      ['e2e/x.spec.ts', '--project=chromium', '--workers=1', '--grep=one$'],
      ['e2e/x.spec.ts', '--project=chromium', '--workers=1', '--grep', 'one$', '--config=evil'],
      ['e2e/a.spec.ts', 'e2e/b.spec.ts', '--project=chromium', '--workers=1', '--grep', 'one$'],
      ['e2e/pattern-unlock.spec.ts', '--project=chromium', '--workers=1', '--grep', 'one$'],
    ]) {
      expect(() => parseE1FocusedArguments(['--', ...tail])).toThrow();
    }
  });

  test('accepts discovery projects only and keeps Task 8 subset distinct from complete discovery', () => {
    expect(parseE1FocusedArguments(['--projects=chromium'])).toEqual({
      kind: 'discovery', listOnly: false, projects: ['chromium'], scope: 'complete',
    });
    expect(parseE1FocusedArguments(['--task8-subset', '--projects=chromium,webkit'])).toEqual({
      kind: 'discovery', listOnly: false, projects: ['chromium', 'webkit'], scope: 'task8',
    });
    expect(() => parseE1FocusedArguments(['--projects=firefox'])).toThrow();
    expect(() => parseE1FocusedArguments(['--projects=webkit,chromium'])).toThrow();
    expect(() => parseE1FocusedArguments(['--projects=chromium', '--grep', 'nope$'])).toThrow();
  });

  test('requires one focused Chromium listing', () => {
    expect(() => validateFocusedListing('')).toThrow();
    expect(() => validateFocusedListing('[chromium] › e2e/a.spec.ts:1:1 › one\n[chromium] › e2e/a.spec.ts:2:1 › two')).toThrow();
    expect(validateFocusedListing('[chromium] › e2e/a.spec.ts:1:1 › one')).toBe(1);
  });

  test('validates the exact 56-title retained suite paths in either discovery scope', () => {
    const subset = [
      'community-limit.spec.ts', 'event-extraction.spec.ts', 'recent-input.spec.ts',
      'timezone-resolution.spec.ts', 'url-scrape.spec.ts', 'scanner-product-loop.spec.ts',
      'calendar-event-regression.spec.ts',
    ].flatMap((file, index) => Array.from({ length: index === 0 ? 50 : 1 }, (_, row) =>
      `[chromium] › e2e/${file}:${row + 1}:1 › ${file} ${row}`,
    ));
    expect(validateDiscoveryListing(subset.join('\n'), 'chromium', 'task8')).toEqual({ titles: 56, paths: 7 });
    expect(validateDiscoveryListing(subset.join('\n').replaceAll('› e2e/', '› '), 'chromium', 'task8')).toEqual({ titles: 56, paths: 7 });
    expect(() => validateDiscoveryListing(subset.join('\n'), 'webkit', 'task8')).toThrow();
    expect(validateDiscoveryListing(subset.join('\n'), 'chromium', 'complete')).toEqual({ titles: 56, paths: 7 });
    expect(validateDiscoveryListing(subset.join('\n').replaceAll('[chromium]', '[webkit]'), 'webkit', 'complete')).toEqual({ titles: 56, paths: 7 });
  });

  test('derives only names owned by one mktemp invocation', () => {
    expect(deriveInvocationPaths('/private/tmp/e1-t8-focus.abc123', '/repo')).toEqual({
      tempDirectory: '/private/tmp/e1-t8-focus.abc123',
      distDirectory: '/repo/.next-e1-t8-focus-abc123',
      resultsDirectory: '/repo/test-results-e1-t8-focus-abc123',
      reportDirectory: '/repo/playwright-report-e1-t8-focus-abc123',
      suffix: 'abc123',
    });
    expect(() => deriveInvocationPaths('/private/tmp/not-owned', '/repo')).toThrow();
  });

  test('awaits recorded Playwright before recorded Next and skips missing children', async () => {
    const events: string[] = [];
    const child = (name: string) => {
      let resolve!: () => void;
      return {
        pid: 123,
        kill: () => {
          events.push(`kill:${name}`);
          resolve();
        },
        exited: new Promise<void>((done) => { resolve = () => { events.push(`await:${name}`); done(); }; }),
      };
    };
    const result = await teardownRecordedChildren({ playwright: child('playwright'), next: child('next') });
    expect(result.settled).toBe(true);
    expect(events).toEqual(['kill:playwright', 'await:playwright', 'kill:next', 'await:next']);
    await expect(teardownRecordedChildren({ playwright: undefined, next: undefined })).resolves.toMatchObject({ events: ['skip:playwright', 'skip:next'], settled: true });
  });

  test('rejects alternate focused flag spellings and extra tokens', () => {
    for (const tail of [
      ['e2e/scanner-product-loop.spec.ts', '--project', 'chromium', '--workers=1', '--grep', 'one$'],
      ['e2e/scanner-product-loop.spec.ts', '--project=chromium', '--workers', '1', '--grep', 'one$'],
      ['e2e/scanner-product-loop.spec.ts', '--project=chromium', '--workers=1', '--grep', 'one$', '--output=x'],
      ['e2e/scanner-product-loop.spec.ts', '--project=chromium', '--workers=1', '--grep', 'one$', '--reporter=line'],
    ]) expect(() => parseE1FocusedArguments(['--', ...tail])).toThrow();
  });

  test('uses literal reversible config patches and detects an injection', () => {
    const original = {
      playwright: "const localUrl = 'http://localhost:3777';\nconst devCommand = 'node_modules/next/dist/bin/next dev -p 3777';\n  reporter: 'html',\n  webServer: isProd\n    ? undefined\n    : {\n        command: devCommand,\n        url: localUrl,\n        reuseExistingServer: !isOffline && !process.env.CI,\n        timeout: 120000,\n      },",
      next: 'const nextConfig = {\n  reactStrictMode: true,\n',
      tsconfig: '{"compilerOptions":{}}',
    };
    const paths = deriveInvocationPaths('/private/tmp/e1-t8-focus.abc123', '/repo');
    const patched = forwardConfigPatches(original, paths);
    expect(inverseConfigPatches(patched, paths)).toEqual(original);
    expect(() => restoreConfigTexts({ ...patched, playwright: `${patched.playwright}\n// injected` }, {
      playwright: hashText(original.playwright), next: hashText(original.next), tsconfig: hashText(original.tsconfig),
    }, paths)).toThrow();
  });

  test('keeps collided outputs ineligible for cleanup', () => {
    const paths = deriveInvocationPaths('/private/tmp/e1-t8-focus.abc123', '/repo');
    expect(() => deriveInvocationPaths('/private/tmp/e1-t8-focus.not-valid!', '/repo')).toThrow();
    expect(paths.resultsDirectory).toContain('test-results-e1-t8-focus-abc123');
    const existing = new Map([[paths.resultsDirectory, 'user bytes']]);
    expect(() => authorizeInvocationOutputs(paths, (file) => existing.has(file))).toThrow(paths.resultsDirectory);
    expect(existing.get(paths.resultsDirectory)).toBe('user bytes');
    expect(authorizeInvocationOutputs(paths, () => false)).toBe(paths);
  });

  test('accepts WebKit and exact dual-project discovery while preserving the scrubbed preload environment', () => {
    expect(parseE1FocusedArguments(['--projects=webkit'])).toMatchObject({ kind: 'discovery', projects: ['webkit'], scope: 'complete' });
    expect(parseE1FocusedArguments(['--projects=chromium,webkit'])).toMatchObject({ kind: 'discovery', projects: ['chromium', 'webkit'], scope: 'complete' });
    const environment = createE1OfflineEnvironment({ OPENROUTER_API_KEY: 'secret', SAFE: 'yes' });
    expect(environment).toMatchObject({ OPENROUTER_API_KEY: '', SAFE: 'yes', E1_OFFLINE: '1' });
    expect(environment.E1_OFFLINE_PRELOAD).toContain('e1-offline-preload.cjs');
    expect(environment.NODE_OPTIONS).toContain(environment.E1_OFFLINE_PRELOAD!);
  });

  test('tries every recorded child independently through kill failure and bounded SIGKILL fallback', async () => {
    const events: string[] = [];
    const killThrows: { pid: number; kill: () => void; exited: Promise<void> } = {
      pid: 11, kill: () => { events.push('kill:playwright'); throw new Error('kill failed'); }, exited: Promise.resolve(),
    };
    const next: { pid: number; kill: (signal?: NodeJS.Signals) => void; exited: Promise<void> } = {
      pid: 12, kill: (signal) => events.push(`kill:next:${signal}`), exited: Promise.resolve(),
    };
    const failedKill = await teardownRecordedChildren({ playwright: killThrows, next }, async () => 'settled');
    expect(failedKill.settled).toBe(true);
    expect(failedKill.failures).toHaveLength(1);
    expect(events).toEqual(['kill:playwright', 'kill:next:SIGTERM']);

    const unresponsive = await teardownRecordedChildren({ playwright: next, next }, async () => 'timeout');
    expect(unresponsive.settled).toBe(false);
    expect(unresponsive.events).toEqual([
      'kill:playwright:SIGTERM', 'await:playwright:timeout', 'kill:playwright:SIGKILL', 'await:playwright:timeout',
      'kill:next:SIGTERM', 'await:next:timeout', 'kill:next:SIGKILL', 'await:next:timeout',
    ]);
    const rejectedExit = await teardownRecordedChildren({ playwright: next }, async () => 'failed');
    expect(rejectedExit.settled).toBe(false);
    expect(rejectedExit.failures.map((error) => error.message)).toContain('playwright child exit rejected.');
  });

  test('skips configuration and output cleanup when child exit rejects', async () => {
    const events: string[] = [];
    const action = (name: string) => async () => { events.push(name); };

    await expect(runLifecyclePhases({
      prePatch: action('prePatch'),
      startNext: action('startNext'),
      waitForNext: action('waitForNext'),
      list: action('list'),
      run: action('run'),
      cleanup: {
        children: async () => ({
          events: ['await:playwright:failed'],
          settled: false,
          failures: [new Error('playwright child exit rejected.')],
        }),
        inverse: action('inverse'),
        hash: action('hash'),
        port: action('port'),
        remove: action('remove'),
      },
    }, createTerminationSentinel())).rejects.toThrow('E1 focused runner lifecycle failed');

    expect(events).toEqual(['prePatch', 'startNext', 'waitForNext', 'list', 'run']);
  });

  test('uses a resolving signal sentinel and aggregates phase/cleanup failures without launching', async () => {
    const sentinel = createTerminationSentinel();
    const events: string[] = [];
    sentinel.terminate('SIGTERM');
    await expect(runLifecyclePhases({
      prePatch: async () => { events.push('pre-patch'); },
      startNext: async () => { events.push('start-next'); },
      waitForNext: async () => { events.push('next-wait'); },
      list: async () => { events.push('list'); },
      run: async () => { events.push('run'); },
      cleanup: {
        children: async () => { events.push('children'); },
        inverse: async () => { events.push('inverse'); },
        hash: async () => { events.push('hash'); },
        port: async () => { events.push('port'); },
        remove: async () => { events.push('remove'); },
      },
    }, sentinel)).rejects.toThrow('SIGTERM');
    expect(events).toEqual(['children', 'inverse', 'hash', 'port', 'remove']);
  });

  test('routes pre-patch, Next-wait, list, and run signals into cleanup without subprocesses', async () => {
    for (const phase of ['prePatch', 'waitForNext', 'list', 'run'] as const) {
      const sentinel = createTerminationSentinel();
      const events: string[] = [];
      const action = (name: string) => async () => { events.push(name); if (name === phase) sentinel.terminate('SIGINT'); };
      await expect(runLifecyclePhases({
        prePatch: action('prePatch'), startNext: action('startNext'), waitForNext: action('waitForNext'), list: action('list'), run: action('run'),
        cleanup: {
          children: async () => { await action('children')(); },
          inverse: async () => { await action('inverse')(); },
          hash: async () => { await action('hash')(); },
          port: async () => { await action('port')(); },
          remove: async () => { await action('remove')(); },
        },
      }, sentinel)).rejects.toThrow('SIGINT');
      expect(events.slice(-5)).toEqual(['children', 'inverse', 'hash', 'port', 'remove']);
    }
  });

  test('aggregates primary, child, inverse, hash, port, and removal failures without masking later cleanup', async () => {
    const events: string[] = [];
    const failure = (name: string) => async () => { events.push(name); throw new Error(name); };
    await expect(runLifecyclePhases({
      prePatch: failure('primary'), startNext: async () => {}, waitForNext: async () => {}, list: async () => {}, run: async () => {},
      cleanup: {
        children: async () => ({ events: [], settled: true, failures: [new Error('child')] }),
        inverse: failure('inverse'), hash: failure('hash'), port: failure('port'), remove: failure('remove'),
      },
    }, createTerminationSentinel())).rejects.toThrow('E1 focused runner lifecycle failed');
    expect(events).toEqual(['primary', 'inverse', 'hash', 'port', 'remove']);
  });

  test('literally reverses the installed Next full generated tsconfig bytes to repository pristine bytes', () => {
    const paths = deriveInvocationPaths('/private/tmp/e1-t8-focus.abc123', '/repo');
    const pristine = readFileSync(path.resolve(import.meta.dir, '../tsconfig.json'), 'utf8');
    const parsed = JSON.parse(pristine) as { include: string[] };
    parsed.include = [...parsed.include].sort().concat('.next-e1-t8-focus-abc123/types/**/*.ts');
    const generated = `${JSON.stringify(parsed, null, 2)}\n`;
    const restored = inverseTsconfigMutation(generated, pristine, paths);
    expect(restored).toBe(pristine);
    expect(hashText(restored)).toBe(hashText(pristine));
    const concurrentEdit = generated.replace('"target": "ES2017"', '"target": "ES2020"');
    expect(() => inverseTsconfigMutation(concurrentEdit, pristine, paths)).toThrow('literal Next shape');
    expect(concurrentEdit).toContain('ES2020');
  });

  test('uses the shared credential-scrubbed offline environment without retired setup', () => {
    const environment = createFocusedEnvironment({ OPENROUTER_API_KEY: 'private', SAFE: 'yes' });
    expect(environment).toMatchObject({ OPENROUTER_API_KEY: '', SAFE: 'yes', E1_OFFLINE: '1' });
  });

  test('attempts every owned removal in deterministic order and renders nested aggregate causes', () => {
    const paths = deriveInvocationPaths('/private/tmp/e1-t8-focus.abc123', '/repo');
    const attempted: string[] = [];
    expect(() => removeOwnedPaths(paths, paths, () => true, (file) => {
      attempted.push(file);
      if (file === paths.resultsDirectory) throw new Error('results failed');
      if (file === paths.tempDirectory) throw new Error('temp failed');
    })).toThrow('Owned path removal failed.');
    expect(attempted).toEqual([paths.distDirectory, paths.resultsDirectory, paths.reportDirectory, paths.tempDirectory]);
    try {
      removeOwnedPaths(paths, paths, () => true, (file) => { if (file !== paths.distDirectory) throw new Error(`failed:${path.basename(file)}`); });
      throw new Error('expected aggregate');
    } catch (error) {
      expect(renderGateError(error)).toBe('Owned path removal failed.\n- failed:test-results-e1-t8-focus-abc123\n- failed:playwright-report-e1-t8-focus-abc123\n- failed:e1-t8-focus.abc123');
    }
  });
});
