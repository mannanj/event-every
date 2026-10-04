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

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

const IMAGE_TYPES: ImageType[] = ['image/png', 'image/jpeg', 'image/webp'];

/** Event Every's own ceilings, so a too-big file is refused here and not after an upload. */
export const MAX_TEXT = 20_000;
export const MAX_ICS_BYTES = 1_000_000;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Typed or pasted text. A lone http(s) link is a page to read; a calendar
 * file's text is a calendar file even when it arrives through the clipboard.
 */
export function inputFromText(raw: string): EventEveryInput | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^BEGIN:VCALENDAR/i.test(text)) return { kind: 'ics', ics: text };
  if (/^https?:\/\/\S+$/i.test(text)) {
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
  const isIcs = /\.ics$/i.test(file.name) || file.type === 'text/calendar';
  if (isIcs) {
    if (file.size > MAX_ICS_BYTES) throw new InputRefused('That calendar file is over 1 MB.');
    return { kind: 'ics', ics: await file.text(), ...(name && { filename: name }) };
  }
  if ((IMAGE_TYPES as string[]).includes(file.type)) {
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
