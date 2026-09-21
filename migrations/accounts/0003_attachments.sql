-- Attachment backup: the originals an account chose to keep.
--
-- WHY R2 AND NOT A COLUMN. Events are rows and a row is the wrong shape for a
-- photograph. `/api/sync/push` caps an event at 64KB precisely so one enormous
-- row cannot be stored, which is also why an original image has never reached
-- the server: it lives in the browser's IndexedDB and nowhere else. That is
-- fine until someone signs in on a new laptop, where their history arrives with
-- every file missing.
--
-- So the bytes go to R2 and only the description of them goes here.
--
-- OFF BY DEFAULT. `account.backup_attachments` is 0 until somebody turns it on
-- from the account menu. Uploading a person's photographs because they signed
-- in is not a default anyone asked for, and the storage is the account owner's
-- to pay for.
--
-- INDEXEDDB STAYS FIRST. This is a backup, not the store of record: every read
-- still comes from IndexedDB, and R2 is consulted only when the file is not
-- there. A browser that already holds the file never makes a request.
ALTER TABLE account ADD COLUMN backup_attachments INTEGER NOT NULL DEFAULT 0;

-- One row per backed-up file. The bytes are in R2 under `att/{account_id}/{id}`,
-- sealed with the same per-account data key the events use, so a dump of this
-- table plus a dump of the bucket still needs the KEK to read one photo.
--
-- There is deliberately no column here that describes the CONTENT: a filename
-- is the person's own words and is encrypted with the bytes it names, not
-- stored in the clear beside them.
CREATE TABLE attachment (
  -- The client's own file id, so re-uploading updates rather than duplicates.
  id          TEXT    NOT NULL,
  account_id  TEXT    NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  -- Which input-history entry the file belongs to, so a fresh browser can
  -- restore a whole entry's files in one request.
  entry_id    TEXT    NOT NULL,
  -- Sealed: name and mime type are the person's, and go in the envelope.
  nonce       TEXT    NOT NULL,
  meta_nonce  TEXT    NOT NULL,
  meta        TEXT    NOT NULL,
  -- Plaintext, because they describe the object rather than its contents and
  -- the bucket already knows both.
  byte_size   INTEGER NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  -- Tombstone, matching synced_event: a device that has been offline needs to
  -- learn that a file it still holds was removed from the account elsewhere.
  deleted     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, id)
);

CREATE INDEX idx_attachment_entry ON attachment (account_id, entry_id);
CREATE INDEX idx_attachment_updated ON attachment (account_id, updated_at);
