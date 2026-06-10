-- Spirit & Hammer collective waitlist (shared across member apps; `source`
-- records which app captured the signup).
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'summon',
  user_agent TEXT,
  email_sent INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist (created_at);
