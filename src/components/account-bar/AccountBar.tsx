'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './AccountBar.module.css';

/**
 * The account controls that sit at the right of an app bar: the MCP mark, and
 * either the way in or whoever you are.
 *
 * PORTABLE ON PURPOSE. Ported from ~/Documents/skeletons/signup-cloudflare
 * (components/AccountMenu.tsx and components/McpButton.tsx), with every
 * app-specific edge turned into a prop:
 *
 *   the skeleton                     here
 *   ------------------------------   --------------------------------------
 *   fetch('/api/auth/signout')       onSignOut()
 *   window.location.href = '/'       the host decides what happens after
 *   <Link href="/signup">            signInHref + renderLink
 *   MCP_ENDPOINT from @/lib/         mcp prop
 *
 * It imports nothing from the app around it - no router, no config, no data
 * layer - so the same file works in Event Every, Meet Time or anything else.
 * `renderLink` exists so a Next app can hand in next/link without this module
 * having to know Next exists; omit it and you get a plain anchor.
 */

export interface AccountBarMcp {
  /** Disabled shows the mark greyed with a tooltip and no menu. */
  enabled: boolean;
  /** What the tooltip says. Kept a prop because "coming soon" is temporary. */
  tooltip: string;
  /** Only called when enabled. Ignored when `panel` is given. */
  onOpen?: () => void;
  /**
   * The popover the mark opens, e.g. the shared connector panel. Handed a
   * close callback so a link inside it can dismiss the popover on the way out.
   */
  panel?: (close: () => void) => React.ReactNode;
  /**
   * The "Disconnect MCP" panel, e.g. the shared McpDisconnect. Given, it is the
   * menu's second line, right under "MCP Connector".
   */
  disconnect?: (close: () => void) => React.ReactNode;
}

/**
 * One line in the account menu.
 *
 * `checked` makes it a switch rather than a command: it draws a tick and keeps
 * the menu open, because somebody turning a setting on often wants to look at
 * what else is there. A command closes the menu, the way Sign out always has.
 */
export interface AccountBarItem {
  key: string;
  label: string;
  /** Present makes this a switch. Undefined makes it a command. */
  checked?: boolean;
  disabled?: boolean;
  /** Small grey line under the label, for a consequence worth stating. */
  note?: string | null;
  /** 0-100 draws a progress bar under the note; null or omitted draws none. */
  progress?: number | null;
  /**
   * Keep the menu open after this one is chosen. A switch does that anyway; a
   * command needs it when choosing it only arms the real thing, such as a
   * delete that asks before it means it.
   */
  keepOpen?: boolean;
  onSelect: () => void | Promise<void>;
  testId?: string;
}

export interface AccountBarProps {
  /** Undefined means "not asked yet" - render nothing rather than guess. */
  signedIn: boolean | undefined;
  email: string | null;
  onSignOut: () => void | Promise<void>;
  signInHref?: string;
  signInLabel?: string;
  /** Shown next to the account button while background work is running. */
  busyLabel?: string | null;
  mcp?: AccountBarMcp;
  /** Extra lines above Sign out. Empty or omitted leaves the menu as it was. */
  items?: readonly AccountBarItem[];
  /** Hide the way in on the page that is the way in. */
  hideSignIn?: boolean;
  renderLink?: (href: string, className: string, children: React.ReactNode) => React.ReactNode;
}

/**
 * The Model Context Protocol mark, at 17px - two thirds of the 26 it was drawn
 * at. At full size it reads as the loudest thing in the bar, which is wrong for
 * a door most people never open.
 */
export function McpLogoIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      role="img"
      aria-label="Model Context Protocol"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
    >
      <path d="M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245" />
    </svg>
  );
}

/** Dismissed by click outside, touch outside, or Escape - all three. */
function useDismiss(open: boolean, close: () => void) {
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent | TouchEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('touchstart', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('touchstart', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);
  return wrapper;
}

function McpMark({ mcp }: { mcp: AccountBarMcp }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrapper = useDismiss(open, close);

  return (
    <div className={styles.mcp} ref={wrapper}>
      <button
        type="button"
        className={styles.mcpButton}
        aria-label={mcp.tooltip}
        aria-expanded={mcp.panel ? open : undefined}
        disabled={!mcp.enabled}
        onClick={mcp.enabled ? (mcp.panel ? () => setOpen((was) => !was) : mcp.onOpen) : undefined}
        data-testid="mcp-button"
      >
        <McpLogoIcon />
        <span className={styles.tip} data-testid="mcp-tooltip">
          {mcp.tooltip}
        </span>
      </button>

      {open && mcp.panel && (
        <div
          className={`${styles.mcpPanel} mcp-panel`}
          role="dialog"
          aria-label={mcp.tooltip}
          data-testid="mcp-panel"
        >
          {mcp.panel(close)}
        </div>
      )}
    </div>
  );
}

export default function AccountBar({
  signedIn,
  email,
  onSignOut,
  signInHref = '/signin',
  signInLabel = 'Sign in',
  busyLabel = null,
  mcp,
  items,
  hideSignIn = false,
  renderLink,
}: AccountBarProps) {
  // The menu, or one of the MCP panels in its place - hanging from the address
  // the way the menu does, so the account corner is one control, not two.
  const [view, setView] = useState<'closed' | 'menu' | 'mcp' | 'disconnect'>('closed');
  const open = view !== 'closed';
  const close = useCallback(() => setView('closed'), []);
  const wrapper = useDismiss(open, close);
  const mcpInMenu = mcp?.enabled === true && mcp.panel !== undefined;

  const link = (href: string, className: string, children: React.ReactNode) =>
    renderLink ? (
      renderLink(href, className, children)
    ) : (
      <a href={href} className={className}>
        {children}
      </a>
    );

  return (
    <div className={styles.bar}>
      {/* The mark sits left of whoever you are, signed in or not, so its
          position never shifts when the bar finds out who you are. */}
      {/* Signed in, the connector moves into the account menu (see below). */}
      {mcp && !(signedIn === true && mcpInMenu) && <McpMark mcp={mcp} />}

      {/* Undefined is the "not asked yet" state. Showing the way in to someone
          already signed in, even for one frame, is worse than showing nothing. */}
      {signedIn === false && !hideSignIn &&
        link(signInHref, styles.link, signInLabel)}

      {signedIn === true && (
        <div className={styles.account} ref={wrapper} data-testid="account-menu">
          {busyLabel && (
            <span className={styles.busy} data-testid="account-busy">
              {busyLabel}
            </span>
          )}
          <button
            type="button"
            className={styles.accountButton}
            aria-expanded={open}
            onClick={() => setView((was) => (was === 'closed' ? 'menu' : 'closed'))}
            data-testid="account-button"
          >
            <span className={styles.email} title={email ?? ''}>
              {email}
            </span>
            <svg
              viewBox="0 0 16 16"
              width={11}
              height={11}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.5 6l4.5 4.5L12.5 6" />
            </svg>
          </button>

          {view === 'menu' && (
            <div className={styles.menu} role="menu">
              {/* The address is on the button, so it is not repeated here.
                  MCP first, then how to undo it, then everything else. */}
              {mcpInMenu && (
                <button
                  type="button"
                  className={`${styles.item} ${styles.itemIcon}`}
                  role="menuitem"
                  onClick={() => setView('mcp')}
                  data-testid="menu-mcp"
                >
                  <McpLogoIcon size={15} />
                  MCP Connector
                </button>
              )}
              {mcpInMenu && mcp?.disconnect && (
                <button
                  type="button"
                  className={styles.item}
                  role="menuitem"
                  onClick={() => setView('disconnect')}
                  data-testid="menu-mcp-disconnect"
                >
                  Disconnect MCP
                </button>
              )}
              {items?.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={styles.item}
                  role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  onClick={() => {
                    // A switch leaves the menu open so the tick can be seen to
                    // move. A command closes it, the way Sign out always has,
                    // unless it says otherwise.
                    if (item.checked === undefined && !item.keepOpen) close();
                    void item.onSelect();
                  }}
                  data-testid={item.testId}
                >
                  <span className={styles.itemLabel}>
                    <span className={styles.tick} aria-hidden="true">
                      {item.checked ? '✓' : ''}
                    </span>
                    {item.label}
                  </span>
                  {item.note && <span className={styles.itemSubnote}>{item.note}</span>}
                  {typeof item.progress === 'number' && (
                    <span className={styles.progress} data-testid={item.testId && `${item.testId}-progress`}>
                      <span
                        className={styles.progressTrack}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={item.progress}
                      >
                        <span className={styles.progressFill} style={{ width: `${item.progress}%` }} />
                      </span>
                      <span className={styles.progressValue}>{item.progress}%</span>
                    </span>
                  )}
                </button>
              ))}

              <button
                type="button"
                className={styles.item}
                role="menuitem"
                onClick={() => {
                  close();
                  void onSignOut();
                }}
                data-testid="sign-out"
              >
                Sign out
              </button>
            </div>
          )}

          {view === 'mcp' && mcp?.panel && (
            <div className={`${styles.mcpPanel} mcp-panel`} role="dialog" aria-label="MCP Connector" data-testid="mcp-panel">
              {mcp.panel(close)}
            </div>
          )}

          {view === 'disconnect' && mcp?.disconnect && (
            <div
              className={`${styles.mcpPanel} mcp-panel`}
              role="dialog"
              aria-label="Disconnect MCP"
              data-testid="mcp-disconnect-panel"
            >
              {mcp.disconnect(close)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
