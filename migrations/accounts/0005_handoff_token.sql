-- An upload link, spent once.
--
-- `request_photo_upload` hands an assistant a link the person opens to send a
-- photo. It was signed, short-lived and bound to one account - and REUSABLE for
-- its whole fifteen minutes. The link sits in a chat transcript, and every
-- redeem runs a paid image scan and writes events into the account, so twenty
-- redeems of one link exhaust the day's budget and fill somebody's calendar.
--
-- "Single-purpose" was true and is not the same as single use.
--
-- Same shape as login_token, and for the same reason: the token is stored
-- HASHED, so a dump of this table cannot be replayed as an upload. The row
-- exists only to record that a particular link has been spent.
CREATE TABLE handoff_token (
  token_hash TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- Set the moment the link is spent. Single use is enforced by an UPDATE that
  -- requires this to still be NULL, so two simultaneous uploads cannot both win.
  used_at    TEXT
);

-- For sweeping spent and expired rows, the way login_token is swept.
CREATE INDEX idx_handoff_token_expires ON handoff_token (expires_at);
