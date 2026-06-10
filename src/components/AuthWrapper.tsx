'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import PatternLock from './PatternLock';
import EmailRequestModal from './EmailRequestModal';
import SideDrawerLockButton from './SideDrawerLockButton';
import CommunityLimitScreen from './CommunityLimitScreen';
import { COMMUNITY_LIMIT_EVENT, CommunityLimitDetail } from '@/utils/communityLimit';

// The app is open by default (community mode, budget-gated server-side).
// 'limit' replaces it when the daily community budget is spent; 'pattern' is
// the admin entry point — reached from the limit screen or /?unlock.
type Screen = 'app' | 'limit' | 'pattern';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, attempts, isLockedOut, verifyPattern } = useAuth();
  const [screen, setScreen] = useState<Screen>('app');
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);

  const isDevMode = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('unlock')) {
      setScreen('pattern');
    }
  }, []);

  // If today's community budget is already spent, anonymous visitors land on
  // the limit screen. Admins (valid pattern cookie) never see it.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    let cancelled = false;
    fetch('/api/usage')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !data.exhausted || data.isAdmin) return;
        setResetAt(typeof data.resetAt === 'string' ? data.resetAt : null);
        setScreen((prev) => (prev === 'pattern' ? prev : 'limit'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated]);

  // Mid-session limit hits (any API call returning the community-limit 402).
  useEffect(() => {
    const onLimit = (event: Event) => {
      if (isAuthenticated) return;
      const detail = (event as CustomEvent<CommunityLimitDetail>).detail;
      setResetAt(detail?.resetAt ?? null);
      setScreen('limit');
    };
    window.addEventListener(COMMUNITY_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(COMMUNITY_LIMIT_EVENT, onLimit);
  }, [isAuthenticated]);

  // Pattern success → straight back into the app, now in admin mode.
  useEffect(() => {
    if (isAuthenticated) {
      setScreen('app');
      setError('');
    }
  }, [isAuthenticated]);

  const handleVerify = async (input: number[]) => {
    const result = await verifyPattern(input);

    if (result === true) {
      setError('');
    } else if (typeof result === 'object') {
      if ('networkError' in result && result.networkError) {
        setError('Connection error. Check your network and try again.');
      } else if (result.isLockedOut) {
        setError('Whoa there! Too many tries. Take a breather.');
      } else if (result.attemptsLeft === 0) {
        setError('Not quite! No attempts remaining.');
      } else if (result.attemptsLeft === 1) {
        setError('Nope! Last chance—make it count.');
      } else {
        setError(`Not quite! ${result.attemptsLeft} attempts left.`);
      }
    } else {
      setError('Not quite! Try again.');
    }
  };

  if (screen === 'pattern' && !isAuthenticated) {
    return (
      <>
        <PatternLock
          onSubmit={handleVerify}
          error={error}
          attemptsLeft={attempts}
        />
        {isLockedOut ? (
          <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2">
            <button
              onClick={() => setShowEmailModal(true)}
              className="px-6 py-3 bg-black text-white hover:bg-white hover:text-black border-2 border-black transition-colors font-medium"
            >
              Request Access
            </button>
          </div>
        ) : null}
        {showEmailModal ? <EmailRequestModal onClose={() => setShowEmailModal(false)} /> : null}
      </>
    );
  }

  if (screen === 'limit' && !isAuthenticated) {
    return (
      <CommunityLimitScreen
        resetAt={resetAt}
        onEnterPattern={() => {
          setError('');
          setScreen('pattern');
        }}
      />
    );
  }

  return (
    <>
      {children}
      {isDevMode ? (
        <SideDrawerLockButton
          onLock={() => {
            setError('');
            setScreen('pattern');
          }}
        />
      ) : null}
    </>
  );
}
