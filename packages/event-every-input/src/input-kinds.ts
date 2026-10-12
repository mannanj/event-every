/**
 * What someone hands the Event Every input: everything in the box at once,
 * as Event Every's own site takes it - and nothing else. Pure (no React), so a
 * host app's server can import the same type it validates against.
 *
 *   text + photos  -> read_into_events  (the site's own reading steps: links
 *                                        fetched, a photo's event taking its
 *                                        link from the words beside it)
 *   calendar files -> import_calendar   (spends nothing: parsed, not inferred)
 */
export interface PhotoInput {
  imageBase64: string;
  mimeType: ImageType;
  filename?: string;
}

export interface CalendarFileInput {
  ics: string;
  filename?: string;
}

export interface EventEveryInput {
  text: string;
  images: PhotoInput[];
  calendars: CalendarFileInput[];
}

/** The site's own ceiling on photos in one read. */
export const MAX_PHOTOS = 10;

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

/**
 * Images go to a vision model that bills by pixels, and the text on a flyer or
 * screenshot stays legible well below phone-camera resolution. Measured on real
 * scans: a 2100 px screenshot cost 2,577 prompt tokens, the same image at
 * 1024 px cost 1,381, with no change in what was read. Fewer pixels is also a
 * faster read and a smaller upload. So the long edge is capped before upload.
 */
export const SCAN_IMAGE_MAX_EDGE = 1024;

export function scanDimensions(width: number, height: number, maxEdge = SCAN_IMAGE_MAX_EDGE): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= maxEdge || longest <= 0) return { width, height, scaled: false };
  const ratio = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), scaled: true };
}

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

export class InputRefused extends Error {
  name = 'InputRefused';
}

function base64(bytes: Uint8Array): string {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

/** What a file held in the box is, for the chip that shows it. */
export function fileKind(file: FileLike): 'photo' | 'calendar' | null {
  if (isCalendarFile(file)) return 'calendar';
  if (isImageFile(file)) return 'photo';
  return null;
}

/** A file someone adds to the box. Null when it can be held; else the sentence why not. */
export function refusalFor(file: File): string | null {
  const kind = fileKind(file);
  if (kind === 'calendar') return file.size > MAX_ICS_BYTES ? 'That calendar file is over 1 MB.' : null;
  if (kind === 'photo') return file.size > MAX_IMAGE_BYTES ? 'That photo is over 8 MB.' : null;
  return 'Event Every reads text, links, .ics files and PNG, JPEG or WebP photos.';
}

/**
 * A photo already within the scan ceiling, or a smaller copy of it. Browser
 * only; anywhere it cannot draw (a server, an undecodable file) the photo is
 * passed through untouched. PNG stays PNG so screenshot text keeps its hard
 * edges; camera formats become JPEG.
 */
export async function shrinkForScan(file: File, maxEdge = SCAN_IMAGE_MAX_EDGE): Promise<File> {
  if (!isImageFile(file) || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const target = scanDimensions(bitmap.width, bitmap.height, maxEdge);
    if (!target.scaled) return file;
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, type === 'image/jpeg' ? 0.9 : undefined));
    return blob && blob.size < file.size ? new File([blob], file.name, { type }) : file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/**
 * The box, ready to send: the words, each photo (shrunk to the scan ceiling
 * first, as the site does), each calendar file. Calendar text pasted as words
 * is a calendar file. Throws InputRefused with a sentence for the person.
 */
export async function collectInput(rawText: string, files: readonly File[]): Promise<EventEveryInput | null> {
  let text = rawText.trim();
  const images: PhotoInput[] = [];
  const calendars: CalendarFileInput[] = [];
  if (/^BEGIN:VCALENDAR/i.test(text)) {
    calendars.push({ ics: text });
    text = '';
  }
  for (const file of files) {
    const refused = refusalFor(file);
    if (refused) throw new InputRefused(refused);
    const name = file.name || undefined;
    if (fileKind(file) === 'calendar') {
      calendars.push({ ics: await file.text(), ...(name && { filename: name }) });
      continue;
    }
    const small = await shrinkForScan(file);
    const bytes = new Uint8Array(await small.arrayBuffer());
    images.push({ imageBase64: base64(bytes), mimeType: small.type as ImageType, ...(name && { filename: name }) });
  }
  if (images.length > MAX_PHOTOS) throw new InputRefused(`Up to ${MAX_PHOTOS} photos at a time.`);
  if (!text && images.length === 0 && calendars.length === 0) return null;
  return { text: text.slice(0, MAX_TEXT), images, calendars };
}

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/** A short line for what is being read, shown while it is. */
export function describeInput(input: EventEveryInput): string {
  const parts: string[] = [];
  if (input.images.length) parts.push(input.images.length === 1 ? (input.images[0].filename ?? 'your photo') : plural(input.images.length, 'photo'));
  if (input.text) {
    const urls = findUrls(input.text);
    parts.push(urls.length === 1 && urls[0] === input.text ? new URL(urls[0]).hostname : urls.length ? 'your text and links' : 'your text');
  }
  if (input.calendars.length) parts.push(plural(input.calendars.length, 'calendar file'));
  return `Reading ${parts.join(' and ')}`;
}
