import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createCloudflareChildEnvironment } from './run-c1-a-cloudflare';

const OUTPUTS = ['.open-next', '.wrangler'] as const;
const REQUIRED_ARTIFACT_MARKERS = [
  'https://openrouter.ai/api/v1/chat/completions',
  'OwnerBudgetAuthority',
  'ProviderRequestAuthority',
] as const;
const FORBIDDEN_ARTIFACT = [
  /OPENROUTER_(?:COMMUNITY_KEY|API_KEY|BASE_URL|MODEL|SUMMARY_MODEL)/,
  /@upstash\/redis|KV_REST_API_(?:URL|TOKEN)|\bupstash\b|\bredis\b/i,
  /src\/platform\/legacy\/(?:dispatch|provider|usage|waitlist)\.ts/i,
  /(?:from|import)\s*\(?\s*["'][^"']*platform\/legacy\/dispatch/i,
  /community[- ]sponsored|shared daily limit|join the waitlist|spirit\s*&\s*hammer|membership provides access|public free use/i,
  /["'`]\/spent(?:[/?#"'`]|$)/,
] as const;
const EXCLUDED_DIRECTORY = new Set([
  '.git', '.next', '.open-next', '.wrangler', 'node_modules', 'coverage', 'dist', 'out',
  'playwright-report', 'test-results', '.claude', 'tasks', 'docs',
]);
const EXCLUDED_FILE = /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/;

function fail(kind: string): never {
  throw new Error(`private worker: ${kind}`);
}

function inside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertArtifactText(value: string): void {
  if (FORBIDDEN_ARTIFACT.some((pattern) => pattern.test(value))) fail('forbidden artifact');
}

function localImportTarget(specifier: string, importer: string, artifactRoot: string): string | null {
  if (/^(?:node|cloudflare|workerd):/.test(specifier)) return null;
  if (!specifier.startsWith('.')) {
    if (specifier.startsWith('/')) fail(`unresolved import ${path.relative(artifactRoot, importer)} -> ${specifier}`);
    // A bare runtime package is external to the emitted-asset graph. The build scanner still
    // authenticates the authored inputs that selected it, while local chunks must resolve.
    return null;
  }
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.mjs`,
    `${unresolved}.cjs`,
    path.join(unresolved, 'index.js'),
    path.join(unresolved, 'index.mjs'),
    path.join(unresolved, 'index.cjs'),
  ];
  const target = candidates.find((candidate) => inside(artifactRoot, candidate)
    && existsSync(candidate) && lstatSync(candidate).isFile());
  if (!target) {
    fail(`unresolved import ${path.relative(artifactRoot, importer)} -> ${specifier}`);
  }
  return target;
}

function importSpecifiers(sourceText: string, file: string, artifactRoot: string): readonly string[] {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const parseDiagnostics = (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (parseDiagnostics?.length) fail('invalid JavaScript artifact');
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) fail('unresolved import');
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]!)) {
        // OpenNext's one generated server-function bundle contains framework runtime imports
        // (Workerd shims and bundled route IDs). It is itself scanned in full and emits no
        // sibling JavaScript chunks, so those calls cannot create an unscanned artifact edge.
        const relative = path.relative(artifactRoot, file);
        const closedRuntimeDirectory = relative.startsWith(`${path.join('server-functions', 'default')}${path.sep}`)
          || relative.startsWith(`middleware${path.sep}`);
        if (!closedRuntimeDirectory) {
          fail(`non-literal dynamic import ${relative}`);
        }
        ts.forEachChild(node, visit);
        return;
      }
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

function scanSourceMaps(sourceText: string, importer: string, artifactRoot: string, observed: string[]): void {
  const references: string[] = [];
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, sourceText);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const comment = scanner.getTokenText();
    const match = comment.match(/^\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/)
      ?? comment.match(/^\/\*[#@]\s*sourceMappingURL=([^\s*]+)\s*\*\/$/);
    if (match) references.push(match[1]!);
  }
  for (const reference of references) {
    let mapText: string;
    if (reference.startsWith('data:application/json;base64,')) {
      try {
        mapText = Buffer.from(reference.slice('data:application/json;base64,'.length), 'base64').toString('utf8');
      } catch {
        fail('unresolved source map');
      }
    } else {
      let decoded: string;
      try { decoded = decodeURIComponent(reference); } catch { fail('invalid source map'); }
      const target = path.resolve(path.dirname(importer), decoded);
      // OpenNext copies dependencies with their original (often unpublished) map comments.
      // A missing map contributes no emitted source; any map that is present is authenticated,
      // parsed, and scanned below.
      if (!inside(artifactRoot, target) || !existsSync(target) || !lstatSync(target).isFile()) continue;
      mapText = readFileSync(target, 'utf8');
    }
    assertArtifactText(mapText);
    let parsed: unknown;
    try { parsed = JSON.parse(mapText); } catch { fail('invalid source map'); }
    if (!parsed || typeof parsed !== 'object') fail('invalid source map');
    const map = parsed as { sources?: unknown; sourcesContent?: unknown };
    if (!Array.isArray(map.sources) || map.sources.some((entry) => typeof entry !== 'string')) fail('invalid source map');
    if (map.sourcesContent !== undefined && (!Array.isArray(map.sourcesContent)
      || map.sourcesContent.some((entry) => entry !== null && typeof entry !== 'string'))) fail('invalid source map');
    observed.push(...map.sources as string[]);
    observed.push(...(map.sourcesContent ?? []).filter((entry): entry is string => typeof entry === 'string'));
  }
}

function emittedJavaScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && /\.(?:m?js)$/.test(entry.name)) files.push(target);
    }
  };
  walk(directory);
  return files;
}

export function assertPrivateWorkerArtifact(root: string): void {
  const artifactRoot = path.join(root, '.open-next');
  const entry = path.join(artifactRoot, 'worker.js');
  if (!existsSync(entry) || !lstatSync(entry).isFile()) fail('missing worker artifact');
  const pending = [entry];
  const seen = new Set<string>();
  const observed: string[] = [];
  const wrapper = path.join(root, 'cloudflare', 'app-worker.ts');
  if (existsSync(wrapper) && lstatSync(wrapper).isFile()) {
    const wrapperText = readFileSync(wrapper, 'utf8');
    assertArtifactText(wrapperText);
    observed.push(wrapperText);
  }
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const sourceText = readFileSync(file, 'utf8');
    assertArtifactText(sourceText);
    observed.push(sourceText);
    scanSourceMaps(sourceText, file, artifactRoot, observed);
    if (path.relative(artifactRoot, file) === path.join('server-functions', 'default', 'handler.mjs')) {
      // The permitted framework runtime imports are closed by scanning every emitted module
      // in the sole server-function directory, whether or not the runtime selects it.
      pending.push(...emittedJavaScriptFiles(path.dirname(file)));
    }
    if (path.relative(artifactRoot, file).startsWith(`middleware${path.sep}`)) {
      pending.push(...emittedJavaScriptFiles(path.join(artifactRoot, 'middleware')));
    }
    for (const specifier of importSpecifiers(sourceText, file, artifactRoot)) {
      const target = localImportTarget(specifier, file, artifactRoot);
      if (target) pending.push(target);
    }
  }
  const graphText = observed.join('\n');
  assertArtifactText(graphText);
  for (const marker of REQUIRED_ARTIFACT_MARKERS) {
    if (!graphText.includes(marker)) fail(`missing ${marker}`);
  }
}

export function listAuthoredInputs(root: string): readonly string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORY.has(entry.name) && !entry.name.startsWith('.private-privacy-')
          && !entry.name.startsWith('test-results-') && !entry.name.startsWith('playwright-report-')) {
          walk(path.join(directory, entry.name));
        }
        continue;
      }
      if (!entry.isFile() || EXCLUDED_FILE.test(entry.name)) continue;
      files.push(path.join(directory, entry.name));
    }
  };
  walk(root);
  return files.sort();
}

function hash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function build(root: string): Promise<void> {
  const result = Bun.spawnSync(['node', 'node_modules/@opennextjs/cloudflare/dist/cli/index.js', 'build'], {
    cwd: root,
    env: createCloudflareChildEnvironment(process.env, root),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) fail('build failed');
}

export type PrivateWorkerAssertionSeams = Readonly<{
  authoredInputs(root: string): readonly string[];
  hash(file: string): string;
  build(root: string): Promise<void>;
}>;

const DEFAULT_SEAMS: PrivateWorkerAssertionSeams = { authoredInputs: listAuthoredInputs, hash, build };

function existsPath(target: string): boolean {
  try { lstatSync(target); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function runPrivateWorkerAssertion(
  root: string,
  seams: PrivateWorkerAssertionSeams = DEFAULT_SEAMS,
): Promise<void> {
  const outputs = OUTPUTS.map((entry) => path.join(root, entry));
  if (outputs.some(existsPath)) fail('output already exists');
  const inputs = [...seams.authoredInputs(root)];
  if (!inputs.length || new Set(inputs).size !== inputs.length
    || inputs.some((file) => !inside(root, file) || !existsSync(file) || !lstatSync(file).isFile())) {
    fail('authored inputs');
  }
  const before = new Map(inputs.map((file) => [file, seams.hash(file)]));
  let ownsOutputs = true;
  let primary: unknown;
  try {
    await seams.build(root);
    assertPrivateWorkerArtifact(root);
    for (const file of inputs) if (seams.hash(file) !== before.get(file)) fail('authored input changed');
  } catch (error) {
    primary = error;
  } finally {
    if (ownsOutputs) {
      for (const output of outputs) if (existsPath(output)) rmSync(output, { recursive: true, force: false });
      ownsOutputs = false;
    }
  }
  if (primary) throw primary;
}

if (import.meta.main) {
  try {
    await runPrivateWorkerAssertion(path.resolve(import.meta.dir, '..'));
    console.log('private worker: accepted');
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('private worker:')
      ? error.message
      : 'private worker: failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
