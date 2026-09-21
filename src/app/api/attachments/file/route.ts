import { getAttachment } from '@/server/accounts/attachments';
import { attachmentJson, requireAttachmentSession } from '@/server/accounts/attachment-session';

export const dynamic = 'force-dynamic';

/**
 * The only media types this endpoint will name.
 *
 * An allowlist rather than a denylist: the set of types a browser will execute
 * grows, and a list of the ones it will not is a list that goes out of date
 * silently. These are the types the app itself produces - the image kinds the
 * scanner accepts, plus the calendar and text originals.
 */
const SERVABLE = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/calendar',
  'text/plain',
]);

function servableType(stored: string): string {
  return SERVABLE.has(stored) ? stored : 'application/octet-stream';
}

/**
 * One backed-up file's bytes.
 *
 * THE SECOND LAYER. Nothing calls this when IndexedDB already holds the file.
 * It exists for the new laptop, the cleared browser, and the history entry that
 * aged out of one device but not another.
 *
 * Returned as the raw bytes with the stored media type, so an <img> can point
 * straight at it. The filename is not put in a `Content-Disposition` header: it
 * is the person's own words, and this response can be cached by things that
 * should not be reading it. The browser already knows the name from the list.
 */
export async function GET(request: Request) {
  const gate = await requireAttachmentSession(request);
  if (!gate.ok) return gate.response;
  const { db, bucket, dek, account } = gate.context;

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return attachmentJson({ error: 'Which file?' }, 400);

  try {
    const file = await getAttachment(db, bucket, dek, account.id, id);
    // 404 whether it never existed, belongs to somebody else, or the object is
    // gone. None of those are worth telling apart to a caller.
    if (!file) return attachmentJson({ error: 'No such file.' }, 404);

    return new Response(file.bytes as unknown as BodyInit, {
      headers: {
        // The stored type, but only from a list this app is willing to serve.
        // The upload route takes the media type from the client, so echoing it
        // back means an uploader chooses what the browser executes on this
        // origin - and text/html here is a stored cross-site scripting hole
        // against eventevery.com itself, session cookie and all. Anything
        // unrecognised is served as bytes to download rather than content to
        // render.
        'Content-Type': servableType(file.mimeType),
        'Content-Length': String(file.bytes.byteLength),
        // Belt as well as braces: never let a sniffer overrule the line above.
        'X-Content-Type-Options': 'nosniff',
        // An attachment even when the type is renderable, so nothing from this
        // endpoint is ever treated as a document in this origin. The restore
        // path reads the bytes; it does not navigate to them.
        'Content-Disposition': 'attachment',
        // Private, not public: this is one person's file and a shared cache
        // must never hold it.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('attachment fetch failed', error instanceof Error ? error.message : 'unknown');
    return attachmentJson({ error: 'Could not read that file.' }, 500);
  }
}
