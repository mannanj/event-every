#!/usr/bin/env node
/**
 * Put a real file in the real bucket, take it out, and delete it.
 *
 * WHY THIS EXISTS. Attachment backup shipped with 33 tests and had never
 * written a byte to R2. Every server test used `memoryBucket`, a Map with three
 * methods, and every client test stubbed `fetch`. Those prove the logic and say
 * nothing about whether R2 `put`/`get`/`delete` behave the way the code assumes
 * - which is exactly the gap between "written" and "run" that this project has
 * been bitten by twice already.
 *
 * It runs against production, as the person would: a session cookie, the real
 * routes, the real bucket, the real encryption.
 *
 *   APP_ORIGIN=https://eventevery.com SESSION_ID=<seeded session> node verify-attachments-live.mjs
 *
 * Exits non-zero on failure. Leaves nothing behind.
 */

const APP = (process.env.APP_ORIGIN || 'https://eventevery.com').replace(/\/$/, '');
const SESSION = process.env.SESSION_ID || '';
const COOKIE = process.env.SESSION_COOKIE || 'ee_session';

if (!SESSION) {
  console.error('SESSION_ID is required (seed a session row first)');
  process.exit(2);
}

let failures = 0;
const ok = (label, detail = '') => console.log(`  ok    ${label.padEnd(46)} ${detail}`);
const fail = (label, detail) => { failures += 1; console.log(`  FAIL  ${label.padEnd(46)} ${detail}`); };
const check = (label, expected, actual) =>
  String(expected) === String(actual) ? ok(label, String(actual)) : fail(label, `expected ${expected}, got ${actual}`);
const expect_boolean = (label, value) =>
  typeof value === 'boolean' ? ok(label, String(value)) : fail(label, `not a boolean: ${value}`);

const headers = { cookie: `${COOKIE}=${SESSION}`, 'Content-Type': 'application/json' };
const api = (path, init = {}) => fetch(`${APP}${path}`, { ...init, headers: { ...headers, ...init.headers } });

// A 1x1 PNG. Small, real, and recognisable byte for byte on the way back.
const PIXEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PIXEL = Buffer.from(PIXEL_B64, 'base64');
const FILE_ID = `live-verify-${Date.now()}`;
const ENTRY_ID = `live-entry-${Date.now()}`;
const SECRET_NAME = 'termination-letter.png';

console.log(`Attachment backup, against the real bucket\n  ${APP}\n`);

// 1. The switch ──────────────────────────────────────────────────────────────
console.log('1. the account setting');
/** Whatever the account had before this ran, so cleanup can put it back. */
let SWITCH_WAS_ON = false;
{
  const before = await (await api('/api/attachments')).json();
  SWITCH_WAS_ON = before.enabled === true;
  // Not an assertion about the account: a real account may legitimately have it
  // on already. What is asserted is that the value is readable and boolean.
  expect_boolean('the switch reads back', before.enabled);

  const turned = await api('/api/attachments/settings', {
    method: 'POST',
    body: JSON.stringify({ enabled: true }),
  });
  check('turns on', 200, turned.status);
  check('and reports it', true, (await turned.json()).enabled);
}

// 2. Refusing to upload when it is off ───────────────────────────────────────
console.log('\n2. the switch is enforced server-side');
{
  await api('/api/attachments/settings', { method: 'POST', body: JSON.stringify({ enabled: false }) });
  const refused = await api('/api/attachments/upload', {
    method: 'POST',
    body: JSON.stringify({
      entryId: ENTRY_ID,
      files: [{ id: `${FILE_ID}-nope`, name: 'x.png', mimeType: 'image/png', kind: 'image', data: PIXEL_B64 }],
    }),
  });
  // A stale tab that never heard the switch was turned off must not be able to
  // upload anyway. The switch is a decision about the account, not a hint.
  check('a stale client cannot upload anyway', 409, refused.status);
  await api('/api/attachments/settings', { method: 'POST', body: JSON.stringify({ enabled: true }) });
}

// 3. Into the real bucket ────────────────────────────────────────────────────
console.log('\n3. a real object in the real bucket');
{
  const uploaded = await api('/api/attachments/upload', {
    method: 'POST',
    body: JSON.stringify({
      entryId: ENTRY_ID,
      files: [{ id: FILE_ID, name: SECRET_NAME, mimeType: 'image/png', kind: 'image', data: PIXEL_B64 }],
    }),
  });
  check('upload accepted', 201, uploaded.status);
  const stored = (await uploaded.json()).stored ?? [];
  stored.includes(FILE_ID) ? ok('the file is stored') : fail('the file is stored', JSON.stringify(stored));
}

// 4. Listed back ─────────────────────────────────────────────────────────────
console.log('\n4. listed back, metadata decrypted');
{
  const listed = await (await api(`/api/attachments?entry=${encodeURIComponent(ENTRY_ID)}`)).json();
  const mine = (listed.attachments ?? []).find((one) => one.id === FILE_ID);
  mine ? ok('appears in the entry listing') : fail('appears in the entry listing', JSON.stringify(listed).slice(0, 200));
  // The name round-trips through the envelope, which is the whole reason it is
  // sealed with the bytes rather than stored beside them.
  mine?.name === SECRET_NAME ? ok('the sealed filename came back') : fail('the sealed filename came back', String(mine?.name));
  check('the size is right', PIXEL.byteLength, mine?.size);
}

// 5. The bytes ───────────────────────────────────────────────────────────────
console.log('\n5. the bytes, out of R2 and through the envelope');
{
  const got = await api(`/api/attachments/file?id=${encodeURIComponent(FILE_ID)}`);
  check('fetch succeeds', 200, got.status);
  check('served as the stored type', 'image/png', got.headers.get('content-type'));
  // Hardening that only matters because an uploader chose the media type.
  check('nosniff', 'nosniff', got.headers.get('x-content-type-options'));
  check('never rendered in this origin', 'attachment', got.headers.get('content-disposition'));

  const bytes = Buffer.from(await got.arrayBuffer());
  bytes.equals(PIXEL)
    ? ok('the bytes are identical to what went in')
    : fail('the bytes are identical to what went in', `${bytes.byteLength} bytes back`);
}

// 6. Gone when removed ───────────────────────────────────────────────────────
console.log('\n6. removal');
{
  const removed = await api('/api/attachments/remove', {
    method: 'POST',
    body: JSON.stringify({ ids: [FILE_ID] }),
  });
  check('remove accepted', 200, removed.status);
  check('one removed', 1, (await removed.json()).removed);

  const gone = await api(`/api/attachments/file?id=${encodeURIComponent(FILE_ID)}`);
  check('the object is really gone', 404, gone.status);

  const listed = await (await api(`/api/attachments?entry=${encodeURIComponent(ENTRY_ID)}`)).json();
  (listed.attachments ?? []).some((one) => one.id === FILE_ID)
    ? fail('gone from the listing too', 'still listed')
    : ok('gone from the listing too');
}

// 7. Leave nothing behind, and NOTHING ELSE EITHER ───────────────────────────
console.log('\n7. cleanup');
{
  // THIS USED TO POST { all: true }, WHICH DELETES EVERY BACKUP ON THE ACCOUNT.
  // A verification script that destroys the data it was pointed at is a trap:
  // it is safe on the throwaway account it was written for and catastrophic the
  // first time somebody runs it against their own. Remove only what this run
  // created, by id.
  await api('/api/attachments/remove', {
    method: 'POST',
    body: JSON.stringify({ ids: [FILE_ID, `${FILE_ID}-nope`] }),
  });

  // The switch goes back to whatever it was, not to off. This run turned it on;
  // an account that already had it on must not be quietly turned off by a test.
  await api('/api/attachments/settings', {
    method: 'POST',
    body: JSON.stringify({ enabled: SWITCH_WAS_ON }),
  });

  const after = await (await api('/api/attachments')).json();
  check('switch restored to how it was found', SWITCH_WAS_ON, after.enabled);
  (after.attachments ?? []).some((one) => one.id === FILE_ID)
    ? fail('this run left nothing of its own', 'still listed')
    : ok('this run left nothing of its own');
}

console.log(failures ? `\nFAILED (${failures})` : '\nREAL BUCKET ROUND TRIP PASSED');
process.exit(failures ? 1 : 0);
