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
-- 3) Join table: users ↔ trips (many-to-many)
CREATE TABLE IF NOT EXISTS trip_members (
  trip_id   TEXT    NOT NULL REFERENCES trips(id)   ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role      TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  status    TEXT    NOT NULL DEFAULT 'joined' CHECK (status IN ('invited','joined','left')),
  joined_at TIMESTAMPTZ     DEFAULT NOW(),
  updated_at TIMESTAMPTZ    DEFAULT NOW(),
  PRIMARY KEY (trip_id, user_id)
);

-- touch updated_at automatically
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trip_members_set_updated_at ON trip_members;
CREATE TRIGGER trip_members_set_updated_at
BEFORE UPDATE ON trip_members
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- helpful indexes
CREATE INDEX IF NOT EXISTS idx_trip_members_trip        ON trip_members (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user        ON trip_members (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip_status ON trip_members (trip_id, status);

-- 4) (Optional but recommended) Denormalized live counter on trips
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0;

-- trigger to maintain trips.member_count based on trip_members
CREATE OR REPLACE FUNCTION trips_member_count_tg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'joined' THEN
      UPDATE trips SET member_count = member_count + 1 WHERE id = NEW.trip_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status, '') <> 'joined' AND NEW.status = 'joined' THEN
      UPDATE trips SET member_count = member_count + 1 WHERE id = NEW.trip_id;
    ELSIF OLD.status = 'joined' AND COALESCE(NEW.status, '') <> 'joined' THEN
      UPDATE trips SET member_count = member_count - 1 WHERE id = NEW.trip_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'joined' THEN
      UPDATE trips SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.trip_id;
    END IF;
  END IF;

  RETURN NULL;
END$$;

DROP TRIGGER IF EXISTS trip_members_counter_a_iud ON trip_members;
CREATE TRIGGER trip_members_counter_a_iud
AFTER INSERT OR UPDATE OR DELETE ON trip_members
FOR EACH ROW EXECUTE FUNCTION trips_member_count_tg();

-- 5) Simple function to get the current joined count (source-of-truth compute)
CREATE OR REPLACE FUNCTION count_joined_members(p_trip_id TEXT)
RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::int
  FROM trip_members
  WHERE trip_id = p_trip_id AND status = 'joined';
$$;

-- 6) (Optional) View that exposes computed counts alongside trips
CREATE OR REPLACE VIEW trips_with_counts AS
SELECT t.*,
       COUNT(m.*) FILTER (WHERE m.status = 'joined')::int AS joined_count
FROM trips t
LEFT JOIN trip_members m ON m.trip_id = t.id
GROUP BY t.id;
-- Add deadline column
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS deadline DATE;

-- Never allow a past deadline (NULL is allowed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_deadline_not_past'
  ) THEN
    ALTER TABLE trips
      ADD CONSTRAINT trips_deadline_not_past
      CHECK (deadline IS NULL OR deadline >= CURRENT_DATE);
  END IF;
END$$;

-- Keep deadline within [start_date, end_date] when those are present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_deadline_after_start'
  ) THEN
    ALTER TABLE trips
      ADD CONSTRAINT trips_deadline_after_start
      CHECK (deadline IS NULL OR start_date IS NULL OR deadline >= start_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trips_deadline_before_end'
  ) THEN
    ALTER TABLE trips
      ADD CONSTRAINT trips_deadline_before_end
      CHECK (deadline IS NULL OR end_date IS NULL OR deadline <= end_date);
  END IF;
END$$;