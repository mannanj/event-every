import type { CostOutcome } from './contracts';

export const PROVIDER_BODY_MAX_BYTES = 2 * 1024 * 1024;
const JSON_NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const EXACT_COST = /^(?:0|[1-9][0-9]*)(?:\.([0-9]{1,18}))?$/;
const MAX_NANODOLLARS = BigInt('9007194254740991');
const NANODOLLARS_PER_DOLLAR = BigInt('1000000000');

export function parseCostLexeme(lexeme: string): CostOutcome {
  JSON_NUMBER.lastIndex = 0;
  if (!JSON_NUMBER.test(lexeme) || JSON_NUMBER.lastIndex !== lexeme.length) return { kind: 'malformed' };
  JSON_NUMBER.lastIndex = 0;
  if (lexeme.startsWith('-')) return { kind: 'malformed' };
  const exact = EXACT_COST.exec(lexeme);
  if (!exact) return /[1-9]/.test(lexeme.replace(/[eE].*$/, '')) ? { kind: 'positive-overflow' } : { kind: 'malformed' };
  const [integer, fraction = ''] = lexeme.split('.');
  let nanodollars = BigInt(integer!) * NANODOLLARS_PER_DOLLAR;
  nanodollars += BigInt((fraction.slice(0, 9) || '').padEnd(9, '0'));
  if (fraction.slice(9).split('').some((digit) => digit !== '0')) nanodollars += BigInt(1);
  if (nanodollars > MAX_NANODOLLARS) return { kind: 'positive-overflow' };
  return { kind: 'exact', nanodollars: Number(nanodollars) };
}

class JsonCursor {
  private index = 0;
  private usageSeen = false;
  private costSeen = false;
  costLexeme: string | undefined;
  constructor(private readonly input: string) {}
  parse(): unknown {
    this.space(); const value = this.value(false, false); this.space();
    if (this.index !== this.input.length) throw new Error('trailing JSON');
    return value;
  }
  private space(): void { while ([' ', '\t', '\r', '\n'].includes(this.input[this.index] ?? '')) this.index += 1; }
  private value(inUsage: boolean, isCost: boolean, depth = 0): unknown {
    this.space(); const char = this.input[this.index];
    if (char === '{') return this.object(inUsage, depth);
    if (char === '[') return this.array(depth);
    if (char === '"') return this.string();
    if (char === '-' || (char && /[0-9]/.test(char))) return this.number(isCost);
    for (const literal of ['true', 'false', 'null']) if (this.input.startsWith(literal, this.index)) { this.index += literal.length; return literal === 'true' ? true : literal === 'false' ? false : null; }
    throw new Error('malformed JSON');
  }
  private object(inUsage: boolean, depth: number): Record<string, unknown> {
    const result: Record<string, unknown> = {}; this.index += 1; this.space();
    if (this.input[this.index] === '}') { this.index += 1; return result; }
    for (;;) {
      this.space(); if (this.input[this.index] !== '"') throw new Error('malformed JSON');
      const key = this.string(); this.space(); if (this.input[this.index++] !== ':') throw new Error('malformed JSON');
      const topUsage = depth === 0 && key === 'usage';
      if (topUsage && this.usageSeen) throw new Error('duplicate usage');
      if (topUsage) this.usageSeen = true;
      const usageObject = topUsage;
      const isCost = inUsage && key === 'cost';
      if (isCost && this.costSeen) throw new Error('duplicate usage.cost');
      if (isCost) this.costSeen = true;
      result[key] = this.value(usageObject, isCost, depth + 1); this.space();
      const separator = this.input[this.index++]; if (separator === '}') return result; if (separator !== ',') throw new Error('malformed JSON');
    }
  }
  private array(depth: number): unknown[] { const value: unknown[] = []; this.index += 1; this.space(); if (this.input[this.index] === ']') { this.index += 1; return value; } for (;;) { value.push(this.value(false, false, depth + 1)); this.space(); const separator = this.input[this.index++]; if (separator === ']') return value; if (separator !== ',') throw new Error('malformed JSON'); } }
  private string(): string { const start = this.index++; let escaped = false; for (; this.index < this.input.length; this.index += 1) { const char = this.input[this.index]!; if (!escaped && char === '"') { this.index += 1; try { return JSON.parse(this.input.slice(start, this.index)) as string; } catch { throw new Error('malformed JSON'); } } if (!escaped && char < ' ') throw new Error('malformed JSON'); escaped = !escaped && char === '\\'; if (char !== '\\') escaped = false; } throw new Error('malformed JSON'); }
  private number(isCost: boolean): number { JSON_NUMBER.lastIndex = this.index; const found = JSON_NUMBER.exec(this.input); if (!found) throw new Error('malformed JSON'); this.index = JSON_NUMBER.lastIndex; if (isCost) this.costLexeme = found[0]; return Number(found[0]); }
}

export function parseBoundedProviderJson(input: string): Readonly<{ value: unknown; costLexeme?: string }> {
  if (new TextEncoder().encode(input).byteLength > PROVIDER_BODY_MAX_BYTES) throw new Error('provider body too large');
  const cursor = new JsonCursor(input); return { value: cursor.parse(), costLexeme: cursor.costLexeme };
}

export async function readBoundedProviderJson(body: ReadableStream<Uint8Array>): Promise<Readonly<{ value: unknown; costLexeme?: string }>> {
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > PROVIDER_BODY_MAX_BYTES) { await reader.cancel(); throw new Error('provider body too large'); } chunks.push(next.value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseBoundedProviderJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
