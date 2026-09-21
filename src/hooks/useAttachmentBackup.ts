'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  readBackupStatus,
  removeAllBackups,
  setBackupEnabled,
  type BackupStatus,
} from '@/services/attachmentBackup';

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
  toggle: () => Promise<void>;
  removeAll: () => Promise<void>;
}

export function useAttachmentBackup(signedIn: boolean | undefined): AttachmentBackup {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (signedIn !== true) {
      setStatus(null);
      return;
    }
    let active = true;
    void readBackupStatus().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, [signedIn]);

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
    toggle,
    removeAll,
  };
}
