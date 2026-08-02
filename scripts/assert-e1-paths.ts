import { existsSync, readFileSync } from 'node:fs';

const E1_PATHS = new Set([
  'docs/superpowers/plans/2026-07-29-event-every-scanner-product-loop.md',
  'scripts/vendor-event-scanner.ts',
  'scripts/assert-e1-paths.ts',
  'scripts/assert-e1-protected.ts',
  'scripts/e1-offline-preload.cjs',
  'scripts/run-e1-offline.ts',
  'scripts/run-e1-focused.ts',
  'scripts/run-e1-focused.test.ts',
  'vendor/event-every-scanner/PROVENANCE.json',
  'vendor/event-every-scanner/package.json',
  'vendor/event-every-scanner/README.md',
  'src/services/__tests__/scannerVendor.test.ts',
  'package.json',
  'bun.lock',
  'src/app/layout.tsx',
  'src/app/globals.css',
  'playwright.config.ts',
  'src/types/review.ts',
  'src/services/scannerDraft.ts',
  'src/services/__tests__/scannerDraft.test.ts',
  'src/types/scannerHttp.ts',
  'src/types/scanRequest.ts',
  'src/server/scanner/transport.ts',
  'src/server/scanner/scan.ts',
  'src/server/scanner/__tests__/transport.test.ts',
  'src/server/scanner/__tests__/scan.test.ts',
  'src/lib/llm.ts',
  'src/lib/__tests__/llm.test.ts',
  'src/server/scanner/image.ts',
  'src/server/scanner/__tests__/image.test.ts',
  'src/server/scanner/job.ts',
  'src/app/api/scan/route.ts',
  'src/app/api/scan/__tests__/route.test.ts',
  'src/services/scanClient.ts',
  'src/services/__tests__/scanClient.test.ts',
  'src/app/api/__tests__/limit-gating.test.ts',
  'src/lib/__tests__/limits.test.ts',
  'src/app/page.tsx',
  'src/services/__tests__/urlServices.test.ts',
  'src/services/urlDetector.ts',
  'src/services/webScraper.ts',
  'src/components/review/ReviewDraftSection.tsx',
  'src/components/review/ReviewDraftCard.tsx',
  'src/components/review/ReviewDraftFields.tsx',
  'src/components/review/ReviewIssues.tsx',
  'src/services/scannerExporter.ts',
  'src/services/__tests__/scannerExporter.test.ts',
  'src/services/reviewStorage.ts',
  'src/services/__tests__/reviewStorage.test.ts',
  'e2e/scanner-product-loop.spec.ts',
  'e2e/recent-input.spec.ts',
  'e2e/calendar-event-regression.spec.ts',
  'docs/testing/e1-mutation-ledger.md',
  'e2e/helpers.ts',
  'e2e/community-limit.spec.ts',
  'e2e/event-extraction.spec.ts',
  'e2e/export-ics.spec.ts',
  'e2e/draft-and-history.spec.ts',
  'e2e/inline-edit-timezone.spec.ts',
  'e2e/timezone-resolution.spec.ts',
  'e2e/url-scrape.spec.ts',
  'src/app/api/parse/route.ts',
  'src/services/parser.ts',
  'src/services/__tests__/parser.test.ts',
  'README.md',
  '.env.example',
  'src/services/inputStorage.ts',
  'src/services/__tests__/inputStorage.test.ts',
]);

function output(command: string, args: string[]): string[] {
  const result = Bun.spawnSync([command, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return new TextDecoder().decode(result.stdout).split('\n').filter(Boolean);
}

const CODE_FILE = /\.(?:ts|tsx)$/;
const TEST_FILE = /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.[^/]+$)/;
const LEGACY_PARSER_PATHS = [
  'src/app/api/parse/route.ts',
  'src/services/parser.ts',
  'src/services/__tests__/parser.test.ts',
] as const;

function terminalRemovalViolations(codeFiles: string[]): string[] {
  const violations: string[] = [];
  const source = new Map(codeFiles.map((file) => [file, readFileSync(file, 'utf8')]));

  for (const token of ['/api/parse', 'parseEventsBatch', 'buildSSE', 'mockParseAPI']) {
    const matches = codeFiles.filter((file) => source.get(file)!.includes(token));
    if (matches.length > 0) violations.push(`Forbidden ${token} reference:\n${matches.join('\n')}`);
  }

  const parsedEventUsers = codeFiles.filter((file) => (
    file !== 'src/types/event.ts' && /\bParsedEvent\b/.test(source.get(file)!)
  ));
  if (parsedEventUsers.length > 0) {
    violations.push(`ParsedEvent remains on an executable scan path:\n${parsedEventUsers.join('\n')}`);
  }

  const reviewImports = codeFiles.filter((file) => (
    file.startsWith('src/components/review/')
    && /from\s+['"](?:@\/services\/exporter|ics)['"]/.test(source.get(file)!)
  ));
  if (reviewImports.length > 0) {
    violations.push(`ReviewDraft components import a legacy exporter:\n${reviewImports.join('\n')}`);
  }

  const browserReachable = codeFiles.filter((file) => (
    !TEST_FILE.test(file)
    && (
      file === 'src/app/page.tsx'
      || file.startsWith('src/components/')
      || file.startsWith('src/hooks/')
      || file.startsWith('src/services/')
      || file.startsWith('src/types/')
      || file.startsWith('src/utils/')
    )
  ));
  const browserOpenRouterImports = browserReachable.filter((file) => (
    source.get(file)!.includes('@event-every/scanner/openrouter')
  ));
  if (browserOpenRouterImports.length > 0) {
    violations.push(`Browser-reachable modules import Scanner OpenRouter:\n${browserOpenRouterImports.join('\n')}`);
  }

  const productionScanCallSites = codeFiles.filter((file) => (
    file.startsWith('src/') && !TEST_FILE.test(file) && source.get(file)!.includes('/api/scan')
  ));
  if (
    productionScanCallSites.length !== 1
    || productionScanCallSites[0] !== 'src/services/scanClient.ts'
    || source.get('src/services/scanClient.ts')!.split('/api/scan').length !== 2
  ) {
    violations.push(
      `Expected exactly one /api/scan browser call site in src/services/scanClient.ts; observed:\n${productionScanCallSites.join('\n') || '(none)'}`,
    );
  }

  const presentLegacyPaths = LEGACY_PARSER_PATHS.filter(existsSync);
  if (presentLegacyPaths.length > 0) {
    violations.push(`Legacy parser paths remain:\n${presentLegacyPaths.join('\n')}`);
  }

  return violations;
}

const [base, head, ...extra] = process.argv.slice(2);
if (!base || !head || extra.length > 0) {
  throw new Error('Usage: bun scripts/assert-e1-paths.ts <base-revision> <head-revision>');
}

const staged = output('git', ['diff', '--cached', '--name-only']);
const protectedStaged = staged.filter((file) => (
  file === '.claude'
  || file.startsWith('.claude/')
  || file === 'tasks/task-192.md'
  || file === 'tasks/task-193.md'
));
if (protectedStaged.length > 0) {
  throw new Error(`Protected paths must never be staged:\n${protectedStaged.join('\n')}`);
}

const changed = new Set([
  ...output('git', ['diff', '--name-only', `${base}..${head}`]),
  ...output('git', ['diff', '--name-only']),
  ...staged,
]);
const disallowed = [...changed].filter((file) => (
  !(E1_PATHS.has(file) || file.startsWith('vendor/event-every-scanner/dist/'))
));
if (disallowed.length > 0) {
  throw new Error(`E1 path guard rejected:\n${disallowed.sort().join('\n')}`);
}

const codeFiles = output('git', [
  'ls-files', '--cached', '--others', '--exclude-standard', 'src', 'e2e',
]).filter((file) => CODE_FILE.test(file) && existsSync(file));
const removalViolations = terminalRemovalViolations(codeFiles);
if (removalViolations.length > 0) {
  throw new Error(`E1 terminal removal guard rejected:\n${removalViolations.join('\n\n')}`);
}

console.log(`E1 path guard accepted ${changed.size} changed path(s).`);
