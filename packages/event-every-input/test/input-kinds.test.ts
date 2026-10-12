import { describe, expect, test } from 'bun:test';
import {
  acceptAttribute,
  collectInput,
  describeInput,
  fileKind,
  findUrls,
  InputRefused,
  refusalFor,
  isCalendarFile,
  isImageFile,
  scanDimensions,
  shrinkForScan,
  SITE_IMAGE_TYPES,
} from '../src/input-kinds';

const png = (name = 'shot.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

describe('collectInput: everything in the box, sent together', () => {
  test('a typed link and a pasted screenshot are one input', async () => {
    const input = await collectInput('  https://luma.com/join/g-abc  ', [png()]);
    expect(input).toEqual({
      text: 'https://luma.com/join/g-abc',
      images: [{ imageBase64: 'iVBORw==', mimeType: 'image/png', filename: 'shot.png' }],
      calendars: [],
    });
    expect(describeInput(input!)).toBe('Reading shot.png and luma.com');
  });

  test('words alone, photos alone, an empty box', async () => {
    expect(await collectInput('Dinner Friday 7pm', [])).toEqual({ text: 'Dinner Friday 7pm', images: [], calendars: [] });
    expect(describeInput((await collectInput('', [png('a.png'), png('b.png')]))!)).toBe('Reading 2 photos');
    expect(await collectInput('   ', [])).toBeNull();
  });

  test('a calendar file, picked or pasted as words, is imported, not read', async () => {
    const ics = new File(['BEGIN:VCALENDAR\nEND:VCALENDAR'], 'invite.ics', { type: 'text/calendar' });
    expect(await collectInput('', [ics])).toEqual({ text: '', images: [], calendars: [{ ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR', filename: 'invite.ics' }] });
    expect(await collectInput('BEGIN:VCALENDAR\nEND:VCALENDAR', [])).toMatchObject({ text: '', calendars: [{ ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR' }] });
  });

  test('caps words at Event Every\'s limit', async () => {
    expect((await collectInput('a'.repeat(30_000), []))!.text.length).toBe(20_000);
  });

  test('refuses what Event Every cannot read, and what is too big', async () => {
    await expect(collectInput('', [new File(['x'], 'a.pdf', { type: 'application/pdf' })])).rejects.toBeInstanceOf(InputRefused);
    expect(refusalFor(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }))).toBe('That photo is over 8 MB.');
    expect(refusalFor(png())).toBeNull();
    expect(fileKind(png())).toBe('photo');
  });
});

describe('the shared rules (also used by Event Every\'s own SmartInput)', () => {
  test('a calendar file is known by type or by its .ics name', () => {
    expect(isCalendarFile({ name: 'x.ICS', type: '' })).toBe(true);
    expect(isCalendarFile({ name: 'x', type: 'application/ics' })).toBe(true);
    expect(isCalendarFile({ name: 'x.txt', type: 'text/plain' })).toBe(false);
  });

  test('photos: the readable set by default; the site also takes HEIC', () => {
    expect(isImageFile({ name: 'a.heic', type: 'image/heic' })).toBe(false);
    expect(isImageFile({ name: 'a.heic', type: 'image/heic' }, SITE_IMAGE_TYPES)).toBe(true);
    expect(acceptAttribute()).toBe('image/png,image/jpeg,image/webp,text/calendar,application/ics,.ics');
  });

  test('findUrls returns each link once, in order', () => {
    expect(findUrls('see https://a.com/x and http://b.org, then https://a.com/x')).toEqual(['https://a.com/x', 'http://b.org']);
    expect(findUrls('no links')).toEqual([]);
  });
});

describe('scanDimensions', () => {
  test('caps the long edge at 1024, keeping the shape', () => {
    expect(scanDimensions(2100, 1470)).toEqual({ width: 1024, height: 717, scaled: true });
    expect(scanDimensions(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
  });

  test('outside a browser a photo passes through untouched', async () => {
    const f = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    expect(await shrinkForScan(f)).toBe(f);
  });
});
