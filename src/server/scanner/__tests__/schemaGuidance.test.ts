import { describe, expect, test } from 'bun:test';
import { OPENROUTER_OBSERVATION_JSON_SCHEMA, WireProviderScanObservationSchema } from '../../../../vendor/event-every-scanner/dist/openrouter/wire-schema.js';
import { withGuidedSchema } from '@/server/scanner/schemaGuidance';

function pointUnions(node: unknown, found: unknown[][] = []): unknown[][] {
  if (Array.isArray(node)) { node.forEach((n) => pointUnions(n, found)); return found; }
  if (!node || typeof node !== 'object') return found;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'oneOf' && Array.isArray(value) && value.some((b) => (b as { properties?: { kind?: { const?: string } } }).properties?.kind?.const === 'date')) found.push(value);
    pointUnions(value, found);
  }
  return found;
}

const kindOf = (b: unknown) => (b as { properties: { kind: { const: string } } }).properties.kind.const;

describe('withGuidedSchema', () => {
  const request = { response_format: { type: 'json_schema', json_schema: { name: 'x', strict: true, schema: OPENROUTER_OBSERVATION_JSON_SCHEMA } } };
  const guided = withGuidedSchema(request);
  const schema = guided.response_format.json_schema.schema;

  test('every temporal point union lists the timed kinds before the date-only kind, each described', () => {
    const unions = pointUnions(schema);
    expect(unions.length).toBeGreaterThan(0);
    for (const union of unions) {
      expect(union.map(kindOf)).toEqual(['floating', 'zoned', 'partial', 'date']);
      for (const branch of union) expect(typeof (branch as { description?: unknown }).description).toBe('string');
    }
  });

  test('the vendored schema itself is untouched and still lists date first', () => {
    const unions = pointUnions(OPENROUTER_OBSERVATION_JSON_SCHEMA);
    expect(unions[0]!.map(kindOf)[0]).toBe('date');
    expect(request.response_format.json_schema.schema).toBe(OPENROUTER_OBSERVATION_JSON_SCHEMA);
  });

  test('a completion shaped by the guided schema still parses with the Scanner schema', () => {
    const observation = {
      candidates: [{
        sourceUid: null,
        title: { value: 'Team standup', confidence: 0.9, evidence: [] },
        description: { value: null, confidence: 0, evidence: [] },
        location: { value: null, confidence: 0, evidence: [] },
        url: { value: null, confidence: 0, evidence: [] },
        temporal: { value: { start: { kind: 'floating', date: { year: 2026, month: 3, day: 13 }, time: { hour: 9, minute: 30, second: 0 } }, end: null, duration: null, allDay: false }, confidence: 0.9, evidence: [] },
        recurrence: { value: null, confidence: 0, evidence: [] },
        issues: [],
      }],
      issues: [],
    };
    expect(WireProviderScanObservationSchema.safeParse(observation).success).toBe(true);
  });

  test('a request without a schema passes through by identity', () => {
    const bare = { messages: [] };
    expect(withGuidedSchema(bare)).toBe(bare);
  });
});
