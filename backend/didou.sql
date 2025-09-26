BEGIN TRANSACTION;
CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT    NOT NULL UNIQUE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT
);
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  name_norm     TEXT    GENERATED ALWAYS AS (lower(trim(name))) STORED,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name_norm)
);
INSERT INTO "users" VALUES(1,'Demo User','demo@didou.app','dc00ec8af7696cc55747456191fe171698f9455f3ba83205882f769183741722','3667ce114dfc987bc1c33380ba5d7715','2025-09-26 06:35:59');
INSERT INTO "users" VALUES(2,'Gloria','gloria@example.com','44b9daa070d1198d5eb7ff5600ecf0cd93e99e77855a2e864119bc22a61ad4ad','027340223f629239aa7c9abc05c0a34e','2025-09-26 06:35:59');
INSERT INTO "users" VALUES(3,'Alex Chen','alex@example.com','63a42c73e9d3de3f622b6f67519a5facb0a4e6f75c45e411cecba00afbcf253d','84adf7b625c0afb9dc1e9664dc68029f','2025-09-26 06:35:59');
CREATE INDEX idx_users_name_norm ON users(name_norm);
COMMIT;
