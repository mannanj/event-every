import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * The wiring, asserted as wiring.
 *
 * An independent audit of this branch found `backupEntryFiles` and
 * `restoreEntryFiles` fully written, fully unit-tested, and called by nothing.
 * Tests passed and the feature did not exist. These assertions exist so that
 * cannot be true again quietly: they check that the callers are still there.
 *
 * Reading the source is a blunt instrument and it is chosen deliberately. The
 * alternative is a React render harness this repo does not have, and the thing
 * worth catching is not a subtle behavioural regression - it is somebody
 * deleting the call during a refactor and every other test still passing.
 */

const hook = readFileSync('src/hooks/useInputHistory.ts', 'utf8');
const page = readFileSync('src/app/page.tsx', 'utf8');

describe('the upload side is connected', () => {
  test('saving an input-history entry calls the backup', () => {
    expect(hook).toContain('backupEntryFiles');
  });

  test('it is not awaited, so a slow upload cannot hold up a save', () => {
    expect(hook).toMatch(/void backupEntryFiles\(/);
  });

  test('it is skipped when there are no files', () => {
    expect(hook).toMatch(/entry\.files\.length > 0/);
  });
});

describe('the restore side is connected', () => {
  test('the hook exposes a way to fetch files this browser lacks', () => {
    expect(hook).toContain('restoreEntryFiles');
    expect(hook).toContain('ensureFiles');
  });

  test('IndexedDB is preferred: an entry that has files makes no request', () => {
    expect(hook).toMatch(/if \(entry\.files\.length > 0\) return entry;/);
  });

  test('restored files are written back, so the second look is local again', () => {
    expect(hook).toContain('inputStorage.updateHistoryEntry(entry.id, { files })');
  });

  test('loading an entry from history goes through it', () => {
    // The moment the files are actually wanted, which is the only honest place
    // to reach for the backup.
    expect(page).toContain('ensureInputFiles');
    expect(page).toMatch(/await ensureInputFiles\(historyEntry\)/);
  });
});
