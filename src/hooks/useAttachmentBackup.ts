'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import {
  readBackupStatus,
  removeAllBackups,
  setBackupEnabled,
  type BackupStatus,
} from '@/services/attachmentBackup';
import {
  backfillWasInterrupted,
  getBackfillState,
  startBackfill,
  stopBackfill,
  subscribeBackfill,
} from '@/services/backfillRun';

const IDLE = { progress: null, failed: 0 };

/**
 * The two account-menu lines, and the state behind them.
 *
 * Asked for once, when somebody signs in. A deployment with no bucket answers
 * null and `available` stays false, so the menu shows nothing rather than a
 * switch that cannot do anything.
 *
 * The switch is OPTIMISTIC and then corrected: a tick that waits for a round
 * trip reads as broken. If the server disagrees, its answer wins.
 */
export interface AttachmentBackup {
  available: boolean;
  enabled: boolean;
  count: number;
  bytes: number;
  busy: boolean;
  /** True once removal has been asked for and is waiting to be meant. */
  confirming: boolean;
  /** 0-100 while this browser's history is being sent up, otherwise null. */
  progress: number | null;
  /** Files the last run could not send, such as one over the size limit. */
  failed: number;
  toggle: () => Promise<void>;
  removeAll: () => Promise<void>;
}

export function useAttachmentBackup(signedIn: boolean | undefined): AttachmentBackup {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { progress, failed } = useSyncExternalStore(
    subscribeBackfill,
    getBackfillState,
    () => IDLE,
  );

  useEffect(() => {
    if (signedIn !== true) {
      setStatus(null);
      return;
    }
    let active = true;
    void readBackupStatus().then(async (next) => {
      if (!active) return;
      setStatus(next);
      // Picks up a run the last visit cut off, from where the account's own
      // list says it got to.
      if (next?.enabled && backfillWasInterrupted()) {
        await startBackfill(new Set(next.attachments.map((file) => file.id)));
        const after = await readBackupStatus();
        if (active) setStatus(after);
      }
    });
    return () => {
      active = false;
    };
  }, [signedIn]);

  // The browser's own "leave site?" prompt, only while something is uploading.
  useEffect(() => {
    if (progress === null) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [progress]);

  const toggle = useCallback(async () => {
    if (!status || busy) return;
    const wanted = !status.enabled;
    setBusy(true);
    setStatus({ ...status, enabled: wanted });
    const answer = await setBackupEnabled(wanted);
    // The server's answer, not the optimistic one. A refused change has to be
    // visible, or the menu quietly lies about what the account does.
    setStatus((current) =>
      current ? { ...current, enabled: answer ?? !wanted } : current,
    );
    setBusy(false);

    if (answer !== true) {
      stopBackfill();
      return;
    }
    await startBackfill(new Set(status.attachments.map((file) => file.id)));
    setStatus(await readBackupStatus());
  }, [status, busy]);

  const removeAll = useCallback(async () => {
    if (!status || busy) return;
    // Asked once, meant twice. This destroys the only copy on any device but
    // this one, and a menu item that does that on a single click - next to the
    // switch somebody came here to flip - is a trap.
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    const removed = await removeAllBackups();
    if (removed !== null) {
      // Re-read rather than subtracting: the count is the server's to state,
      // and another device may have changed it since this menu opened.
      setStatus(await readBackupStatus());
    }
    setBusy(false);
  }, [status, busy, confirming]);

  return {
    available: status !== null,
    enabled: status?.enabled === true,
    count: status?.attachments.length ?? 0,
    bytes: status?.bytes ?? 0,
    busy,
    confirming,
    progress,
    failed,
    toggle,
    removeAll,
  };
}
