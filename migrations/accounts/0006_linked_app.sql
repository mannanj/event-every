-- 0006_linked_app - this account signed in to a sister app's MCP server.
--
-- One row per (account, app): Event Every holding a token for Calendar, so the
-- panel can show "Signed in" and, later, call Calendar for the person. The
-- tokens are credentials we must PRESENT elsewhere, so unlike login_token they
-- cannot be hashed: they are sealed (AES-GCM under LINKED_APPS_SECRET, see
-- src/vendor/mcp-connector/linked-app.ts) and a dump without that secret is inert.
--
-- Mutable, never deleted by the app: signing out clears the sealed tokens and
-- stamps signed_out_at; signing in again reuses the row. The only thing that
-- removes a row is the account itself going away.
CREATE TABLE IF NOT EXISTS linked_app (
  account_id    TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
  app_id        TEXT NOT NULL,
  -- Sealed LinkedTokens JSON. NULL while signed out.
  tokens_sealed TEXT,
  connected_at  INTEGER,
  signed_out_at INTEGER,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (account_id, app_id)
);
