'use client';

import { useState } from 'react';

import { useAccount } from '@/components/AccountProvider';

/**
 * The button that makes the page's promise true.
 *
 * Asks once and means it twice, like the attachment deletion: this ends every
 * connection on the account and any assistant using one stops working
 * immediately. That is the right outcome when somebody wants it and a bad
 * surprise when they mis-clicked.
 *
 * Shown only to a signed-in visitor, because there is nothing to disconnect
 * otherwise and an inert button is worse than no button.
 */
export default function McpDisconnect() {
  const account = useAccount();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (account.signedIn !== true) return null;

  async function disconnect() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/mcp/disconnect', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => null)) as
        | { revoked?: number; error?: string }
        | null;
      if (!response.ok) {
        setResult(body?.error ?? 'That did not go through. Try again.');
      } else {
        const count = body?.revoked ?? 0;
        setResult(
          count === 0
            ? 'There was nothing connected.'
            : `Disconnected ${count === 1 ? 'one assistant' : `${count} assistants`}.`,
        );
      }
    } catch {
      setResult('We could not reach the server. Try again.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="stack stack--element" data-testid="mcp-disconnect">
      <h2 className="title">Disconnect</h2>
      <p className="lede">
        Ends every assistant connection on this account. Any assistant using one stops
        working straight away.
      </p>
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void disconnect()}
          className="guide__action"
          data-testid="mcp-disconnect-button"
        >
          {busy
            ? 'Disconnecting...'
            : confirming
              ? 'Disconnect them. This cannot be undone.'
              : 'Disconnect everything'}
        </button>
      </div>
      {result && (
        <p className="lede" data-testid="mcp-disconnect-result">
          {result}
        </p>
      )}
    </div>
  );
}
