### Task 243: Originals get a second home

**Severity: Product expansion** · Opened 2026-09-21, alongside Task 202. The MCP work ran into this and stopped: an assistant could be told what is on somebody's calendar but never handed the poster it came from, because the poster was never on the server in the first place.

#### What was true before

An original image has never reached Event Every's servers. It lives in the browser's IndexedDB, synced events carry `inputEntryIds` (pointers, not bytes), `event.attachments` is only populated on legacy rows, and `/api/sync/push` caps an event at 64KB so a photo could not be carried there even if something tried.

That is a defensible design right up until somebody signs in on a new laptop, where their whole history arrives with every file missing.

#### The shape

```
IndexedDB   the store of record. Every read looks here FIRST, always.
R2          the second layer. Read only when the first one does not have it.
```

Bytes are sealed with the same per-account data key the events use, before they reach the bucket. The filename is sealed WITH them rather than stored beside them: "termination-letter.pdf" in the clear next to an encrypted PDF gives away most of what the encryption was for.

Off by default. Uploading somebody's photographs because they signed in is not a default anyone asked for, and the storage is the account owner's to pay for.

#### Scope

- [x] `sealFile` / `openFile` in `crypto.ts`, returning bytes rather than base64 because the ciphertext goes straight to R2
- [x] Migration: `account.backup_attachments`, and an `attachment` table with no column that describes the contents
- [x] `src/server/accounts/attachments.ts`: put, get, list, remove
- [x] Five routes behind the session cookie, in the route manifest
- [x] R2 binding in `wrangler.jsonc`
- [x] `src/services/attachmentBackup.ts`, every failure answering null or empty rather than throwing
- [x] `useAttachmentBackup`, optimistic and corrected by the server
- [x] The two account-menu items, with a second click before deleting
- [x] Upload on save: called from `useInputHistory.addEntry`, not awaited
- [x] Restore on miss: `ensureFiles`, called when an entry is loaded from history
- [x] The R2 bucket itself, and the migration applied

#### Decisions, stated

**Turning the switch off does not delete anything.** Off means stop uploading. A switch that also quietly destroyed a year of originals would be a trap; removing them is the other menu item, which says so and asks twice.

**Deleting the backup does not touch the browser's copies.** IndexedDB is the store of record, and this is a decision about what the account keeps on a server.

#### Prove

- [x] 18 tests against real SQLite running the actual migrations, not a mock
- [x] Mutation-validated: storing plaintext fails 5, dropping `account_id` from the lookup fails 1
- [x] 15 tests on the client half, all on failing quietly
- [x] A round trip through a real bucket: `scripts/verify-attachments-live.mjs`, run against production. Bytes identical in and out, the sealed filename survived, removal really deleted the object.

- Location: `src/server/accounts/attachments.ts`, `src/app/api/attachments/`, `src/services/attachmentBackup.ts`, `src/hooks/useAttachmentBackup.ts`, `migrations/accounts/0003_attachments.sql`
