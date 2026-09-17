import { readFileSync } from 'node:fs';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export type Question =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> };
export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number };

function loadKey(): string {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY.trim();
  const line = readFileSync('.env.local', 'utf8').split('\n').find((l) => /^\s*TYPESAFE_API_KEY\s*=/.test(l));
  const value = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error('TYPESAFE_API_KEY not found in env or .env.local');
  return value;
}
const KEY = loadKey();

export const usage = { calls: 0, tokens: 0, ms: 0 };

export async function ask(state: unknown, questions: Record<string, Question>): Promise<Record<string, Answer>> {
  const startedAt = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state, questions }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { answers: Record<string, Answer>; usage: { input_tokens: number; output_tokens: number } };
  usage.calls += 1;
  usage.tokens += body.usage.input_tokens + body.usage.output_tokens;
  usage.ms += Date.now() - startedAt;
  return body.answers;
}

export const noul = (a: Answer | undefined): number => (a?.type === 'noul' ? a.noul : NaN);
