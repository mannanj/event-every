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
    <div className="mt-6 border-2 border-black bg-white p-4" data-testid="mcp-disconnect">
      <p className="text-sm text-black">
        <strong>Disconnect everything.</strong> Ends every assistant connection on this
        account. Any assistant using one stops working straight away.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void disconnect()}
        className="mt-3 w-full border-2 border-black bg-white px-4 py-2 font-semibold text-black transition-colors hover:bg-black hover:text-white disabled:opacity-50"
        data-testid="mcp-disconnect-button"
      >
        {busy
          ? 'Disconnecting...'
          : confirming
            ? 'Disconnect them. This cannot be undone.'
            : 'Disconnect'}
      </button>
      {result && (
        <p className="mt-3 text-sm text-black" data-testid="mcp-disconnect-result">
          {result}
        </p>
      )}
    </div>
  );
}
