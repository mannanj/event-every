import { describe, expect, test } from 'bun:test';
import {
  buildShapePrompt,
  extractFirstJsonObject,
  parseShapedOutput,
  type ExtractionContext,
} from '@/services/localModel/extraction';

const context: ExtractionContext = {
  nowISO: '2026-09-14T00:00:00.000Z',
  timeZone: 'America/Toronto',
};

function shape(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

describe('extractFirstJsonObject', () => {
  test('pulls the object out of a fenced block', () => {
    const raw = 'Here you go:\n```json\n{"title":"Show"}\n```\nHope that helps.';
    expect(extractFirstJsonObject(raw)).toBe('{"title":"Show"}');
  });

  test('is not truncated by a brace inside a string', () => {
    const raw = '{"title":"Closing } Night","location":"Hall"}';
    expect(extractFirstJsonObject(raw)).toBe(raw);
  });

  test('survives an escaped quote inside a string', () => {
    const raw = '{"title":"The \\"Big\\" Night"}';
    expect(extractFirstJsonObject(raw)).toBe(raw);
  });

  test('returns null when there is no object', () => {
    expect(extractFirstJsonObject('I could not read the poster.')).toBeNull();
  });

  test('ignores a trailing second object', () => {
    expect(extractFirstJsonObject('{"a":1} {"b":2}')).toBe('{"a":1}');
  });
});

describe('parseShapedOutput accepts good output', () => {
  test('builds a timed event', () => {
    const result = parseShapedOutput(
      shape({
        title: 'Warehouse Show',
        date: '2026-10-02',
        startTime: '20:00',
        endTime: '23:30',
        location: 'Unit 7',
        description: 'Live music',
        allDay: false,
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.title).toBe('Warehouse Show');
    expect(result.event.startDate).toBe('2026-10-02T20:00:00');
    expect(result.event.endDate).toBe('2026-10-02T23:30:00');
    expect(result.event.allDay).toBe(false);
    expect(result.event.timezone).toBe('America/Toronto');
  });

  test('treats a missing start time as all day', () => {
    const result = parseShapedOutput(
      shape({ title: 'Open Studio', date: '2026-10-02', startTime: null, allDay: false }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.allDay).toBe(true);
    expect(result.event.startDate).toBe('2026-10-02T00:00:00');
  });

  test('ignores allDay:true when the model also gave a start time', () => {
    // Observed in a real Safari run of Qwen3-VL-2B: correct 20:00 start time
    // alongside allDay:true, which previously moved the event to midnight.
    const result = parseShapedOutput(
      shape({
        title: 'Midnight Signal',
        date: '2026-10-02',
        startTime: '20:00',
        endTime: '23:30',
        allDay: true,
      }),
      context,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.allDay).toBe(false);
    expect(result.event.startDate).toBe('2026-10-02T20:00:00');
    expect(result.event.endDate).toBe('2026-10-02T23:30:00');
    expect(result.event.confidence).toBeLessThan(0.6);
  });

  test('keeps a dateless event at lower confidence rather than dropping it', () => {
    const result = parseShapedOutput(shape({ title: 'Undated Flyer', date: null }), context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.startDate).toBeUndefined();
    expect(result.event.confidence).toBeLessThan(0.5);
  });

  test('parses output wrapped in prose and a fence', () => {
    const raw = `Sure! Here is the event:\n\`\`\`json\n${shape({
      title: 'Night Market',
      date: '2026-11-20',
      startTime: '18:00',
    })}\n\`\`\``;
    const result = parseShapedOutput(raw, context);
    expect(result.ok).toBe(true);
  });
});

describe('parseShapedOutput rejects well-formed but wrong output', () => {
  test('rejects a date that does not exist', () => {
    const result = parseShapedOutput(
      shape({ title: 'Ghost Show', date: '2026-02-30', startTime: '19:00' }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('not a real date');
  });

  test('rejects a year far outside the plausible range', () => {
    const result = parseShapedOutput(
      shape({ title: 'Time Traveller', date: '1999-05-01', startTime: '19:00' }),
      context,
    );
    expect(result.ok).toBe(false);
  });

  test('rejects an end time that precedes the start', () => {
    const result = parseShapedOutput(
      shape({ title: 'Backwards', date: '2026-10-02', startTime: '22:00', endTime: '21:00' }),
      context,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('not after the start');
  });

  test('rejects a malformed time', () => {
    const result = parseShapedOutput(
      shape({ title: 'Vague', date: '2026-10-02', startTime: '8pm' }),
      context,
    );
    expect(result.ok).toBe(false);
  });

  test('rejects an empty title', () => {
    const result = parseShapedOutput(shape({ title: '   ', date: '2026-10-02' }), context);
    expect(result.ok).toBe(false);
  });

  test('rejects prose with no JSON at all', () => {
    const result = parseShapedOutput('I cannot find an event in this image.', context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('No JSON object');
  });

  test('rejects truncated JSON', () => {
    const result = parseShapedOutput('{"title":"Cut off","date":"2026-10-0', context);
    expect(result.ok).toBe(false);
  });
});

describe('buildShapePrompt', () => {
  test('anchors the model to today so relative dates resolve', () => {
    const prompt = buildShapePrompt('Doors at 8pm on Friday.', context);
    expect(prompt).toContain('2026-09-14');
    expect(prompt).toContain('Doors at 8pm on Friday.');
  });

  test('tells the model not to invent a date', () => {
    expect(buildShapePrompt('notes', context)).toContain('Never invent a date');
  });
});
