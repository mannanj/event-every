import { backfillHistory } from '@/services/attachmentBackup';

/**
 * The one backup run this tab can have, outside React.
 *
 * Every page renders its own header, so a run held in component state was
 * orphaned by the first navigation - and the next header, seeing the resume
 * marker, would start a second run over the same files. Here there is one run
 * per tab, and headers only watch it.
 *
 * THE MARKER is what makes an interrupted run resumable without making every
 * page load an upload. It is set when a run starts and cleared only when one
 * finishes or is stopped on purpose, so its presence at load means "a run was
 * cut off", not "backup is on". Deleting the account's copies therefore does
 * not re-upload them on the next visit.
 */
export interface BackfillState {
  /** 0-100 while running, otherwise null. */
  progress: number | null;
  /** Files the last finished run could not send. */
  failed: number;
}

const MARKER = 'event-every:backup-backfill-pending';

let state: BackfillState = { progress: null, failed: 0 };
let running = false;
let stopped = false;
const listeners = new Set<() => void>();

function set(next: BackfillState) {
  state = next;
  for (const listener of listeners) listener();
}

function mark(on: boolean) {
  try {
    if (on) localStorage.setItem(MARKER, '1');
    else localStorage.removeItem(MARKER);
  } catch {
    // Without storage the run still works; it just cannot resume.
  }
}

export function backfillWasInterrupted(): boolean {
  try {
    return localStorage.getItem(MARKER) === '1';
  } catch {
    return false;
  }
}

export function subscribeBackfill(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBackfillState(): BackfillState {
  return state;
}

/** Resolves when the run ends. A second call while one runs joins nothing and returns. */
export async function startBackfill(alreadyBackedUp: ReadonlySet<string>): Promise<void> {
  if (running) return;
  running = true;
  stopped = false;
  mark(true);
  set({ progress: 0, failed: 0 });
  const result = await backfillHistory(
    alreadyBackedUp,
    ({ doneBytes, totalBytes }) =>
      set({
        ...state,
        progress: totalBytes === 0 ? 100 : Math.floor((doneBytes / totalBytes) * 100),
      }),
    () => stopped,
  ).catch(() => null);
  running = false;
  // A throw leaves the marker, so the next load tries again.
  if (result !== null || stopped) mark(false);
  set({
    progress: null,
    failed: result && !stopped ? result.attempted - result.stored : 0,
  });
}

export function stopBackfill(): void {
  stopped = true;
  mark(false);
}
