# Plan 011: Unify the OpenRouter HTTP client into one `openRouterChat` in `src/lib/llm.ts`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 400bf32..HEAD -- src/lib/llm.ts src/services/parser.ts src/app/api/parse src/app/api/summarize src/app/api/detect-urls src/app/api/resolve-timezone`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (At planning time this diff was
> empty — the files are exactly as excerpted below.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — this touches all FOUR live LLM code paths (parse, summarize, detect-urls, resolve-timezone). The new tests in Step 1/6 are the risk mitigation; do not skip them.
- **Depends on**: plans/003-unit-test-baseline-for-critical-paths.md (SOFT). 003 stands up the `bun test` runner this plan's tests run under. If 003 has not landed, **this plan adds the `"test": "bun test src"` script itself** (Step 1) and proceeds — see the dependency note in Step 1.
- **Category**: tech-debt
- **Planned at**: commit `400bf32`, 2026-06-13

## Why this matters

The OpenRouter HTTP contract — the `fetch` to `${OPENROUTER_BASE_URL}/chat/completions` with the `Authorization`/`Content-Type`/`X-Title` headers, the `!response.ok` → `upstreamCommunityLimit` check, the `recordLlmUsage(mode, data.usage)` accounting call, and the `data.choices[0].message…` extraction — is copy-pasted across **four** call sites. `src/services/parser.ts:124` `callOpenRouter()` is the clean version; the three route handlers (`resolve-timezone`, `summarize`, `detect-urls`) re-implement the same sequence inline. The same `OPENROUTER_BASE_URL` const is declared four times, and the `OpenRouterResponse`/`OpenRouterToolCall`/`ToolDefinition` types are defined in three places.

This duplication has **already drifted in the load-bearing part — error handling**: parser and detect-urls *throw* on a missing tool call; resolve-timezone returns a `502` JSON instead; summarize reads `message.content` (not a tool call) and *throws* on a bad upstream. The budget/usage metering (`recordLlmUsage`) is the thing that caps real USD spend on the community key, so a future divergence here is a money bug, not a style nit. `src/lib/llm.ts` is already the authority for auth, mode, budget, and usage (`getLlmKey`, `getLlmMode`, `ensureCommunityBudget`, `upstreamCommunityLimit`, `recordLlmUsage`) — the transport belongs there too. After this lands there is exactly one place that talks HTTP to OpenRouter, it has direct test coverage (today it has none), and each route keeps its own model id and its own response mapping. Estimated net reduction ~120–160 lines.

## Current state

The transport is duplicated across these files. Excerpts are the live code at `400bf32`.

### `src/lib/llm.ts` — the LLM authority (this is where the new client goes)

Owns auth/mode/budget/usage. It does **not** currently own transport, the base URL, or the OpenRouter response types. Relevant existing exports (full file is ~57 lines — read it):

```ts
// src/lib/llm.ts:5
export type LlmMode = 'admin' | 'community';
```
```ts
// src/lib/llm.ts:41-43  — maps a 402 from the community key to the budget-exhausted error
export function upstreamCommunityLimit(mode: LlmMode, status: number): CommunityLimitError | null {
  return mode === 'community' && status === 402 ? new CommunityLimitError(nextResetISO()) : null;
}
```
```ts
// src/lib/llm.ts:52-56  — records USD spend for community mode; usage.cost ships in every OpenRouter response
export async function recordLlmUsage(mode: LlmMode, usage?: { cost?: number }): Promise<void> {
  if (mode !== 'community') return;
  await recordCommunitySpend(typeof usage?.cost === 'number' ? usage.cost : 0);
}
```

`src/lib/llm.ts` currently imports only from `next/server`, `@/app/api/auth/shared`, and `./budget`. It does **not** import from `@/services/parser` — keep it that way (parser depends on llm, not vice-versa; reversing it creates a cycle).

### `src/services/parser.ts` — has the GOOD abstraction to promote and then delete locally

```ts
// src/services/parser.ts:1-10
import { ParsedEvent, BatchParsedEvents, ClientContext } from '@/types/event';
import { LlmMode, recordLlmUsage, upstreamCommunityLimit } from '@/lib/llm';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-large-2512';

export interface LlmCallAuth {
  key: string;
  mode: LlmMode;
}
```
```ts
// src/services/parser.ts:12-40  — the three types to move into lib/llm.ts
type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenRouterToolCall = {
  function: {
    name: string;
    arguments: string;
  };
};

type OpenRouterResponse = {
  choices: Array<{
    message: {
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
  usage?: {
    cost?: number;
  };
  error?: {
    message?: string;
  };
};
```
```ts
// src/services/parser.ts:124-174  — the function to replace with a call to openRouterChat
async function callOpenRouter(
  content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>,
  tools: ToolDefinition[],
  toolName: string,
  auth: LlmCallAuth
): Promise<OpenRouterToolCall> {
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
      model: OPENROUTER_MODEL,
      messages: [ { role: 'user', content } ],
      tools,
      tool_choice: { type: 'function', function: { name: toolName } },
    }),
  });

  const data = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    const limitError = upstreamCommunityLimit(auth.mode, response.status);
    if (limitError) throw limitError;
    const errorMessage = data.error?.message || 'OpenRouter API error';
    throw new Error(errorMessage);
  }

  await recordLlmUsage(auth.mode, data.usage);

  const toolCalls = data.choices?.[0]?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    throw new Error('No tool calls found in OpenRouter response');
  }

  return toolCalls[0];
}
```
```ts
// src/services/parser.ts:258  — the only call site (inside parseEventsBatch)
    const toolCall = await callOpenRouter(content, tools, 'extract_events', auth);
```
Note the message shape parser sends: a single `{ role: 'user', content }` where `content` is the text/image-part array. The new client must support that (a `messages` array whose entries' `content` may be a string OR a content-part array). `OPENROUTER_MODEL` (line 5) is parser's own model env id — **keep it local to parser**; do not move it to lib/llm.

### `src/app/api/resolve-timezone/route.ts` — inline dup; returns 502 on failure (do NOT regress)

```ts
// resolve-timezone/route.ts:1-13
import { NextRequest, NextResponse } from 'next/server';
import {
  CommunityLimitError,
  communityLimitResponse,
  ensureCommunityBudget,
  getLlmKey,
  getLlmMode,
  recordLlmUsage,
  upstreamCommunityLimit,
} from '@/lib/llm';

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const TZ_RESOLVE_MODEL = process.env.OPENROUTER_TZ_MODEL || 'deepseek/deepseek-chat-v3-0324';
```
```ts
// resolve-timezone/route.ts:50-111  — inline transport + error/usage + tool-call extraction
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'event-every' },
      body: JSON.stringify({
        model: TZ_RESOLVE_MODEL,
        messages: [ { role: 'user', content: `Given the following event context… ${contextParts} …` } ],
        tools: [ /* resolve_timezone function tool */ ],
        tool_choice: { type: 'function', function: { name: 'resolve_timezone' } },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const limitError = upstreamCommunityLimit(mode, response.status);
      if (limitError) return communityLimitResponse(limitError);
      return NextResponse.json({ error: data.error?.message || 'LLM API error' }, { status: 502 });   // ← 502, not throw
    }

    await recordLlmUsage(mode, data.usage);

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json({ error: 'No timezone resolution from LLM' }, { status: 502 });          // ← 502, not throw
    }

    const result = JSON.parse(toolCalls[0].function.arguments);
    return NextResponse.json({ timezone: result.timezone, confidence: result.confidence ?? 0.5 });
```
This route has NO local `OpenRouterResponse` interface (it uses an untyped `data`). It uses **return-502** for both upstream-not-ok and missing-tool-call, distinct from parser/detect-urls which **throw**. `TZ_RESOLVE_MODEL` (line 13) stays local.

### `src/app/api/summarize/route.ts` — inline dup; reads `message.content`, not a tool call (do NOT regress)

```ts
// summarize/route.ts:12-16
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
// …NOTE: use the dated id; the bare `mistralai/ministral-8b` alias 404s ("No endpoints found").
const OPENROUTER_SUMMARY_MODEL = process.env.OPENROUTER_SUMMARY_MODEL || 'mistralai/ministral-8b-2512';
```
```ts
// summarize/route.ts:23-27  — a DIFFERENT, content-shaped local OpenRouterResponse
interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { cost?: number };
  error?: { message?: string };
}
```
```ts
// summarize/route.ts:83-112  — inline transport; note max_tokens + temperature + system message + content read
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'event-every' },
      body: JSON.stringify({
        model: OPENROUTER_SUMMARY_MODEL,
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: context },
        ],
        max_tokens: 16,
        temperature: 0.2,
      }),
    });

    const data = (await response.json()) as OpenRouterResponse;

    if (!response.ok) {
      const limitError = upstreamCommunityLimit(mode, response.status);
      if (limitError) return communityLimitResponse(limitError);
      throw new Error(data.error?.message || 'OpenRouter API error');                 // ← throw
    }

    await recordLlmUsage(mode, data.usage);

    const summary = cleanLabel(data.choices?.[0]?.message?.content || '');             // ← reads message.content
    return NextResponse.json({ summary });
```
Summarize is the only caller that: sends a `system` + `user` message pair, passes `max_tokens`/`temperature`, sends NO `tools`/`tool_choice`, and reads `choices[0].message.content` instead of a tool call. The new client must support all of that. `OPENROUTER_SUMMARY_MODEL` (line 16, with its 404 comment) stays local.

### `src/app/api/detect-urls/route.ts` — inline dup; throws on missing tool call

```ts
// detect-urls/route.ts:12-13
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-large-2512';
```
```ts
// detect-urls/route.ts:31-59  — local ToolDefinition + OpenRouterToolCall + OpenRouterResponse (duplicates parser's)
type ToolDefinition = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown>; }; };
type OpenRouterToolCall = { function: { name: string; arguments: string; }; };
interface OpenRouterResponse {
  choices: Array<{ message: { tool_calls?: OpenRouterToolCall[]; }; }>;
  usage?: { cost?: number };
  error?: { message?: string };
}
```
```ts
// detect-urls/route.ts:115-156  — inline transport; throws on missing tool call
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'event-every' },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [ { role: 'user', content: `${URL_DETECTION_PROMPT}\n\nExtract URLs from this text:\n${text}` } ],
        tools,
        tool_choice: { type: 'function', function: { name: 'extract_urls' } },
      }),
    });

    const data = (await response.json()) as OpenRouterResponse;

    if (!response.ok) {
      const limitError = upstreamCommunityLimit(mode, response.status);
      if (limitError) return communityLimitResponse(limitError);
      const errorMessage = data.error?.message || 'OpenRouter API error';
      throw new Error(errorMessage);                                                   // ← throw
    }

    await recordLlmUsage(mode, data.usage);

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      throw new Error('No tool calls found in OpenRouter response');                   // ← throw
    }

    const result = JSON.parse(toolCalls[0].function.arguments) as URLDetectionResult;
    return NextResponse.json(result);
```
`OPENROUTER_MODEL` here (line 13) is the same env id as parser's, by design (both use the heavyweight parse model) — keep it local to the route.

### Drift summary across the four sites (the thing being unified)

| Concern | parser.ts | resolve-timezone | summarize | detect-urls |
|---|---|---|---|---|
| Base URL const | line 4 | line 12 | line 12 | line 12 |
| `!response.ok` (non-402) | **throw** | **return 502** | **throw** | **throw** |
| Result extraction | `tool_calls[0]` | `tool_calls[0]` | `message.content` | `tool_calls[0]` |
| Missing tool call | **throw** | **return 502** | n/a (content) | **throw** |
| `tools`/`tool_choice` | yes | yes | **no** | yes |
| `max_tokens`/`temperature` | no | no | **yes** | no |
| Local response type | yes (12-40) | **none** | content-shaped (23-27) | tool-shaped (47-59) |

The unification **must preserve every cell of the "result extraction", "throw vs 502", and request-option columns** — `openRouterChat` unifies *transport + 402-limit + usage*, and **returns the raw upstream pieces so each caller keeps its own mapping**. It does NOT decide throw-vs-502 and does NOT pick tool-call-vs-content; the callers do.

### Repo conventions that apply

- TypeScript strict, **no `any`**. tsconfig `paths: { "@/*": ["./src/*"] }`.
- Module direction: `parser.ts` and the routes import FROM `@/lib/llm`. Never the reverse. (lib/llm must not import parser → would cycle.)
- Comment policy (CLAUDE.md): minimal; only "why" comments (e.g. the 402/usage rationale already in llm.ts is the right density).
- Test convention (from plan 003): `import { describe, expect, test, mock, beforeEach } from 'bun:test'`; tests live under `src/**/__tests__/*.test.ts`; run with `bun test src` (bare `bun test` wrongly picks up the Playwright e2e specs — always pass `src`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun run type-check` | exit 0, no errors |
| Unit tests | `bun run test` | all pass (this runs `bun test src`) |
| One test file | `bun test src/lib/__tests__/llm.test.ts` | all pass |
| Build | `bun run build` | exit 0, "Compiled successfully" |

Do NOT run `bun run lint` (broken at this commit — plans/004 owns it). Do NOT run bare `bun test` without `src` (picks up `e2e/*.spec.ts` and fails).

## Scope

**In scope** (the only files you may modify or create):
- `src/lib/llm.ts` — add `OPENROUTER_BASE_URL`, the three OpenRouter types, and `openRouterChat`.
- `src/services/parser.ts` — delete local base-URL const + 3 types + `callOpenRouter`; import and call `openRouterChat`. Keep `OPENROUTER_MODEL` + `LlmCallAuth` local.
- `src/app/api/resolve-timezone/route.ts` — replace inline transport with `openRouterChat`; keep the 502 mappings and `TZ_RESOLVE_MODEL`.
- `src/app/api/summarize/route.ts` — replace inline transport with `openRouterChat`; keep `max_tokens`/`temperature`, the content read, the `throw`, `cleanLabel`, and `OPENROUTER_SUMMARY_MODEL`.
- `src/app/api/detect-urls/route.ts` — replace inline transport with `openRouterChat`; delete local 3 types; keep the throws and `OPENROUTER_MODEL`.
- `src/lib/__tests__/llm.test.ts` (create) — the new client's tests.
- `package.json` — ONLY if plan 003 has not landed: add `"test": "bun test src"` (see Step 1).

**Out of scope** (do NOT touch, even though they look related):
- `src/app/api/parse/route.ts` — it calls `parseEventsBatch`, not the transport directly; its behavior is unchanged by this refactor. Do not edit it.
- The **prompts, tool JSON-schemas, model env-var ids, response shapes, and status codes** of any route — preserve them byte-for-byte. This plan moves *transport*, not behavior.
- **URL normalization / cleaning of detected URLs** — explicitly owned by a future plan 012. Do not "improve" `detect-urls`' output here; only swap its transport.
- `src/lib/budget.ts`, `src/lib/ratelimit.ts`, `auth/shared.ts` — untouched.
- The Playwright e2e suite and `playwright.config.ts`.

## Git workflow

- Branch: `advisor/011-unify-openrouter-client` (create it before any edit).
- **One commit** for the whole plan. Message style matches the repo (`git log` shows `Task NNN: …` / `Plan NNN: …` subjects), e.g.:
  `Plan 011: unify OpenRouter transport into lib/llm openRouterChat`
  End the message with the repo trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`
- Do NOT push and do NOT open a PR unless the operator explicitly says so.

## Steps

Order is: add the new client + tests (Step 1–2, codebase still compiles), migrate parser (Step 3), migrate each route (Step 4–6), then delete-verify + full gates (Step 7). The old code stays until each caller is switched, so the build is green between steps.

### Step 1: Ensure the test runner exists (soft dependency on plan 003)

Run `grep -n '"test"' package.json`.
- If it prints a line containing `"test": "bun test src"` → plan 003 has landed; **do nothing** to `package.json`.
- If it prints **nothing** → plan 003 has not landed. Add exactly one script to the `"scripts"` block of `package.json`: `"test": "bun test src"`. (This is the same script plan 003's Step 1 defines; adding it here is idempotent and safe — if 003 lands later it sets the identical value.) Do not add any other script and do not add any test dependency (bun's runner is built in).

**Verify**: `grep -n '"test": "bun test src"' package.json` → exactly one match. `bun run type-check` → exit 0.

### Step 2: Add `OPENROUTER_BASE_URL`, the types, and `openRouterChat` to `src/lib/llm.ts`

Append to `src/lib/llm.ts` (do not remove or alter anything already there). Add the base-URL const near the top imports region and the rest below the existing exports. Produce this shape:

```ts
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

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
```

Design notes you must honor:
- `openRouterChat` returns the **whole parsed body**, not `tool_calls[0]`. This is deliberate: summarize needs `message.content`, the others need `tool_calls[0]`, and resolve-timezone needs to distinguish "missing tool call" itself (to return 502). The "let the caller pick" extraction is what preserves all four behaviors.
- The conditional spreads (`...(options.tools ? …)`) keep the request body byte-identical to today for each caller: a tool caller emits `tools`+`tool_choice` and no `max_tokens`; summarize emits `max_tokens`+`temperature` and no `tools`. Do not always-emit a key with `undefined` — that would change the JSON.
- `upstreamCommunityLimit`, `recordLlmUsage`, `nextResetISO`, `CommunityLimitError` are already in this file — reuse them; do not re-import or re-declare.

**Verify**: `bun run type-check` → exit 0. `grep -n 'export async function openRouterChat' src/lib/llm.ts` → one match. `grep -n 'export const OPENROUTER_BASE_URL' src/lib/llm.ts` → one match.

### Step 3: Migrate `src/services/parser.ts` to `openRouterChat`

1. Change the import on line 2 from
   `import { LlmMode, recordLlmUsage, upstreamCommunityLimit } from '@/lib/llm';`
   to import what parser still needs plus the new client and types:
   `import { LlmMode, openRouterChat, OpenRouterToolCall, ToolDefinition } from '@/lib/llm';`
   (parser no longer references `recordLlmUsage`/`upstreamCommunityLimit` directly — they move inside `openRouterChat`. Keep `LlmMode` — it's used by the local `LlmCallAuth`.)
2. **Delete** the local base-URL const (line 4: `const OPENROUTER_BASE_URL = …`). **Keep** `OPENROUTER_MODEL` (line 5).
3. **Delete** the three local type declarations `ToolDefinition`, `OpenRouterToolCall`, `OpenRouterResponse` (lines 12-40) — they now come from `@/lib/llm`. **Keep** the `LlmCallAuth` interface (lines 7-10) local and exported (the routes that import parser do not need it, but `parseEventsBatch` does; leaving it exported is fine).
4. **Replace** the entire `callOpenRouter` function (lines 124-174) with a thin local helper that calls `openRouterChat` and reproduces parser's old "throw on missing tool call" behavior:

```ts
async function callOpenRouter(
  content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>,
  tools: ToolDefinition[],
  toolName: string,
  auth: LlmCallAuth
): Promise<OpenRouterToolCall> {
  const data = await openRouterChat(
    {
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content }],
      tools,
      tool_choice: { type: 'function', function: { name: toolName } },
    },
    auth
  );

  const toolCalls = data.choices?.[0]?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    throw new Error('No tool calls found in OpenRouter response');
  }
  return toolCalls[0];
}
```
   The call site at line 258 (`const toolCall = await callOpenRouter(content, tools, 'extract_events', auth);`) is unchanged. (You may inline `openRouterChat` directly into `parseEventsBatch` and drop the helper, but keeping the helper minimizes the diff and preserves the existing call site — prefer that.)

**Verify**: `bun run type-check` → exit 0. `grep -n 'OPENROUTER_BASE_URL' src/services/parser.ts` → no matches. `grep -n 'type OpenRouterResponse' src/services/parser.ts` → no matches.

### Step 4: Migrate `src/app/api/detect-urls/route.ts`

1. Extend the `@/lib/llm` import to add `openRouterChat`, `OpenRouterToolCall`, `ToolDefinition`. You may drop `recordLlmUsage` and `upstreamCommunityLimit` from the import (they're now inside the client) **only after** removing their inline uses below; keep `CommunityLimitError`, `communityLimitResponse`, `ensureCommunityBudget`, `getLlmKey`, `getLlmMode`.
2. **Delete** the local base-URL const (line 12). **Keep** `OPENROUTER_MODEL` (line 13) and the `URL_DETECTION_PROMPT`, `URLDetectionResult`, and `tools` definitions.
3. **Delete** the three local types `ToolDefinition`, `OpenRouterToolCall`, `OpenRouterResponse` (lines 31-59) — import `ToolDefinition`/`OpenRouterToolCall` from `@/lib/llm` (the response type isn't needed locally).
4. **Replace** the fetch block + error handling + usage + extraction (lines 115-154) with:

```ts
    let data;
    try {
      data = await openRouterChat(
        {
          model: OPENROUTER_MODEL,
          messages: [
            {
              role: 'user',
              content: `${URL_DETECTION_PROMPT}\n\nExtract URLs from this text:\n${text}`,
            },
          ],
          tools,
          tool_choice: { type: 'function', function: { name: 'extract_urls' } },
        },
        { key: apiKey, mode }
      );
    } catch (error) {
      if (error instanceof CommunityLimitError) return communityLimitResponse(error);
      throw error;
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      throw new Error('No tool calls found in OpenRouter response');
    }

    const result = JSON.parse(toolCalls[0].function.arguments) as URLDetectionResult;
    return NextResponse.json(result);
```
   Why the try/catch: `openRouterChat` *throws* `CommunityLimitError` on a community 402, but this route's contract is to return `communityLimitResponse(...)` (HTTP 402 JSON), so catch that one type and map it; rethrow everything else into the route's outer `catch` (lines 157-168), which already returns a 500 — preserving today's behavior (a non-402 upstream error ends as the route's 500). The "No tool calls" throw is preserved exactly.

**Verify**: `bun run type-check` → exit 0. `grep -n 'OPENROUTER_BASE_URL\|fetch(' src/app/api/detect-urls/route.ts` → no matches.

### Step 5: Migrate `src/app/api/resolve-timezone/route.ts` (preserve the 502 mappings)

1. Extend the `@/lib/llm` import to add `openRouterChat`. You may drop `recordLlmUsage` and `upstreamCommunityLimit` after removing their inline uses; keep `CommunityLimitError`, `communityLimitResponse`, `ensureCommunityBudget`, `getLlmKey`, `getLlmMode`.
2. **Delete** the local base-URL const (line 12). **Keep** `TZ_RESOLVE_MODEL` (line 13) and the `contextParts` builder and the `tools` array (the `resolve_timezone` tool, lines 65-81).
3. **Replace** the fetch + error/usage + extraction (lines 50-111) with — note this route returns **502**, not throw, for both the upstream-not-ok and the missing-tool-call cases:

```ts
    let data;
    try {
      data = await openRouterChat(
        {
          model: TZ_RESOLVE_MODEL,
          messages: [
            {
              role: 'user',
              content: `Given the following event context, determine the IANA timezone identifier.\n\n${contextParts}\n\nReturn the most likely IANA timezone (e.g. "America/New_York", "UTC", "Europe/London").`,
            },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'resolve_timezone',
                description: 'Return the resolved IANA timezone',
                parameters: {
                  type: 'object',
                  properties: {
                    timezone: { type: 'string', description: 'IANA timezone identifier' },
                    confidence: { type: 'number', description: 'Confidence 0-1', minimum: 0, maximum: 1 },
                  },
                  required: ['timezone', 'confidence'],
                },
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'resolve_timezone' } },
        },
        { key: apiKey, mode }
      );
    } catch (error) {
      if (error instanceof CommunityLimitError) return communityLimitResponse(error);
      // Preserve this route's contract: a non-limit upstream failure is a 502, not a 500.
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'LLM API error' },
        { status: 502 }
      );
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return NextResponse.json({ error: 'No timezone resolution from LLM' }, { status: 502 });
    }

    const result = JSON.parse(toolCalls[0].function.arguments);
    return NextResponse.json({
      timezone: result.timezone,
      confidence: result.confidence ?? 0.5,
    });
```
   Note the subtlety: previously a non-402 `!response.ok` returned `502` directly; now `openRouterChat` throws on that path, so the `catch` maps a non-`CommunityLimitError` to `502` — **same status, same `data.error?.message`-style body**. Keep the existing tool/prompt JSON exactly as it is in the file (the excerpt abbreviates the prompt with `…` in the Current-state section but the real tool block is reproduced in full above; if your file's tool block differs, use the file's, not this excerpt). The outer route `catch` (lines 112-118) still returns 500 for anything before the LLM call (e.g. a `request.json()` failure) — leave it.

**Verify**: `bun run type-check` → exit 0. `grep -n 'OPENROUTER_BASE_URL\|fetch(' src/app/api/resolve-timezone/route.ts` → no matches. `grep -c 'status: 502' src/app/api/resolve-timezone/route.ts` → 2 (both 502 paths preserved).

### Step 6: Migrate `src/app/api/summarize/route.ts` (preserve content read + max_tokens/temperature + throw)

1. Extend the `@/lib/llm` import to add `openRouterChat`. Drop `recordLlmUsage`/`upstreamCommunityLimit` after removing inline uses; keep the rest.
2. **Delete** the local base-URL const (line 12). **Keep** `OPENROUTER_SUMMARY_MODEL` (line 16) **and its 404 comment**, the `SUMMARY_PROMPT`, and `cleanLabel`.
3. **Delete** the local `interface OpenRouterResponse` (lines 23-27) — it's now imported (or simply not needed locally since you read fields off the returned object).
4. **Replace** the fetch + error/usage + content read (lines 83-112) with — note: NO `tools`, YES `max_tokens`/`temperature`, reads `content`, and **throws** on upstream error (rethrown into the route's outer 500 catch):

```ts
    let data;
    try {
      data = await openRouterChat(
        {
          model: OPENROUTER_SUMMARY_MODEL,
          messages: [
            { role: 'system', content: SUMMARY_PROMPT },
            { role: 'user', content: context },
          ],
          max_tokens: 16,
          temperature: 0.2,
        },
        { key: apiKey, mode }
      );
    } catch (error) {
      if (error instanceof CommunityLimitError) return communityLimitResponse(error);
      throw error;
    }

    const summary = cleanLabel(data.choices?.[0]?.message?.content || '');
    return NextResponse.json({ summary });
```
   The catch maps the community 402 to `communityLimitResponse` (today's behavior) and rethrows other upstream errors into the existing outer `catch` (lines 113-117), which returns the route's 500 with `error.message` — matching today (where the inline `throw new Error(...)` landed in that same outer catch). `max_tokens: 16` and `temperature: 0.2` must remain. The `content` read and `cleanLabel` must remain.

**Verify**: `bun run type-check` → exit 0. `grep -n 'OPENROUTER_BASE_URL\|fetch(' src/app/api/summarize/route.ts` → no matches. `grep -n 'max_tokens: 16' src/app/api/summarize/route.ts` → one match. `grep -n 'message?.content\|message\.content' src/app/api/summarize/route.ts` → one match.

### Step 7: Write the unit tests for `openRouterChat`, then run all gates

Create `src/lib/__tests__/llm.test.ts`. Use the bun:test pattern from plan 003. The function under test calls global `fetch`, `recordLlmUsage` (→ `recordCommunitySpend` → Redis), and `upstreamCommunityLimit` (→ `nextResetISO`). To keep the test offline and deterministic, **mock `./budget`** (so `recordCommunitySpend`/`getBudgetStatus`/`nextResetISO` don't touch Redis) and **mock global `fetch`**. Mock the module *before* importing `@/lib/llm` (bun's `mock.module` + dynamic `import()`, exactly as plan 003 Step 4 does for `@upstash/redis`).

Target shape:

```ts
import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Keep budget metering offline: stub the Redis-backed module llm.ts imports.
const recordCommunitySpend = mock(async (_cost: number) => {});
mock.module('@/lib/budget', () => ({
  recordCommunitySpend,
  getBudgetStatus: mock(async () => ({ exhausted: false, resetAt: '2026-01-01T00:00:00.000Z', remainingUsd: 5 })),
  nextResetISO: () => '2026-01-01T00:00:00.000Z',
  DAILY_BUDGET_USD: 5,
}));

const { openRouterChat, CommunityLimitError } = await import('@/lib/llm');

const ADMIN = { key: 'sk-test', mode: 'admin' as const };
const COMMUNITY = { key: 'sk-test', mode: 'community' as const };

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = mock(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

beforeEach(() => {
  recordCommunitySpend.mockClear();
});
```

Cases (at least these; each an explicit assertion, no `any`):

1. **Success returning a tool call** — `mockFetch(200, { choices: [{ message: { tool_calls: [{ function: { name: 'extract_events', arguments: '{"ok":true}' } }] } }], usage: { cost: 0.003 } })`; call `openRouterChat({ model:'m', messages:[{role:'user',content:'x'}], tools:[…], tool_choice:{…} }, ADMIN)`; assert the returned `data.choices[0].message.tool_calls[0].function.name === 'extract_events'`.
2. **Success returning content** — `mockFetch(200, { choices: [{ message: { content: 'Team Lunch' } }], usage: { cost: 0.0001 } })`; assert `data.choices[0].message.content === 'Team Lunch'`. (Proves the summarize path's shape is supported.)
3. **Records usage for community mode** — success body with `usage:{cost:0.5}`, call with `COMMUNITY`; assert `recordCommunitySpend` was called once with `0.5` (`expect(recordCommunitySpend).toHaveBeenCalledTimes(1)` and `…toHaveBeenCalledWith(0.5)`).
4. **Does NOT record usage for admin mode** — success body, call with `ADMIN`; assert `recordCommunitySpend` not called (`toHaveBeenCalledTimes(0)`). (Pins the `mode !== 'community'` guard in `recordLlmUsage`.)
5. **Community 402 → throws `CommunityLimitError`** — `mockFetch(402, { error: { message: 'out of credits' } })`, call with `COMMUNITY`; `await expect(openRouterChat(opts, COMMUNITY)).rejects.toBeInstanceOf(CommunityLimitError)`. Also assert `recordCommunitySpend` was NOT called (usage isn't recorded on the error path).
6. **Admin 402 → throws plain Error, not CommunityLimitError** — `mockFetch(402, { error: { message: 'nope' } })` with `ADMIN`; assert it rejects, and the rejection is NOT a `CommunityLimitError` (`upstreamCommunityLimit` only fires for community). Assert the message is `'nope'`.
7. **Non-402 upstream error → throws Error with upstream message** — `mockFetch(500, { error: { message: 'boom' } })` with `ADMIN`; `await expect(...).rejects.toThrow('boom')`.
8. **Missing key → throws before fetch** — call `openRouterChat(opts, { key: '', mode: 'admin' })`; assert it rejects with `/OPENROUTER_API_KEY/` and that `fetch` was never called (set `globalThis.fetch = mock(...)` and assert `toHaveBeenCalledTimes(0)`).
9. **Request body shape** (guards the byte-identical-body requirement) — capture the `fetch` arguments via the mock; for a tool call assert the JSON body has `tools` and `tool_choice` and NO `max_tokens`; for a `max_tokens`/`temperature` call assert the body has `max_tokens`/`temperature` and NO `tools`. (This is the test that catches an accidental always-emit-undefined regression in Step 2.)

If `mock.module('@/lib/budget', …)` cannot intercept llm.ts's `import … from './budget'` after two attempts, STOP per the conditions below (do not refactor llm.ts to make it testable).

**Verify**: `bun test src/lib/__tests__/llm.test.ts` → all pass (≥ 9 tests). Then run the full gates:
- `bun run test` → all pass (the new file plus any from plan 003 if present).
- `bun run type-check` → exit 0.
- `bun run build` → exit 0, "Compiled successfully".

## Test plan

- New file `src/lib/__tests__/llm.test.ts`, structural pattern = plan 003's `budget.test.ts` (mock a Redis-backed dependency module, then dynamic-import the unit under test).
- Cases: the nine above — success/tool-call, success/content, community usage recorded, admin usage NOT recorded, community-402→CommunityLimitError, admin-402→plain Error, non-402→Error, missing-key→pre-fetch throw, request-body-shape (tools vs max_tokens). These cover every behavior `openRouterChat` centralizes (transport, 402-mapping, usage, body construction).
- Why this is the right coverage: the four routes' *own* mappings (502 vs throw vs content) are thin wrappers verified by `type-check` + `build` and the existing Playwright e2e suite (which mocks the LLM endpoints); the risky shared core is `openRouterChat`, and it had zero tests before this plan.
- Verification: `bun run test` → all green, including ≥ 9 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run type-check` exits 0.
- [ ] `bun run build` exits 0 ("Compiled successfully").
- [ ] `bun run test` exits 0; `src/lib/__tests__/llm.test.ts` exists with ≥ 9 passing tests.
- [ ] `grep -rn "OPENROUTER_BASE_URL" src/` shows it **only** in `src/lib/llm.ts` (one definition; zero in parser.ts and the three routes).
- [ ] `grep -rn "fetch(\`\${OPENROUTER_BASE_URL}/chat/completions\`)" src/` returns **no** matches (the inline transport is gone). Equivalently `grep -rn "chat/completions" src/services/parser.ts src/app/api/summarize src/app/api/detect-urls src/app/api/resolve-timezone` → no matches.
- [ ] `grep -rn "export async function openRouterChat" src/lib/llm.ts` → exactly one match.
- [ ] `grep -c "status: 502" src/app/api/resolve-timezone/route.ts` → 2 (both 502 fallbacks preserved).
- [ ] `grep -n "max_tokens: 16" src/app/api/summarize/route.ts` → 1 (summarize options preserved); `grep -n "message?.content\|message\.content" src/app/api/summarize/route.ts` → 1 (content read preserved).
- [ ] No files outside the in-scope list are modified (`git status` shows only the in-scope files + the new test, plus `plans/README.md`, plus `package.json` only if Step 1 added the script).
- [ ] `plans/README.md` status row for 011 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `400bf32`, or the code at the locations in "Current state" doesn't match the excerpts (the codebase drifted; re-plan rather than guess).
- `mock.module('@/lib/budget', …)` cannot intercept llm.ts's `./budget` import after two attempts — report it; do not restructure `llm.ts` to be testable (that would be a separate plan).
- `bun test src` mis-resolves the `@/*` path alias — report; do not add a bundler/jest config.
- Making any route compile or any test pass appears to require changing a **prompt, a tool JSON-schema, a model env id, a response shape, or a status code** — that's a behavior change and is out of scope; report what you hit.
- The fix appears to require editing `src/app/api/parse/route.ts` or any file outside the In-scope list.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **There is now exactly one place** that talks HTTP to OpenRouter: `openRouterChat` in `src/lib/llm.ts`. Any new LLM route must call it rather than re-`fetch`-ing `/chat/completions`. A reviewer should reject a new inline OpenRouter fetch on sight.
- **Behavior preserved deliberately, not by accident**: resolve-timezone still returns `502` (not `500`/throw) on an upstream failure; summarize still reads `message.content` with `max_tokens:16`/`temperature:0.2` and still `throw`s (→ outer 500); parser and detect-urls still `throw` on a missing tool call. These divergences are now expressed in each *caller's* mapping, not in copies of the transport. If you intend to unify the *error responses* too (e.g. make every route return the same status on upstream failure), that's a follow-up decision — this plan intentionally did not change any caller's status codes.
- **What a PR reviewer should scrutinize**: that the request body emitted by `openRouterChat` is byte-identical per caller (the conditional spreads in Step 2; covered by test case 9) — an accidental `max_tokens: undefined` on the tool path or a missing `tools` key would silently change upstream behavior.
- **Explicitly deferred — not in this plan**: normalizing/cleaning the URLs returned by `detect-urls` is **owned by plan 012**; do not fold URL normalization into this transport unification. Sweeping the routes' leaked `error.message` in 500 bodies is tracked in `plans/README.md`'s "not planned" list (page-refactor wave), not here.
- **Interaction with plan 003**: if 003 lands after this, its `package.json` `"test"` script value is identical to what Step 1 may have added — no conflict. The `llm.test.ts` file added here is additive to 003's suite.
