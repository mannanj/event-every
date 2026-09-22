/**
 * One source of truth for the connection details shown to a person, shared by
 * the header menu and the /mcp guide so the two can never drift.
 *
 * Falls back to the CURRENTLY DEPLOYED endpoint rather than an aspirational
 * custom domain. mcp.eventevery.com does not resolve - a custom domain needs
 * the Workers Routes zone permission first - so defaulting to it would hand out
 * instructions that fail. Green Light learned this the same way.
 */
export const DEFAULT_MCP_ENDPOINT = 'https://event-every-mcp.mannanteam.workers.dev/mcp';

export function mcpEndpoint(env: { MCP_ORIGIN?: string } = {}): string {
  const origin = env.MCP_ORIGIN?.trim();
  return origin ? `${origin.replace(/\/$/, '')}/mcp` : DEFAULT_MCP_ENDPOINT;
}

export function mcpClaudeCodeCommand(endpoint: string): string {
  return `claude mcp add --transport http event-every ${endpoint}`;
}

export function mcpAgentInstruction(endpoint: string): string {
  return `Connect to the MCP server at ${endpoint} (streamable HTTP) to read and add events on my Event Every account.`;
}

/**
 * What the tools actually do, for the guide page.
 *
 * Kept beside the endpoint rather than in the page, because the honest thing to
 * tell somebody before they connect an assistant to their calendar is what it
 * will be able to see and what it will be able to spend - and that list has to
 * be maintained next to the thing it describes.
 */
export const MCP_TOOLS: readonly { name: string; does: string; costs: string }[] = [
  { name: 'whoami', does: 'Says which account is connected.', costs: 'Nothing.' },
  {
    name: 'list_events',
    does: 'Searches your saved events by date, text or source. Needs a filter, returns at most 50.',
    costs: 'Nothing.',
  },
  { name: 'get_event', does: 'One event, optionally as an .ics file.', costs: 'Nothing.' },
  { name: 'add_events', does: 'Saves events from details the assistant already has.', costs: 'Nothing.' },
  {
    name: 'read_text_into_events',
    does: 'Runs the scanner over text you paste.',
    costs: 'Spends from the daily budget.',
  },
  {
    name: 'read_image_into_events',
    does: 'Reads a poster, ticket or screenshot, from a link or from raw bytes.',
    costs: 'Spends from the daily budget.',
  },
  {
    name: 'read_link_into_events',
    does: 'Fetches a public page and reads the events on it.',
    costs: 'Spends from the daily budget.',
  },
  {
    name: 'import_calendar',
    does: 'Imports an .ics file. Parsed, not inferred.',
    costs: 'Nothing.',
  },
  {
    name: 'request_photo_upload',
    does: 'Hands you a one-time link to send a photo from your own phone. Lasts 15 minutes.',
    costs: 'The scan it triggers spends from the daily budget.',
  },
  { name: 'remove_event', does: 'Removes an event from every device.', costs: 'Nothing.' },
];
