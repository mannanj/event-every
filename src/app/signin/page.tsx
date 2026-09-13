'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useAccount } from '@/components/AccountProvider';
import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';

/**
 * One front door.
 *
 * Signing in and signing up are the same act, because the account is created on
 * first successful sign-in. There is no "already have an account?" link to get
 * wrong and no second form to keep in step with this one.
 *
 * The composition is the skeleton's sign-up page - mark and title on one line,
 * then three lines each quieter than the one above it, then a single card with
 * the one thing to do - rendered in Event Every's own language rather than the
 * skeleton's: the display face, a hard black rule and the offset shadow.
 */

/** A door with an arrow going through it. Sits left of the title. */
function SignInMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.5 3H6.5a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 6.5 21h8" />
      <path d="M11 12h9" />
      <path d="m17 8.5 3.5 3.5L17 15.5" />
    </svg>
  );
}

export default function SignInPage() {
  const account = useAccount();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setProblem(body?.error ?? 'That did not go through. Try again.');
        return;
      }
      setSent(true);
    } catch {
      setProblem('We could not reach the server. Try again.');
    } finally {
      setSending(false);
    }
  }

  const signedIn = account.signedIn === true;

  return (
    <main className="min-h-screen rainbow-gradient-bg flex flex-col">
      <SiteHeader />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="flex flex-col items-center gap-5 max-w-xl">
          <h1 className="flex items-center justify-center gap-3 display text-[clamp(1.9rem,5vw,2.6rem)] leading-[1.1] text-black">
            <span className="inline-flex flex-none text-black">
              <SignInMark />
            </span>
            {signedIn ? "You're signed in" : 'Sign in once, stay signed in'}
          </h1>

          {/* Three lines, each quieter than the one above it. */}
          <p className="text-sm text-black">
            {signedIn
              ? 'Your events are kept on this account, on any device you sign in on.'
              : 'Save history across devices, manage events, and use the future MCP'}
          </p>
          <p className="text-[0.6875rem] text-gray-500 -mt-3">
            Your data is encrypted, and we never sell it to third parties.
          </p>
        </div>

        {/* The one thing to do, on white, away from the paper behind it. */}
        <div className="w-full max-w-md mt-10 border-2 border-black bg-white p-6 offset-shadow text-left">
          {sent ? (
            <div data-testid="signin-sent">
              <p className="display text-xl text-black">Check your email.</p>
              <p className="mt-2 text-sm text-gray-600 leading-snug">
                We sent a link to {email}. It works once, and expires in 20 minutes.
              </p>
            </div>
          ) : signedIn ? (
            <>
              <Link
                href="/"
                className="block w-full border-2 border-black bg-black px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-white hover:text-black"
                data-testid="signin-continue"
              >
                Go to your events
              </Link>
              <p className="mt-3 text-xs text-gray-500 leading-snug text-center">
                Signed in on this device for 30 days, or until you sign out.
              </p>
            </>
          ) : (
            <form onSubmit={submit}>
              <label className="sr-only" htmlFor="signin-email">
                Your email
              </label>
              <input
                id="signin-email"
                type="email"
                required
                maxLength={200}
                autoComplete="email"
                placeholder="Enter your email"
                value={email}
                onChange={(change) => setEmail(change.target.value)}
                className="w-full border-2 border-black px-3 py-3 text-base"
                data-testid="signin-email"
              />
              <button
                type="submit"
                disabled={sending}
                className="mt-3 w-full border-2 border-black bg-black px-4 py-3 font-semibold text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
                data-testid="signin-submit"
              >
                {sending ? 'Just a moment...' : 'Continue with email'}
              </button>
              <p className="mt-3 text-xs text-gray-500 leading-snug text-center">
                By continuing, you acknowledge usage of Event Every comes with no guarantees,
                promises or terms of service.
              </p>
            </form>
          )}

          {problem && (
            <p
              className="mt-4 border-2 border-black bg-white px-3 py-2 text-sm"
              data-testid="signin-problem"
            >
              {problem}
            </p>
          )}
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
