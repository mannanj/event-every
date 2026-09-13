'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { resetSyncCursor, syncNow, type SyncSummary } from '@/services/sync';

export interface AccountState {
  /** Undefined until the first check returns. Three states, not two: showing
   *  "Sign in" to someone who is already signed in, even for one frame, is
   *  worse than showing nothing at all. */
  signedIn: boolean | undefined;
  /** False when this deployment has no accounts configured at all. */
  available: boolean;
  email: string | null;
  syncing: boolean;
  lastSync: SyncSummary | null;
  signOut: () => Promise<void>;
  sync: () => Promise<void>;
}

const AccountContext = createContext<AccountState | null>(null);

/**
 * Session state, fetched once for the whole app.
 *
 * A context rather than a hook each component calls, because the header and the
 * paused screen both need to know who you are — and a hook per consumer would
 * mean two `/api/auth/check` requests and, worse, two full syncs racing each
 * other on sign-in.
 */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [available, setAvailable] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      setLastSync(await syncNow());
    } catch {
      // A sync failure is not something the person can act on, and their events
      // are still in this browser either way.
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch('/api/auth/check', { credentials: 'same-origin' });
        const body = (await response.json()) as {
          authenticated?: boolean;
          accounts?: boolean;
          email?: string;
        };
        if (!live) return;
        setAvailable(body.accounts !== false);
        setSignedIn(Boolean(body.authenticated));
        setEmail(body.email ?? null);
        if (body.authenticated) await sync();
      } catch {
        if (live) setSignedIn(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [sync]);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      // The cursor goes with the session. Leaving it behind means the next
      // person to sign in on this browser starts mid-history and never pulls
      // the events they already had.
      resetSyncCursor();
      setSignedIn(false);
      setEmail(null);
      setLastSync(null);
    }
  }, []);

  const value = useMemo(
    () => ({ signedIn, available, email, syncing, lastSync, signOut, sync }),
    [signedIn, available, email, syncing, lastSync, signOut, sync],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/**
 * Outside the provider this reports "still checking" rather than throwing, so a
 * component can be rendered in isolation — a test, a status page — without
 * having to stand the whole app up around it.
 */
export function useAccount(): AccountState {
  return (
    useContext(AccountContext) ?? {
      signedIn: undefined,
      available: true,
      email: null,
      syncing: false,
      lastSync: null,
      signOut: async () => {},
      sync: async () => {},
    }
  );
}
