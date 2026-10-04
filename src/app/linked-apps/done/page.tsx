import { Suspense } from 'react';
import LinkedAppDone from '@/components/LinkedAppDone';

/** Where a sister-app sign-in window lands: it tells the other windows, then closes. */
export default function LinkedAppDonePage() {
  return (
    <main className="min-h-screen bg-white p-6 text-sm">
      <Suspense fallback={null}>
        <LinkedAppDone />
      </Suspense>
    </main>
  );
}
