# @mannan/event-every-input

Event Every's input, for another app to put at the top of its own
create-an-event flow. **UI only** — the host signs in to Event Every's MCP
server through its own server (`@mannan/mcp-connector`'s `linked-app.ts`) and
passes `onRead`; this package never sees a token.

    node ~/Documents/event-every/packages/event-every-input/bin/sync.mjs vendor/event-every-input

    import { EventEveryBar, ApplyChip } from '@/vendor/event-every-input';
    import '@/vendor/event-every-input/styles.css';

    <EventEveryBar
      status={signedIn ? 'signed-in' : 'signed-out'}   // 'unknown' renders nothing
      onSignIn={() => openSignInWindow()}
      onRead={async (input) => {                        // { text, images, calendars }
        const { events } = await api.read(input);       // your server → read_into_events + import_calendar
        useThem(events);                                 // throw Error('sentence') to show it
      }}
    />

- **Signed out:** one blue line, "Use Event Every" and **Sign in**.
- **Signed in:** the input, with "Provided by **Event Every**" (rainbow, links
  home) floating bottom-right. As on Event Every's site, everything goes in the
  box first - words, pasted or dropped or picked files (shown as chips) - and
  is sent together on Enter or →. Text and photos → `read_into_events` (the
  site's own reading steps, so a link typed above a screenshot gives the
  event its link); `.ics` → `import_calendar` (free). ⤢ opens it full size.
- **`ApplyChip`** — "Apply <value>?" beside a field label, for a value Event
  Every found where the person had already typed something; once applied it
  becomes an undo arrow.

`input-kinds.ts` has no React: the `EventEveryInput` shape and
`collectInput`, for a host's server to share the type.

Hosts: Calendar (`~/Documents/calendar/vendor/event-every-input`).
Tests: `bun test` here.
