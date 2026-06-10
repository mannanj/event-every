'use client';

import { useEffect, useState } from 'react';
import CommunityLimitScreen from '@/components/CommunityLimitScreen';

// Live preview of the community limit screen — exactly what visitors see once
// the daily budget is spent — without touching the real budget. The waitlist
// form and pattern-lock link are fully functional.
export default function SpentPreviewPage() {
  // Render only after mount: the reset time must be formatted in the
  // visitor's timezone, never the server's.
  const [mounted, setMounted] = useState(false);
  const [resetAt, setResetAt] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    fetch('/api/usage')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.resetAt === 'string') setResetAt(data.resetAt);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted) return null;

  return (
    <CommunityLimitScreen
      resetAt={resetAt}
      onEnterPattern={() => {
        window.location.href = '/?unlock';
      }}
    />
  );
}
