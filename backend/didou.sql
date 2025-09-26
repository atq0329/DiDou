-- db/didou.sql  (PostgreSQL)

-- 0) Extensions / helpers FIRST
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) ID generator for trips (must exist before table default uses it)
CREATE OR REPLACE FUNCTION gen_trip_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
BEGIN
  LOOP
    code := substring(
             regexp_replace(
               upper(encode(gen_random_bytes(6), 'base64')),
               '[^A-Z0-9]', '', 'g'
             )
           FROM 1 FOR 8);

    IF code IS NOT NULL
       AND length(code) = 8
       AND NOT EXISTS (SELECT 1 FROM trips WHERE id = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

-- 2) Core tables
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  name_norm     TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  trip_role     TEXT,
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

-- Fresh trips table with text ID defaulting to gen_trip_id()
DROP TABLE IF EXISTS trips CASCADE;
CREATE TABLE trips (
  id          TEXT PRIMARY KEY DEFAULT gen_trip_id(),
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  duration    TEXT NOT NULL,   -- or INTEGER if you store # of days
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leader_id   INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_leader_id ON trips(leader_id);