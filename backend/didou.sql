BEGIN TRANSACTION;

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT    NOT NULL UNIQUE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  name_norm     TEXT    GENERATED ALWAYS AS (lower(trim(name))) STORED,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  trip_role     TEXT,                            -- 'leader' | 'member'
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name_norm)
);

CREATE INDEX idx_users_name_norm ON users(name_norm);

COMMIT;
