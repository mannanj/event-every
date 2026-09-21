import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_ADMIN_EMAILS,
  adminEmails,
  isAdminEmail,
  readCapSubject,
  setUnlimited,
  shouldEnforceDailyCaps,
} from '@/server/accounts/admin';
import { upsertAccount } from '@/server/accounts/auth';

import { migratedDatabase } from './sqlite-d1';

describe('who is on the owner list', () => {
  test('the compiled-in owner is always on it', () => {
    expect(adminEmails()).toContain('hello@mannan.is');
    expect(isAdminEmail('hello@mannan.is')).toBe(true);
  });

  test('case and surrounding space do not matter', () => {
    expect(isAdminEmail('  Hello@Mannan.is ')).toBe(true);
  });

  test('nobody else is', () => {
    expect(isAdminEmail('ada@example.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  test('the environment can add, separated by commas or spaces', () => {
    const env = { EVENT_EVERY_ADMIN_EMAILS: 'ada@example.com, bo@example.com  cy@example.com' };
    expect(isAdminEmail('ada@example.com', env)).toBe(true);
    expect(isAdminEmail('bo@example.com', env)).toBe(true);
    expect(isAdminEmail('cy@example.com', env)).toBe(true);
  });

  test('the environment cannot REMOVE the owner', () => {
    // Additive on purpose. An env var that could drop the compiled-in owner is
    // a way to lock him out of his own deployment with a typo.
    const env = { EVENT_EVERY_ADMIN_EMAILS: 'ada@example.com' };
    expect(isAdminEmail(DEFAULT_ADMIN_EMAILS[0], env)).toBe(true);
  });
});

describe('who the daily cap applies to', () => {
  test('a signed-out visitor is capped', () => {
    // The answer that must never drift. An exemption defaulting to "exempt" is
    // not a role, it is a hole.
    expect(shouldEnforceDailyCaps(null)).toBe(true);
    expect(shouldEnforceDailyCaps(undefined)).toBe(true);
  });

  test('an ordinary account is capped', () => {
    expect(shouldEnforceDailyCaps({ email: 'ada@example.com' })).toBe(true);
    expect(shouldEnforceDailyCaps({ email: 'ada@example.com', unlimited: false })).toBe(true);
  });

  test('an admin is not', () => {
    expect(shouldEnforceDailyCaps({ email: 'hello@mannan.is' })).toBe(false);
  });

  test('an unlimited account is not, without being an admin', () => {
    // The whole reason the two are separate: this account bypasses the cap and
    // is still nobody special anywhere else.
    const ada = { email: 'ada@example.com', unlimited: true };
    expect(shouldEnforceDailyCaps(ada)).toBe(false);
    expect(isAdminEmail(ada.email)).toBe(false);
  });
});

describe('reading it back off an account', () => {
  test('a new account is capped and not unlimited', async () => {
    const db = migratedDatabase();
    const ada = await upsertAccount(db, 'ada@example.com');

    const subject = await readCapSubject(db, ada.id);
    expect(subject).toEqual({ email: 'ada@example.com', unlimited: false });
    expect(shouldEnforceDailyCaps(subject)).toBe(true);
  });

  test('granting it lifts the cap, and revoking it puts it back', async () => {
    const db = migratedDatabase();
    const ada = await upsertAccount(db, 'ada@example.com');

    await setUnlimited(db, ada.id, true);
    expect(shouldEnforceDailyCaps(await readCapSubject(db, ada.id))).toBe(false);

    await setUnlimited(db, ada.id, false);
    expect(shouldEnforceDailyCaps(await readCapSubject(db, ada.id))).toBe(true);
  });

  test('it is per account, not global', async () => {
    const db = migratedDatabase();
    const ada = await upsertAccount(db, 'ada@example.com');
    const bo = await upsertAccount(db, 'bo@example.com');

    await setUnlimited(db, ada.id, true);
    expect(shouldEnforceDailyCaps(await readCapSubject(db, bo.id))).toBe(true);
  });

  test('an account that does not exist is nobody, and nobody is capped', async () => {
    const db = migratedDatabase();
    expect(await readCapSubject(db, 'no-such-account')).toBeNull();
    expect(shouldEnforceDailyCaps(await readCapSubject(db, 'no-such-account'))).toBe(true);
  });

  test('the owner is uncapped by the list even with the column at zero', async () => {
    // Admin does not require the column. The two tiers are independent.
    const db = migratedDatabase();
    const owner = await upsertAccount(db, 'hello@mannan.is');
    const subject = await readCapSubject(db, owner.id);
    expect(subject?.unlimited).toBe(false);
    expect(shouldEnforceDailyCaps(subject)).toBe(false);
  });
});
