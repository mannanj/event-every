import { NextRequest, NextResponse } from 'next/server';
import { getBudgetStatus, nextResetISO, recordCommunitySpend } from './budget';
import type { BudgetStatus } from './budget';
import type { OpenRouterChatRequest } from '@event-every/scanner/openrouter';

export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

export type LlmMode = 'admin' | 'community';

export const COMMUNITY_LIMIT_CODE = 'community_limit';
export const COMMUNITY_LIMIT_MESSAGE =
  'This app is community sponsored. The usage limits have been hit today.';

// Product requests use the community authority; no request-derived admin path exists.
export function getLlmMode(_request: NextRequest): LlmMode {
  return 'community';
}

export function getLlmKey(_mode: LlmMode): string {
  if (!process.env.OPENROUTER_COMMUNITY_KEY) throw new Error('community_key_unavailable');
  return process.env.OPENROUTER_COMMUNITY_KEY;
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

// Resolves the community-pool decision for a mode WITHOUT throwing, so the
// unified limit authority (src/lib/limits.ts) can compose it alongside the
// per-IP gate. The typed admin branch remains for non-product callers.
export async function getCommunityBudgetStatus(mode: LlmMode): Promise<BudgetStatus | null> {
  if (mode === 'admin') return null;
  return getBudgetStatus();
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

export type OpenRouterMessage = {
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

export class OpenRouterUpstreamError extends Error {
  readonly name = 'OpenRouterUpstreamError';
  readonly code: 'upstream_timeout' | 'upstream_unavailable';

  constructor(
    public readonly status: number,
    public readonly retryable: boolean,
    code: 'upstream_timeout' | 'upstream_unavailable' = 'upstream_unavailable',
  ) {
    super('OpenRouter API error');
    this.code = code;
  }
}

function isScannerRequest(
  options: OpenRouterChatOptions | OpenRouterChatRequest
): options is OpenRouterChatRequest {
  return 'response_format' in options;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A failed cancellation is still status-only; never fall back to reading.
  }
}

// One transport for every OpenRouter call: performs the fetch, maps a community
// 402 to CommunityLimitError, records USD usage once, and returns the parsed
// body for the caller to read tool_calls or content from. Throws on a missing
// key or a non-402 upstream error; callers that need a different status (e.g.
// resolve-timezone's 502) catch and remap.
export async function openRouterChat(
  options: OpenRouterChatOptions | OpenRouterChatRequest,
  auth: LlmCallAuth,
  callOptions: Readonly<{ signal?: AbortSignal }> = {},
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
    body: JSON.stringify(isScannerRequest(options)
      ? options
      : {
        model: options.model,
        messages: options.messages,
        ...(options.tools ? { tools: options.tools } : {}),
        ...(options.tool_choice ? { tool_choice: options.tool_choice } : {}),
        ...(options.max_tokens !== undefined ? { max_tokens: options.max_tokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      }),
    signal: callOptions.signal,
  });

  if (!response.ok) {
    await cancelResponseBody(response);
    const limitError = upstreamCommunityLimit(auth.mode, response.status);
    if (limitError) throw limitError;
    throw new OpenRouterUpstreamError(
      response.status,
      response.status === 408 || response.status === 429 || response.status >= 500,
      response.status === 408 ? 'upstream_timeout' : 'upstream_unavailable',
    );
  }

  let data: OpenRouterResponse;
  try {
    data = (await response.json()) as OpenRouterResponse;
  } catch {
    throw new Error('OpenRouter API error');
  }

  await recordLlmUsage(auth.mode, data.usage);
  return data;
}
