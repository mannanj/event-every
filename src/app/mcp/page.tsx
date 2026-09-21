import type { Metadata } from 'next';

import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import McpConnect from '@/components/McpConnect';
import {
  DEFAULT_MCP_ENDPOINT,
  MCP_TOOLS,
  mcpAgentInstruction,
  mcpClaudeCodeCommand,
} from '@/lib/mcp-info';

export const metadata: Metadata = {
  title: 'Connect your assistant - Event Every',
  description: 'Let an AI assistant read and add events on your Event Every account.',
};

/**
 * The guide the MCP Worker's health endpoint points at.
 *
 * It advertised `${APP_ORIGIN}/mcp` before this page existed, so the one link
 * the server hands out 404ed.
 *
 * WHAT THIS PAGE IS FOR is telling somebody what they are agreeing to before
 * they agree to it. Connecting an assistant to a calendar means a third-party
 * client can read the contents of every event on the account, so the table
 * below says which tools can spend money and which can read, in the app's own
 * words rather than in a tool description only a model ever sees.
 */
export default function McpGuidePage() {
  const endpoint = DEFAULT_MCP_ENDPOINT;

  return (
    <main className="min-h-screen rainbow-gradient-bg flex flex-col">
      <SiteHeader />

      <div className="flex-1 w-full max-w-3xl mx-auto px-6 py-16">
        <h1 className="display text-[clamp(1.9rem,5vw,2.6rem)] leading-[1.1] text-black">
          Connect your assistant
        </h1>
        <p className="mt-4 text-sm text-black leading-relaxed">
          Event Every speaks the Model Context Protocol, so an assistant like Claude can
          search your saved events and add new ones for you. You sign in the same way you
          always do, in your own browser, and you can disconnect whenever you like.
        </p>

        <McpConnect
          endpoint={endpoint}
          command={mcpClaudeCodeCommand(endpoint)}
          instruction={mcpAgentInstruction(endpoint)}
        />

        <h2 className="display text-xl text-black mt-12">What it can do</h2>
        <p className="mt-2 text-sm text-gray-600 leading-snug">
          Reading and scanning both work on your account only. Scanning runs the same
          extraction the website does, and spends from the same daily budget, so an
          assistant that scans in a loop can use the day up.
        </p>

        <div className="mt-5 border-2 border-black bg-white offset-shadow">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="px-3 py-2 font-semibold">Tool</th>
                <th className="px-3 py-2 font-semibold">What it does</th>
                <th className="px-3 py-2 font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody>
              {MCP_TOOLS.map((tool) => (
                <tr key={tool.name} className="border-b border-black/15 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs align-top whitespace-nowrap">
                    {tool.name}
                  </td>
                  <td className="px-3 py-2 align-top leading-snug">{tool.does}</td>
                  <td className="px-3 py-2 align-top leading-snug whitespace-nowrap">
                    {tool.costs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="display text-xl text-black mt-12">What it cannot do</h2>
        <ul className="mt-3 text-sm text-black leading-relaxed list-disc pl-5 space-y-1.5">
          <li>See any account but yours. Every call is signed for one account and scoped to it.</li>
          <li>Sign in as you. Connecting sends you to this site to sign in yourself.</li>
          <li>
            Change your attachment backup setting. It can choose to keep or skip the original
            for a single request, and that choice never changes the setting itself.
          </li>
          <li>Spend past the daily budget, which is shared with the website.</li>
        </ul>

        <p className="mt-10 text-xs text-gray-500 leading-snug">
          Your events are encrypted where they are stored, and the server can read them in
          order to answer a tool call. Connecting an assistant means handing that content to
          whichever client you connected. That is the trade, and it is worth knowing before
          you make it.
        </p>
      </div>

      <SiteFooter />
    </main>
  );
}
