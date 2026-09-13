import type { Metadata } from 'next';

import { statusFragment } from '@/lib/statusPages';

export const metadata: Metadata = {
  title: 'Nothing here',
  robots: { index: false, follow: false },
};

/**
 * Rendered by Next for any unmatched route. Uses the same markup as the
 * Worker-level status pages, so a 404 from the app and a 404 from the edge
 * are the same page rather than two designs that drifted apart.
 */
export default function NotFound() {
  return <div dangerouslySetInnerHTML={{ __html: statusFragment('notFound') }} />;
}
