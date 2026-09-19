import { describe, it, expect } from 'bun:test';
import { InputHistoryEntry } from '@/types/input';
import { findDuplicateEntry, inputHistoryIdentity } from '../inputIdentity';

const file = (name: string, size: number, kind: 'image' | 'calendar' = 'image') =>
  ({ id: `f-${name}`, file: new File([], name), kind, name, mimeType: 'image/png', size });

const entry = (
  id: string,
  text: string,
  files: ReturnType<typeof file>[] = [],
  createdAt = 1,
): InputHistoryEntry => ({ id, createdAt, text, files, source: files.length ? 'image' : 'text' });

describe('inputHistoryIdentity', () => {
  it('treats the same text as the same input', () => {
    expect(inputHistoryIdentity(entry('a', 'dinner friday'))).toBe(inputHistoryIdentity(entry('b', 'dinner friday')));
  });

  it('ignores surrounding whitespace, which the input trims anyway', () => {
    expect(inputHistoryIdentity(entry('a', '  dinner friday '))).toBe(inputHistoryIdentity(entry('b', 'dinner friday')));
  });

  it('treats edited text as a different input', () => {
    expect(inputHistoryIdentity(entry('a', 'dinner friday'))).not.toBe(inputHistoryIdentity(entry('b', 'dinner saturday')));
  });

  it('separates text from file names so neither can impersonate the other', () => {
    const textOnly = entry('a', 'image:poster.png\t120');
    const withFile = entry('b', '', [file('poster.png', 120)]);
    expect(inputHistoryIdentity(textOnly)).not.toBe(inputHistoryIdentity(withFile));
  });

  it('distinguishes a different file, and a different size of the same name', () => {
    const base = entry('a', '', [file('poster.png', 120)]);
    expect(inputHistoryIdentity(base)).not.toBe(inputHistoryIdentity(entry('b', '', [file('flyer.png', 120)])));
    expect(inputHistoryIdentity(base)).not.toBe(inputHistoryIdentity(entry('c', '', [file('poster.png', 121)])));
  });

  it('distinguishes the same file attached as a calendar rather than an image', () => {
    expect(inputHistoryIdentity(entry('a', '', [file('x.ics', 9, 'image')])))
      .not.toBe(inputHistoryIdentity(entry('b', '', [file('x.ics', 9, 'calendar')])));
  });

  it('matches the same text and files together', () => {
    const files = [file('poster.png', 120), file('invite.ics', 9, 'calendar')];
    expect(inputHistoryIdentity(entry('a', 'gig', files))).toBe(inputHistoryIdentity(entry('b', 'gig', files)));
  });
});

describe('findDuplicateEntry', () => {
  it('finds the stored entry a re-run should move rather than duplicate', () => {
    const stored = [entry('old', 'dinner friday', [], 100), entry('other', 'brunch', [], 90)];
    expect(findDuplicateEntry(stored, entry('new', 'dinner friday'))?.id).toBe('old');
  });

  it('returns nothing once the input has been edited', () => {
    const stored = [entry('old', 'dinner friday', [], 100)];
    expect(findDuplicateEntry(stored, entry('new', 'dinner friday at 8'))).toBeUndefined();
  });

  it('returns nothing when there is no history yet', () => {
    expect(findDuplicateEntry([], entry('new', 'dinner friday'))).toBeUndefined();
  });

  it('prefers the newest match, which is the one the list shows first', () => {
    // getAllHistory hands back newest first, so the first match is the newest.
    const stored = [entry('newer', 'repeat', [], 200), entry('older', 'repeat', [], 100)];
    expect(findDuplicateEntry(stored, entry('incoming', 'repeat'))?.id).toBe('newer');
  });
});
