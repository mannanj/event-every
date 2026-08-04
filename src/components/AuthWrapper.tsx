'use client';

import { useEffect, useState } from 'react';
import CommunityLimitScreen from './CommunityLimitScreen';
import { COMMUNITY_LIMIT_EVENT, CommunityLimitDetail } from '@/utils/communityLimit';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [limited, setLimited] = useState(false);
  const [resetAt, setResetAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/usage')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.exhausted) return;
        setResetAt(typeof data.resetAt === 'string' ? data.resetAt : null);
        setLimited(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onLimit = (event: Event) => {
      const detail = (event as CustomEvent<CommunityLimitDetail>).detail;
      setResetAt(detail?.resetAt ?? null);
      setLimited(true);
    };
    window.addEventListener(COMMUNITY_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(COMMUNITY_LIMIT_EVENT, onLimit);
  }, []);

  return limited ? <CommunityLimitScreen resetAt={resetAt} /> : children;
}
