import Link from 'next/link';

/**
 * The name, and who made it. Nothing else belongs down here.
 *
 * Standard on every page that has a bottom - the app, sign-in, the status
 * pages - so the frame is the same wherever someone lands. Deliberately keeps
 * the centred column the header gave up: a footer pinned to the far edges of a
 * wide screen reads as a stray line rather than a close.
 *
 * Not used on the paused screen, which is a single short message and closes
 * itself.
 */
export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-black/10">
      <div className="max-w-2xl mx-auto px-6 py-8 flex items-center justify-between text-sm">
        <Link href="/" className="wordmark text-black/80" aria-label="Event Every - home">
          Event Every
        </Link>
        <span className="text-gray-500">
          made by{' '}
          <a href="https://mannan.is" className="text-black underline-offset-4 hover:underline">
            Mannan
          </a>
        </span>
      </div>
    </footer>
  );
}
