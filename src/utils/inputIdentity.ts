import { InputHistoryEntry, StoredInputFile } from '@/types/input';

type IdentifiableInput = Readonly<{
  text: string;
  files: readonly Pick<StoredInputFile, 'kind' | 'name' | 'size'>[];
}>;

/**
 * What makes two Recent entries the same input.
 *
 * Re-running an input used to append a second identical row, so a few repeats
 * of the same paste buried everything else. Entries that match here are one
 * entry moved to now; anything the user changed differs here and becomes its
 * own row, which is what makes an edit feel like a new thing rather than an
 * overwrite.
 *
 * File order is part of the identity because it is part of what was submitted,
 * and the newline and tab guards keep `a\tb` with no files from colliding with
 * `a` plus a file named `b`.
 */
export function inputHistoryIdentity(entry: IdentifiableInput): string {
  const files = entry.files
    .map((file) => [file.kind, file.name, String(file.size)].join('\t'))
    .join('\n');
  return `${entry.text.trim()}\n\u0000\n${files}`;
}

/**
 * The stored entry an incoming input should reuse, or undefined for a new row.
 */
export function findDuplicateEntry(
  existing: readonly InputHistoryEntry[],
  incoming: IdentifiableInput,
): InputHistoryEntry | undefined {
  const identity = inputHistoryIdentity(incoming);
  return existing.find((candidate) => inputHistoryIdentity(candidate) === identity);
}
