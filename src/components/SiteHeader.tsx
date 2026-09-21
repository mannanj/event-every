'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAccount } from '@/components/AccountProvider';
import AccountBar, { type AccountBarItem } from '@/components/account-bar/AccountBar';
import { useAttachmentBackup } from '@/hooks/useAttachmentBackup';

/**
 * The bar every screen wears.
 *
 * One header, used on the app, the sign-in page and the paused screen, so a
 * visitor never loses the way home or the way in. The wordmark is Event Every's
 * own; the controls on the right are the portable AccountBar, which is handed
 * values and callbacks and knows nothing about this app.
 */
/** Whole numbers below a megabyte: "1.4 MB" reads, "1434 KB" does not. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SiteHeader({ showHow = false }: { showHow?: boolean }) {
  const account = useAccount();
  // No point offering the way in from the page that is the way in.
  const onSignIn = usePathname() === '/signin';
  const backup = useAttachmentBackup(account.signedIn);

  // Only when there is a bucket to back up to. A deployment without one shows
  // the menu it always showed rather than a switch that does nothing.
  const items: AccountBarItem[] = backup.available
    ? [
        {
          key: 'backup',
          label: 'Backup attachments to my account',
          checked: backup.enabled,
          disabled: backup.busy,
          note: backup.enabled
            ? 'Originals are kept encrypted, so a new device can get them back.'
            : 'Originals stay on this device only.',
          onSelect: backup.toggle,
          testId: 'attachment-backup-toggle',
        },
        {
          key: 'delete-backups',
          label: backup.confirming
            ? 'Delete them. This cannot be undone.'
            : 'Delete attachments from my account',
          disabled: backup.busy || backup.count === 0,
          note:
            backup.count === 0
              ? 'Nothing backed up yet.'
              : `${backup.count} ${backup.count === 1 ? 'file' : 'files'}, ${formatBytes(backup.bytes)}. This device keeps its own copies.`,
          // The first click only arms it, so the menu has to stay open for the
          // second one to be possible.
          keepOpen: !backup.confirming,
          onSelect: backup.removeAll,
          testId: 'attachment-backup-delete',
        },
      ]
    : [];

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
              items={items}
              // The mark opens the guide rather than a popover: connecting is a
              // thing somebody does once, in a terminal or a client's settings,
              // and the page can say what an assistant will be able to see. A
              // popover cannot, and this is not a decision to make from a
              // tooltip.
              mcp={{
                enabled: true,
                tooltip: 'Connect your assistant',
                onOpen: () => {
                  window.location.href = '/mcp';
                },
              }}
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
