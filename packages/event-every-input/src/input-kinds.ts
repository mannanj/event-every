/**
 * What someone hands the Event Every input, sorted into the four things Event
 * Every's MCP server reads - and nothing else. Pure, no React, so a host app's
 * server can import the same type it validates against.
 *
 *   text   → read_text_into_events   (a pasted invitation, an email)
 *   url    → read_link_into_events   (one link on its own)
 *   ics    → import_calendar         (spends nothing: parsed, not inferred)
 *   image  → read_image_into_events  (a poster, a screenshot)
 */
export type EventEveryInput =
  | { kind: 'text'; text: string }
  | { kind: 'url'; url: string }
  | { kind: 'ics'; ics: string; filename?: string }
  | { kind: 'image'; imageBase64: string; mimeType: ImageType; filename?: string };

/**
 * THE ONE SET OF INPUT RULES. Event Every's full input on its own site
 * (src/components/SmartInput.tsx) and this compact one in other apps both
 * classify files and find links with the functions below, so the two cannot
 * drift on what counts as a photo, a calendar file or a link.
 */

/** Photo types every Event Every reader takes — the MCP image tool's own list. */
export const READABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageType = (typeof READABLE_IMAGE_TYPES)[number];

/** Event Every's own uploader also takes these: it converts them in the browser first. */
export const SITE_IMAGE_TYPES: readonly string[] = [...READABLE_IMAGE_TYPES, 'image/jpg', 'image/heic'];

export const CALENDAR_TYPES: readonly string[] = ['text/calendar', 'application/ics'];

/** Event Every's own ceilings, so a too-big file is refused here and not after an upload. */
export const MAX_TEXT = 20_000;
export const MAX_ICS_BYTES = 1_000_000;
/** Through MCP (base64 in one tool call). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Through the site's own uploader. */
export const MAX_SITE_FILE_BYTES = 10 * 1024 * 1024;

type FileLike = Pick<File, 'name' | 'type'>;

export function isCalendarFile(file: FileLike): boolean {
  return CALENDAR_TYPES.includes(file.type) || file.name.toLowerCase().endsWith('.ics');
}

export function isImageFile(file: FileLike, accepted: readonly string[] = READABLE_IMAGE_TYPES): boolean {
  return accepted.includes(file.type);
}

/** The `accept` attribute for a file picker taking these photos plus calendar files. */
export function acceptAttribute(imageTypes: readonly string[] = READABLE_IMAGE_TYPES): string {
  return [...imageTypes, ...CALENDAR_TYPES, '.ics'].join(',');
}

const URL_PATTERN = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*))/gi;

/** Every distinct link in a piece of text, in order. */
export function findUrls(text: string): string[] {
  return Array.from(new Set(text.match(URL_PATTERN) ?? []));
}

/**
 * Typed or pasted text. A lone http(s) link is a page to read; a calendar
 * file's text is a calendar file even when it arrives through the clipboard.
 */
export function inputFromText(raw: string): EventEveryInput | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^BEGIN:VCALENDAR/i.test(text)) return { kind: 'ics', ics: text };
  const urls = findUrls(text);
  if (urls.length === 1 && urls[0] === text) {
    try {
      return { kind: 'url', url: new URL(text).toString() };
    } catch {
      // Not really a URL: read it as words.
    }
  }
  return { kind: 'text', text: text.slice(0, MAX_TEXT) };
}

export class InputRefused extends Error {
  name = 'InputRefused';
}

function base64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

/** A dropped, pasted or picked file. Throws InputRefused with a sentence for the person. */
export async function inputFromFile(file: File): Promise<EventEveryInput> {
  const name = file.name || undefined;
  if (isCalendarFile(file)) {
    if (file.size > MAX_ICS_BYTES) throw new InputRefused('That calendar file is over 1 MB.');
    return { kind: 'ics', ics: await file.text(), ...(name && { filename: name }) };
  }
  if (isImageFile(file)) {
    if (file.size > MAX_IMAGE_BYTES) throw new InputRefused('That photo is over 8 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { kind: 'image', imageBase64: base64(bytes), mimeType: file.type as ImageType, ...(name && { filename: name }) };
  }
  if (file.type.startsWith('text/')) {
    const read = inputFromText(await file.text());
    if (read) return read;
  }
  throw new InputRefused('Event Every reads text, links, .ics files and PNG, JPEG or WebP photos.');
}

/** A short line for what is being read, shown while it is. */
export function describeInput(input: EventEveryInput): string {
  switch (input.kind) {
    case 'text':
      return 'Reading your text';
    case 'url':
      return `Reading ${new URL(input.url).hostname}`;
    case 'ics':
      return `Importing ${input.filename ?? 'the calendar file'}`;
    case 'image':
      return `Reading ${input.filename ?? 'the photo'}`;
  }
}
