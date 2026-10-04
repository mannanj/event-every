import { describe, expect, test } from 'bun:test';
import { describeInput, inputFromFile, inputFromText, InputRefused } from '../src/input-kinds';

describe('inputFromText', () => {
  test('a lone link is a page; words are text; a calendar is a calendar', () => {
    expect(inputFromText('  https://example.com/talk  ')).toEqual({ kind: 'url', url: 'https://example.com/talk' });
    expect(inputFromText('Dinner Friday 7pm https://example.com')).toEqual({ kind: 'text', text: 'Dinner Friday 7pm https://example.com' });
    expect(inputFromText('BEGIN:VCALENDAR\nEND:VCALENDAR')).toMatchObject({ kind: 'ics' });
    expect(inputFromText('   ')).toBeNull();
  });

  test('caps text at Event Every\'s limit', () => {
    const out = inputFromText('a'.repeat(30_000));
    expect(out?.kind === 'text' && out.text.length).toBe(20_000);
  });
});

describe('inputFromFile', () => {
  test('an .ics becomes import_calendar input, named', async () => {
    const f = new File(['BEGIN:VCALENDAR\nEND:VCALENDAR'], 'invite.ics', { type: 'text/calendar' });
    expect(await inputFromFile(f)).toEqual({ kind: 'ics', ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR', filename: 'invite.ics' });
  });

  test('a photo is base64 with its type', async () => {
    const f = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    expect(await inputFromFile(f)).toEqual({ kind: 'image', imageBase64: 'iVBORw==', mimeType: 'image/png', filename: 'p.png' });
  });

  test('refuses what Event Every cannot read, and what is too big', async () => {
    await expect(inputFromFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toBeInstanceOf(InputRefused);
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    await expect(inputFromFile(big)).rejects.toThrow('over 8 MB');
  });
});

test('describeInput names what is being read', () => {
  expect(describeInput({ kind: 'url', url: 'https://lu.ma/x' })).toBe('Reading lu.ma');
  expect(describeInput({ kind: 'ics', ics: 'x', filename: 'a.ics' })).toBe('Importing a.ics');
});
