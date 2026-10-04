'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { announceLinkedAppsChanged } from '@/lib/linked-apps-broadcast';
import { LINKED_APPS, isLinkedAppId } from '@/lib/linked-apps';

const REASONS: Record<string, string> = {
  denied: 'You cancelled on the other side.',
  expired: 'That took too long. Try again.',
  state: 'That sign-in did not start here. Try again from Event Every.',
  owner: 'That sign-in was started by a different account.',
  exchange: 'The other app would not finish the sign-in. Try again.',
};

/**
 * The sign-in window's last stop. Success or not, the window that opened it
 * hears about it, and a window we opened closes itself. Opened directly (a
 * blocked pop-up fell back to a full-page trip), it offers the way back.
 */
export default function LinkedAppDone() {
  const params = useSearchParams();
  const linked = params.get('linked');
  const error = params.get('linked_error');
  const name = linked && isLinkedAppId(linked) ? LINKED_APPS[linked].name : 'the other app';

  useEffect(() => {
    announceLinkedAppsChanged();
    if (linked && window.opener) {
      const t = setTimeout(() => window.close(), 600);
      return () => clearTimeout(t);
    }
  }, [linked]);

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-3" data-testid="linked-app-done">
      {linked ? (
        <p className="font-medium">Signed in to {name}.</p>
      ) : (
        <>
          <p className="font-medium">Not signed in.</p>
          <p className="text-black/60">{REASONS[error ?? ''] ?? 'Something went wrong. Try again.'}</p>
        </>
      )}
      <p className="text-black/50">
        You can close this window, or{' '}
        <Link href="/" className="underline">
          go to Event Every
        </Link>
        .
      </p>
    </div>
  );
}
