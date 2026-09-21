import { createEvent, type EventAttributes } from 'ics';

import type { McpEventView } from '@/server/mcp/events';

/**
 * One event as a calendar file, for handing to an assistant.
 *
 * Built here rather than reusing services/exporter.ts because that one's job is
 * to trigger a download in a browser: it ends in an anchor click. This is the
 * same library and the same product id, just stopping at the text.
 *
 * It is the one thing an assistant can usefully carry away as a file. A tool
 * result can hold an embedded resource, so the client gets something it can
 * save or attach, rather than a wall of calendar syntax in a chat message.
 */

function parts(iso: string): [number, number, number, number, number] {
  const date = new Date(iso);
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  ];
}

export function eventToIcs(event: McpEventView): string | null {
  const attributes: EventAttributes = {
    // Written in UTC, so the file means the same instant wherever it is opened.
    // The stored instants are already absolute; a floating local time here
    // would move the event by the reader's offset.
    start: parts(event.start),
    startInputType: 'utc',
    end: parts(event.end),
    endInputType: 'utc',
    title: event.title,
    productId: 'event-every/ics',
    uid: event.id,
    ...(event.location ? { location: event.location } : {}),
    ...(event.description ? { description: event.description } : {}),
    ...(event.url ? { url: event.url } : {}),
  };

  const { error, value } = createEvent(attributes);
  if (error || !value) {
    // A url the library rejects is the common cause, and an event without one
    // is far better than no file at all.
    const retry = createEvent({ ...attributes, url: undefined });
    return retry.error || !retry.value ? null : retry.value;
  }
  return value;
}
