import { announceLinkedAppsChanged } from '@/lib/linked-apps-broadcast';
import { isLinkedAppId, LINKED_APP_LIST, LINKED_DONE_PATH } from '@/lib/linked-apps';
import type { McpAppsSource } from '@/vendor/mcp-connector/connector';

/**
 * The browser's side of "Add other MCPs". Module-level functions, so the
 * object handed to the connector has one identity for the life of the page:
 * `load` is an effect dependency in the shared package.
 */
async function load(): Promise<{ appId: string; connectedAt: number }[]> {
  const response = await fetch('/api/linked-apps', { credentials: 'same-origin' });
  const body = (await response.json().catch(() => null)) as
    | { links?: { appId: string; connectedAt: number }[]; error?: string }
    | null;
  if (!response.ok) throw new Error(body?.error ?? 'could not load sign-ins');
  return body?.links ?? [];
}

function connectUrl(appId: string, returnTo: string): string {
  return `/api/linked-apps/connect?app=${encodeURIComponent(appId)}&returnTo=${encodeURIComponent(returnTo)}`;
}

function signIn(appId: string): void {
  if (!isLinkedAppId(appId)) return;
  // A small window, so the page keeps its state. A blocked pop-up falls back to
  // leaving the page and coming back to it.
  const popup = window.open(connectUrl(appId, LINKED_DONE_PATH), 'ee-linked-signin', 'popup,width=520,height=720');
  if (!popup) window.location.assign(connectUrl(appId, window.location.pathname + window.location.search));
}

async function signOut(appId: string): Promise<void> {
  if (!isLinkedAppId(appId)) return;
  const response = await fetch(`/api/linked-apps?app=${encodeURIComponent(appId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'sign out failed');
  }
  announceLinkedAppsChanged();
}

export const linkedAppsSource: McpAppsSource = {
  apps: LINKED_APP_LIST.map(({ id, name, href }) => ({ id, name, href })),
  load,
  signIn,
  signOut,
};
