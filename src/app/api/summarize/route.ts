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
// Lightweight model for fast 2-3 word labels — kept separate from the heavyweight
// parse model (OPENROUTER_MODEL) so it can be swapped without touching extraction.
// NOTE: use the dated id; the bare `mistralai/ministral-8b` alias 404s ("No endpoints found").
const OPENROUTER_SUMMARY_MODEL = process.env.OPENROUTER_SUMMARY_MODEL || 'mistralai/ministral-8b-2512';

const SUMMARY_PROMPT = `You write ultra-short labels for saved calendar inputs.
Reply with ONLY a 2-3 word label in Title Case, words separated by single spaces.
No punctuation, no quotes, no preamble, no explanation.
Example reply: Team Lunch`;

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { cost?: number };
  error?: { message?: string };
}

// Force the model's reply into a clean 2-3 word Title Case label. Handles the
// observed failure modes: run-on PascalCase ("DinnerWithSam"), stray quotes/markdown,
// trailing punctuation, and >3 words.
function cleanLabel(raw: string): string {
  let s = (raw || '').split('\n')[0].trim();
  s = s.replace(/^["'`*]+|["'`*]+$/g, '').replace(/[.,;:!?]+$/g, '').trim();
  // Split camel/Pascal run-ons only when there are no spaces to work with.
  if (!/\s/.test(s) && /[a-z][A-Z]/.test(s)) {
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }
  const words = s.split(/\s+/).filter(Boolean).slice(0, 3);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function POST(request: NextRequest) {
  try {
    const mode = getLlmMode(request);
    const apiKey = getLlmKey(mode);
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    try {
      await ensureCommunityBudget(mode);
    } catch (error) {
      if (error instanceof CommunityLimitError) return communityLimitResponse(error);
      throw error;
    }

    let body: { text?: unknown; eventTitles?: unknown };
    try {
      body = await request.json();
    } catch {
      // Empty/aborted/malformed request (e.g. a tab closed mid-summary) — not worth logging.
      return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
    }
    const text: string = typeof body.text === 'string' ? body.text : '';
    const eventTitles: string[] = Array.isArray(body.eventTitles)
      ? body.eventTitles.filter(
          (t: unknown): t is string => typeof t === 'string' && t.trim().length > 0
        )
      : [];

    if (!text.trim() && eventTitles.length === 0) {
      return NextResponse.json({ error: 'text or eventTitles required' }, { status: 400 });
    }

    const context = [
      text.trim() ? `Input text: ${text.trim().slice(0, 600)}` : 'Input text: (none, image only)',
      eventTitles.length ? `Event titles: ${eventTitles.slice(0, 8).join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'summon',
      },
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
      throw new Error(data.error?.message || 'OpenRouter API error');
    }

    await recordLlmUsage(mode, data.usage);

    const summary = cleanLabel(data.choices?.[0]?.message?.content || '');
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Summarize API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to summarize input';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
