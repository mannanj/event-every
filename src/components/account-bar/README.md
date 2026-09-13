# AccountBar

The account controls at the right of an app bar: the MCP mark, and either the
way in or whoever you are. Ported from
`~/Documents/skeletons/signup-cloudflare` (`components/AccountMenu.tsx`,
`components/McpButton.tsx`, and the `.account*` / `.mcp*` rules in
`app/globals.css`).

## Why it is shaped like this

It is meant to be used by more than one app, so **every edge that was
app-specific in the skeleton is a prop here**:

| the skeleton did | this does |
| --- | --- |
| `fetch('/api/auth/signout')` | calls `onSignOut()` |
| `window.location.href = '/'` | nothing - the host decides |
| `<Link href="/signup">` | `signInHref` + optional `renderLink` |
| `MCP_ENDPOINT` from `@/lib/mcp-info` | the `mcp` prop |

It imports nothing from the app around it. No router, no config, no data layer,
no `@/` paths - only React and its own stylesheet. That is what keeps the
boundary real rather than just tidy: you can copy this folder into another app
and it compiles.

`renderLink` is how a Next app hands in `next/link` without this module having
to know Next exists. Omit it and you get a plain `<a>`.

## Styling

A CSS module, not Tailwind. This is the one deliberate exception to the repo's
Tailwind-only rule, and the reason is portability: a component that carries its
own look works in an app that does not use Tailwind. Being a module, it is
scoped and cannot leak.

Every colour reads a variable with a fallback, so a host app can re-skin it
without touching the file:

```css
:root {
  --ab-link: #1a56db;
  --ab-link-hover: #143fa8;
  --ab-ink: #0b0b0b;
  --ab-paper: #ffffff;
  --ab-ground: #f3f3f3;
  --ab-muted: #6f6f6f;
  --ab-rule-strong: #a8a8a8;
  --ab-radius: 9px;
  --ab-font-mono: ui-monospace, SFMono-Regular, monospace;
}
```

Define none of them and you get the skeleton's palette, which is what the
screenshot this was built from shows.

## Use

```tsx
<AccountBar
  signedIn={account.signedIn}          // boolean | undefined
  email={account.email}
  onSignOut={account.signOut}
  busyLabel={account.syncing ? 'syncing' : null}
  hideSignIn={pathname === '/signin'}
  mcp={{ enabled: false, tooltip: 'MCP coming soon' }}
  renderLink={(href, className, children) => (
    <Link href={href} className={className}>{children}</Link>
  )}
/>
```

`signedIn` is three-valued on purpose. `undefined` means the check has not come
back yet, and the bar renders nothing rather than flash the wrong state.

## When a second app needs it

Copy the folder. If a third does, promote it to `~/Documents/account-bar` with a
sync script, the way `~/Documents/mcp-connector` is shared - and add a test that
fails the build when a vendored copy drifts from the source, which is what the
skeleton does for the connector.
