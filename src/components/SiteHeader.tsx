'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAccount } from '@/components/AccountProvider';
import AccountBar from '@/components/account-bar/AccountBar';

/**
 * The bar every screen wears.
 *
 * One header, used on the app, the sign-in page and the paused screen, so a
 * visitor never loses the way home or the way in. The wordmark is Event Every's
 * own; the controls on the right are the portable AccountBar, which is handed
 * values and callbacks and knows nothing about this app.
 */
export default function SiteHeader({ showHow = false }: { showHow?: boolean }) {
  const account = useAccount();
  // No point offering the way in from the page that is the way in.
  const onSignIn = usePathname() === '/signin';

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-white/55 border-b border-black/10">
      {/* Full width, not the page's centred column: the wordmark sits at the
          far left edge and the account controls at the far right, so the bar
          reads as the frame around every page rather than part of one. */}
      <div className="w-full px-6 h-14 flex items-center justify-between">
        <Link href="/" className="wordmark text-lg" aria-label="Event Every - back to top">
          Event Every
        </Link>

        <div className="flex items-center gap-4">
          {showHow && (
            <a href="#faq" className="eyebrow text-black/45 hover:text-black transition-colors">
              FAQ
            </a>
          )}

          {account.available && (
            <AccountBar
              signedIn={account.signedIn}
              email={account.email}
              onSignOut={account.signOut}
              busyLabel={account.syncing ? 'syncing' : null}
              hideSignIn={onSignIn}
              // Disabled until the MCP Worker exists. See tasks/task-202.md.
              mcp={{ enabled: false, tooltip: 'MCP coming soon' }}
              renderLink={(href, className, children) => (
                <Link href={href} className={className} data-testid="sign-in-link">
                  {children}
                </Link>
              )}
            />
          )}
        </div>
      </div>
    </nav>
  );
}
