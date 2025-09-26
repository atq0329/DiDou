-- db/didou.sql  (PostgreSQL version)

-- Users first (others reference it)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  name_norm     TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  trip_role     TEXT,  -- 'leader' | 'member'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name_norm)
);

CREATE INDEX IF NOT EXISTS idx_users_name_norm ON users(name_norm);

CREATE TABLE IF NOT EXISTS sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

-- NOTE: duration is TEXT to match your Node code.
-- If you prefer exact days as a number, change to INTEGER and adjust your insert.
CREATE TABLE IF NOT EXISTS trips (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  duration    TEXT NOT NULL,   -- or INTEGER if you store number of days
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leader_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_leader_id ON trips(leader_id);