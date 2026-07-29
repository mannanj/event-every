import { describe, expect, test } from 'bun:test';
import {
  hydrateInputFiles,
  persistInputFiles,
} from '@/services/inputStorage';
import type { StoredInputFile } from '@/types/input';

function storedFile(overrides: Partial<StoredInputFile> = {}): StoredInputFile {
  return {
    id: 'file-1',
    file: new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'flyer.png', {
      type: 'image/png',
    }),
    kind: 'image',
    name: 'flyer.png',
    mimeType: 'image/png',
    size: 4,
    ...overrides,
  };
}

describe('input storage file DTO', () => {
  test('round-trips bytes and metadata without persisting File objects', async () => {
    const persisted = await persistInputFiles([
      storedFile({ eventCount: 3 }),
    ]);

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty('file');
    expect(persisted[0]?.bytes).toBeInstanceOf(ArrayBuffer);

    const [hydrated] = hydrateInputFiles(persisted);
    expect(hydrated?.file).toBeInstanceOf(File);
    expect(hydrated?.file.name).toBe('flyer.png');
    expect(hydrated?.file.type).toBe('image/png');
    expect(hydrated?.kind).toBe('image');
    expect(hydrated?.eventCount).toBe(3);
    expect([...new Uint8Array(await hydrated!.file.arrayBuffer())]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  test('hydrates legacy Blob records without changing public metadata', async () => {
    const [hydrated] = hydrateInputFiles([
      {
        id: 'legacy-1',
        file: new Blob(['BEGIN:VCALENDAR'], { type: 'text/calendar' }),
        kind: 'calendar',
        name: 'legacy.ics',
        mimeType: 'text/calendar',
        size: 15,
        eventCount: 1,
      },
    ]);

    expect(hydrated?.file).toBeInstanceOf(File);
    expect(hydrated?.file.name).toBe('legacy.ics');
    expect(hydrated?.file.type).toBe('text/calendar');
    expect(hydrated?.eventCount).toBe(1);
    expect(await hydrated?.file.text()).toBe('BEGIN:VCALENDAR');
  });
});
