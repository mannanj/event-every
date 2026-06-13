import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/app/api/auth/shared';
import { getBudgetStatus, nextResetISO, recordCommunitySpend } from './budget';

export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

export type LlmMode = 'admin' | 'community';

export const COMMUNITY_LIMIT_CODE = 'community_limit';
export const COMMUNITY_LIMIT_MESSAGE =
  'This app is community sponsored. The usage limits have been hit today.';

// The pattern-lock cookie doubles as the admin signal: admins use the
// unrestricted OpenRouter key and bypass the community budget entirely.
export function getLlmMode(request: NextRequest): LlmMode {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return token && verifyAuthToken(token) ? 'admin' : 'community';
}

export function getLlmKey(mode: LlmMode): string {
  const adminKey = process.env.OPENROUTER_API_KEY || '';
  if (mode === 'admin') return adminKey;
  return process.env.OPENROUTER_COMMUNITY_KEY || adminKey;
}

export class CommunityLimitError extends Error {
  readonly code = COMMUNITY_LIMIT_CODE;

  constructor(public readonly resetAt: string) {
    super(COMMUNITY_LIMIT_MESSAGE);
    this.name = 'CommunityLimitError';
  }
}

export async function ensureCommunityBudget(mode: LlmMode): Promise<void> {
  if (mode === 'admin') return;
  const status = await getBudgetStatus();
  if (status.exhausted) throw new CommunityLimitError(status.resetAt);
}

// OpenRouter returns 402 when the key/account is out of credits — for the
// community key that is the same condition as the tracked budget running out.
export function upstreamCommunityLimit(mode: LlmMode, status: number): CommunityLimitError | null {
  return mode === 'community' && status === 402 ? new CommunityLimitError(nextResetISO()) : null;
}

export function communityLimitResponse(error: CommunityLimitError): NextResponse {
  return NextResponse.json(
    { error: error.message, code: COMMUNITY_LIMIT_CODE, resetAt: error.resetAt },
    { status: 402 }
  );
}

// usage.cost (USD) is included automatically in every OpenRouter response.
export async function recordLlmUsage(mode: LlmMode, usage?: { cost?: number }): Promise<void> {
  if (mode !== 'community') return;
  await recordCommunitySpend(typeof usage?.cost === 'number' ? usage.cost : 0);
}

// Shapes shared by every OpenRouter /chat/completions caller. Promoted here so
// the transport, budget metering, and 402-limit mapping live in one place.
export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OpenRouterToolCall = {
  function: {
    name: string;
    arguments: string;
  };
};

// Covers both extraction styles in use: tool-call callers read `tool_calls`,
// the summarize caller reads `content`.
export type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  usage?: { cost?: number };
  error?: { message?: string };
};

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
};

export interface OpenRouterChatOptions {
  messages: OpenRouterMessage[];
  model: string;
  tools?: ToolDefinition[];
  tool_choice?: { type: 'function'; function: { name: string } };
  max_tokens?: number;
  temperature?: number;
}

export interface LlmCallAuth {
  key: string;
  mode: LlmMode;
}

// One transport for every OpenRouter call: performs the fetch, maps a community
// 402 to CommunityLimitError, records USD usage once, and returns the parsed
// body for the caller to read tool_calls or content from. Throws on a missing
// key or a non-402 upstream error; callers that need a different status (e.g.
// resolve-timezone's 502) catch and remap.
export async function openRouterChat(
  options: OpenRouterChatOptions,
  auth: LlmCallAuth
): Promise<OpenRouterResponse> {
  if (!auth.key) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.key}`,
      'Content-Type': 'application/json',
      'X-Title': 'event-every',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.tool_choice ? { tool_choice: options.tool_choice } : {}),
      ...(options.max_tokens !== undefined ? { max_tokens: options.max_tokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    }),
  });

  const data = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    const limitError = upstreamCommunityLimit(auth.mode, response.status);
    if (limitError) throw limitError;
    throw new Error(data.error?.message || 'OpenRouter API error');
  }

  await recordLlmUsage(auth.mode, data.usage);
  return data;
}
