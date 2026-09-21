'use client';

import { useEffect, useRef, useState } from 'react';

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
  // The bot check. Its sitekey is FETCHED, not compiled in: NEXT_PUBLIC_ is
  // inlined at build time and would be empty here, where the key lives on the
  // deployed Worker. A null sitekey means the check is off and this form
  // behaves exactly as it did before it existed.
  const [turnstileSitekey, setTurnstileSitekey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const turnstileWidget = useRef<string | null>(null);
  // Set when an assistant sent someone here to connect. Read from the location
  // rather than useSearchParams, which would make this whole page opt out of
  // static rendering for a parameter almost nobody arrives with.
  const [mcpState, setMcpState] = useState<string | null>(null);

  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get('state');
    setMcpState(state && /^[A-Za-z0-9_-]{1,128}$/.test(state) ? state : null);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/config', { cache: 'no-store' })
      .then((res) => res.json() as Promise<{ turnstile?: { enabled?: boolean; sitekey?: string | null } }>)
      .then((config) => {
        if (!active || !config.turnstile?.enabled || !config.turnstile.sitekey) return;
        setTurnstileSitekey(config.turnstile.sitekey);
        if (!document.getElementById('cf-turnstile-script')) {
          const script = document.createElement('script');
          script.id = 'cf-turnstile-script';
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
      })
      .catch(() => {
        // Leave it off rather than blocking sign-in on a config fetch.
      });
    return () => {
      active = false;
    };
  }, []);

  // Explicit render, not the implicit class scan: the scan runs when the script
  // loads and can miss an element React has not mounted yet.
  useEffect(() => {
    if (!turnstileSitekey || sent) return;
    let cancelled = false;
    const render = () => {
      const api = (window as unknown as { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string } }).turnstile;
      if (cancelled || !turnstileBox.current || !api || turnstileWidget.current) return;
      turnstileWidget.current = api.render(turnstileBox.current, {
        sitekey: turnstileSitekey,
        action: 'signin',
        theme: 'light',
        callback: (token: string) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(null),
        'error-callback': () => setTurnstileToken(null),
      });
    };
    render();
    const timer = window.setInterval(render, 200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [turnstileSitekey, sent]);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email,
          ...(turnstileToken ? { turnstileToken } : {}),
          ...(mcpState ? { mcpState } : {}),
        }),
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
            {mcpState ? 'Connect your assistant' : signedIn ? "You're signed in" : 'Event faster, plan better'}
          </h1>

          {/* Three lines, each quieter than the one above it. The title follows
              the house pattern - Green Light's "Go faster, travel better", Meet
              Time's "Meet faster, time better" - and verbs the product name the
              way the landing hero already does in "Event everything". */}
          <p className="text-sm text-black">
            {mcpState
              ? 'Sign in and your assistant can read and add events on this account.'
              : signedIn
                ? 'Your events are kept on this account, on any device you sign in on.'
                : 'Save history across devices, manage events, and connect your assistant'}
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
              {/* Already signed in with a connection waiting: a plain anchor,
                  not a Link, because this leaves the app for the bridge and the
                  router has no business prefetching an authorization. */}
              <a
                href={mcpState ? `/api/mcp/authorize?state=${encodeURIComponent(mcpState)}` : '/'}
                className="block w-full border-2 border-black bg-black px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-white hover:text-black"
                data-testid="signin-continue"
              >
                {mcpState ? 'Finish connecting' : 'Go to your events'}
              </a>
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
              {/* Usually invisible: a managed widget only draws a challenge
                  when it wants one. It keeps its own element so that, when it
                  does, the button is pushed down rather than covered. */}
              {turnstileSitekey && <div ref={turnstileBox} className="mt-3" data-testid="signin-turnstile" />}
              <button
                type="submit"
                disabled={sending || Boolean(turnstileSitekey && !turnstileToken)}
                className="mt-3 w-full border-2 border-black bg-black px-4 py-3 font-semibold text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
                data-testid="signin-submit"
              >
                {sending || (turnstileSitekey && !turnstileToken)
                  ? 'Just a moment...'
                  : 'Continue with email'}
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
