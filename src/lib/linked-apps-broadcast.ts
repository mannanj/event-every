'use client';

import { useEffect } from 'react';

/**
 * Cross-window "sign-ins to sister apps changed". The sign-in finishes in its
 * own small window; this is how the window that opened it (and any other open
 * Event Every) learns to redraw the panel.
 */
const CHANNEL = 'event-every-linked-apps';

export function announceLinkedAppsChanged(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel(CHANNEL);
  ch.postMessage('changed');
  ch.close();
}

export function useLinkedAppsChangedElsewhere(onChange: () => void): void {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => onChange();
    return () => ch.close();
  }, [onChange]);
}
