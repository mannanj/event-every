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

  test('NOTHING IS SENT until the account has been asked', () => {
    // The one that matters, and the one this got wrong first time. The upload
    // used to fire unconditionally on the reasoning that the server refuses
    // when the switch is off - which it does, after receiving the photograph.
    // A signed-out visitor's picture left the device on every save.
    //
    // So the status call must come BEFORE the upload call, textually and in
    // execution.
    expect(hook).toContain('readBackupStatus');
    expect(hook.indexOf('readBackupStatus')).toBeLessThan(hook.indexOf('backupEntryFiles('));
    expect(hook).toMatch(/if \(status\?\.enabled !== true\) return;/);
  });

  test('it does not hold up a save', () => {
    // Fired without the caller awaiting it: the save has already succeeded and
    // somebody is waiting to see their events.
    expect(hook).toMatch(/void \(async \(\) => \{/);
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
