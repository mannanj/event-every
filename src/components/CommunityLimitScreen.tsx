'use client';

import { useMemo, useState } from 'react';

interface CommunityLimitScreenProps {
  resetAt: string | null;
  onEnterPattern: () => void;
}

// "June 11, 2026, 8:00 PM EDT" — the viewer's own timezone, with the zone listed.
function formatResetTime(resetAt: string | null): string {
  let date = resetAt ? new Date(resetAt) : null;
  if (!date || Number.isNaN(date.getTime())) {
    const now = new Date();
    date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export default function CommunityLimitScreen({ resetAt, onEnterPattern }: CommunityLimitScreenProps) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const resetText = useMemo(() => formatResetTime(resetAt), [resetAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage('');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: honeypot }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        setStatus('error');
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setStatus('success');
      if (data.alreadyJoined) {
        setConfirmation("You're already on the waitlist.");
      } else if (data.emailSent) {
        setConfirmation(`You're on the waitlist. A confirmation email is on its way to ${email.trim()}.`);
      } else {
        setConfirmation("You're on the waitlist.");
      }
    } catch {
      setStatus('error');
      setErrorMessage('Connection error. Check your network and try again.');
    }
  };

  return (
    <main
      className="min-h-screen rainbow-gradient-bg flex items-center justify-center px-6 py-12"
      data-testid="community-limit-screen"
    >
      <div className="bg-white border-2 border-black p-8 max-w-xl w-full">
        <h1 className="text-3xl font-black retro-rainbow-text tracking-wider text-center mb-8">Event Every</h1>

        <p className="text-black text-base leading-relaxed mb-6" data-testid="community-limit-message">
          This app is community sponsored. The usage limits have been hit today and reset {resetText}.
        </p>

        <p className="text-black text-base leading-relaxed mb-6">
          Alternatively, you can sign up for the waitlist to be invited as a member to the Spirit &amp; Hammer
          collective when membership opens. Membership provides access to several member apps including this one.
        </p>

        {status === 'success' ? (
          <p className="text-black font-semibold border-2 border-black p-4 mb-6" data-testid="waitlist-confirmation">
            {confirmation}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mb-6">
            <label htmlFor="waitlist-email" className="block text-sm font-semibold mb-2">
              Email
            </label>
            <input
              id="waitlist-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border-2 border-black px-3 py-2.5 mb-3 focus:outline-none"
              data-testid="waitlist-email"
            />
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="honeypot-field"
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-black text-white py-2.5 px-6 hover:bg-gray-800 transition-colors disabled:bg-gray-400"
              data-testid="waitlist-submit"
            >
              {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
            </button>
            {status === 'error' ? (
              <p className="text-sm text-black font-medium mt-3" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </form>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={onEnterPattern}
            className="text-blue-600 underline hover:text-blue-800 transition-colors"
            data-testid="enter-pattern-link"
          >
            Enter pattern lock
          </button>
        </div>
      </div>
    </main>
  );
}
