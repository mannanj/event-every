import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, readlink } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_RECORDS = 53_300;
const EXPECTED_DIGEST = 'b942bbc69387c45f23708c70c4aa96c99e6a91666fee4a089e318412f7c6e2d5';
const PROTECTED_ROOTS = ['.claude', 'tasks/task-192.md', 'tasks/task-193.md'];

async function inventory(relative: string): Promise<string[]> {
  const absolute = path.resolve(relative);
  const metadata = await lstat(absolute);
  if (metadata.isDirectory()) {
    const records = [`d\t${relative}`];
    for (const name of await readdir(absolute)) {
      records.push(...await inventory(path.posix.join(relative, name)));
    }
    return records;
  }
  if (metadata.isSymbolicLink()) {
    return [`l\t${relative}\t${await readlink(absolute)}`];
  }
  if (metadata.isFile()) {
    const contents = await readFile(absolute);
    return [`f\t${relative}\t${contents.byteLength}\t${createHash('sha256').update(contents).digest('hex')}`];
  }
  throw new Error(`Unsupported protected path type: ${relative}`);
}

const records = (await Promise.all(PROTECTED_ROOTS.map(inventory))).flat().sort();
const canonical = records.map((record) => `${record}\n`).join('');
const digest = createHash('sha256').update(canonical).digest('hex');
if (records.length !== EXPECTED_RECORDS || digest !== EXPECTED_DIGEST) {
  throw new Error(`Protected inventory drift: records=${records.length}, digest=${digest}`);
}
console.log(`Protected inventory verified: ${records.length} records.`);
