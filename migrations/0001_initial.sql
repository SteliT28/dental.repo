PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  cqc_location_id TEXT NOT NULL,
  practice_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contacts_location_idx
  ON contacts(cqc_location_id);

CREATE INDEX IF NOT EXISTS contacts_email_idx
  ON contacts(email);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  cqc_location_id TEXT NOT NULL,
  practice_name TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS activity_created_idx
  ON activity(created_at DESC);
