import { z } from 'zod';
import { inputStorage } from '@/services/inputStorage';
import { createProviderRequestId } from '@/services/requestId';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000, 5_000] as const;
const timestamp = z.number().int().safe().nonnegative().max(8_640_000_000_000_000);

const ProviderOperationRecordSchema = z.object({
  requestId: z.string().regex(UUID),
  route: z.enum(['/api/scan', '/api/summarize', '/api/resolve-timezone']),
  consumerKind: z.enum(['scan_text', 'scan_image', 'summarize', 'resolve_timezone']),
  consumerRef: z.string().regex(UUID),
  createdAtMs: timestamp,
  transportDeadlineMs: timestamp.nullable(),
  state: z.literal('pending'),
}).strict().superRefine((value, context) => {
  const expectedRoute = value.consumerKind === 'summarize'
    ? '/api/summarize'
    : value.consumerKind === 'resolve_timezone'
      ? '/api/resolve-timezone'
      : '/api/scan';
  if (value.route !== expectedRoute) context.addIssue({ code: 'custom', message: 'Consumer does not match route.' });
});

const PendingStatusSchema = z.object({
  status: z.literal('pending'),
  code: z.literal('provider_request_pending'),
  phase: z.enum(['prepared', 'reserved', 'budget_committed', 'provider_inflight']),
  transportDeadlineMs: timestamp.optional(),
}).strict();
const CompletedStatusSchema = z.object({ status: z.literal('completed'), replay: z.unknown() }).strict();
const ErrorStatusSchema = z.object({ code: z.string().max(64).optional() }).passthrough();

export type ProviderOperationRecord = z.infer<typeof ProviderOperationRecordSchema>;
export type ProviderOperationStart = Readonly<Pick<ProviderOperationRecord, 'route' | 'consumerKind' | 'consumerRef'>>;

type OperationStore = Readonly<{
  save(record: unknown): Promise<void>;
  list(): Promise<unknown[]>;
  delete(requestId: string): Promise<void>;
}>;

type ProviderOperationDependencies = Readonly<{
  requestId(): string;
  now(): number;
  wait(delayMs: number, signal?: AbortSignal): Promise<void>;
  fetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  store: OperationStore;
}>;

const defaultStore: OperationStore = {
  save: (record) => inputStorage.saveProviderOperationRecord(record),
  list: () => inputStorage.getAllProviderOperationRecords(),
  delete: (requestId) => inputStorage.deleteProviderOperationRecord(requestId),
};

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, delayMs);
    function done(): void {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      reject(abortReason(signal!));
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

const defaults: ProviderOperationDependencies = {
  requestId: createProviderRequestId,
  now: Date.now,
  wait,
  fetcher: (input, init) => fetch(input, init),
  store: defaultStore,
};
let injected: Partial<ProviderOperationDependencies> | undefined;
let beginInFlight = false;

function dependencies(): ProviderOperationDependencies {
  return { ...defaults, ...injected };
}

export function setProviderOperationDependenciesForTests(
  value: Partial<ProviderOperationDependencies> | undefined,
): void {
  injected = value;
}

export function parseProviderOperation(record: unknown): ProviderOperationRecord {
  const parsed = ProviderOperationRecordSchema.safeParse(record);
  if (!parsed.success) throw new Error('Invalid provider operation record.');
  return parsed.data;
}

export async function listProviderOperations(): Promise<ProviderOperationRecord[]> {
  return (await dependencies().store.list()).map(parseProviderOperation);
}

export async function beginProviderOperation(input: ProviderOperationStart): Promise<ProviderOperationRecord> {
  if (beginInFlight) throw new Error('A provider operation is already pending.');
  beginInFlight = true;
  try {
    if ((await listProviderOperations()).length > 0) {
      throw new Error('A provider operation is already pending.');
    }
    const deps = dependencies();
    const record = parseProviderOperation({
      ...input,
      requestId: deps.requestId(),
      createdAtMs: deps.now(),
      transportDeadlineMs: null,
      state: 'pending',
    });
    await deps.store.save(record);
    return record;
  } finally {
    beginInFlight = false;
  }
}

export function acknowledgeProviderOperation(requestId: string): Promise<void> {
  return dependencies().store.delete(requestId);
}

export function cancelProviderOperation(requestId: string): Promise<void> {
  return dependencies().store.delete(requestId);
}

export class ProviderOperationTerminalError extends Error {
  readonly name = 'ProviderOperationTerminalError';

  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return undefined; }
}

export async function resumeProviderOperation<T = unknown>(
  initial: ProviderOperationRecord,
  project: (replay: unknown) => T = (replay) => replay as T,
  signal?: AbortSignal,
): Promise<T> {
  let record = parseProviderOperation(initial);
  let backoffIndex = 0;
  let observedAfterDeadline = false;
  const deps = dependencies();

  await deps.wait(BACKOFF_MS[0], signal);
  backoffIndex = 1;

  for (;;) {
    if (signal?.aborted) throw abortReason(signal);
    let response: Response | undefined;
    let body: unknown;
    let observedPending = false;
    try {
      response = await deps.fetcher('/api/provider-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: record.requestId }),
        signal,
      });
      body = await readJson(response);
    } catch (_error) {
      if (signal?.aborted) throw abortReason(signal);
    }

    if (response?.ok) {
      const completed = CompletedStatusSchema.safeParse(body);
      if (!completed.success) {
        await deps.store.delete(record.requestId);
        throw new ProviderOperationTerminalError(502, 'provider_invalid_response', 'Invalid provider status response.');
      }
      try {
        return project(completed.data.replay);
      } catch {
        await deps.store.delete(record.requestId);
        throw new ProviderOperationTerminalError(502, 'provider_invalid_response', 'Invalid provider replay.');
      }
    }

    const pending = response?.status === 409 ? PendingStatusSchema.safeParse(body) : undefined;
    if (pending?.success) {
      observedPending = true;
      const authorityDeadline = pending.data.transportDeadlineMs;
      if (authorityDeadline !== undefined && authorityDeadline !== record.transportDeadlineMs) {
        record = parseProviderOperation({ ...record, transportDeadlineMs: authorityDeadline });
        await deps.store.save(record);
      }
    } else if (response) {
      const error = ErrorStatusSchema.safeParse(body);
      await deps.store.delete(record.requestId);
      throw new ProviderOperationTerminalError(
        response.status,
        error.success ? error.data.code ?? null : null,
        'Provider operation failed.',
      );
    }

    const now = deps.now();
    let delay: number = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
    backoffIndex += 1;
    if (record.transportDeadlineMs !== null) {
      if (now >= record.transportDeadlineMs) {
        if (observedPending && !observedAfterDeadline) {
          observedAfterDeadline = true;
          delay = 0;
        }
      } else {
        delay = Math.min(delay, record.transportDeadlineMs - now);
      }
    }
    await deps.wait(delay, signal);
  }
}

export async function recoverProviderOperations(
  deliver: (record: ProviderOperationRecord, replay: unknown) => Promise<void> | void,
  signal?: AbortSignal,
): Promise<void> {
  const records = await listProviderOperations();
  for (const record of records) {
    try {
      const replay = await resumeProviderOperation(record, (value) => value, signal);
      if (signal?.aborted) throw abortReason(signal);
      await deliver(record, replay);
      if (signal?.aborted) throw abortReason(signal);
      await acknowledgeProviderOperation(record.requestId);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!(error instanceof ProviderOperationTerminalError)) throw error;
    }
  }
}
