'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The page an assistant's upload link opens.
 *
 * Deliberately the plainest screen in the app. Somebody arrives here holding a
 * phone, from a chat, with one thing to do. There is no header, no navigation
 * and no sign-in: the token in the URL already names the account, and asking
 * them to sign in on a phone would defeat the entire point of the handoff.
 *
 * `capture="environment"` puts the camera first on a phone while still allowing
 * the library, because the common case is a poster on a wall in front of them.
 */

type Phase = 'ready' | 'working' | 'done' | 'failed';

export default function UploadPage() {
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ title: string; start: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('t');
    setToken(value);
    // The token is a capability and it is sitting in the address bar. Taking it
    // out of the URL does not unsend it, but it keeps it out of a screenshot,
    // out of the next person's shoulder view, and out of anything that reads
    // history later.
    if (value) window.history.replaceState(null, '', '/upload');
  }, []);

  async function send(file: File) {
    if (!token) return;
    setPhase('working');
    setMessage(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let at = 0; at < bytes.length; at += 8192) {
        binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
      }

      const response = await fetch('/api/mcp/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'redeem',
          token,
          imageBase64: btoa(binary),
          mimeType: file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg',
          filename: file.name,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { events?: { title: string; start: string }[]; error?: string }
        | null;

      if (!response.ok) {
        setPhase('failed');
        setMessage(body?.error ?? 'That did not go through. Try again.');
        return;
      }

      setSaved(body?.events ?? []);
      setPhase('done');
    } catch {
      setPhase('failed');
      setMessage('We could not reach the server. Try again.');
    }
  }

  if (token === null) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="display text-xl text-black">This link is not complete.</p>
          <p className="mt-2 text-sm text-gray-600 leading-snug">
            Ask your assistant for a new upload link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm border-2 border-black bg-white p-6 offset-shadow">
        {phase === 'done' ? (
          <div data-testid="upload-done">
            <p className="display text-xl text-black">
              {saved.length === 0 ? 'Nothing found in that.' : 'Saved.'}
            </p>
            {saved.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm text-black">
                {saved.map((event) => (
                  <li key={`${event.title}-${event.start}`} className="leading-snug">
                    <span className="font-semibold">{event.title}</span>
                    <br />
                    <span className="text-gray-600">{event.start.slice(0, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-gray-500 leading-snug">
              You can close this and go back to your assistant.
            </p>
          </div>
        ) : (
          <>
            <p className="display text-xl text-black">Send a photo</p>
            <p className="mt-2 text-sm text-gray-600 leading-snug">
              A poster, an invitation, a ticket. It goes to your Event Every account and
              nowhere else.
            </p>

            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              className="sr-only"
              data-testid="upload-input"
              onChange={(change) => {
                const file = change.target.files?.[0];
                if (file) void send(file);
              }}
            />

            <button
              type="button"
              disabled={phase === 'working'}
              onClick={() => input.current?.click()}
              className="mt-5 w-full border-2 border-black bg-black px-4 py-3 font-semibold text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
              data-testid="upload-button"
            >
              {phase === 'working' ? 'Reading it...' : 'Choose a photo'}
            </button>

            {message && (
              <p
                className="mt-4 border-2 border-black bg-white px-3 py-2 text-sm"
                data-testid="upload-problem"
              >
                {message}
              </p>
            )}

            <p className="mt-4 text-xs text-gray-500 leading-snug">
              This link works once and expires in fifteen minutes.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
