/**
 * The sister apps Event Every can sign in to, as the connector's "Add other
 * MCPs" section names them. Client-safe: names and links only. Where each app's
 * MCP server is lives with the server code (src/server/linked-apps/service.ts).
 */
export type LinkedAppId = 'calendar';

export interface LinkedAppInfo {
  id: LinkedAppId;
  name: string;
  /** The app's own site. */
  href: string;
}

export const LINKED_APPS: Record<LinkedAppId, LinkedAppInfo> = {
  calendar: { id: 'calendar', name: 'Calendar', href: 'https://mannan.is/calendar' },
};

export const LINKED_APP_LIST: LinkedAppInfo[] = Object.values(LINKED_APPS);

export function isLinkedAppId(value: string): value is LinkedAppId {
  return Object.hasOwn(LINKED_APPS, value);
}

/** Where the sign-in window lands: it tells the others and closes itself. */
export const LINKED_DONE_PATH = '/linked-apps/done';
