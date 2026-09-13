import { describe, expect, test } from 'bun:test';

import {
  createWrappedDek,
  importKek,
  openEvent,
  sealEvent,
  unwrapDek,
} from '@/server/accounts/crypto';

function kekBase64(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function freshDek(accountId: string) {
  const key = kekBase64();
  const kek = await importKek(key);
  const wrapped = await createWrappedDek(kek, accountId);
  return { kek, wrapped, dek: await unwrapDek(kek, accountId, wrapped) };
}

const EVENT = {
  id: 'evt-1',
  title: 'Dentist',
  startDate: '2026-03-13T09:30:00Z',
  location: 'Blue Room',
};

describe('envelope encryption', () => {
  test('a sealed event opens back to exactly what went in', async () => {
    const { dek } = await freshDek('acc-1');
    const sealed = await sealEvent(dek, 'acc-1', 'evt-1', EVENT);
    expect(await openEvent(dek, 'acc-1', 'evt-1', sealed)).toEqual(EVENT);
  });

  test('the ciphertext does not contain the plaintext', async () => {
    const { dek } = await freshDek('acc-1');
    const sealed = await sealEvent(dek, 'acc-1', 'evt-1', EVENT);
    // The whole point: a database dump must not reveal the title or location.
    expect(sealed.ciphertext).not.toContain('Dentist');
    expect(sealed.ciphertext).not.toContain('Blue Room');
    expect(atob(sealed.ciphertext)).not.toContain('Dentist');
  });

  test('every write uses a fresh nonce, so identical events differ on disk', async () => {
    const { dek } = await freshDek('acc-1');
    const first = await sealEvent(dek, 'acc-1', 'evt-1', EVENT);
    const second = await sealEvent(dek, 'acc-1', 'evt-1', EVENT);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test('a ciphertext moved to another event id will not open', async () => {
    const { dek } = await freshDek('acc-1');
    const sealed = await sealEvent(dek, 'acc-1', 'evt-1', EVENT);
    // AAD binds the row. Re-filing someone's event under a new id must fail
    // rather than silently return it.
    expect(await openEvent(dek, 'acc-1', 'evt-2', sealed)).toBeNull();
  });

  test('a ciphertext moved to another account will not open', async () => {
    const { dek } = await freshDek('acc-1');
    const sealed = await sealEvent(dek, 'acc-1', 'evt-1', EVENT);
    expect(await openEvent(dek, 'acc-2', 'evt-1', sealed)).toBeNull();
  });

  test('another account key cannot read it', async () => {
    const mine = await freshDek('acc-1');
    const theirs = await freshDek('acc-2');
    const sealed = await sealEvent(mine.dek, 'acc-1', 'evt-1', EVENT);
    expect(await openEvent(theirs.dek, 'acc-1', 'evt-1', sealed)).toBeNull();
  });

  test('a tampered ciphertext will not open', async () => {
    const { dek } = await freshDek('acc-1');
    const sealed = await sealEvent(dek, 'acc-1', 'evt-1', EVENT);
    const bytes = atob(sealed.ciphertext).split('');
    bytes[0] = String.fromCharCode(bytes[0]!.charCodeAt(0) ^ 0xff);
    const tampered = { ...sealed, ciphertext: btoa(bytes.join('')) };
    // GCM authenticates, so a flipped bit is a failure rather than garbage.
    expect(await openEvent(dek, 'acc-1', 'evt-1', tampered)).toBeNull();
  });

  test('a data key is useless without the master key that wrapped it', async () => {
    const { wrapped } = await freshDek('acc-1');
    const otherKek = await importKek(kekBase64());
    await expect(unwrapDek(otherKek, 'acc-1', wrapped)).rejects.toThrow();
  });

  test('a wrapped key will not unwrap under another account id', async () => {
    const { kek, wrapped } = await freshDek('acc-1');
    await expect(unwrapDek(kek, 'acc-2', wrapped)).rejects.toThrow();
  });

  test('a short master key is refused rather than quietly accepted', async () => {
    // A truncated or placeholder KEK would encrypt perfectly well and protect
    // nothing, so this has to fail loudly at import.
    await expect(importKek(btoa('too-short'))).rejects.toThrow(/32 bytes/);
  });
});
