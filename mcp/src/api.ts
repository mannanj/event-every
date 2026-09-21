import { signActor } from '../../src/server/mcp/grant';

/**
 * The app is the only thing that reads or writes.
 *
 * Every tool goes through eventevery.com's own endpoints rather than reaching
 * into D1, so an event created over MCP and an event created in a browser run
 * the same code: the same validation, the same envelope encryption, the same
 * tombstone on removal. Two implementations of "save an event" drift, and the
 * one nobody is looking at is the one that ends up wrong.
 *
 * It also means this Worker holds no database binding and no encryption key at
 * all, so a mistake here cannot corrupt anything. The worst it can do is make a
 * bad request.
 */
export interface ToolEnv {
  APP_ORIGIN: string;
  MCP_GRANT_SECRET: string;
}

export interface Caller {
  sub: string;
  email: string;
}

export interface McpEventView {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
  updatedAt: string;
}

export class ApiError extends Error {}

async function call<T>(
  env: ToolEnv,
  path: string,
  init: RequestInit,
  caller: Caller,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  // A fresh actor token per call, good for sixty seconds. It says which account
  // this one request is for and nothing else: it is not a session, and it is
  // not the grant that the browser carried, which is signed for a different
  // purpose entirely and would be refused here.
  headers.set('authorization', `Bearer ${await signActor(caller, env.MCP_GRANT_SECRET)}`);

  const response = await fetch(new URL(path, env.APP_ORIGIN).toString(), { ...init, headers });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `The app answered ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function listEvents(
  env: ToolEnv,
  caller: Caller,
  query: { from?: string; to?: string; limit?: number } = {},
): Promise<McpEventView[]> {
  const path = new URL('/api/mcp/events', env.APP_ORIGIN);
  if (query.from) path.searchParams.set('from', query.from);
  if (query.to) path.searchParams.set('to', query.to);
  if (query.limit) path.searchParams.set('limit', String(query.limit));
  const body = await call<{ events: McpEventView[] }>(
    env,
    `${path.pathname}${path.search}`,
    { method: 'GET' },
    caller,
  );
  return body.events;
}

export async function getEvent(
  env: ToolEnv,
  caller: Caller,
  id: string,
  options: { ics?: boolean } = {},
): Promise<{ event: McpEventView; ics: string | null }> {
  const path = new URL('/api/mcp/events', env.APP_ORIGIN);
  path.searchParams.set('id', id);
  if (options.ics) path.searchParams.set('format', 'ics');
  const body = await call<{ events: McpEventView[]; ics?: string }>(
    env,
    `${path.pathname}${path.search}`,
    { method: 'GET' },
    caller,
  );
  const event = body.events[0];
  if (!event) throw new ApiError('No such event.');
  return { event, ics: body.ics ?? null };
}

export interface NewEvent {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  timezone?: string;
  location?: string;
  description?: string;
  url?: string;
}

export async function saveEvents(
  env: ToolEnv,
  caller: Caller,
  events: readonly NewEvent[],
): Promise<McpEventView[]> {
  const body = await call<{ events: McpEventView[] }>(
    env,
    '/api/mcp/events/save',
    { method: 'POST', body: JSON.stringify({ events }) },
    caller,
  );
  return body.events;
}

export async function removeEvent(
  env: ToolEnv,
  caller: Caller,
  id: string,
): Promise<{ deleted: string; title: string }> {
  return call<{ deleted: string; title: string }>(
    env,
    '/api/mcp/events/remove',
    { method: 'POST', body: JSON.stringify({ id }) },
    caller,
  );
}

export async function scanText(
  env: ToolEnv,
  caller: Caller,
  input: { text: string; timezone?: string },
): Promise<{ events: McpEventView[]; found: number }> {
  return call<{ events: McpEventView[]; found: number }>(
    env,
    '/api/mcp/scan',
    { method: 'POST', body: JSON.stringify(input) },
    caller,
  );
}
