-- Accounts, sign-in, and encrypted event sync.
--
-- This is a SEPARATE database from EVENT_EVERY_DB. That one is
-- `spirit-hammer-waitlist`, shared across member apps; putting per-app identity
-- in a shared database means another app's migration can rename a column out
-- from under this one. The account convention on this Cloudflare account is
-- already one database per app (`sun-signal-accounts`, `greenlights_accounts`),
-- and this follows it.
--
-- The auth half is lifted from ~/Documents/skeletons/signup-cloudflare: the
-- address is the identity, tokens are stored hashed, and an account is created
-- on first successful sign-in so there is no separate registration step.

-- Who exists. Created on first successful sign-in.
CREATE TABLE account (
  id         TEXT NOT NULL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- A sign-in link, stored HASHED so a leaked row cannot be replayed as a login:
-- the token itself exists only in the email that was sent.
CREATE TABLE login_token (
  token_hash TEXT NOT NULL PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- Set the moment the link is spent. Single use is enforced by an UPDATE that
  -- requires this to still be NULL, so two simultaneous clicks cannot both win.
  used_at    TEXT
);

CREATE INDEX idx_login_token_expires ON login_token (expires_at);

CREATE TABLE session (
  id         TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_session_account ON session (account_id);

-- Fixed-window limiting for the one endpoint that spends a resource on a
-- stranger's say-so: requesting a sign-in link makes this domain send mail to
-- whatever address was typed. Turnstile asks "is this a person"; this asks "has
-- this already happened too many times". Only the second stops a solved-token
-- farm or a slow human-paced drip, and the per-address bucket is what keeps
-- this app from being used to mailbomb someone who never signed up.
CREATE TABLE rate_limit (
  bucket       TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT    NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX idx_rate_limit_expires ON rate_limit (expires_at);

-- Envelope encryption, key half.
--
-- Each account gets its own data key (DEK). The DEK is never stored in the
-- clear: it is sealed with a master key (KEK) that lives only in a Worker
-- secret, so a dump of this database yields wrapped keys and ciphertext and
-- nothing else. D1's own at-rest encryption is transparent — every query
-- returns plaintext — so it protects against stolen disks and not against a
-- leaked API token, which is the failure that actually happens. This is the
-- same stance the accepted migration design already takes for R2: "encrypted
-- before R2. R2 platform encryption is defense in depth."
--
-- The ceiling is honest: the Worker can decrypt, so this is not protection
-- against a compromised Worker. Passwordless sign-in leaves no user secret to
-- derive a key from, so that is the strongest guarantee available without
-- making the user hold a passphrase they can lose.
CREATE TABLE account_key (
  account_id  TEXT    NOT NULL PRIMARY KEY REFERENCES account (id) ON DELETE CASCADE,
  -- base64 AES-GCM(KEK, DEK), and the nonce it was sealed under.
  wrapped_dek TEXT    NOT NULL,
  wrap_nonce  TEXT    NOT NULL,
  -- Which KEK sealed it. Present from row one so rotating the master key later
  -- is a migration over rows rather than a schema change.
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL
);

-- Envelope encryption, data half.
--
-- One row per synced event, holding ciphertext and nothing else describable.
-- There is deliberately no title, date, or location column: indexing on them
-- would put the very fields worth protecting back into the clear. The cost is
-- real and worth stating — the server cannot sort, search, or filter events,
-- so every one of those happens in the browser after decryption, and this table
-- can only ever be paged by `updated_at`.
CREATE TABLE synced_event (
  -- The client's own event id, so a re-sync updates rather than duplicates.
  id          TEXT    NOT NULL,
  account_id  TEXT    NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  nonce       TEXT    NOT NULL,
  ciphertext  TEXT    NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT    NOT NULL,
  -- Tombstone rather than DELETE: a device that has been offline needs to learn
  -- that a row it still holds was removed elsewhere.
  deleted     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, id)
);

CREATE INDEX idx_synced_event_updated ON synced_event (account_id, updated_at);
