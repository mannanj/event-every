import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * The two settings the MCP bridge adds, kept apart from AccountsEnv because
 * they answer a different question: accounts must keep working when MCP is not
 * configured at all, and a deployment with neither of these is simply an app
 * without a connector.
 */
export interface McpEnv {
  /**
   * Shared with the MCP Worker, which must be given the SAME value. If they
   * differ, every sign-in is refused at /callback with a message that
   * deliberately does not say why, and nothing anywhere explains it.
   */
  MCP_GRANT_SECRET?: string;
  /** Where the MCP Worker lives, for the /callback leg of the bridge. */
  MCP_ORIGIN?: string;
}

export function mcpEnv(): McpEnv {
  return getCloudflareContext().env as CloudflareEnv & McpEnv;
}

/**
 * Configured means both halves are present. Half-configured is worse than off:
 * a bridge that can sign a grant but has nowhere to send it strands people on
 * an error page mid-sign-in.
 */
export function mcpConfigured(env: McpEnv = mcpEnv()): boolean {
  return Boolean(env.MCP_GRANT_SECRET && env.MCP_ORIGIN);
}
