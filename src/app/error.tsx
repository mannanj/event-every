'use client';

import { useEffect } from 'react';

import { statusFragment } from '@/lib/statusPages';

/**
 * Rendered when a route segment throws. Same markup as the Worker-level
 * status pages, plus a retry, since a client-side error is often transient
 * in a way a 404 is not.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only safe correlator: Next redacts the message in
    // production, and the raw error may carry user content.
    console.error('route error', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: statusFragment('serverError') }} />
      <div style={{ textAlign: 'center', marginTop: '-1.5rem' }}>
        <button
          type="button"
          onClick={reset}
          style={{
            background: 'transparent',
            color: '#000000',
            border: '2px solid #000000',
            padding: '.45rem 1.1rem',
            font: 'inherit',
            fontSize: '.9rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
