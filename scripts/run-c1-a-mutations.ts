import { chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { constants as osConstants, tmpdir } from 'node:os';
import { basename, dirname, posix, resolve } from 'node:path';
import { CString, dlopen, FFIType, ptr, read } from 'bun:ffi';

export const CREDENTIAL_NAME = /(OPENROUTER|ANTHROPIC|API_KEY|TOKEN|SECRET|CLOUDFLARE|RESEND|KV_REST|D1|R2|AUTH_PATTERN)/i;
export const CHILD_TIMEOUT_MS = 120_000;
export const COMPILE_TIMEOUT_MS = 300_000;
const COMPILE_COMMAND = ['bun', 'scripts/run-with-open-next.ts', '--', 'node', 'node_modules/typescript/bin/tsc', '--noEmit'] as const;

export type MutationCommand = keyof typeof MUTATION_COMMANDS;
export type MutationRow = Readonly<{ id: string; ownerTask: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; target: string; oldText: string; newText: string; command: MutationCommand; redAssertion: string }>;
export type MutationProof = MutationRow & Readonly<{ restoredSha256: string }>;
export type MutationMode = 'write' | 'verify';
export type ParsedMutationArguments = Readonly<{ mode: MutationMode; ids: readonly string[] }>;
export type SpawnResult = Readonly<{ exitCode: number | null | undefined; stdout: Uint8Array; stderr: Uint8Array; timedOut?: boolean; signal?: string | null; authorityLost?: boolean; groupExtinct?: boolean }>;
export type TrackedSnapshotFile = Readonly<{ path: string; bytes: Uint8Array; executable?: boolean }>;
export type MutationExecution = Readonly<{
  root: string;
  ledgerPath: string;
  now: () => number;
  pid: number;
  isProcessAlive: (pid: number) => boolean;
  run: (argv: readonly string[], options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv; shell: false; timeoutMs: number; authorityPid?: number; runnerPid?: number; topologyFd?: number }>) => SpawnResult;
  hasDirtyTarget: (target: string) => boolean;
  subscribeAbort?: (handler: () => void) => () => void;
  allowMissingLedger?: boolean;
  calls?: string[][];
  rootDescriptor?: number;
  lockAuthorityPid?: number;
  afterTargetParentOpened?: (target: string) => void;
  trackedSnapshotFiles?: () => readonly TrackedSnapshotFile[];
  dependencyRoot?: string;
  dependencyDescriptor?: number;
  snapshotRoot?: string;
  snapshotDescriptor?: number;
  topologyFd?: number;
  beforeDependencyEntryCopy?: (relative: string) => void;
}>; 

type LifecycleExecution = MutationExecution & Readonly<{ beforeLedgerPublish?: () => void }>;

export const MUTATION_COMMANDS = Object.freeze({
  'MUT-A': ['bun', 'test', 'src/platform/__tests__/identity.test.ts', 'src/platform/__tests__/admission.test.ts', 'src/app/api/scan/__tests__/route.test.ts', '--isolate'],
  'MUT-B': ['bun', 'test', 'src/server/scanner/__tests__/image.test.ts', '--isolate'],
  'MUT-C': ['bun', 'test', 'src/platform/legacy/__tests__/dispatch.test.ts', 'src/server/scanner/__tests__/transport.test.ts', 'src/app/api/scan/__tests__/route.test.ts', '--isolate'],
  'MUT-D': ['bun', 'test', 'src/lib/__tests__/llm.test.ts', '--isolate'],
  'MUT-E': ['bun', 'test', 'src/platform/__tests__/route-manifest.test.ts', 'src/services/__tests__/urlServices.test.ts', '--isolate'],
  'MUT-F': ['bun', 'test', 'src/platform/resolver/__tests__/capability.test.ts', '--isolate'],
  'MUT-G': ['bun', 'scripts/run-with-open-next.ts', '--', 'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.workers.ts', 'test/worker/resolver.integration.test.ts', 'test/worker/deny-egress.integration.test.ts'],
  'MUT-H': ['bun', 'test', 'src/services/__tests__/urlServices.test.ts', '--isolate'],
  'MUT-I': ['bun', 'test', 'src/platform/resolver/__tests__/url-policy.test.ts', 'src/app/api/scrape-url/__tests__/route.test.ts', '--isolate'],
  'MUT-J': ['bun', 'test', 'src/lib/__tests__/llm.test.ts', 'src/lib/__tests__/limits.test.ts', '--isolate'],
  'MUT-K': ['bun', 'scripts/run-c1-a-cloudflare.ts', 'keepalive-tests'],
  'MUT-L': ['bun', 'test', 'src/services/__tests__/reviewStorage.test.ts', '--isolate'],
  'MUT-M': ['bun', 'scripts/run-with-open-next.ts', '--', 'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.workers.ts', 'test/worker/app-worker.test.ts', 'test/worker/deny-egress.integration.test.ts'],
  'MUT-N': ['bun', 'test', 'src/services/__tests__/scanClient.test.ts', '--isolate'],
  'MUT-O': ['bun', 'test', 'src/services/__tests__/summarizer.test.ts', '--isolate'],
  'MUT-P': ['bun', 'test', 'src/platform/__tests__/identity.test.ts', '--isolate'],
  'MUT-Q': ['bun', 'test', 'src/platform/__tests__/runtime.test.ts', '--isolate'],
  'MUT-R': ['bun', 'test', 'src/app/api/keep-alive/__tests__/route.test.ts', '--isolate'],
  'MUT-S': ['bun', 'test', 'src/platform/resolver/__tests__/html-to-text.test.ts', '--isolate'],
  'MUT-T': ['bun', 'test', 'src/app/api/resolve-timezone/__tests__/route.test.ts', '--isolate'],
} as const satisfies Record<string, readonly string[]>);

function ownerTask(id: string): MutationRow['ownerTask'] {
  if (['C1A-M27', 'C1A-M28', 'C1A-M30', 'C1A-M38', 'C1A-M39'].includes(id)) return 3;
  if (/^C1A-M0[1-5]$/.test(id) || id === 'C1A-M24') return 4;
  if (/^C1A-M0[6-9]$/.test(id) || id === 'C1A-M25' || id === 'C1A-M26') return 5;
  if (/^C1A-M1[0-5](?:[A-C])?$/.test(id) || ['C1A-M29', 'C1A-M36', 'C1A-M42', 'C1A-M43'].includes(id)) return 6;
  if (['C1A-M16', 'C1A-M17', 'C1A-M18', 'C1A-M33', 'C1A-M34', 'C1A-M35', 'C1A-M37', 'C1A-M41'].includes(id)) return 7;
  if (id === 'C1A-M19' || id === 'C1A-M40') return 8;
  if (id === 'C1A-M20' || id === 'C1A-M31' || id === 'C1A-M32') return 9;
  if (id === 'C1A-M21' || id === 'C1A-M22' || id === 'C1A-M23') return 10;
  throw new Error('c1-a mutations: registry invalid');
}
export const C1_A_MUTATIONS: readonly MutationRow[] = Object.freeze([
  ['C1A-M01','src/platform/identity.ts',"request.headers.get('cf-connecting-ip')","request.headers.get('x-forwarded-for')",'MUT-A','forged forwarding header is ignored'],
  ['C1A-M02','src/platform/admission.ts','return isAllowedOrigin(request, policy);','return true;','MUT-A','cross-site text is rejected before route'],
  ['C1A-M03','src/platform/admission.ts','totalBytes += chunk.byteLength;',"totalBytes = Number(request.headers.get('content-length') ?? 0);",'MUT-A','chunked overflow cancels the stream'],
  ['C1A-M04','src/platform/admission.ts','if (totalBytes > policy.maxBodyBytes) {','if (totalBytes >= policy.maxBodyBytes) {','MUT-A','exact byte ceiling is accepted'],
  ['C1A-M05','src/platform/admission.ts',"await cancelAndReject(reader, 'body_too_large');","return rejectAdmission('body_too_large');",'MUT-A','chunked overflow cancels the stream'],
  ['C1A-M06','src/server/scanner/image.ts','validateStructuredImage(decoded, mimeType)','decoded.byteLength >= 4','MUT-B','truncated image structure is rejected'],
  ['C1A-M07','src/server/scanner/image.ts','decoded.byteLength > MAX_IMAGE_BYTES','encoded.length > MAX_IMAGE_BYTES','MUT-B','decoded image byte ceiling is enforced'],
  ['C1A-M08','src/server/scanner/transport.ts','signal: input.signal,','signal: undefined,','MUT-C','exact signal reaches fetch'],
  ['C1A-M09','src/lib/llm.ts','await response.body?.cancel();','await response.json();','MUT-D','provider error body remains unread'],
  ['C1A-M10','src/app/api/detect-urls/route.ts','detectUrlsDeterministically(input.text)',"await fetch('/api/summarize', { method: 'POST' }).then(() => detectUrlsDeterministically(input.text))",'MUT-E','deterministic detector performs no provider call'],
  ['C1A-M11','src/platform/resolver/capability.ts','Math.min(input.nowMs + 120_000, blackoutStartMs)','input.nowMs + 120_000','MUT-F','capability expires before blackout'],
  ['C1A-M12A','src/platform/cloudflare/resolver-request-authority.ts','if (!isTrustedUtcDay(input.authorityDay, input.nowMs)) {','if (false) {','MUT-G','begin rejects day mismatch before mutation'],
  ['C1A-M12B','src/platform/cloudflare/resolver-request-authority.ts','if (!isTrustedUtcDay(input.currentUtcDay, input.nowMs)) {','if (false) {','MUT-G','claim rejects day mismatch before mutation'],
  ['C1A-M12C','src/platform/cloudflare/daily-counter.ts','if (!isTrustedUtcDay(input.currentUtcDay, input.nowMs)) {','if (false) {','MUT-G','admission rejects day mismatch before mutation'],
  ['C1A-M13','src/platform/cloudflare/daily-counter.ts','if (activeLeases >= RESOLVER_MAX_CONCURRENT) return busyResult(input.nowMs, active);','if (activeLeases >= RESOLVER_MAX_CONCURRENT) { incrementDailyCountSql(this.ctx.storage.sql, input.authorityDay, input.identityHmac); return busyResult(input.nowMs, active); }','MUT-G','busy admission does not increment'],
  ['C1A-M14','src/platform/cloudflare/resolver-request-authority.ts',"return { status: stored.state === 'claimed' ? 'inflight' as const : stored.state };","return { status: 'permit' as const, nonce: stored.nonce ?? '' };",'MUT-G','non-permit result exposes no nonce'],
  ['C1A-M15','src/services/webScraper.ts','mapWithConcurrency(urls, 2, resolveOne)','Promise.all(urls.map(resolveOne))','MUT-H','resolver concurrency is bounded at two'],
  ['C1A-M16','src/platform/resolver/url-policy.ts',"redirect: 'manual',","redirect: 'follow',",'MUT-I','private redirect is rejected'],
  ['C1A-M17','src/platform/resolver/url-policy.ts','assertAllowedResolverUrl(nextUrl);','assertAllowedScheme(nextUrl);','MUT-I','every redirect hop is fully revalidated'],
  ['C1A-M18','src/app/api/scrape-url/route.ts','readCappedBody(response.body, RESOLVER_BODY_LIMIT, signal)','response.text()','MUT-I','512 KiB plus one cancels upstream'],
  ['C1A-M19','src/lib/llm.ts',"return 'community';","return 'admin';",'MUT-J','community mode has no cookie admin bypass'],
  ['C1A-M20','cloudflare/legacy-keepalive-worker.ts','return mapKeepAliveFailure(error);','throw error;','MUT-K','native failure is status-only'],
  ['C1A-M21','src/app/page.tsx',"case 'recovered-corrupt': return { hydrationComplete: true };","case 'recovered-corrupt': return { hydrationComplete: false };",'MUT-L','recovered corrupt storage completes hydration'],
  ['C1A-M22','src/services/reviewStorage.ts','storage.removeItem(REVIEW_STORAGE_KEY);','void REVIEW_STORAGE_KEY;','MUT-L','corrupt Scanner key is removed'],
  ['C1A-M23','src/services/reviewStorage.ts','storage.removeItem(REVIEW_STORAGE_KEY);','storage.clear();','MUT-L','unrelated storage remains untouched'],
  ['C1A-M24','cloudflare/app-worker.ts','return handler.fetch(admitted.request, env, ctx)','return handler.fetch(request, env, ctx)','MUT-M','wrapper forwards only rebuilt admitted request'],
  ['C1A-M25','src/platform/legacy/dispatch.ts','const provider = invokeProvider(input.provider, input.signal);','const provider = charge.then(() => invokeProvider(input.provider, input.signal)).then((result) => result);','MUT-C','charge settlement cannot delay provider invocation'],
  ['C1A-M26','src/platform/legacy/dispatch.ts',"if (abortedAfterStart || settled.kind === 'aborted') {","if (abortedAfterStart && settled.kind === 'aborted') {",'MUT-C','late provider success after abort is unknown'],
  ['C1A-M27','src/services/scanClient.ts',"'X-Event-Every-Request-Id': requestId","'X-Event-Every-Request-Id': createProviderRequestId()",'MUT-N','scan retry preserves one request UUID'],
  ['C1A-M28','src/services/summarizer.ts',"'X-Event-Every-Request-Id': requestId","'X-Event-Every-Request-Id': createProviderRequestId()",'MUT-O','summarizer forwards its created request UUID'],
  ['C1A-M29','src/platform/identity.ts','nowMs < schedule.activatesAtMs','nowMs <= schedule.activatesAtMs','MUT-P','identity switches exactly at activation'],
  ['C1A-M30','src/platform/runtime.ts','return notReadyProviderPort;','return legacyProviderPort;','MUT-Q','shadow and cloudflare fail before legacy provider'],
  ['C1A-M31','src/app/api/keep-alive/route.ts','return new Response(null, { status: 410 });',"return fetch('http://127.0.0.1:8799/legacy-keepalive');",'MUT-R','public keep-alive performs zero outbound state calls'],
  ['C1A-M32','cloudflare/legacy-keepalive-worker.ts',"if (env.STATE_AUTHORITY_MODE === 'cloudflare') return;",'if (false) return;','MUT-K','cloudflare mode performs no keep-alive state call'],
  ['C1A-M33','src/platform/resolver/url-policy.ts','return isPublicAddress(parsedAddress);','return true;','MUT-I','private literal address is rejected'],
  ['C1A-M34','src/platform/resolver/url-policy.ts','if (totalBytes > RESOLVER_BODY_LIMIT) {','if (totalBytes > Number.MAX_SAFE_INTEGER) {','MUT-I','512 KiB plus one cancels upstream'],
  ['C1A-M35','src/platform/resolver/html-to-text.ts','truncateUtf8(text, RESOLVER_TEXT_MAX_BYTES)','text','MUT-S','sanitized text is capped at 100000 UTF-8 bytes'],
  ['C1A-M36','src/platform/cloudflare/resolver-request-authority.ts','stored.authorityDay !== trustedDay','false','MUT-G','claim rejects stored pre-midnight authority day'],
  ['C1A-M37','src/platform/resolver/url-policy.ts','canonicalBytes > RESOLVER_URL_MAX_BYTES','canonicalBytes > Number.MAX_SAFE_INTEGER','MUT-I','canonical URL is capped at 2048 bytes'],
  ['C1A-M38','src/platform/route-manifest.ts',"'/api/scrape-url': SCRAPE_URL_POLICY,","'/api/not-scrape-url': SCRAPE_URL_POLICY,",'MUT-E','every API route has one manifest entry'],
  ['C1A-M39','src/app/api/resolve-timezone/route.ts',"request.headers.get('x-event-every-request-id')",'crypto.randomUUID()','MUT-T','timezone route forwards the caller request UUID'],
  ['C1A-M40','src/lib/llm.ts',"if (!process.env.OPENROUTER_COMMUNITY_KEY) throw new Error('community_key_unavailable');","if (!process.env.OPENROUTER_COMMUNITY_KEY) return process.env.OPENROUTER_API_KEY!;",'MUT-J','community request never falls back to admin key'],
  ['C1A-M41','src/platform/resolver/html-to-text.ts','truncateUtf8(title, RESOLVER_TITLE_MAX_BYTES)','title','MUT-S','sanitized title is capped at 512 UTF-8 bytes'],
  ['C1A-M42','src/platform/cloudflare/resolver-request-authority.ts','if (input.nowMs >= stored.permitDeadlineMs) {','if (false) {','MUT-G','claim in blackout tombstones without nonce'],
  ['C1A-M43','src/platform/cloudflare/daily-counter.ts',"for (const lease of this.readLeases('expires_at_ms <= ?', nowMs)) {\n      this.moveExpiredLeaseToOutbox(lease, nowMs);","for (const lease of this.readLeases('expires_at_ms <= ?', nowMs)) {\n      void lease;",'MUT-G','expired lease is durable before deletion'],
].map(([id, target, oldText, newText, command, redAssertion]) => Object.freeze({ id, ownerTask: ownerTask(id), target, oldText, newText, command: command as MutationCommand, redAssertion })));

export class MutationRunnerError extends Error { constructor(reason: string) { super(`c1-a mutations: ${reason}`); } }
const count = (source: string, needle: string) => source.split(needle).length - 1;
const digest = (source: string) => new Bun.CryptoHasher('sha256').update(source).digest('hex');
const fixedError = (reason: string): never => { throw new MutationRunnerError(reason); };

function assertRegistry(): void {
  if (C1_A_MUTATIONS.length !== 45 || new Set(C1_A_MUTATIONS.map(({ id }) => id)).size !== 45) fixedError('registry invalid');
  for (const row of C1_A_MUTATIONS) {
    if (!/^C1A-M(?:0[1-9]|[1-9][0-9]?|12[A-C])$/.test(row.id) || !MUTATION_COMMANDS[row.command]) fixedError('registry invalid');
    assertTarget(row.target);
  }
}
function assertTarget(target: string): void {
  if (!target || target.startsWith('/') || target.includes('\\') || target.split('/').includes('..')) fixedError('target');
}

const libc = dlopen('/usr/lib/libSystem.B.dylib', {
  openat: { args: [FFIType.i32, FFIType.ptr, FFIType.i32, FFIType.u32], returns: FFIType.i32 },
  linkat: { args: [FFIType.i32, FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  unlinkat: { args: [FFIType.i32, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  dup: { args: [FFIType.i32], returns: FFIType.i32 },
  fchdir: { args: [FFIType.i32], returns: FFIType.i32 },
  chflags: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  lchflags: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  readlinkat: { args: [FFIType.i32, FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
  fdopendir: { args: [FFIType.i32], returns: FFIType.ptr },
  readdir: { args: [FFIType.ptr], returns: FFIType.ptr },
  closedir: { args: [FFIType.ptr], returns: FFIType.i32 },
  getpgid: { args: [FFIType.i32], returns: FFIType.i32 },
  __error: { args: [], returns: FFIType.ptr },
});
const processLibrary = dlopen('/usr/lib/libproc.dylib', {
  proc_listallpids: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  proc_pidinfo: { args: [FFIType.i32, FFIType.i32, FFIType.u64, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
});
const nativeErrno = (): number => { const location = libc.symbols.__error(); return location === null ? osConstants.errno.EIO : read.i32(location); };
export function tryLifecycleLock(descriptor: number): boolean { return libc.symbols.flock(descriptor, 2 | 4) === 0; }
function duplicateDescriptor(descriptor: number): number {
  const duplicates: number[] = [];
  try {
    for (;;) {
      const duplicated = libc.symbols.dup(descriptor); if (duplicated < 0) fixedError('descriptor unavailable'); duplicates.push(duplicated);
      if (duplicated >= 32) { duplicates.pop(); return duplicated; }
      if (duplicates.length > 64) fixedError('descriptor unavailable');
    }
  } finally { for (const duplicate of duplicates) closeQuietly(duplicate); }
}
const cString = (value: string): Buffer => Buffer.from(`${value}\0`);
function nativeOpenAt(directory: number, name: string, flags: number, mode = 0): { descriptor: number; errno: number } {
  const encoded = cString(name); const descriptor = libc.symbols.openat(directory, ptr(encoded), flags, mode);
  return { descriptor, errno: descriptor < 0 ? nativeErrno() : 0 };
}
function nativeLinkAt(directory: number, oldName: string, newName: string): number {
  const oldEncoded = cString(oldName); const newEncoded = cString(newName);
  const status = libc.symbols.linkat(directory, ptr(oldEncoded), directory, ptr(newEncoded), 0);
  return status === 0 ? 0 : nativeErrno();
}
function nativeUnlinkAt(directory: number, name: string): number {
  const encoded = cString(name); const status = libc.symbols.unlinkat(directory, ptr(encoded), 0);
  return status === 0 ? 0 : nativeErrno();
}
function nativeReadlinkAt(directory: number, name: string): string {
  const encoded = cString(name); const buffer = Buffer.alloc(4_096); const length = Number(libc.symbols.readlinkat(directory, ptr(encoded), ptr(buffer), buffer.length));
  if (length <= 0 || length >= buffer.length) fixedError('snapshot unsafe');
  return buffer.subarray(0, length).toString('utf8');
}
function readLinkNoFollow(target: string): string {
  const parent = openSync(dirname(target), directoryFlags);
  try { return nativeReadlinkAt(parent, basename(target)); } finally { closeQuietly(parent); }
}
function nativeDirectoryNames(descriptor: number): string[] {
  const opened = nativeOpenAt(descriptor, '.', directoryFlags); if (opened.descriptor < 0) fixedError('snapshot unsafe');
  const directory = libc.symbols.fdopendir(opened.descriptor); if (directory === null) { closeQuietly(opened.descriptor); fixedError('snapshot unsafe'); }
  const names: string[] = [];
  try {
    for (;;) {
      const entry = libc.symbols.readdir(directory); if (entry === null) break;
      const length = read.u16(entry, 18); if (length === 0 || length > 1_024) fixedError('snapshot unsafe');
      const name = new CString(entry, 21, length).toString(); if (name !== '.' && name !== '..') names.push(name);
    }
    return names.sort();
  } finally { libc.symbols.closedir(directory); }
}
const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const O_SYMLINK = 0x00200000;
type DirectoryIdentity = Readonly<{ name: string; descriptor: number; dev: number; ino: number }>;
type AnchoredHierarchy = Readonly<{ root: string; rootIdentity: DirectoryIdentity; descendants: readonly DirectoryIdentity[] }>;
function closeQuietly(descriptor: number): void { try { closeSync(descriptor); } catch { /* the fixed caller error wins */ } }
function openRoot(root: string, inherited?: number, reason: 'target unsafe' | 'ledger unsafe' | 'snapshot unavailable' = 'target unsafe'): DirectoryIdentity {
  let descriptor = -1;
  try {
    const pathname = lstatSync(root); if (!pathname.isDirectory() || pathname.isSymbolicLink()) fixedError(reason);
    if (inherited !== undefined) {
      const duplicated = nativeOpenAt(inherited, '.', directoryFlags); if (duplicated.descriptor < 0) fixedError(reason); descriptor = duplicated.descriptor;
    } else descriptor = openSync(root, directoryFlags);
    const opened = fstatSync(descriptor);
    if (!opened.isDirectory() || opened.dev !== pathname.dev || opened.ino !== pathname.ino) fixedError(reason);
    const identity = { name: '.', descriptor, dev: opened.dev, ino: opened.ino }; descriptor = -1; return identity;
  } catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError(reason);
  } finally { if (descriptor >= 0) closeQuietly(descriptor); }
}
function openHierarchy(root: string, components: readonly string[], inherited: number | undefined, reason: 'target unsafe' | 'ledger unsafe' | 'snapshot unavailable'): AnchoredHierarchy {
  const rootIdentity = openRoot(root, inherited, reason); const descendants: DirectoryIdentity[] = [];
  try {
    let parent = rootIdentity.descriptor;
    for (const name of components) {
      const opened = nativeOpenAt(parent, name, directoryFlags); if (opened.descriptor < 0) fixedError(reason);
      const stat = fstatSync(opened.descriptor); if (!stat.isDirectory()) { closeQuietly(opened.descriptor); fixedError(reason); }
      descendants.push({ name, descriptor: opened.descriptor, dev: stat.dev, ino: stat.ino }); parent = opened.descriptor;
    }
    return { root, rootIdentity, descendants };
  } catch (error) { for (const entry of descendants.reverse()) closeQuietly(entry.descriptor); closeQuietly(rootIdentity.descriptor); throw error; }
}
function closeHierarchy(hierarchy: AnchoredHierarchy): void {
  for (const entry of [...hierarchy.descendants].reverse()) closeQuietly(entry.descriptor);
  closeQuietly(hierarchy.rootIdentity.descriptor);
}
type HierarchyFailure = 'concurrent edit' | 'ledger unsafe' | 'snapshot unavailable';
function assertHierarchyCurrent(hierarchy: AnchoredHierarchy, reason: HierarchyFailure): void {
  const probes: number[] = [];
  try {
    const rootPath = lstatSync(hierarchy.root); const expectedRoot = hierarchy.rootIdentity;
    if (!rootPath.isDirectory() || rootPath.isSymbolicLink() || rootPath.dev !== expectedRoot.dev || rootPath.ino !== expectedRoot.ino) fixedError(reason);
    let parent = expectedRoot.descriptor;
    for (const expected of hierarchy.descendants) {
      const opened = nativeOpenAt(parent, expected.name, directoryFlags); if (opened.descriptor < 0) fixedError(reason);
      probes.push(opened.descriptor); const stat = fstatSync(opened.descriptor);
      if (!stat.isDirectory() || stat.dev !== expected.dev || stat.ino !== expected.ino) fixedError(reason);
      parent = opened.descriptor;
    }
  } catch (error) { if (error instanceof MutationRunnerError) throw error; fixedError(reason);
  } finally { for (const descriptor of probes.reverse()) closeQuietly(descriptor); }
}
export function parseMutationArguments(args: readonly string[]): ParsedMutationArguments {
  assertRegistry();
  if (args.length !== 2 || (args[0] !== '--write-ledger' && args[0] !== '--verify-ledger') || (args[0] === '--write-ledger' && args[1] !== '--all')) fixedError('expected --write-ledger --all or --verify-ledger --all|ID');
  const mode: MutationMode = args[0] === '--write-ledger' ? 'write' : 'verify';
  const ids = args[1] === '--all' ? C1_A_MUTATIONS.map(({ id }) => id) : [args[1]];
  if (!ids.every((id) => C1_A_MUTATIONS.some((row) => row.id === id))) fixedError('expected registered ID');
  return { mode, ids };
}
const SNAPSHOT_ROOT_FILES = new Set([
  'bun.lock', 'bunfig.toml', 'next.config.js', 'open-next.config.ts', 'package.json',
  'playwright.config.ts', 'postcss.config.js', 'tailwind.config.ts', 'tsconfig.json', 'vitest.config.keepalive-workers.ts',
  'vitest.config.workers.ts', 'worker-configuration.d.ts', 'wrangler.jsonc',
]);
const SNAPSHOT_PARENT = '/private/tmp';
const TRUSTED_PATH = `${dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
const SNAPSHOT_PREFIXES = ['cloudflare/', 'public/', 'scripts/', 'src/', 'test/', 'vendor/event-every-scanner/'] as const;
const SNAPSHOT_MAX_FILES = 2_048; const SNAPSHOT_MAX_FILE_BYTES = 32 * 1024 * 1024; const SNAPSHOT_MAX_BYTES = 512 * 1024 * 1024;
function assertSnapshotPath(file: string): void {
  if (!file || file.startsWith('/') || file.includes('\\') || file.includes('\0') || file.split('/').some((part) => !part || part === '.' || part === '..')) fixedError('snapshot unsafe');
}
function requiredSnapshotPath(file: string): boolean { return SNAPSHOT_ROOT_FILES.has(file) || SNAPSHOT_PREFIXES.some((prefix) => file.startsWith(prefix)); }
const GIT_EXECUTABLE = '/usr/bin/git';
const GIT_DESCRIPTOR_HELPER = String.raw`
import {dlopen,FFIType,ptr} from 'bun:ffi';
const libc=dlopen('/usr/lib/libSystem.B.dylib',{fchdir:{args:[FFIType.i32],returns:FFIType.i32},execve:{args:[FFIType.ptr,FFIType.ptr,FFIType.ptr],returns:FFIType.i32}});
if(libc.symbols.fchdir(4)!==0)process.exit(126);
const zero=String.fromCharCode(0),values=[${JSON.stringify(GIT_EXECUTABLE)},'--git-dir=.','--no-replace-objects',...process.argv.slice(1)];
const strings=values.map(value=>Buffer.from(value+zero)),argv=Buffer.alloc((strings.length+1)*8);
strings.forEach((value,index)=>argv.writeBigUInt64LE(BigInt(ptr(value)),index*8));
const environmentStrings=Object.entries(process.env).map(([name,value])=>Buffer.from(name+'='+value+zero)),environment=Buffer.alloc((environmentStrings.length+1)*8);
environmentStrings.forEach((value,index)=>environment.writeBigUInt64LE(BigInt(ptr(value)),index*8));
const executable=Buffer.from(${JSON.stringify(GIT_EXECUTABLE)}+zero);libc.symbols.execve(ptr(executable),ptr(argv),ptr(environment));process.exit(126);
`;
type GitBinding = Readonly<{ env: NodeJS.ProcessEnv; hierarchy: AnchoredHierarchy }>;
export type GitOperationObserver = (completedOperations: number) => void;
function localGitEnvironment(): NodeJS.ProcessEnv {
  // Deliberately closed: Git has many repository, object, config, hook, and transport selectors.
  return Object.freeze({ NODE_ENV: 'production', PATH: '/usr/bin:/bin', HOME: SNAPSHOT_PARENT, TMPDIR: SNAPSHOT_PARENT, LANG: 'C', LC_ALL: 'C', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '0', GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false', GIT_SSH: '/usr/bin/false' });
}
function authenticatedGitBinding(root: string, inheritedRootDescriptor?: number): GitBinding {
  try {
    const canonicalRoot = realpathSync(root); const hierarchy = openHierarchy(canonicalRoot, ['.git'], inheritedRootDescriptor, 'snapshot unavailable');
    return { env: localGitEnvironment(), hierarchy };
  } catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError('snapshot unavailable'); }
}
function assertGitBindingCurrent(binding: GitBinding): void { assertHierarchyCurrent(binding.hierarchy, 'snapshot unavailable'); }
function runAuthenticatedGit(binding: GitBinding, args: readonly string[], maxBuffer: number): ReturnType<typeof spawnSync> {
  assertGitBindingCurrent(binding);
  const rootDescriptor = duplicateDescriptor(binding.hierarchy.rootIdentity.descriptor); const gitDescriptor = duplicateDescriptor(binding.hierarchy.descendants[0].descriptor);
  try { return spawnSync(process.execPath, ['-e', GIT_DESCRIPTOR_HELPER, ...args], { cwd: SNAPSHOT_PARENT, env: binding.env, shell: false, stdio: ['ignore', 'pipe', 'ignore', rootDescriptor, gitDescriptor], maxBuffer });
  } finally { closeQuietly(rootDescriptor); closeQuietly(gitDescriptor); assertGitBindingCurrent(binding); }
}
export function trackedHeadFiles(root: string, observer?: GitOperationObserver, inheritedRootDescriptor?: number): readonly TrackedSnapshotFile[] {
  const binding = authenticatedGitBinding(root, inheritedRootDescriptor); let completed = 0;
  const run = (args: readonly string[], maxBuffer: number) => { const result = runAuthenticatedGit(binding, args, maxBuffer); completed += 1; observer?.(completed); return result; };
  try {
    const head = run(['rev-parse', '--verify', 'HEAD^{commit}'], 256);
    const commit = Buffer.from(head.stdout ?? []).toString('utf8').trim();
    if (head.status !== 0 || head.error || !/^[a-f0-9]{40,64}$/.test(commit)) return fixedError('snapshot unavailable');
    const tree = run(['ls-tree', '-rz', commit], 4 * 1024 * 1024);
    if (tree.status !== 0 || tree.error) return fixedError('snapshot unavailable');
    const records = Buffer.from(tree.stdout).toString('utf8').split('\0').filter(Boolean); const files: TrackedSnapshotFile[] = []; let total = 0;
    for (const record of records) {
      const match = record.match(/^([0-9]{6}) blob ([a-f0-9]{40,64})\t(.+)$/);
      if (!match) return fixedError('snapshot unsafe');
      const [, mode, object, file] = match; assertSnapshotPath(file);
      if (!requiredSnapshotPath(file)) continue;
      if (mode !== '100644' && mode !== '100755') fixedError('snapshot unsafe');
      const blob = run(['cat-file', 'blob', object], SNAPSHOT_MAX_FILE_BYTES + 1);
      if (blob.status !== 0 || blob.error) fixedError('snapshot unavailable');
      const bytes = Buffer.from(blob.stdout); total += bytes.length;
      if (bytes.length > SNAPSHOT_MAX_FILE_BYTES || total > SNAPSHOT_MAX_BYTES || files.length >= SNAPSHOT_MAX_FILES) fixedError('snapshot unsafe');
      files.push({ path: file, bytes, executable: mode === '100755' });
    }
    assertGitBindingCurrent(binding);
    if (files.length === 0) fixedError('snapshot unavailable');
    return files;
  } finally { closeHierarchy(binding.hierarchy); }
}
type RetainedDependency = Readonly<{ path: string; descriptor: number; dev: number; ino: number; snapshotDescriptor: number; snapshotDev: number; snapshotIno: number; seal: string }>;
type SnapshotHandle = Readonly<{ root: string; dev: number; ino: number; dependency?: RetainedDependency }>;
const DEPENDENCY_MAX_FILES = 100_000; const DEPENDENCY_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const USER_IMMUTABLE_FLAG = 0x00000002;
function setDependencyImmutable(root: string, immutable: boolean): void {
  const apply = (target: string): void => {
    const stat = lstatSync(target);
    if (stat.isDirectory()) for (const entry of readdirSync(target, { withFileTypes: true })) apply(`${target}/${entry.name}`);
    const encoded = cString(target); const status = stat.isSymbolicLink() ? libc.symbols.lchflags(ptr(encoded), immutable ? USER_IMMUTABLE_FLAG : 0) : libc.symbols.chflags(ptr(encoded), immutable ? USER_IMMUTABLE_FLAG : 0);
    if (status !== 0) fixedError('dependency snapshot unavailable');
  };
  apply(root);
}
function dependencySeal(root: string): string {
  const hasher = new Bun.CryptoHasher('sha256'); let entries = 0;
  const visit = (target: string, relative: string): void => {
    const stat = lstatSync(target, { bigint: true }); entries += 1;
    if (entries > DEPENDENCY_MAX_FILES + 1) fixedError('dependency snapshot unavailable');
    const kind = stat.isDirectory() ? 'd' : stat.isFile() ? 'f' : stat.isSymbolicLink() ? 'l' : 'x';
    hasher.update(`${relative}\0${kind}\0${stat.dev}\0${stat.ino}\0${stat.mode}\0${stat.nlink}\0${stat.size}\0${stat.mtimeNs}\0${stat.ctimeNs}\0`);
    if (stat.isSymbolicLink()) { hasher.update(`${readLinkNoFollow(target)}\0`); return; }
    if (stat.isFile()) { hasher.update(new Bun.CryptoHasher('sha256').update(readFileSync(target)).digest('hex')); return; }
    if (stat.isDirectory()) for (const name of readdirSync(target).sort()) visit(`${target}/${name}`, relative === '.' ? name : `${relative}/${name}`);
  };
  try { visit(root, '.'); return hasher.digest('hex'); }
  catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError('dependency snapshot unavailable'); }
}
type DependencyRecord = Readonly<{ kind: 'd' | 'f' | 'l'; fingerprint: string; bytes?: Buffer; link?: string; mode: number }>;
type DependencyManifest = Readonly<{ records: ReadonlyMap<string, DependencyRecord>; seal: string }>;
function readDependencyBytes(descriptor: number, size: number): Buffer {
  if (!Number.isSafeInteger(size) || size < 0 || size > DEPENDENCY_MAX_BYTES) fixedError('snapshot unsafe');
  const bytes = Buffer.alloc(size); let offset = 0;
  while (offset < size) { const amount = readSync(descriptor, bytes, offset, size - offset, offset); if (amount <= 0) fixedError('snapshot unsafe'); offset += amount; }
  return bytes;
}
function dependencyFingerprint(relative: string, kind: DependencyRecord['kind'], stat: ReturnType<typeof fstatSync>, content: string): string {
  return `${relative}\0${kind}\0${stat.dev}\0${stat.ino}\0${stat.mode}\0${stat.nlink}\0${stat.size}\0${stat.mtimeMs}\0${stat.ctimeMs}\0${content}`;
}
function inspectDependencyEntry(parent: number, name: string, relative: string): Readonly<{ record: DependencyRecord; descriptor: number }> {
  const opened = nativeOpenAt(parent, name, constants.O_RDONLY | constants.O_NOFOLLOW);
  if (opened.descriptor < 0) {
    if (opened.errno !== osConstants.errno.ELOOP) fixedError('snapshot unsafe');
    const linkDescriptor = nativeOpenAt(parent, name, constants.O_RDONLY | O_SYMLINK); if (linkDescriptor.descriptor < 0) fixedError('snapshot unsafe');
    try {
      const link = nativeReadlinkAt(parent, name); const stat = fstatSync(linkDescriptor.descriptor);
      if (!stat.isSymbolicLink()) fixedError('snapshot unsafe');
      return { record: { kind: 'l', fingerprint: dependencyFingerprint(relative, 'l', stat, link), link, mode: stat.mode }, descriptor: -1 };
    } finally { closeQuietly(linkDescriptor.descriptor); }
  }
  try {
    const stat = fstatSync(opened.descriptor);
    if (stat.isDirectory()) return { record: { kind: 'd', fingerprint: dependencyFingerprint(relative, 'd', stat, ''), mode: stat.mode }, descriptor: opened.descriptor };
    if (!stat.isFile()) fixedError('snapshot unsafe');
    const bytes = readDependencyBytes(opened.descriptor, stat.size); const hash = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
    return { record: { kind: 'f', fingerprint: dependencyFingerprint(relative, 'f', stat, hash), bytes, mode: stat.mode }, descriptor: opened.descriptor };
  } catch (error) { closeQuietly(opened.descriptor); throw error; }
}
function scanDependency(descriptor: number): DependencyManifest {
  const records = new Map<string, DependencyRecord>(); let entries = 0; let bytes = 0;
  const visit = (directory: number, relative: string): void => {
    const directoryStat = fstatSync(directory); const directoryRecord = { kind: 'd' as const, fingerprint: dependencyFingerprint(relative || '.', 'd', directoryStat, ''), mode: directoryStat.mode };
    records.set(relative || '.', directoryRecord);
    for (const name of nativeDirectoryNames(directory)) {
      if (!name || name.includes('/') || name === '.' || name === '..') fixedError('snapshot unsafe');
      const childRelative = relative ? `${relative}/${name}` : name; assertSnapshotPath(childRelative); entries += 1;
      if (entries > DEPENDENCY_MAX_FILES) fixedError('snapshot unsafe');
      const inspected = inspectDependencyEntry(directory, name, childRelative); records.set(childRelative, inspected.record);
      try { if (inspected.record.kind === 'd') visit(inspected.descriptor, childRelative); else if (inspected.record.kind === 'f') { bytes += inspected.record.bytes!.length; if (bytes > DEPENDENCY_MAX_BYTES) fixedError('snapshot unsafe'); } }
      finally { if (inspected.descriptor >= 0) closeQuietly(inspected.descriptor); }
    }
  };
  visit(descriptor, ''); const hasher = new Bun.CryptoHasher('sha256');
  for (const [relative, record] of [...records].sort(([left], [right]) => left.localeCompare(right))) hasher.update(`${relative}\0${record.fingerprint}\0`);
  return { records, seal: hasher.digest('hex') };
}
function materializeDependency(descriptor: number, snapshotRoot: string, beforeCopy?: (relative: string) => void): Readonly<{ descriptor: number; dev: number; ino: number; seal: string }> {
  const destinationRoot = resolve(snapshotRoot, 'node_modules'); const baseline = scanDependency(descriptor); let files = 0; let bytes = 0; mkdirSync(destinationRoot, { mode: 0o700 });
  const copyDirectory = (sourceDescriptor: number, destination: string, relative: string): void => {
    for (const name of nativeDirectoryNames(sourceDescriptor)) {
      if (!name || name.includes('/') || name === '.' || name === '..') fixedError('snapshot unsafe');
      const childRelative = relative ? `${relative}/${name}` : name; assertSnapshotPath(childRelative); files += 1;
      if (files > DEPENDENCY_MAX_FILES) fixedError('snapshot unsafe'); beforeCopy?.(childRelative);
      const inspected = inspectDependencyEntry(sourceDescriptor, name, childRelative); const expected = baseline.records.get(childRelative);
      try {
        if (!expected || inspected.record.fingerprint !== expected.fingerprint || inspected.record.kind !== expected.kind) fixedError('snapshot unsafe');
        const childDestination = resolve(destination, name);
        if (inspected.record.kind === 'd') { mkdirSync(childDestination, { mode: 0o700 }); copyDirectory(inspected.descriptor, childDestination, childRelative); chmodSync(childDestination, 0o500); continue; }
        if (inspected.record.kind === 'l') {
          const target = inspected.record.link!; const resolvedTarget = posix.normalize(posix.join(posix.dirname(childRelative), target));
          if (!target || target.startsWith('/') || target.includes('\\') || target.includes('\0') || resolvedTarget === '..' || resolvedTarget.startsWith('../')) fixedError('snapshot unsafe');
          symlinkSync(target, childDestination); continue;
        }
        bytes += inspected.record.bytes!.length; if (bytes > DEPENDENCY_MAX_BYTES) fixedError('snapshot unsafe');
        writeFileSync(childDestination, inspected.record.bytes!, { flag: 'wx', mode: inspected.record.mode & 0o111 ? 0o500 : 0o400 });
      } finally { if (inspected.descriptor >= 0) closeQuietly(inspected.descriptor); }
    }
  };
  copyDirectory(descriptor, destinationRoot, '');
  if (scanDependency(descriptor).seal !== baseline.seal) fixedError('snapshot unsafe');
  const opened = openSync(destinationRoot, directoryFlags); const retained = duplicateDescriptor(opened); closeQuietly(opened); const stat = fstatSync(retained);
  if (!stat.isDirectory()) { closeQuietly(retained); return fixedError('snapshot unsafe'); }
  setDependencyImmutable(destinationRoot, true);
  return { descriptor: retained, dev: stat.dev, ino: stat.ino, seal: dependencySeal(destinationRoot) };
}
function authenticateDependencyDescriptor(rootDescriptor: number, dependencyDescriptor: number): Readonly<{ dev: number; ino: number }> {
  let probe = -1;
  try {
    const opened = nativeOpenAt(rootDescriptor, 'node_modules', directoryFlags); if (opened.descriptor < 0) fixedError('snapshot unsafe'); probe = opened.descriptor;
    const inherited = fstatSync(dependencyDescriptor); const current = fstatSync(probe);
    if (!inherited.isDirectory() || !current.isDirectory() || inherited.dev !== current.dev || inherited.ino !== current.ino) fixedError('snapshot unsafe');
    return { dev: inherited.dev, ino: inherited.ino };
  } catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError('snapshot unsafe');
  } finally { if (probe >= 0) closeQuietly(probe); }
}
function createEmptySnapshot(): Readonly<{ handle: SnapshotHandle; descriptor: number }> {
  let root = ''; let descriptor = -1;
  try {
    root = mkdtempSync(resolve(SNAPSHOT_PARENT, 'event-every-c1-a-snapshot-')); chmodSync(root, 0o700);
    const stat = lstatSync(root); const openedDescriptor = openSync(root, directoryFlags); descriptor = duplicateDescriptor(openedDescriptor); closeQuietly(openedDescriptor); const opened = fstatSync(descriptor);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || opened.dev !== stat.dev || opened.ino !== stat.ino) fixedError('snapshot unsafe');
    const handle = { root, dev: stat.dev, ino: stat.ino }; const retained = descriptor; descriptor = -1; return { handle, descriptor: retained };
  } catch (error) {
    if (descriptor >= 0) closeQuietly(descriptor); if (root) { try { rmSync(root, { recursive: true, force: true }); } catch { /* fixed error below */ } }
    if (error instanceof MutationRunnerError) throw error; return fixedError('snapshot unavailable');
  }
}
function createSnapshot(execution: MutationExecution): SnapshotHandle {
  let root = ''; let created = false; let dependencyDescriptor = -1; let snapshotDependencyDescriptor = -1;
  try {
    root = execution.snapshotRoot ?? mkdtempSync(resolve(SNAPSHOT_PARENT, 'event-every-c1-a-snapshot-')); created = true;
    chmodSync(root, 0o700); const rootStat = lstatSync(root); const initialEntries = readdirSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (process.getuid && rootStat.uid !== process.getuid()) || initialEntries.some((entry) => entry !== '.home')) fixedError('snapshot unsafe');
    if (initialEntries.includes('.home')) { const home = lstatSync(resolve(root, '.home')); if (!home.isDirectory() || home.isSymbolicLink() || (process.getuid && home.uid !== process.getuid())) fixedError('snapshot unsafe'); }
    if (execution.snapshotDescriptor !== undefined) {
      const inherited = fstatSync(execution.snapshotDescriptor);
      if (!inherited.isDirectory() || inherited.dev !== rootStat.dev || inherited.ino !== rootStat.ino) fixedError('snapshot unsafe');
    }
    const files = execution.trackedSnapshotFiles?.() ?? trackedHeadFiles(execution.root); const seen = new Set<string>(); let total = 0;
    for (const file of files) {
      assertSnapshotPath(file.path);
      if (!requiredSnapshotPath(file.path) || seen.has(file.path)) fixedError('snapshot unsafe');
      seen.add(file.path); total += file.bytes.byteLength;
      if (seen.size > SNAPSHOT_MAX_FILES || file.bytes.byteLength > SNAPSHOT_MAX_FILE_BYTES || total > SNAPSHOT_MAX_BYTES) fixedError('snapshot unsafe');
      const destination = resolve(root, file.path); mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, file.bytes, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 });
    }
    let dependency: SnapshotHandle['dependency'];
    if (execution.dependencyDescriptor !== undefined) {
      if (execution.rootDescriptor === undefined) fixedError('snapshot unsafe');
      const rootDescriptor = execution.rootDescriptor!; const inheritedDependency = execution.dependencyDescriptor;
      const identity = authenticateDependencyDescriptor(rootDescriptor, inheritedDependency);
      dependencyDescriptor = duplicateDescriptor(inheritedDependency); const retained = fstatSync(dependencyDescriptor);
      if (!retained.isDirectory() || retained.dev !== identity.dev || retained.ino !== identity.ino) fixedError('snapshot unsafe');
      const materialized = materializeDependency(dependencyDescriptor, root, execution.beforeDependencyEntryCopy); snapshotDependencyDescriptor = materialized.descriptor;
      dependency = { path: resolve(execution.root, 'node_modules'), descriptor: dependencyDescriptor, dev: retained.dev, ino: retained.ino, snapshotDescriptor: materialized.descriptor, snapshotDev: materialized.dev, snapshotIno: materialized.ino, seal: materialized.seal }; dependencyDescriptor = -1;
      snapshotDependencyDescriptor = -1;
    } else if (execution.dependencyRoot) {
      const dependencyPath = realpathSync(execution.dependencyRoot); const dependencyStat = lstatSync(dependencyPath);
      if (!dependencyStat.isDirectory() || dependencyStat.isSymbolicLink() || dependencyPath !== resolve(execution.dependencyRoot)) fixedError('snapshot unsafe');
      const openedDependency = openSync(dependencyPath, directoryFlags); dependencyDescriptor = duplicateDescriptor(openedDependency); closeQuietly(openedDependency); const retained = fstatSync(dependencyDescriptor);
      if (!retained.isDirectory() || retained.dev !== dependencyStat.dev || retained.ino !== dependencyStat.ino) fixedError('snapshot unsafe');
      const materialized = materializeDependency(dependencyDescriptor, root, execution.beforeDependencyEntryCopy); snapshotDependencyDescriptor = materialized.descriptor;
      dependency = { path: dependencyPath, descriptor: dependencyDescriptor, dev: retained.dev, ino: retained.ino, snapshotDescriptor: materialized.descriptor, snapshotDev: materialized.dev, snapshotIno: materialized.ino, seal: materialized.seal }; dependencyDescriptor = -1;
      snapshotDependencyDescriptor = -1;
    }
    mkdirSync(resolve(root, '.runtime'), { mode: 0o700 });
    return { root, dev: rootStat.dev, ino: rootStat.ino, dependency };
  } catch (error) {
    if (dependencyDescriptor >= 0) closeQuietly(dependencyDescriptor);
    if (snapshotDependencyDescriptor >= 0) closeQuietly(snapshotDependencyDescriptor);
    if (created && root) {
      try {
        chmodSync(root, 0o700);
        const materialized = resolve(root, 'node_modules');
        if (existsSync(materialized)) { setDependencyImmutable(materialized, false); makeTreeRemovable(materialized); }
        rmSync(root, { recursive: true, force: true });
      } catch { /* fixed error below */ }
    }
    if (error instanceof MutationRunnerError) throw error; return fixedError('snapshot unavailable');
  }
}
function assertDependencyRootCurrent(snapshot: SnapshotHandle): void {
  if (!snapshot.dependency) return;
  try {
    const retained = fstatSync(snapshot.dependency.descriptor);
    if (!retained.isDirectory() || retained.dev !== snapshot.dependency.dev || retained.ino !== snapshot.dependency.ino) fixedError('dependency descriptor unavailable');
    const retainedSnapshot = fstatSync(snapshot.dependency.snapshotDescriptor); const materialized = lstatSync(resolve(snapshot.root, 'node_modules'));
    if (!retainedSnapshot.isDirectory() || retainedSnapshot.dev !== snapshot.dependency.snapshotDev || retainedSnapshot.ino !== snapshot.dependency.snapshotIno || !materialized.isDirectory() || materialized.isSymbolicLink() || materialized.dev !== snapshot.dependency.snapshotDev || materialized.ino !== snapshot.dependency.snapshotIno) fixedError('dependency snapshot unavailable');
  } catch (error) { if (error instanceof MutationRunnerError) throw error; fixedError('dependency unavailable'); }
}
function assertDependencyCurrent(snapshot: SnapshotHandle): void {
  assertDependencyRootCurrent(snapshot);
  if (snapshot.dependency && dependencySeal(resolve(snapshot.root, 'node_modules')) !== snapshot.dependency.seal) fixedError('dependency snapshot unavailable');
}
function makeTreeRemovable(root: string): void {
  const stat = lstatSync(root); if (stat.isSymbolicLink()) return; if (!stat.isDirectory()) { chmodSync(root, 0o600); return; }
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) makeTreeRemovable(`${root}/${entry.name}`);
}
function cleanupSnapshot(snapshot: SnapshotHandle): void {
  let failure: unknown; let cleanupDescriptor = -1;
  try {
    try { cleanupDescriptor = openSync(snapshot.root, directoryFlags); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    if (libc.symbols.flock(cleanupDescriptor, 2) !== 0) fixedError('snapshot cleanup failed');
    try { lstatSync(snapshot.root); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    assertDependencyRootCurrent(snapshot);
    const current = lstatSync(snapshot.root); const opened = fstatSync(cleanupDescriptor);
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== snapshot.dev || current.ino !== snapshot.ino || opened.dev !== snapshot.dev || opened.ino !== snapshot.ino) fixedError('snapshot cleanup failed');
    chmodSync(snapshot.root, 0o700);
    const materialized = resolve(snapshot.root, 'node_modules');
    if (existsSync(materialized)) { setDependencyImmutable(materialized, false); makeTreeRemovable(materialized); }
    rmSync(snapshot.root, { recursive: true, force: true });
  } catch (error) { failure = error;
  } finally { if (cleanupDescriptor >= 0) closeQuietly(cleanupDescriptor); if (snapshot.dependency) { closeQuietly(snapshot.dependency.descriptor); closeQuietly(snapshot.dependency.snapshotDescriptor); } }
  if (failure instanceof MutationRunnerError) throw failure;
  if (failure) fixedError('snapshot cleanup failed');
}
function cleanupSnapshotIfPresent(snapshot: SnapshotHandle): void {
  try { lstatSync(snapshot.root); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; fixedError('snapshot cleanup failed'); }
  cleanupSnapshot(snapshot);
}
function cleanEnvironment(source: NodeJS.ProcessEnv, root: string, home = root): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: source.NODE_ENV, PATH: source.PATH, TMPDIR: source.TMPDIR ?? tmpdir(), LANG: source.LANG, LC_ALL: source.LC_ALL, TZ: source.TZ, HOME: home };
  for (const name of Object.keys(source)) if (CREDENTIAL_NAME.test(name)) env[name] = '';
  env.BUN_CONFIG_NO_LOAD_DOTENV = '1';
  env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'; env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  env.NODE_OPTIONS = `--require=${resolve(root, 'scripts/c1-a-offline-preload.cjs')}`;
  if (source.NODE_ENV === 'test' && /^\d{1,4}$/.test(source.C1_A_TEST_SUPERVISOR_BEFORE_START_DELAY_MS ?? '')) env.C1_A_TEST_SUPERVISOR_BEFORE_START_DELAY_MS = source.C1_A_TEST_SUPERVISOR_BEFORE_START_DELAY_MS;
  if (source.NODE_ENV === 'test' && /^\d{1,4}$/.test(source.C1_A_TEST_SUPERVISOR_BEFORE_RECORD_DELAY_MS ?? '')) env.C1_A_TEST_SUPERVISOR_BEFORE_RECORD_DELAY_MS = source.C1_A_TEST_SUPERVISOR_BEFORE_RECORD_DELAY_MS;
  env.PATH = TRUSTED_PATH;
  return env;
}
export const TERM_GRACE_MS = 250;
const GATED_COMMAND_LEADER = String.raw`
const fs=require('node:fs'),{dlopen,FFIType,ptr}=require('bun:ffi');
const a=process.argv.slice(1),command=a.shift(),args=a;
if(process.env.NODE_ENV==='test')process.stderr.write('LEADER:'+JSON.stringify({argv:process.argv,command,args,cwd:process.cwd()})+'\n');
const registration=Buffer.alloc(128);let registrationLength=0;
for(;;){const amount=fs.readSync(0,registration,registrationLength,registration.length-registrationLength,null);if(amount===0)process.exit(143);registrationLength+=amount;if(registration.subarray(0,registrationLength).includes(10))break;if(registrationLength===registration.length)process.exit(143)}
if(registration.subarray(0,registrationLength).toString('utf8')!==('REGISTER:'+process.pid+'\n'))process.exit(143);
process.kill(process.pid,'SIGSTOP');
const libc=dlopen('/usr/lib/libSystem.B.dylib',{execvp:{args:[FFIType.ptr,FFIType.ptr],returns:FFIType.i32}});
const zero=String.fromCharCode(0),values=[command,...args],strings=values.map(value=>Buffer.from(value+zero)),argv=Buffer.alloc((strings.length+1)*8);
strings.forEach((value,index)=>argv.writeBigUInt64LE(BigInt(ptr(value)),index*8));const executable=Buffer.from(command+zero);
libc.symbols.execvp(ptr(executable),ptr(argv));process.exit(126);
`;
const SUPERVISOR = String.raw`
const {spawn}=require('node:child_process');
const {dlopen,FFIType,ptr}=require('bun:ffi');
const procLibrary=dlopen('/usr/lib/libproc.dylib',{proc_listallpids:{args:[FFIType.ptr,FFIType.i32],returns:FFIType.i32},proc_pidinfo:{args:[FFIType.i32,FFIType.i32,FFIType.u64,FFIType.ptr,FFIType.i32],returns:FFIType.i32}}).symbols;
const getpgid=dlopen('/usr/lib/libSystem.B.dylib',{getpgid:{args:[FFIType.i32],returns:FFIType.i32}}).symbols.getpgid,procBuffer=Buffer.alloc(136),pidBuffer=Buffer.alloc(4*32768);
const fs=require('node:fs');
const a=process.argv.slice(1),timeout=Number(a.shift()),grace=Number(a.shift()),authority=Number(a.shift()),runner=Number(a.shift()),topology=Number(a.shift()),resultRoot=a.shift(),command=a.shift(),args=a;
let stdout=[],stderr=[],captured=0,reason='',leaderClosed=false,code=null,signal=null,finished=false,registered=false,graceTimer,extinctionTimer,registrationTimer,topologyTimer;
const alive=pid=>{if(!pid)return true;try{process.kill(pid,0)}catch{return false}const size=procLibrary.proc_pidinfo(pid,3,0,ptr(procBuffer),procBuffer.length);return size>0&&procBuffer.readUInt32LE(4)!==5};
const stopped=pid=>{const size=procLibrary.proc_pidinfo(pid,3,0,ptr(procBuffer),procBuffer.length);return size>0&&procBuffer.readUInt32LE(4)===4};
const groupAlive=pid=>{try{process.kill(-pid,0);return true}catch{return false}};
const stopGroup=(pid,sig)=>{try{process.kill(-pid,sig)}catch{}};
const add=(sink,value)=>{if(captured>=65536)return;const bytes=Buffer.from(value),part=bytes.subarray(0,65536-captured);sink.push(part);captured+=part.length};
if(process.env.NODE_ENV==='test')add(stderr,'SUPERVISOR:'+JSON.stringify({argv:process.argv,timeout,grace,authority,runner,topology,command,args,cwd:process.cwd()})+'\n');
const notify=value=>{if(!topology)return;try{fs.writeSync(1,value+'\n')}catch{beginStop('authority')}};
const child=spawn(process.execPath,['-e',${JSON.stringify(GATED_COMMAND_LEADER)},command,...args],{detached:true,stdio:['pipe','pipe','pipe'],env:{...process.env,C1_A_TEST_SUPERVISOR_PID:process.env.NODE_ENV==='test'?String(process.pid):''}});
const knownGroups=new Set(child.pid?[child.pid]:[]);
const captureGroups=()=>{const count=procLibrary.proc_listallpids(ptr(pidBuffer),pidBuffer.length);if(count<=0||count>32768)return;const parents=new Map();for(let index=0;index<count;index+=1){const pid=pidBuffer.readInt32LE(index*4);if(pid<=1)continue;const size=procLibrary.proc_pidinfo(pid,3,0,ptr(procBuffer),procBuffer.length);if(size>20)parents.set(pid,procBuffer.readUInt32LE(16))}const descendants=new Set(parents.has(child.pid)?[child.pid]:[]);let changed=true;while(changed){changed=false;for(const [pid,parent] of parents)if(descendants.has(parent)&&!descendants.has(pid)){descendants.add(pid);changed=true}}for(const pid of descendants){const group=getpgid(pid);if(group===child.pid||group===pid)knownGroups.add(group)}};
const groupsAlive=()=>{captureGroups();for(const group of knownGroups)if(groupAlive(group))return true;return false};
const stopGroups=sig=>{captureGroups();for(const group of knownGroups)stopGroup(group,sig)};
child.stdout.on('data',value=>add(stdout,value));child.stderr.on('data',value=>add(stderr,value));
const emit=extinct=>{if(finished)return;finished=true;clearTimeout(timeoutTimer);clearInterval(authorityTimer);clearTimeout(graceTimer);clearInterval(extinctionTimer);clearInterval(registrationTimer);clearInterval(topologyTimer);notify('DONE:'+child.pid+':'+(extinct?'1':'0'));fs.writeSync(2,'RESULT:'+JSON.stringify({code,signal,timedOut:reason==='timeout',authorityLost:reason==='authority',groupExtinct:extinct,stdout:Buffer.concat(stdout).toString('base64'),stderr:Buffer.concat(stderr).toString('base64')}));try{fs.fsyncSync(2);fs.closeSync(2);fs.rmSync(resultRoot,{recursive:true,force:true})}catch{}};
const awaitExtinction=()=>{const deadline=Date.now()+1000;extinctionTimer=setInterval(()=>{if(!groupsAlive()&&leaderClosed){clearInterval(extinctionTimer);emit(true)}else if(Date.now()>=deadline){stopGroups('SIGKILL');clearInterval(extinctionTimer);emit(!groupsAlive()&&leaderClosed)}},10)};
const beginStop=why=>{if(reason)return;reason=why;captureGroups();stopGroups('SIGTERM');graceTimer=setTimeout(()=>{stopGroups('SIGKILL');awaitExtinction()},grace)};
const register=()=>{if(reason||registered||!stopped(child.pid))return;registered=true;notify('START:'+child.pid);if(!topology)try{process.kill(-child.pid,'SIGCONT')}catch{beginStop('child')}};
process.on('SIGINT',()=>beginStop('authority'));process.on('SIGTERM',()=>beginStop('authority'));
if(!child.pid)beginStop('child');else{const recordDelay=process.env.NODE_ENV==='test'?Number(process.env.C1_A_TEST_SUPERVISOR_BEFORE_RECORD_DELAY_MS??'0'):0;if(Number.isInteger(recordDelay)&&recordDelay>0&&recordDelay<=5000)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,recordDelay);fs.writeSync(2,'PGID:'+child.pid+'\n');child.stdin.end('REGISTER:'+child.pid+'\n');const delay=process.env.NODE_ENV==='test'?Number(process.env.C1_A_TEST_SUPERVISOR_BEFORE_START_DELAY_MS??'0'):0;let readyAt=0;if(Number.isInteger(delay)&&delay>0&&delay<=5000)readyAt=Date.now()+delay;registrationTimer=setInterval(()=>{if(Date.now()>=readyAt)register()},5)}
const timeoutTimer=setTimeout(()=>beginStop('timeout'),timeout);
const authorityTimer=setInterval(()=>{if(!alive(authority)||!alive(runner))beginStop('authority')},10);
topologyTimer=setInterval(captureGroups,2);
child.on('error',()=>beginStop('child'));
child.on('close',(childCode,childSignal)=>{captureGroups();leaderClosed=true;code=childCode;signal=childSignal;if(reason)return;if(groupsAlive())beginStop('child');else emit(true)});
`;
function pause(milliseconds: number): void { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function groupAlive(pid: number): boolean { try { process.kill(-pid, 0); return true; } catch { return false; } }
function runningProcess(pid: number): boolean {
  try { process.kill(pid, 0); } catch { return false; }
  const info = Buffer.alloc(136); const size = processLibrary.symbols.proc_pidinfo(pid, 3, 0, ptr(info), info.length);
  return size > 0 && info.readUInt32LE(4) !== 5;
}
function descendantProcessGroups(rootPid: number, includeRoot = true): Set<number> {
  const pidBytes = Buffer.alloc(4 * 32_768); const count = processLibrary.symbols.proc_listallpids(ptr(pidBytes), pidBytes.length);
  if (count <= 0 || count > 32_768) return fixedError('child cleanup failed');
  const parents = new Map<number, number>(); const info = Buffer.alloc(136);
  for (let index = 0; index < count; index += 1) {
    const pid = pidBytes.readInt32LE(index * 4); if (pid <= 1) continue;
    const size = processLibrary.symbols.proc_pidinfo(pid, 3, 0, ptr(info), info.length);
    if (size > 20) parents.set(pid, info.readUInt32LE(16));
  }
  const descendants = new Set<number>(); if (includeRoot) descendants.add(rootPid);
  for (const [pid, parent] of parents) if (parent === rootPid) descendants.add(pid);
  let changed = true;
  while (changed) { changed = false; for (const [pid, parent] of parents) if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true; } }
  const groups = new Set<number>(); const rootGroup = libc.symbols.getpgid(rootPid);
  for (const pid of descendants) { const group = libc.symbols.getpgid(pid); if (group > 1 && (includeRoot || group !== rootGroup)) groups.add(group); }
  return groups;
}
function captureDescendantProcessGroups(rootPid: number, destination: Set<number>, includeRoot = true): void {
  try { for (const group of descendantProcessGroups(rootPid, includeRoot)) destination.add(group); } catch { /* cleanup still drains every group already authenticated by the control stream */ }
}
export function runBoundedChild(argv: readonly string[], options: Parameters<MutationExecution['run']>[1]): SpawnResult {
  const topology = options.topologyFd === undefined ? 0 : 1;
  let resultRoot = ''; let resultPath = ''; let resultDescriptor = -1; let supervisor: ChildProcess | undefined; let spawnFailed = false; const observedGroups = new Set<number>();
  try {
    let resultParent = SNAPSHOT_PARENT;
    try {
      const candidate = realpathSync(options.cwd); const stat = lstatSync(candidate);
      if (dirname(candidate) === SNAPSHOT_PARENT && basename(candidate).startsWith('event-every-c1-a-snapshot-') && stat.isDirectory() && !stat.isSymbolicLink() && (!process.getuid || stat.uid === process.getuid()) && (stat.mode & 0o077) === 0) {
        const runtime = resolve(candidate, '.runtime'); const runtimeStat = lstatSync(runtime);
        if (runtimeStat.isDirectory() && !runtimeStat.isSymbolicLink() && (!process.getuid || runtimeStat.uid === process.getuid()) && (runtimeStat.mode & 0o077) === 0) resultParent = runtime;
      }
    } catch { /* non-snapshot commands use the fixed private parent */ }
    resultRoot = mkdtempSync(resolve(resultParent, '.c1-a-supervisor-')); chmodSync(resultRoot, 0o700); resultPath = resolve(resultRoot, randomUUID());
    resultDescriptor = openSync(resultPath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    supervisor = spawn(process.execPath, ['-e', SUPERVISOR, String(options.timeoutMs), String(TERM_GRACE_MS), String(options.authorityPid ?? 0), String(options.runnerPid ?? 0), String(topology), resultRoot, ...argv], { cwd: options.cwd, env: options.env, shell: false, stdio: ['ignore', options.topologyFd ?? 'ignore', resultDescriptor] });
    supervisor.once('error', () => { spawnFailed = true; });
    const deadline = Date.now() + options.timeoutMs + TERM_GRACE_MS + 2_000; let raw = ''; let parsed: { code: number | null; signal: string | null; timedOut: boolean; authorityLost: boolean; groupExtinct: boolean; stdout: string; stderr: string } | undefined;
    while (Date.now() < deadline) {
      raw = readDescriptor(resultDescriptor); const marker = raw.indexOf('RESULT:');
      if (marker >= 0) { try { parsed = JSON.parse(raw.slice(marker + 7)); } catch { /* writer has not completed the record */ } }
      if (supervisor.pid) captureDescendantProcessGroups(supervisor.pid, observedGroups, false);
      if (parsed || spawnFailed || (supervisor.pid && !runningProcess(supervisor.pid))) break;
      pause(5);
    }
    if (!parsed) {
      raw = readDescriptor(resultDescriptor); const marker = raw.indexOf('RESULT:');
      if (marker >= 0) { try { parsed = JSON.parse(raw.slice(marker + 7)); } catch { /* incomplete records remain non-accepting */ } }
    }
    if (parsed) return { exitCode: parsed.code, signal: parsed.signal, timedOut: parsed.timedOut, authorityLost: parsed.authorityLost, groupExtinct: parsed.groupExtinct, stdout: Buffer.from(parsed.stdout, 'base64'), stderr: Buffer.from(parsed.stderr, 'base64') };
    const group = Number(raw.match(/^PGID:(\d+)$/m)?.[1] ?? 0); if (group > 0) observedGroups.add(group);
    if (observedGroups.size > 0) {
      for (const observed of observedGroups) { try { process.kill(-observed, 'SIGTERM'); } catch { /* already extinct */ } }
      pause(TERM_GRACE_MS);
      const deadline = Date.now() + 1_000;
      while ([...observedGroups].some(groupAlive) && Date.now() < deadline) { for (const observed of observedGroups) { try { process.kill(-observed, 'SIGKILL'); } catch { /* already extinct */ } } pause(10); }
    }
    if (supervisor.pid && runningProcess(supervisor.pid)) { try { supervisor.kill('SIGKILL'); } catch { /* already gone */ } }
    return { exitCode: null, timedOut: !spawnFailed, groupExtinct: [...observedGroups].every((observed) => !groupAlive(observed)), stdout: Buffer.alloc(0), stderr: Buffer.from(raw) };
  } catch { return fixedError('child failed');
  } finally { if (resultDescriptor >= 0) closeQuietly(resultDescriptor); if (resultRoot) { try { rmSync(resultRoot, { recursive: true, force: true }); } catch { /* private snapshot cleanup remains authoritative */ } } }
}
function defaultRun(argv: readonly string[], options: Parameters<MutationExecution['run']>[1]): SpawnResult { return runBoundedChild(argv, options); }
export function defaultDirtyTarget(root: string, target: string, observer?: GitOperationObserver, inheritedRootDescriptor?: number): boolean {
  let binding: GitBinding | undefined; let handle: TargetHandle | undefined; let completed = 0;
  try {
    binding = authenticatedGitBinding(root, inheritedRootDescriptor);
    const cached = runAuthenticatedGit(binding, ['diff', '--cached', '--quiet', '--', target], 256); completed += 1; observer?.(completed);
    if (cached.status !== 0 || cached.error) return true;
    const indexed = runAuthenticatedGit(binding, ['show', `:${target}`], SNAPSHOT_MAX_FILE_BYTES + 1); completed += 1; observer?.(completed);
    if (indexed.status !== 0 || indexed.error || Buffer.byteLength(indexed.stdout) > SNAPSHOT_MAX_FILE_BYTES) return true;
    handle = openTarget(root, target); if (!Buffer.from(indexed.stdout).equals(Buffer.from(readTarget(handle)))) return true;
    assertGitBindingCurrent(binding);
    return false;
  } catch {
    return true;
  } finally { if (handle) closeTarget(handle); if (binding) closeHierarchy(binding.hierarchy); }
}
function defaultExecution(root = resolve(import.meta.dir, '..'), inheritedRootDescriptor?: number): MutationExecution {
  return { root, ledgerPath: resolve(root, 'docs/testing/c1-a-mutation-ledger.md'), now: Date.now, pid: process.pid, isProcessAlive: () => true, run: defaultRun, hasDirtyTarget: (target) => defaultDirtyTarget(root, target, undefined, inheritedRootDescriptor), trackedSnapshotFiles: () => trackedHeadFiles(root, undefined, inheritedRootDescriptor), dependencyRoot: resolve(root, 'node_modules') };
}
export type LockfOutcome = 'completed' | 'contended' | 'unavailable' | 'startup-failed';
export function classifyLockfTermination(status: number | null, errorCode: string | undefined, internalStarted: boolean): LockfOutcome {
  if (errorCode === 'ENOENT') return 'unavailable';
  if (!internalStarted && status === 75) return 'contended';
  return internalStarted ? 'completed' : 'startup-failed';
}
export function runLockfProbe(root: string, executable = '/usr/bin/lockf'): LockfOutcome {
  let descriptor = -1;
  try {
    descriptor = openSync(root, directoryFlags); const result = spawnSync(executable, ['-s', '-t', '0', '/dev/fd/3', '/usr/bin/true'], { cwd: root, shell: false, stdio: ['ignore', 'ignore', 'ignore', descriptor] });
    if (result.status === 0) return 'completed';
    return classifyLockfTermination(result.status, (result.error as NodeJS.ErrnoException | undefined)?.code, false);
  } catch (error) { return classifyLockfTermination(null, (error as NodeJS.ErrnoException | undefined)?.code, false);
  } finally { if (descriptor >= 0) closeQuietly(descriptor); }
}
function runCommand(execution: MutationExecution, argv: readonly string[], interrupted: () => boolean, snapshot: SnapshotHandle, productionCurrent: () => void, timeoutMs = CHILD_TIMEOUT_MS): SpawnResult {
  productionCurrent();
  assertDependencyCurrent(snapshot);
  if (interrupted()) fixedError('interrupted');
  if (execution.lockAuthorityPid && !processAlive(execution.lockAuthorityPid)) fixedError('lock authority lost');
  const preload = resolve(snapshot.root, 'scripts/c1-a-offline-preload.cjs');
  const guarded = argv[0] === 'bun' ? [process.execPath, `--preload=${preload}`, ...argv.slice(1)] : argv;
  let result: SpawnResult | undefined; let childTopology = -1;
  try {
    if (execution.topologyFd !== undefined) childTopology = duplicateDescriptor(execution.topologyFd);
    result = execution.run(guarded, { cwd: snapshot.root, env: cleanEnvironment(process.env, snapshot.root), shell: false, timeoutMs, authorityPid: execution.lockAuthorityPid, runnerPid: execution.lockAuthorityPid ? process.pid : undefined, topologyFd: childTopology >= 0 ? childTopology : undefined });
  } catch { fixedError('child failed');
  } finally { if (childTopology >= 0) closeQuietly(childTopology); productionCurrent(); assertDependencyCurrent(snapshot); }
  if (!result) return fixedError('child failed');
  if (result.authorityLost) fixedError('lock authority lost');
  if (result.groupExtinct === false) fixedError('child cleanup failed');
  if (result.timedOut) fixedError('child timeout');
  if (interrupted() || result.signal) fixedError('interrupted');
  return result;
}
function decoded(result: SpawnResult): string { return new TextDecoder().decode(result.stdout).slice(0, 65_536) + new TextDecoder().decode(result.stderr).slice(0, 65_536); }
function processAlive(pid: number): boolean { return runningProcess(pid); }
function namedRedObserved(result: SpawnResult, assertion: string): boolean {
  const output = decoded(result).replaceAll(/\u001b\[[0-9;]*m/g, '');
  if (output.trim() === assertion) return true;
  return output.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed.includes(assertion)) return false;
    return trimmed.startsWith('(fail) ') || trimmed.startsWith('FAIL ') || trimmed.startsWith('× ') || trimmed.startsWith('✗ ');
  });
}
type TargetHandle = Readonly<{ hierarchy: AnchoredHierarchy; name: string; descriptor: number; dev: number; ino: number }>;
function openTarget(root: string, target: string, inherited?: number, afterParentOpened?: () => void): TargetHandle {
  assertTarget(target); const segments = target.split('/'); const name = segments.pop()!;
  const hierarchy = openHierarchy(root, segments, inherited, 'target unsafe'); let descriptor = -1; let transferred = false;
  try {
    afterParentOpened?.(); assertHierarchyCurrent(hierarchy, 'concurrent edit');
    const parent = hierarchy.descendants.at(-1)?.descriptor ?? hierarchy.rootIdentity.descriptor;
    const openedAt = nativeOpenAt(parent, name, constants.O_RDWR | constants.O_NOFOLLOW);
    if (openedAt.descriptor < 0) fixedError(openedAt.errno === osConstants.errno.ELOOP ? 'target unsafe' : 'target unavailable');
    descriptor = openedAt.descriptor; const opened = fstatSync(descriptor); if (!opened.isFile()) fixedError('target unavailable');
    if (opened.nlink !== 1) fixedError('target unsafe');
    const handle = { hierarchy, name, descriptor, dev: opened.dev, ino: opened.ino }; descriptor = -1; transferred = true; return handle;
  } catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError('target unavailable');
  } finally { if (descriptor >= 0) closeQuietly(descriptor); if (!transferred) closeHierarchy(hierarchy); }
}
function assertCurrentTarget(handle: TargetHandle): void {
  let probe = -1;
  try {
    assertHierarchyCurrent(handle.hierarchy, 'concurrent edit'); const parent = handle.hierarchy.descendants.at(-1)?.descriptor ?? handle.hierarchy.rootIdentity.descriptor;
    const opened = nativeOpenAt(parent, handle.name, constants.O_RDONLY | constants.O_NOFOLLOW); if (opened.descriptor < 0) fixedError('concurrent edit');
    probe = opened.descriptor; const retained = fstatSync(handle.descriptor); const current = fstatSync(probe);
    if (retained.nlink !== 1 || current.nlink !== 1) fixedError('target unsafe');
    if (!retained.isFile() || retained.dev !== handle.dev || retained.ino !== handle.ino || !current.isFile() || current.dev !== handle.dev || current.ino !== handle.ino) fixedError('concurrent edit');
  } catch (error) { if (error instanceof MutationRunnerError) throw error; fixedError('concurrent edit');
  } finally { if (probe >= 0) closeQuietly(probe); }
}
function readTarget(handle: TargetHandle): string { try { const size = fstatSync(handle.descriptor).size; const bytes = Buffer.alloc(size); readSync(handle.descriptor, bytes, 0, size, 0); return bytes.toString('utf8'); } catch { return fixedError('target unavailable'); } }
function writeTargetBytes(handle: TargetHandle, source: string): void { try { const bytes = Buffer.from(source); ftruncateSync(handle.descriptor, 0); let offset = 0; while (offset < bytes.length) offset += writeSync(handle.descriptor, bytes, offset, bytes.length - offset, offset); fsyncSync(handle.descriptor); } catch { fixedError('target write failed'); } }
function writeTarget(handle: TargetHandle, source: string): void { assertCurrentTarget(handle); writeTargetBytes(handle, source); }
function closeTarget(handle: TargetHandle): void { let failed = false; try { closeSync(handle.descriptor); } catch { failed = true; } closeHierarchy(handle.hierarchy); if (failed) fixedError('target cleanup failed'); }
function authenticateProduction(handle: TargetHandle, baseline: string, baselineHash: string): void {
  assertCurrentTarget(handle); const current = readTarget(handle);
  if (current !== baseline || digest(current) !== baselineHash) fixedError('concurrent edit');
}
type ProofInvocation = Readonly<{ nonce: symbol }>;
const proofProvenance = new WeakMap<MutationProof, Readonly<{ invocation: ProofInvocation; restoredSha256: string }>>();
function runOne(row: MutationRow, execution: MutationExecution, snapshot: SnapshotHandle, interrupted: () => boolean, invocation: ProofInvocation): MutationProof {
  const production = openTarget(execution.root, row.target, execution.rootDescriptor, () => execution.afterTargetParentOpened?.(row.target)); let isolated: TargetHandle | undefined;
  let original = ''; let originalHash = ''; let accepted = false; let mutationApplied = false;
  const productionCurrent = () => authenticateProduction(production, original, originalHash);
  try {
    if (execution.hasDirtyTarget(row.target)) fixedError('dirty target');
    original = readTarget(production); originalHash = digest(original);
    isolated = openTarget(snapshot.root, row.target);
    const snapshotBaseline = readTarget(isolated);
    if (snapshotBaseline !== original || digest(snapshotBaseline) !== originalHash) fixedError('target baseline mismatch');
    productionCurrent();
    try {
      if (count(original, row.oldText) !== 1) fixedError('anchor');
      const expectedMutatedNewCount = count(original, row.newText) - count(row.oldText, row.newText) + 1;
      const mutated = original.replace(row.oldText, row.newText); writeTarget(isolated, mutated); mutationApplied = true; productionCurrent();
      if (count(readTarget(isolated), row.newText) !== expectedMutatedNewCount) fixedError('anchor');
      if (runCommand(execution, COMPILE_COMMAND, interrupted, snapshot, productionCurrent, COMPILE_TIMEOUT_MS).exitCode !== 0) fixedError('compile failed');
      assertCurrentTarget(isolated);
      const red = runCommand(execution, MUTATION_COMMANDS[row.command], interrupted, snapshot, productionCurrent);
      assertCurrentTarget(isolated);
      if (readTarget(isolated) !== mutated) fixedError('concurrent edit');
      if (red.exitCode === 0) fixedError('expected RED');
      if (!namedRedObserved(red, row.redAssertion)) fixedError('red assertion not observed');
      accepted = true;
    } finally { if (mutationApplied) writeTargetBytes(isolated, original); }
    if (!accepted) return fixedError('operation failed');
    assertCurrentTarget(isolated); const restored = readTarget(isolated);
    if (restored !== original || digest(restored) !== originalHash) fixedError('restore hash mismatch');
    productionCurrent();
    if (runCommand(execution, MUTATION_COMMANDS[row.command], interrupted, snapshot, productionCurrent).exitCode !== 0) fixedError('restored GREEN failed');
    assertCurrentTarget(isolated); const afterGreen = readTarget(isolated);
    if (afterGreen !== original || digest(afterGreen) !== originalHash) fixedError('concurrent edit');
    productionCurrent();
    if (interrupted()) fixedError('interrupted');
    const proof = Object.freeze({ ...row, restoredSha256: originalHash }); proofProvenance.set(proof, { invocation, restoredSha256: originalHash }); return proof;
  } finally {
    try { if (original) productionCurrent();
    } finally { try { if (isolated) closeTarget(isolated); } finally { closeTarget(production); } }
  }
}
function escaped(value: string): string { return value.replaceAll('|', '\\|').replaceAll('\n', '\\n'); }
export function renderMutationLedger(proofs: readonly MutationProof[]): string {
  for (const proof of proofs) assertTarget(proof.target);
  const lines = ['# C1-A mutation ledger', '', 'Generated by the closed C1-A mutation runner. This ledger contains no fixture, provider, or credential values.', '', '| ID | Owner | Production target | Exact mutator | Focused command | Observed RED assertion | Inverse | Restored SHA-256 | Restored GREEN |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const proof of proofs) lines.push(`| ${proof.id} | Task ${proof.ownerTask} | ${proof.target} | \`${escaped(proof.oldText)} → ${escaped(proof.newText)}\` | ${proof.command} | ${escaped(proof.redAssertion)} | \`${escaped(proof.newText)} → ${escaped(proof.oldText)}\` | ${proof.restoredSha256} | ${proof.command} exit 0 |`);
  return `${lines.join('\n')}\n`;
}
type LedgerHandle = Readonly<{ hierarchy: AnchoredHierarchy; directory: number; name: 'c1-a-mutation-ledger.md' }>;
function openLedger(execution: MutationExecution): LedgerHandle {
  if (resolve(execution.ledgerPath) !== resolve(execution.root, 'docs/testing/c1-a-mutation-ledger.md')) fixedError('ledger unsafe');
  const hierarchy = openHierarchy(execution.root, ['docs', 'testing'], execution.rootDescriptor, 'ledger unsafe');
  return { hierarchy, directory: hierarchy.descendants.at(-1)!.descriptor, name: 'c1-a-mutation-ledger.md' };
}
function openLedgerFile(handle: LedgerHandle, missingReason: 'ledger missing' | 'ledger already exists'): number {
  assertHierarchyCurrent(handle.hierarchy, 'ledger unsafe'); const opened = nativeOpenAt(handle.directory, handle.name, constants.O_RDONLY | constants.O_NOFOLLOW);
  if (opened.descriptor < 0) {
    if (opened.errno === osConstants.errno.ENOENT) fixedError(missingReason);
    fixedError('ledger unsafe');
  }
  try { if (!fstatSync(opened.descriptor).isFile()) fixedError('ledger unsafe'); return opened.descriptor; } catch (error) { closeQuietly(opened.descriptor); throw error; }
}
function atomicWrite(handle: LedgerHandle, value: string, beforePublish: (() => void) | undefined, assertAuthority: () => void): void {
  const temporary = `.c1-a-mutation-ledger.tmp-${process.pid}-${randomUUID()}`; let descriptor = -1; let temporaryExists = false;
  try {
    const created = nativeOpenAt(handle.directory, temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    if (created.descriptor < 0) fixedError('ledger write failed'); descriptor = created.descriptor; temporaryExists = true;
    fchmodSync(descriptor, 0o600);
    const bytes = Buffer.from(value); let offset = 0; while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset, offset);
    fsyncSync(descriptor); closeSync(descriptor); descriptor = -1;
    assertAuthority(); beforePublish?.(); assertAuthority(); assertHierarchyCurrent(handle.hierarchy, 'ledger unsafe');
    const existing = nativeOpenAt(handle.directory, handle.name, constants.O_RDONLY | constants.O_NOFOLLOW);
    if (existing.descriptor >= 0) { closeQuietly(existing.descriptor); fixedError('ledger already exists'); }
    if (existing.errno !== osConstants.errno.ENOENT) fixedError('ledger unsafe');
    assertAuthority(); const linkError = nativeLinkAt(handle.directory, temporary, handle.name);
    if (linkError !== 0) fixedError(linkError === osConstants.errno.EEXIST ? 'ledger already exists' : 'ledger write failed');
    if (nativeUnlinkAt(handle.directory, temporary) !== 0) fixedError('ledger write failed'); temporaryExists = false;
    fsyncSync(handle.directory); assertHierarchyCurrent(handle.hierarchy, 'ledger unsafe');
    const published = openLedgerFile(handle, 'ledger missing'); try { if (readDescriptor(published) !== value) fixedError('ledger write failed'); } finally { closeQuietly(published); }
  } catch (error) { if (error instanceof MutationRunnerError) throw error; fixedError('ledger write failed');
  } finally { if (descriptor >= 0) closeQuietly(descriptor); if (temporaryExists) nativeUnlinkAt(handle.directory, temporary); }
}
function assertInvocationProofs(proofs: readonly MutationProof[], invocation: ProofInvocation): void {
  assertRegistry();
  if (proofs.length !== C1_A_MUTATIONS.length) fixedError('proof provenance');
  for (const [index, proof] of proofs.entries()) {
    const row = C1_A_MUTATIONS[index]; const provenance = proofProvenance.get(proof);
    if (!Object.isFrozen(proof) || provenance?.invocation !== invocation || provenance.restoredSha256 !== proof.restoredSha256 || !/^[a-f0-9]{64}$/.test(proof.restoredSha256)) fixedError('proof provenance');
    for (const field of ['id', 'ownerTask', 'target', 'oldText', 'newText', 'command', 'redAssertion'] as const) if (proof[field] !== row[field]) fixedError('proof provenance');
  }
}
function publishMutationLedger(proofs: readonly MutationProof[], execution: LifecycleExecution, invocation: ProofInvocation, assertAuthority: () => void): void {
  assertInvocationProofs(proofs, invocation);
  assertAuthority(); const handle = openLedger(execution);
  try { atomicWrite(handle, renderMutationLedger(proofs), execution.beforeLedgerPublish, assertAuthority); } finally { closeHierarchy(handle.hierarchy); }
}
function readDescriptor(descriptor: number): string { const size = fstatSync(descriptor).size; const bytes = Buffer.alloc(size); readSync(descriptor, bytes, 0, size, 0); return bytes.toString('utf8'); }
function verifyFocusedLedger(handle: LedgerHandle, proofs: readonly MutationProof[]): void {
  const descriptor = openLedgerFile(handle, 'ledger missing'); let ledger = '';
  try { ledger = readDescriptor(descriptor); assertHierarchyCurrent(handle.hierarchy, 'ledger unsafe'); } finally { closeQuietly(descriptor); }
  const proofById = new Map<string, MutationProof>();
  for (const row of C1_A_MUTATIONS) {
    const prefix = `| ${row.id} | Task ${row.ownerTask} | ${row.target} | \`${escaped(row.oldText)} → ${escaped(row.newText)}\` | ${row.command} | ${escaped(row.redAssertion)} | \`${escaped(row.newText)} → ${escaped(row.oldText)}\` | `;
    const match = ledger.split('\n').find((line) => line.startsWith(prefix));
    if (!match) return fixedError('ledger mismatch');
    const hash = match.slice(prefix.length).match(new RegExp(`^([a-f0-9]{64}) \\| ${row.command} exit 0 \\|$`))?.[1];
    if (!hash) return fixedError('ledger mismatch'); proofById.set(row.id, { ...row, restoredSha256: hash });
  }
  const canonical = renderMutationLedger(C1_A_MUTATIONS.map((row) => proofById.get(row.id)!));
  if (ledger !== canonical) fixedError('ledger mismatch');
  for (const proof of proofs) if (proofById.get(proof.id)?.restoredSha256 !== proof.restoredSha256) fixedError('ledger mismatch');
}
function defaultSubscribeAbort(handler: () => void): () => void {
  const onInterrupt = () => handler(); process.once('SIGINT', onInterrupt); process.once('SIGTERM', onInterrupt);
  return () => { process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onInterrupt); };
}
const PRIVATE_WRITE_AUTHORITY = Symbol('private lifecycle write authority');
function assertExactWriteSet(parsed: ParsedMutationArguments): void {
  if (parsed.mode === 'write' && (parsed.ids.length !== C1_A_MUTATIONS.length || parsed.ids.some((id, index) => id !== C1_A_MUTATIONS[index].id))) fixedError('write requires exact registry');
}
function executeMutations(parsed: ParsedMutationArguments, execution: LifecycleExecution, writeAuthority?: symbol, transformProofsBeforePublication?: (proofs: readonly MutationProof[]) => readonly MutationProof[]): readonly MutationProof[] {
  let unsubscribe: (() => void) | undefined; let ledgerHandle: LedgerHandle | undefined; let snapshot: SnapshotHandle | undefined;
  try {
    assertRegistry();
    assertExactWriteSet(parsed);
    if (parsed.mode === 'write' && writeAuthority !== PRIVATE_WRITE_AUTHORITY) fixedError('write requires private lifecycle');
    const rows = parsed.ids.map((id) => C1_A_MUTATIONS.find((row) => row.id === id)!).filter(Boolean);
    if (rows.length !== parsed.ids.length) fixedError('expected registered ID');
    if (execution.lockAuthorityPid && !processAlive(execution.lockAuthorityPid)) fixedError('lock authority lost');
    let interrupted = false; unsubscribe = (execution.subscribeAbort ?? defaultSubscribeAbort)(() => { interrupted = true; });
    const assertAuthority = () => { if (interrupted) fixedError('interrupted'); if (execution.lockAuthorityPid && !processAlive(execution.lockAuthorityPid)) fixedError('lock authority lost'); };
    snapshot = createSnapshot(execution);
    const invocation: ProofInvocation = Object.freeze({ nonce: Symbol('mutation invocation') });
    const proofs = rows.map((row) => runOne(row, execution, snapshot!, () => interrupted, invocation));
    const completedSnapshot = snapshot; snapshot = undefined; cleanupSnapshot(completedSnapshot);
    if (parsed.mode === 'write') publishMutationLedger(transformProofsBeforePublication?.(proofs) ?? proofs, execution, invocation, assertAuthority);
    else {
      ledgerHandle = openLedger(execution);
      try { verifyFocusedLedger(ledgerHandle, proofs); }
      catch (error) { if (!(execution.allowMissingLedger && error instanceof MutationRunnerError && error.message === 'c1-a mutations: ledger missing')) throw error; }
    }
    return proofs;
  } catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError('operation failed');
  } finally { try { unsubscribe?.(); } finally { try { if (ledgerHandle) closeHierarchy(ledgerHandle.hierarchy); } finally { if (snapshot) cleanupSnapshot(snapshot); } } }
}
export function runMutations(parsed: ParsedMutationArguments, execution?: MutationExecution): readonly MutationProof[] {
  assertExactWriteSet(parsed);
  if (parsed.mode === 'write') fixedError('write requires private lifecycle');
  return executeMutations(parsed, execution ?? defaultExecution());
}

export type TestFixtureWriteCapability = object;
export type TestFixturePublicationHooks = Readonly<{
  beforeLedgerPublish?: () => void;
  transformProofsBeforePublication?: (proofs: readonly MutationProof[]) => readonly MutationProof[];
}>;
type TestFixtureCapabilityBinding = Readonly<{
  callerExecution: MutationExecution;
  execution: MutationExecution;
  root: string;
  dev: number;
  ino: number;
  ledgerPath: string;
  nonce: Buffer;
  tag: Buffer;
  hooks: TestFixturePublicationHooks;
}>;
const TEST_FIXTURE_CAPABILITY_SECRET = randomBytes(32);
const testFixtureCapabilityBindings = new WeakMap<TestFixtureWriteCapability, TestFixtureCapabilityBinding>();
function bindPlainDataObject<T extends object>(value: T): Readonly<T> {
  if (Object.getPrototypeOf(value) !== Object.prototype) fixedError('test fixture authority denied');
  const descriptors = Object.getOwnPropertyDescriptors(value); const bound: Record<string, unknown> = {};
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor) || descriptor.get || descriptor.set) fixedError('test fixture authority denied');
    bound[name] = descriptor.value;
  }
  return Object.freeze(bound) as Readonly<T>;
}
function testFixtureCapabilityTag(root: string, dev: number, ino: number, ledgerPath: string, nonce: Buffer): Buffer {
  return createHmac('sha256', TEST_FIXTURE_CAPABILITY_SECRET).update(`${root}\0${dev}\0${ino}\0${ledgerPath}\0`).update(nonce).digest();
}
function authenticateTestFixtureRoot(execution: MutationExecution): Readonly<{ root: string; dev: number; ino: number; ledgerPath: string }> {
  try {
    const root = realpathSync(execution.root); const parent = realpathSync(dirname(root));
    const allowedParents = new Set([realpathSync(tmpdir()), realpathSync(SNAPSHOT_PARENT)]);
    const stat = lstatSync(root); const ledgerPath = resolve(realpathSync(dirname(execution.ledgerPath)), basename(execution.ledgerPath));
    if (!allowedParents.has(parent) || !basename(root).startsWith('event-every-c1-a-complete-') || !stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || (stat.mode & 0o077) !== 0 || ledgerPath !== resolve(root, 'docs/testing/c1-a-mutation-ledger.md')) fixedError('test fixture authority denied');
    return { root, dev: stat.dev, ino: stat.ino, ledgerPath };
  } catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError('test fixture authority denied'); }
}
export function createTestFixtureWriteCapability(execution: MutationExecution, hooks: TestFixturePublicationHooks = {}): TestFixtureWriteCapability {
  const boundExecution = bindPlainDataObject(execution) as MutationExecution; const boundHooks = bindPlainDataObject(hooks) as TestFixturePublicationHooks;
  const identity = authenticateTestFixtureRoot(boundExecution); const nonce = randomBytes(32); const capability = Object.freeze({});
  testFixtureCapabilityBindings.set(capability, { callerExecution: execution, execution: boundExecution, ...identity, nonce, tag: testFixtureCapabilityTag(identity.root, identity.dev, identity.ino, identity.ledgerPath, nonce), hooks: boundHooks });
  return capability;
}
export function runTestFixtureMutations(parsed: ParsedMutationArguments, execution: MutationExecution, capability: TestFixtureWriteCapability): readonly MutationProof[] {
  assertExactWriteSet(parsed);
  if (parsed.mode !== 'write') fixedError('test fixture authority denied');
  const binding = testFixtureCapabilityBindings.get(capability);
  if (!binding || binding.callerExecution !== execution) fixedError('test fixture authority denied');
  const authenticatedBinding = binding!;
  const identity = authenticateTestFixtureRoot(authenticatedBinding.execution);
  if (authenticatedBinding.root !== identity.root || authenticatedBinding.dev !== identity.dev || authenticatedBinding.ino !== identity.ino || authenticatedBinding.ledgerPath !== identity.ledgerPath || !timingSafeEqual(authenticatedBinding.tag, testFixtureCapabilityTag(identity.root, identity.dev, identity.ino, identity.ledgerPath, authenticatedBinding.nonce))) fixedError('test fixture authority denied');
  const rootIdentity = openRoot(identity.root, undefined, 'target unsafe');
  try {
    const fixtureExecution: LifecycleExecution = Object.freeze({ ...authenticatedBinding.execution, rootDescriptor: rootIdentity.descriptor, beforeLedgerPublish: authenticatedBinding.hooks.beforeLedgerPublish });
    return executeMutations(parsed, fixtureExecution, PRIVATE_WRITE_AUTHORITY, authenticatedBinding.hooks.transformProofsBeforePublication);
  } finally { closeQuietly(rootIdentity.descriptor); }
}

const INTERNAL_MODE = '--internal-lifecycle';
const CAPABILITY_FD = 3; const LOCK_FD = 4; const ACK_FD = 5; const SNAPSHOT_FD = 6; const ROOT_FD = 7; const DEPENDENCY_FD = 8; const CAPABILITY_BYTES = 32;
function readCapability(): Buffer {
  try {
    const stat = fstatSync(CAPABILITY_FD); if (!stat.isFIFO() && !stat.isSocket()) fixedError('internal denied');
    const chunks: Buffer[] = []; let total = 0; const buffer = Buffer.alloc(64);
    for (;;) { const amount = readSync(CAPABILITY_FD, buffer, 0, buffer.length, null); if (amount === 0) break; total += amount; if (total > CAPABILITY_BYTES) fixedError('internal denied'); chunks.push(Buffer.from(buffer.subarray(0, amount))); }
    const capability = Buffer.concat(chunks); if (capability.length !== CAPABILITY_BYTES) fixedError('internal denied'); return capability;
  } catch (error) { if (error instanceof MutationRunnerError) throw error; return fixedError('internal denied'); }
}
function writeAll(descriptor: number, bytes: Uint8Array): void { let offset = 0; while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset); }
function fixedMessage(error: unknown): string { return error instanceof MutationRunnerError ? error.message : 'c1-a mutations: operation failed'; }
async function runInternalCli(snapshotRoot: string, args: readonly string[]): Promise<number> {
  try {
    const capability = readCapability(); const root = resolve(import.meta.dir, '..'); const validation = openRoot(root, ROOT_FD, 'target unsafe'); closeQuietly(validation.descriptor);
    const snapshotValidation = openRoot(snapshotRoot, SNAPSHOT_FD, 'target unsafe'); closeQuietly(snapshotValidation.descriptor);
    authenticateDependencyDescriptor(ROOT_FD, DEPENDENCY_FD);
    if (!tryLifecycleLock(ROOT_FD)) return 75;
    writeAll(ACK_FD, capability);
    const execution: LifecycleExecution = { ...defaultExecution(root, ROOT_FD), rootDescriptor: ROOT_FD, dependencyDescriptor: DEPENDENCY_FD, lockAuthorityPid: process.ppid, snapshotRoot, snapshotDescriptor: SNAPSHOT_FD, topologyFd: ACK_FD };
    executeMutations(parseMutationArguments(args), execution, PRIVATE_WRITE_AUTHORITY); return 0;
  } catch (error) { process.stderr.write(`${fixedMessage(error)}\n`); return 1; }
}
function collect(stream: NodeJS.ReadableStream | null): Promise<Buffer> {
  return new Promise((resolvePromise) => { if (!stream) return resolvePromise(Buffer.alloc(0)); const chunks: Buffer[] = []; let size = 0;
    stream.on('data', (value: Uint8Array) => { if (size >= 65_536) return; const bytes = Buffer.from(value).subarray(0, 65_536 - size); chunks.push(bytes); size += bytes.length; });
    stream.on('end', () => resolvePromise(Buffer.concat(chunks)));
  });
}
function installPublicSignalOwnership(onInterrupt: () => void): () => void {
  const handler = () => onInterrupt(); process.once('SIGINT', handler); process.once('SIGTERM', handler);
  return () => { process.removeListener('SIGINT', handler); process.removeListener('SIGTERM', handler); };
}
function stopPublicGroup(child: ChildProcess): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
}
function signalCommandGroups(groups: ReadonlySet<number>, signal: NodeJS.Signals): void {
  for (const group of groups) { try { process.kill(-group, signal); } catch { /* already extinct */ } }
}
async function cleanupPublicTopology(child: ChildProcess, commandGroups: Set<number>): Promise<void> {
  if (child.pid) captureDescendantProcessGroups(child.pid, commandGroups);
  stopPublicGroup(child); signalCommandGroups(commandGroups, 'SIGTERM'); await Bun.sleep(TERM_GRACE_MS);
  if (child.pid) captureDescendantProcessGroups(child.pid, commandGroups);
  const deadline = Date.now() + 1_000;
  do {
    if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already extinct */ } }
    signalCommandGroups(commandGroups, 'SIGKILL');
    if ((!child.pid || !groupAlive(child.pid)) && [...commandGroups].every((group) => !groupAlive(group))) return;
    await Bun.sleep(10);
  } while (Date.now() < deadline);
  fixedError('child cleanup failed');
}
function observeLifecycleControl(stream: NodeJS.ReadableStream, capability: Buffer, groups: Set<number>, interrupted: () => boolean): Readonly<{ done: Promise<void>; invalid: () => boolean; started: () => boolean }> {
  let pending = ''; let handshake = Buffer.alloc(0); let handshakeComplete = false; let acknowledged = false; let malformed = false;
  const announced = new Set<number>();
  const acknowledgeGroup = async (group: number) => {
    const delay = process.env.NODE_ENV === 'test' ? Number(process.env.C1_A_TEST_PUBLIC_BEFORE_RELEASE_DELAY_MS ?? '0') : 0;
    if (Number.isInteger(delay) && delay > 0 && delay <= 5_000) await Bun.sleep(delay);
    if (interrupted()) { try { process.kill(-group, 'SIGTERM'); } catch { /* already extinct */ } return; }
    try { process.kill(-group, 'SIGCONT'); } catch { malformed = true; }
  };
  const consume = (final: boolean) => {
    const lines = pending.split('\n'); pending = final ? '' : lines.pop() ?? '';
    for (const line of lines) {
      if (!line) continue;
      const start = line.match(/^START:(\d+)$/); const done = line.match(/^DONE:(\d+):[01]$/);
      if (start) { const group = Number(start[1]); if (!Number.isSafeInteger(group) || group <= 1 || announced.has(group)) { malformed = true; continue; } announced.add(group); groups.add(group); void acknowledgeGroup(group); }
      else if (!done) malformed = true;
    }
    if (final && pending) malformed = true;
  };
  const done = new Promise<void>((resolvePromise) => {
    stream.on('data', (value: Uint8Array) => {
      let bytes = Buffer.from(value);
      if (!handshakeComplete) {
        handshake = Buffer.concat([handshake, bytes]); if (handshake.length < CAPABILITY_BYTES) return;
        acknowledged = handshake.subarray(0, CAPABILITY_BYTES).equals(capability); handshakeComplete = true; bytes = handshake.subarray(CAPABILITY_BYTES); handshake = Buffer.alloc(0);
      }
      if (pending.length + bytes.length > 8_192) { malformed = true; return; } pending += bytes.toString('utf8'); consume(false);
    });
    stream.on('end', () => { if (!handshakeComplete && handshake.length > 0) malformed = true; consume(true); resolvePromise(); }); stream.on('error', () => { malformed = true; resolvePromise(); });
  });
  return { done, invalid: () => malformed, started: () => acknowledged };
}
async function publicStartupCheckpoint(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') return;
  const delay = Number(process.env.C1_A_TEST_PUBLIC_STARTUP_DELAY_MS ?? '0');
  if (Number.isInteger(delay) && delay > 0 && delay <= 5_000) await Bun.sleep(delay);
}
async function runPublicCli(args: readonly string[]): Promise<number> {
  let rootDescriptor = -1; let dependencyDescriptor = -1; let snapshotDescriptor = -1; let snapshot: SnapshotHandle | undefined; let child: ChildProcess | undefined; let interrupted = false; let cleanup: Promise<void> | undefined;
  const commandGroups = new Set<number>();
  const interrupt = () => {
    interrupted = true;
    if (child?.pid) captureDescendantProcessGroups(child.pid, commandGroups);
    if (child && !cleanup) cleanup = cleanupPublicTopology(child, commandGroups);
  };
  const unsubscribe = installPublicSignalOwnership(interrupt);
  try {
    parseMutationArguments(args); const root = resolve(import.meta.dir, '..'); const openedRoot = openSync(root, directoryFlags); rootDescriptor = duplicateDescriptor(openedRoot); closeQuietly(openedRoot);
    const openedDependency = nativeOpenAt(rootDescriptor, 'node_modules', directoryFlags); if (openedDependency.descriptor < 0) fixedError('snapshot unsafe');
    try { dependencyDescriptor = duplicateDescriptor(openedDependency.descriptor); } finally { closeQuietly(openedDependency.descriptor); }
    authenticateDependencyDescriptor(rootDescriptor, dependencyDescriptor); const capability = randomBytes(CAPABILITY_BYTES);
    const ownedSnapshot = createEmptySnapshot(); snapshot = ownedSnapshot.handle; snapshotDescriptor = ownedSnapshot.descriptor;
    const snapshotHome = resolve(snapshot.root, '.home'); mkdirSync(snapshotHome, { mode: 0o700 });
    await publicStartupCheckpoint(); if (interrupted) fixedError('interrupted');
    child = spawn('/usr/bin/lockf', ['-s', '-t', '0', `/dev/fd/${LOCK_FD}`, process.execPath, import.meta.path, INTERNAL_MODE, snapshot.root, ...args], { cwd: root, env: cleanEnvironment(process.env, root, snapshotHome), shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', rootDescriptor, 'pipe', snapshotDescriptor, rootDescriptor, dependencyDescriptor] }); const lifecycle = child;
    const extraStdio = lifecycle.stdio as unknown as Array<NodeJS.ReadableStream | NodeJS.WritableStream | null>;
    const stdoutPromise = collect(lifecycle.stdout); const stderrPromise = collect(lifecycle.stderr);
    const control = observeLifecycleControl(extraStdio[5] as NodeJS.ReadableStream, capability, commandGroups, () => interrupted);
    (extraStdio[3] as NodeJS.WritableStream).end(capability);
    if (interrupted && !cleanup) cleanup = cleanupPublicTopology(lifecycle, commandGroups);
    const termination = await new Promise<{ status: number | null; errorCode?: string }>((resolvePromise) => {
      let errorCode: string | undefined; lifecycle.once('error', (error: NodeJS.ErrnoException) => { errorCode = error.code; });
      lifecycle.once('close', (status) => resolvePromise({ status, errorCode }));
    });
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]); await control.done; const started = control.started();
    if (interrupted) { await cleanup; fixedError('interrupted'); }
    if (control.invalid()) fixedError('child cleanup failed');
    const outcome = classifyLockfTermination(termination.status, termination.errorCode, started);
    if (outcome === 'completed') { if (stdout.length) process.stdout.write(stdout); if (stderr.length) process.stderr.write(stderr); return termination.status ?? 1; }
    const reason = outcome === 'contended' ? 'concurrent run' : outcome === 'unavailable' ? 'lockf unavailable' : 'lock startup failed';
    process.stderr.write(`c1-a mutations: ${reason}\n`); return 1;
  } catch (error) { process.stderr.write(`${fixedMessage(error)}\n`); return 1;
  } finally {
    try { unsubscribe(); } finally {
      if (rootDescriptor >= 0) closeQuietly(rootDescriptor); if (dependencyDescriptor >= 0) closeQuietly(dependencyDescriptor); if (snapshotDescriptor >= 0) closeQuietly(snapshotDescriptor);
      if (snapshot) { try { cleanupSnapshotIfPresent(snapshot); } catch (error) { process.stderr.write(`${fixedMessage(error)}\n`); return 1; } }
    }
  }
}
if (import.meta.main) process.exitCode = Bun.argv[2] === INTERNAL_MODE ? await runInternalCli(Bun.argv[3] ?? '', Bun.argv.slice(4)) : await runPublicCli(Bun.argv.slice(2));
