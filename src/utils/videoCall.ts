import { normalizeUrl } from '@/utils/url';

const CALL_HOSTS = [
  /(^|\.)meet\.google\.com$/,
  /(^|\.)zoom\.us$/,
  /(^|\.)teams\.microsoft\.com$/,
  /(^|\.)teams\.live\.com$/,
  /(^|\.)webex\.com$/,
  /(^|\.)whereby\.com$/,
];

/**
 * The meeting a link lands on, if it is one. A personal join link (Luma's
 * /join/, a calendar's "Join" button) redirects to the call itself, and a
 * server fetching Google Meet is bounced to /unsupported with the real room in
 * `ref` - the room is still the answer.
 */
export function videoCallLink(landing: string): string | null {
  let url: URL;
  try {
    url = new URL(landing);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!CALL_HOSTS.some((pattern) => pattern.test(host))) return null;
  if (/(^|\.)meet\.google\.com$/.test(host)) {
    const ref = url.searchParams.get('ref');
    if (ref) return videoCallLink(ref);
    const code = url.pathname.match(/^\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})$/i)?.[1]
      ?? url.searchParams.get('meetingCode');
    return code && /^[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}$/i.test(code) ? `https://meet.google.com/${code.toLowerCase()}` : null;
  }
  if (url.pathname === '/' || url.pathname === '') return null;
  return normalizeUrl(url.toString()) ?? url.toString();
}
