'use client';

import { useState } from 'react';

/**
 * The three things somebody needs to connect a client, each copyable.
 *
 * ONE RULE, INHERITED FROM ~/Documents/mcp-connector AND WORTH REPEATING. The
 * value field's height must never change to make room for a scrollbar, and the
 * way to guarantee that is to have no scrollbar: `overflow-hidden` plus
 * `text-overflow: ellipsis`. These are copy targets, not prose - the button
 * hands over the whole string, so nobody ever needs to scroll one.
 *
 * That package measured two earlier attempts failing. Styling
 * `::-webkit-scrollbar` swaps WebKit's overlay bar for a classic one that
 * reserves space inside the box, Safari only. `scrollbar-width: thin` measures
 * clean in headless browsers because they default to overlay scrollbars, and
 * draws a permanent bar on a system set to always show them - which headless
 * measurement cannot see.
 */

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // A browser that refuses the clipboard still shows the value, which is
      // selectable. Failing silently beats an error about a convenience.
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-black">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="text-xs font-semibold underline underline-offset-2 text-black hover:no-underline"
          data-testid={`mcp-copy-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div
        className="mt-1 border-2 border-black bg-white px-3 py-2 font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis"
        title={value}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500 leading-snug">{hint}</p>}
    </div>
  );
}

export default function McpConnect({
  endpoint,
  command,
  instruction,
}: {
  endpoint: string;
  command: string;
  instruction: string;
}) {
  return (
    <div className="mt-8 border-2 border-black bg-white p-5 offset-shadow" data-testid="mcp-connect">
      <Row
        label="Endpoint"
        value={endpoint}
        hint="Streamable HTTP. Paste this into a client that asks for a server URL."
      />
      <Row label="Claude Code" value={command} hint="Run it in a terminal." />
      <Row
        label="Any other agent"
        value={instruction}
        hint="Paste this if the client takes an instruction rather than a URL."
      />
      <p className="mt-4 text-xs text-gray-500 leading-snug">
        You will be sent here to sign in the first time a client connects. Nothing is shared
        until you do.
      </p>
    </div>
  );
}
