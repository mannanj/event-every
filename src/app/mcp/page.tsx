import type { Metadata } from 'next';
import Link from 'next/link';

import SiteFooter from '@/components/SiteFooter';
import SiteHeader from '@/components/SiteHeader';
import { AiGenerated, McpConnector } from '@/vendor/mcp-connector/connector';
import { maskEmail } from '@/vendor/mcp-connector/mask';
import '@/vendor/mcp-connector/styles.css';
import {
  DEFAULT_MCP_ENDPOINT,
  MCP_TOOLS,
  mcpAgentInstruction,
  mcpClaudeCodeCommand,
} from '@/lib/mcp-info';

export const metadata: Metadata = {
  title: 'Event Every over MCP',
  description: 'Let an AI assistant read and add events on your Event Every account.',
};

/**
 * The guide the connector's Docs link points at, in the shape every app in the
 * family uses (Calendar's and MeetTime's `/mcp`): what it is, how to connect,
 * what the tools are, and what is worth knowing before an assistant writes to
 * it. The layout and its tokens are the shared page's; only the words are
 * Event Every's.
 */
export default function McpGuidePage() {
  const endpoint = DEFAULT_MCP_ENDPOINT;

  return (
    <main className="mcp-guide min-h-screen flex flex-col">
      <SiteHeader />

      <div className="mcp-guide__column flex-1">
        <div className="stack stack--section">
          <div className="stack stack--element">
            {/* The address is not in the markup until someone asks for it. */}
            <AiGenerated emailMasked={maskEmail('hello@mannan.is')} />
            <h1 className="display">Event Every over MCP</h1>
            <p className="lede">
              Event Every speaks the Model Context Protocol, so an assistant like Claude can
              search your saved events and add new ones for you. You sign in the same way you
              always do, in your own browser, and you can disconnect whenever you like from
              Disconnect MCP in your account menu.
            </p>
          </div>

          <div className="stack stack--element">
            <h2 className="title">Connect</h2>
            <p className="lede">
              Add this as a connector in claude.ai, or run the command in Claude Code. You will
              be asked to sign in the first time.
            </p>
            <McpConnector
              endpoint={endpoint}
              claudeCodeCommand={mcpClaudeCodeCommand(endpoint)}
              agentInstruction={mcpAgentInstruction(endpoint)}
              title="MCP Connector"
            />
          </div>

          <div className="stack stack--element">
            <h2 className="title">The tools</h2>
            <p className="lede">
              Reading and scanning both work on your account only. Scanning runs the same
              extraction the website does, and spends from the same daily budget, so an
              assistant that scans in a loop can use the day up.
            </p>
            <dl className="toolist">
              {MCP_TOOLS.map((tool) => (
                <div key={tool.name}>
                  <dt>{tool.name}</dt>
                  <dd>
                    {tool.does}
                    {tool.costs !== 'Nothing.' && ` ${tool.costs}`}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="stack stack--element">
            <h2 className="title">What it cannot do</h2>
            <p className="lede">
              See any account but yours. Every call is signed for one account and scoped to it.
              Sign in as you. Connecting sends you to this site to sign in yourself.
            </p>
            <p className="lede">
              Change your attachment backup setting. It can choose to keep or skip the original
              for a single request, and that choice never changes the setting itself. Nor can it
              spend past the daily budget, which is shared with the website.
            </p>
            <p className="lede">
              Your events are encrypted where they are stored, and the server can read them in
              order to answer a tool call. Connecting an assistant means handing that content to
              whichever client you connected. That is the trade, and it is worth knowing before
              you make it.
            </p>
          </div>

          <Link href="/" className="guide__back">
            ← Back to Event Every
          </Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
