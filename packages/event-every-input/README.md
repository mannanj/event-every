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
      onRead={async (input) => {                        // text | url | ics | image
        const { events } = await api.read(input);       // your server → read_*_into_events
        useThem(events);                                 // throw Error('sentence') to show it
      }}
    />

- **Signed out:** one blue line, "Use Event Every" and **Sign in**.
- **Signed in:** the input, with "Provided by **Event Every**" (rainbow, links
  home) floating bottom-right. Enter reads; Shift+Enter is a new line. Paste
  or drop a file, or pick one: `.ics` → `import_calendar` (free), PNG/JPEG/WebP
  → `read_image_into_events`. A lone link → `read_link_into_events`.
- **`ApplyChip`** — "Apply <value>?" beside a field label, for a value Event
  Every found where the person had already typed something; once applied it
  becomes an undo arrow.

`input-kinds.ts` is pure (no React): the `EventEveryInput` union and
`inputFromText` / `inputFromFile`, for a host's server to share the type.

Hosts: Calendar (`~/Documents/calendar/vendor/event-every-input`).
Tests: `bun test` here.
