#!/usr/bin/env node
/**
 * Copy this package into a host app: `node bin/sync.mjs <target-dir>`.
 *
 * A copy and not a dependency for the same reason as @mannan/mcp-connector:
 * bun satisfies a `file:` dependency with per-file symlinks that Turbopack
 * will not follow. The copy carries a banner and each host keeps a test that
 * fails when it drifts, so this directory stays the one place to edit.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');
if (!process.argv[2]) {
  console.error('usage: node bin/sync.mjs <target-dir>');
  process.exit(1);
}
const target = resolve(process.argv[2]);

export const FILES = ['index.tsx', 'input-kinds.ts', 'styles.css'];

const banner = (name) =>
  name.endsWith('.css')
    ? `/* GENERATED FROM @mannan/event-every-input/${name} - DO NOT EDIT HERE.\n   Edit ~/Documents/event-every/packages/event-every-input and re-run its bin/sync.mjs */\n`
    : `// GENERATED FROM @mannan/event-every-input/${name} - DO NOT EDIT HERE.\n// Edit ~/Documents/event-every/packages/event-every-input and re-run its bin/sync.mjs\n`;

mkdirSync(target, { recursive: true });
for (const name of FILES) {
  writeFileSync(join(target, name), banner(name) + readFileSync(join(src, name), 'utf8'));
  console.log(`wrote ${join(target, name)}`);
}
