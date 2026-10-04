// GENERATED FROM @mannan/mcp-connector/index.tsx - DO NOT EDIT HERE.
// Edit ~/Documents/mcp-connector and re-run: node bin/sync.mjs <this dir>
'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * The MCP connector menu, shared by every app that hands someone a connection.
 *
 *   MCP Connector                                   Docs
 *   Add this app              Connected  (✳) (>_) (⋯)
 *   (✳)  https://…/mcp                               ⧉
 *   (>_) claude mcp add --transport http …           ⧉
 *   (⋯)  Connect to the MCP server at …              ⧉
 *   Add other MCPs
 *   Event Every                                Sign in
 *
 * Each string is marked with the CLIENT it belongs to, as an icon of one fixed
 * size rather than a heading, so a person finds their own tool at a glance and
 * the panel stays three lines tall. The icon names its client on hover or tap.
 *
 * Signed in, the "Add this app" line carries the account's status: the same
 * three icons, solid for a client that is connected and at half strength for
 * one that is not. Each opens a small menu under it - what is connected, when,
 * and Disconnect; or Connect when nothing is - so connecting and cutting off
 * live on the same line as the strings you connect with.
 *
 * "Add other MCPs" is the other direction: THIS app signing in to a sister
 * app's MCP server (see linked-app.ts). It is drawn only when the app passes
 * any - an app with no sister apps shows no empty heading.
 *
 * UNSTYLED BY DEFAULT. Every colour, radius and face comes from a custom
 * property (see styles.css), so each app keeps its own skin without overriding
 * selectors and without this package knowing anything about their palettes.
 */

export type McpClientKind = 'claude-ai' | 'claude-code' | 'agent';

export type McpConnectorLabels = {
  /** Defaults to the client names the apps agreed on. */
  endpoint?: string;
  claudeCode?: string;
  agent?: string;
};

/** A sister app this one can sign in to. */
export interface McpLinkedApp {
  id: string;
  name: string;
  /** Its site, linked from the name. */
  href?: string;
}

/** One live sign-in to a sister app. */
export interface McpAppLink {
  appId: string;
  /** Unix seconds. */
  connectedAt: number;
}

export interface McpAppsSource {
  apps: McpLinkedApp[];
  /** Pass a stable function: it is an effect dependency. */
  load: () => Promise<McpAppLink[]>;
  /** Usually a navigation to the app's own /connect route, which leaves the page. */
  signIn: (appId: string) => void;
  signOut: (appId: string) => Promise<unknown>;
}

export type McpConnectorProps = {
  endpoint: string;
  claudeCodeCommand: string;
  agentInstruction: string;
  /** Omit when the app has no guide page: a Docs link to nowhere is worse. */
  docsHref?: string;
  /** Lets a Next app pass next/link so the docs link stays client-side. */
  renderDocsLink?: (href: string, children: ReactNode) => ReactNode;
  title?: string;
  /** The heading over the three strings. */
  addTitle?: string;
  labels?: McpConnectorLabels;
  /** Rendered fogged and inert, for a visitor who cannot use it yet. */
  locked?: boolean;
  /**
   * Signed in: what this account has connected, drawn as the status on the
   * "Add this app" line with a menu per client to connect or disconnect.
   * Omit when nobody is signed in - there is nothing to show.
   */
  connections?: McpConnectionsSource;
  /** Sister apps this one signs in to. Omit, or pass none, and the section is not drawn. */
  apps?: McpAppsSource;
  /** Where "Connect" sends someone for claude.ai. */
  claudeAiConnectHref?: string;
  className?: string;
};

const DEFAULT_LABELS: Required<McpConnectorLabels> = {
  endpoint: 'Claude.ai',
  claudeCode: 'Claude Code',
  agent: 'OpenAI, Pi, and other agents',
};

const CLAUDE_AI_CONNECTORS = 'https://claude.ai/settings/connectors';

const COPIED_RESET_MS = 1600;

/**
 * Which client a connection is, from the name it registered with.
 *
 * Claude Code registers as "Claude Code"; claude.ai as "Claude" (or
 * "claude.ai"). Anything else - Codex, Pi, a script - is an agent.
 */
export function clientKind(name: string): McpClientKind {
  const n = name.trim().toLowerCase();
  if (/claude[\s-]?code/.test(n)) return 'claude-code';
  if (/^claude(\.ai)?\b/.test(n) || n === 'anthropic') return 'claude-ai';
  return 'agent';
}

/** Two overlapping sheets: the copy affordance every app already used. */
function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** Confirmation, in the app's own accent rather than a fixed green. */
function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
      className="mcpc-snippet__check">
      <path d="M4 12.5 9 17.5 20 6.5" />
    </svg>
  );
}

/*
 * The three client marks. One 24-unit box each, drawn to the same optical
 * weight and shown at one size (--mcpc-icon), so a row of them reads as a set.
 */

/** claude.ai: the spark. */
function ClaudeAiGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M18.4 5.6l-4.2 4.2M9.8 14.2l-4.2 4.2" />
    </svg>
  );
}

/** Claude Code: a terminal prompt. */
function ClaudeCodeGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2.5" y="4" width="19" height="16" rx="3" />
      <path d="m7 9.5 3 2.5-3 2.5M12.5 15H17" />
    </svg>
  );
}

/** Any other agent: three linked nodes. */
function AgentGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="6" cy="7" r="2.6" />
      <circle cx="18" cy="7" r="2.6" />
      <circle cx="12" cy="18" r="2.6" />
      <path d="M8.6 7h6.8M7.3 9.3l3.4 6.4M16.7 9.3l-3.4 6.4" />
    </svg>
  );
}

const GLYPHS: Record<McpClientKind, () => ReactNode> = {
  'claude-ai': ClaudeAiGlyph,
  'claude-code': ClaudeCodeGlyph,
  agent: AgentGlyph,
};

const KINDS: McpClientKind[] = ['claude-ai', 'claude-code', 'agent'];

/** Click outside, touch outside, Escape: the three ways every menu here closes. */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
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
  }, [open, close, ref]);
}

/**
 * A client's mark that names itself: the tip shows on hover and focus (CSS),
 * and a tap pins it, because a phone has no hover.
 */
export function ClientIcon({ kind, label }: { kind: McpClientKind; label: string }) {
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setPinned(false), []);
  useDismiss(pinned, close, ref);
  const Glyph = GLYPHS[kind];
  return (
    <span ref={ref} className={`mcpc-client${pinned ? ' is-pinned' : ''}`} data-kind={kind}>
      <button type="button" className="mcpc-icon" aria-label={label} onClick={() => setPinned((p) => !p)}>
        <Glyph />
      </button>
      <span className="mcpc-tip" role="tooltip">{label}</span>
    </span>
  );
}

export function CopySnippet({ label, value, kind }: { label: string; value: string; kind?: McpClientKind }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard can be denied; the value stays selectable either way.
    }
  }

  return (
    <div className="mcpc-snippet" data-kind={kind}>
      {/* With a client mark the label IS the icon's tip; without one (an app
          still calling CopySnippet on its own) it stays a heading. */}
      {kind ? <ClientIcon kind={kind} label={label} /> : <span className="mcpc-snippet__label">{label}</span>}
      {/* The field carries the border; the copy control sits INSIDE it as an
          icon. Two bordered boxes side by side read as two controls, when only
          one of them does anything. */}
      <div className="mcpc-snippet__row">
        <code className="mcpc-snippet__value">{value}</code>
        <button
          type="button"
          className="mcpc-snippet__copy"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy ${label}`}
        >
          {copied ? <CheckGlyph /> : <CopyGlyph />}
        </button>
      </div>
    </div>
  );
}

type ConnectionsState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; items: McpConnection[] };

const CONNECTED_ON = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const onDate = (seconds: number) => CONNECTED_ON.format(new Date(seconds * 1000));

/** A small menu hanging under its trigger. Shared by the client and sister-app menus. */
function MenuButton({
  trigger,
  triggerClass,
  label,
  children,
  testId,
}: {
  trigger: ReactNode;
  triggerClass: string;
  label: string;
  children: (close: () => void) => ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  return (
    <span ref={ref} className="mcpc-menuwrap">
      <button
        type="button"
        className={triggerClass}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        {trigger}
      </button>
      {open && (
        <span className="mcpc-menu" role="menu" aria-label={label}>
          {children(close)}
        </span>
      )}
    </span>
  );
}

/**
 * The status on the "Add this app" line: Connected/Disconnected, then one
 * mark per client, solid when that client is connected.
 */
function ConnectionStatus({
  source,
  labels,
  values,
  claudeAiConnectHref,
}: {
  source: McpConnectionsSource;
  labels: Record<McpClientKind, string>;
  values: Record<McpClientKind, string>;
  claudeAiConnectHref: string;
}) {
  const { load, disconnect } = source;
  const [state, setState] = useState<ConnectionsState>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<McpClientKind | null>(null);

  useEffect(() => {
    let live = true;
    load()
      .then((items) => live && setState({ kind: 'ready', items }))
      .catch(() => live && setState({ kind: 'failed' }));
    return () => {
      live = false;
    };
  }, [load]);

  const cut = async (id: string) => {
    setBusy(id);
    try {
      await disconnect(id);
      setState((was) => (was.kind === 'ready' ? { kind: 'ready', items: was.items.filter((c) => c.id !== id) } : was));
    } catch {
      setState({ kind: 'failed' });
    } finally {
      setBusy(null);
    }
  };

  // Connecting is done in the client, not here: hand over the string it needs.
  const connect = async (kind: McpClientKind) => {
    try {
      await navigator.clipboard.writeText(values[kind]);
    } catch {
      // Denied clipboard: the string is still on screen above.
    }
    setCopied(kind);
    if (kind === 'claude-ai') window.open(claudeAiConnectHref, '_blank', 'noopener');
  };

  const items = state.kind === 'ready' ? state.items : [];
  const byKind = (kind: McpClientKind) => items.filter((c) => clientKind(c.client) === kind);
  const word =
    state.kind === 'loading' ? 'Checking…' : state.kind === 'failed' ? 'Unavailable' : items.length ? 'Connected' : 'Disconnected';

  return (
    <span className="mcpc-status" data-testid="mcp-connections" aria-label="Connected assistants">
      <span className={`mcpc-status__word${items.length ? ' is-on' : ''}`} role="status">{word}</span>
      {KINDS.map((kind) => {
        const mine = byKind(kind);
        const Glyph = GLYPHS[kind];
        return (
          <MenuButton
            key={kind}
            label={`${labels[kind]}: ${mine.length ? 'connected' : 'not connected'}`}
            triggerClass={`mcpc-icon mcpc-status__icon${mine.length ? ' is-on' : ''}`}
            trigger={<Glyph />}
            testId={`mcp-status-${kind}`}
          >
            {() => (
              <>
                <span className="mcpc-menu__title">{labels[kind]}</span>
                {state.kind === 'failed' && <span className="mcpc-menu__note" role="alert">Could not load connections.</span>}
                {state.kind === 'loading' && <span className="mcpc-menu__note">Checking…</span>}
                {state.kind === 'ready' && mine.length === 0 && (
                  <span className="mcpc-menu__row">
                    <span className="mcpc-menu__note">{copied === kind ? 'Copied. Paste it in.' : 'Not connected'}</span>
                    <button type="button" className="mcpc-menu__action" role="menuitem" onClick={() => void connect(kind)}>
                      Connect
                    </button>
                  </span>
                )}
                {mine.map((c) => (
                  <span key={c.id} className="mcpc-menu__row mcpc-connections__row">
                    <span className="mcpc-connections__name" title={c.client}>{c.client}</span>
                    <button
                      type="button"
                      role="menuitem"
                      className="mcpc-connections__cut"
                      disabled={busy !== null}
                      onClick={() => void cut(c.id)}
                      aria-label={`Disconnect ${c.client}`}
                    >
                      {busy === c.id ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                    <span className="mcpc-connections__when">{onDate(c.connectedAt)}</span>
                  </span>
                ))}
              </>
            )}
          </MenuButton>
        );
      })}
    </span>
  );
}

type AppsState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; links: McpAppLink[] };

/**
 * "Add other MCPs": one row per sister app - its name, then Sign in, or Sign
 * out behind the same small menu the client marks use, with the date.
 */
export function McpApps({ apps, load, signIn, signOut }: McpAppsSource) {
  const [state, setState] = useState<AppsState>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load()
      .then((links) => live && setState({ kind: 'ready', links }))
      .catch(() => live && setState({ kind: 'failed' }));
    return () => {
      live = false;
    };
  }, [load]);

  const out = async (appId: string, close: () => void) => {
    setBusy(appId);
    try {
      await signOut(appId);
      setState((was) => (was.kind === 'ready' ? { kind: 'ready', links: was.links.filter((l) => l.appId !== appId) } : was));
      close();
    } catch {
      setState({ kind: 'failed' });
    } finally {
      setBusy(null);
    }
  };

  if (apps.length === 0) return null;
  return (
    <section className="mcpc-apps" aria-label="Other MCPs" data-testid="mcp-apps">
      <span className="mcpc-section">Add other MCPs</span>
      <ul className="mcpc-apps__list">
        {apps.map((app) => {
          const link = state.kind === 'ready' ? state.links.find((l) => l.appId === app.id) : undefined;
          return (
            <li key={app.id} className="mcpc-apps__row" data-testid={`mcp-app-${app.id}`}>
              {app.href ? (
                <a className="mcpc-apps__name" href={app.href} target="_blank" rel="noopener">{app.name}</a>
              ) : (
                <span className="mcpc-apps__name">{app.name}</span>
              )}
              {state.kind === 'loading' && <span className="mcpc-menu__note">Checking…</span>}
              {state.kind === 'failed' && <span className="mcpc-menu__note" role="alert">Unavailable</span>}
              {state.kind === 'ready' && !link && (
                <button type="button" className="mcpc-apps__action" onClick={() => signIn(app.id)}>
                  Sign in
                </button>
              )}
              {state.kind === 'ready' && link && (
                <MenuButton label={`Sign out of ${app.name}`} triggerClass="mcpc-apps__action" trigger="Sign out">
                  {(close) => (
                    <>
                      <span className="mcpc-menu__title">{app.name}</span>
                      <span className="mcpc-menu__row mcpc-connections__row">
                        <span className="mcpc-connections__name">Signed in</span>
                        <button
                          type="button"
                          role="menuitem"
                          className="mcpc-connections__cut"
                          disabled={busy !== null}
                          onClick={() => void out(app.id, close)}
                        >
                          {busy === app.id ? 'Signing out…' : 'Sign out'}
                        </button>
                        <span className="mcpc-connections__when">{onDate(link.connectedAt)}</span>
                      </span>
                    </>
                  )}
                </MenuButton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function McpConnector({
  endpoint,
  claudeCodeCommand,
  agentInstruction,
  docsHref,
  renderDocsLink,
  title = 'MCP Connector',
  addTitle = 'Add this app',
  labels,
  locked = false,
  connections,
  apps,
  claudeAiConnectHref = CLAUDE_AI_CONNECTORS,
  className,
}: McpConnectorProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const byKind: Record<McpClientKind, string> = { 'claude-ai': text.endpoint, 'claude-code': text.claudeCode, agent: text.agent };
  const values: Record<McpClientKind, string> = { 'claude-ai': endpoint, 'claude-code': claudeCodeCommand, agent: agentInstruction };
  const docs = docsHref
    ? locked
      ? <span className="mcpc-docs is-locked" aria-disabled="true">Docs</span>
      : renderDocsLink
        ? renderDocsLink(docsHref, 'Docs')
        : <a className="mcpc-docs" href={docsHref}>Docs</a>
    : null;

  return (
    <div className={['mcp-connector', className].filter(Boolean).join(' ')}>
      <div className="mcpc-head">
        <span className="mcpc-title">{title}</span>
        {docs}
      </div>
      <div className="mcpc-subhead">
        <span className="mcpc-section">{addTitle}</span>
        {connections && !locked && (
          <ConnectionStatus source={connections} labels={byKind} values={values} claudeAiConnectHref={claudeAiConnectHref} />
        )}
      </div>
      <div
        className={`mcpc-rows${locked ? ' is-locked' : ''}`}
        aria-hidden={locked || undefined}
      >
        {KINDS.map((kind) => (
          <CopySnippet key={kind} kind={kind} label={byKind[kind]} value={values[kind]} />
        ))}
      </div>
      {apps && apps.apps.length > 0 && !locked && <McpApps {...apps} />}
    </div>
  );
}

/** Build the three strings from one origin, so they cannot drift apart. */
export function mcpStrings(input: { origin: string; slug: string; purpose: string }) {
  const endpoint = input.origin.replace(/\/+$/, '');
  return {
    endpoint,
    claudeCodeCommand: `claude mcp add --transport http ${input.slug} ${endpoint}`,
    agentInstruction: `Connect to the MCP server at ${endpoint} (streamable HTTP) ${input.purpose}`,
  };
}


/**
 * The "AI-Generated" mark that sits above a guide's heading.
 *
 * WHY. These pages are written for agents, and they read like it. Someone who
 * landed here wanting a person should be told so plainly, and given a way to
 * reach one — rather than discovering it three paragraphs in.
 *
 * THE ADDRESS IS NOT IN THE MARKUP UNTIL ASKED FOR. A mailto in a public page
 * is harvested within hours. The address is held in a closure and written into
 * the DOM only once someone acts, which is the same click-to-reveal gate
 * mannan.is and Sun Signal use.
 *
 * `renderChallenge` is the seam for a stronger gate: hand it a Cloudflare
 * Turnstile (or anything else) and the address stays hidden until that calls
 * back. The package deliberately does not depend on Turnstile itself — each
 * app already has its own widget and its own sitekey, and a shared component
 * that loaded a third-party script would put that script on every page that
 * shows a connector.
 */
export type AiGeneratedProps = {
  /** The badge text. */
  label?: string;
  /** The sentence shown when it is opened. */
  note?: string;
  /**
   * Base64 of the address — build it with `maskEmail()`.
   *
   * NOT the plain address: this is a client component, so every prop is
   * serialised into the page's hydration payload. A plain string there is
   * harvestable whether or not it is ever rendered, which is exactly what this
   * gate exists to prevent. Omit and no address is offered at all.
   */
  emailMasked?: string;
  /**
   * A bot check that must pass before the address is revealed. Receives a
   * callback to call on success. Omit for plain click-to-reveal.
   */
  renderChallenge?: (onPass: () => void) => ReactNode;
  className?: string;
};

const AI_NOTE =
  'This page was AI generated and made for Agents. If you are seeking a human touch, send me an email.';

export function AiGenerated({
  label = 'AI-Generated',
  note = AI_NOTE,
  emailMasked,
  renderChallenge,
  className,
}: AiGeneratedProps) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  // Decoded only once someone has passed the gate, so the address enters the
  // DOM at that moment and not before.
  const [address, setAddress] = useState<string | null>(null);
  const wrapper = useRef<HTMLSpanElement>(null);

  const unlock = () => {
    if (!emailMasked) return;
    try {
      setAddress(typeof atob === 'function' ? atob(emailMasked) : Buffer.from(emailMasked, 'base64').toString('utf8'));
      setRevealed(true);
    } catch {
      // A malformed mask offers nothing rather than showing gibberish.
    }
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent | TouchEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('touchstart', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('touchstart', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  // Closing forgets the reveal, so the address is not left sitting in the DOM.
  useEffect(() => {
    if (!open) {
      setRevealed(false);
      setCopied(false);
      setAddress(null);
    }
  }, [open]);

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard?.writeText(address);
    } catch {
      // Keep the UI responsive even where the clipboard is blocked.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <span className={['mcpc-ai', className].filter(Boolean).join(' ')} ref={wrapper}>
      <button
        type="button"
        className="mcpc-ai__badge"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {label}
      </button>

      {open && (
        <span className="mcpc-ai__note" role="dialog" aria-label={label}>
          <span className="mcpc-ai__text">{note}</span>

          {emailMasked && !revealed && (
            <>
              {renderChallenge ? (
                <span className="mcpc-ai__challenge">{renderChallenge(unlock)}</span>
              ) : (
                <button type="button" className="mcpc-ai__show" onClick={unlock}>
                  Show the address
                </button>
              )}
            </>
          )}

          {address && revealed && (
            <span className="mcpc-ai__address">
              <a href={`mailto:${address}`}>{address}</a>
              <button
                type="button"
                className="mcpc-ai__copy"
                aria-label="Copy email address"
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** One connected assistant, as `@mannan/mcp-grant`'s /connections lists it. */
export interface McpConnection {
  id: string;
  /** The name the client registered with. */
  client: string;
  /** Unix seconds. */
  connectedAt: number;
}

export interface McpConnectionsSource {
  /** GET the account's connections. Pass a stable function: it is an effect dependency. */
  load: () => Promise<McpConnection[]>;
  /** Cut one assistant off. It stops working straight away. */
  disconnect: (id: string) => Promise<unknown>;
}


/**
 * The "Connected" section at the foot of the connector panel.
 *
 * WHY IT IS HERE. A connected assistant holds a refresh token that does not
 * expire, and signing out of the site does nothing to it: it never had the
 * session. So the place someone goes to connect an assistant is also where
 * they see what is connected and cut it off - one panel, not two menu lines.
 *
 * Each row: the client's name, Disconnect, and the date it connected, right-
 * aligned. It checks on open ("Checking…"), so what it shows is current.
 */
export function McpConnections({ load, disconnect }: McpConnectionsSource) {
  const [state, setState] = useState<ConnectionsState>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load()
      .then((items) => live && setState({ kind: 'ready', items }))
      .catch(() => live && setState({ kind: 'failed' }));
    return () => {
      live = false;
    };
  }, [load]);

  const cut = async (id: string) => {
    setBusy(id);
    try {
      await disconnect(id);
      setState((was) => (was.kind === 'ready' ? { kind: 'ready', items: was.items.filter((c) => c.id !== id) } : was));
    } catch {
      setState({ kind: 'failed' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mcpc-connections" aria-label="Connected assistants" data-testid="mcp-connections">
      <span className="mcpc-snippet__label">Connected</span>
      {state.kind === 'loading' && <p className="mcpc-connections__note">Checking…</p>}
      {state.kind === 'failed' && <p className="mcpc-connections__note" role="alert">Could not load connections.</p>}
      {state.kind === 'ready' && state.items.length === 0 && (
        <p className="mcpc-connections__note">Nothing connected yet.</p>
      )}
      {state.kind === 'ready' && state.items.length > 0 && (
        <ul className="mcpc-connections__list">
          {state.items.map((c) => (
            <li key={c.id} className="mcpc-connections__row">
              <span className="mcpc-connections__name" title={c.client}>{c.client}</span>
              <button
                type="button"
                className="mcpc-connections__cut"
                disabled={busy !== null}
                onClick={() => void cut(c.id)}
                aria-label={`Disconnect ${c.client}`}
              >
                {busy === c.id ? 'Disconnecting…' : 'Disconnect'}
              </button>
              <span className="mcpc-connections__when">{CONNECTED_ON.format(new Date(c.connectedAt * 1000))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
