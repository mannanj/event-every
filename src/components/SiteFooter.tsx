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
export default function SiteFooter({ tight = false }: { tight?: boolean } = {}) {
  return (
    /* The roomy gap is for the landing page, where the footer closes a long
       scroll. When the app is showing instead, content ends wherever the last
       event card ends, and 80px of blank paper above the rule reads as the page
       having failed to finish rather than as breathing room. */
    <footer className={`${tight ? 'mt-[15px]' : 'mt-20'} border-t border-black/10`}>
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
