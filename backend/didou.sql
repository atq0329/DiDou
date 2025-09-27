-- =========================================================
-- didou.sql  (idempotent)
-- =========================================================

-- 0) Extensions / helpers
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Trip ID generator (8-char A–Z0–9)
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

-- 2) Core tables: users / sessions
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

-- 3) Trips (text ID defaulting to gen_trip_id)
--    Includes 'deadline' and 'member_count' columns.
CREATE TABLE IF NOT EXISTS trips (
  id           TEXT PRIMARY KEY DEFAULT gen_trip_id(),
  name         TEXT NOT NULL,
  destination  TEXT NOT NULL,
  duration     TEXT NOT NULL,              -- UI/API keeps this as TEXT
  start_date   DATE,
  end_date     DATE,
  deadline     DATE,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leader_id    INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_leader_id ON trips(leader_id);

-- Single, final deadline policy (no other deadline constraints elsewhere)
ALTER TABLE trips
  DROP CONSTRAINT IF EXISTS trips_deadline_after_start,
  DROP CONSTRAINT IF EXISTS trips_deadline_before_end,
  DROP CONSTRAINT IF EXISTS trips_deadline_not_past,
  DROP CONSTRAINT IF EXISTS trips_deadline_bounds;

ALTER TABLE trips
  ADD CONSTRAINT trips_deadline_bounds
  CHECK (
    deadline IS NULL
    OR (
      deadline >= CURRENT_DATE
      AND (end_date IS NULL OR deadline <= end_date)
    )
  );

-- 4) Availability (one window per user per trip)
CREATE TABLE IF NOT EXISTS availabilities (
  id           SERIAL PRIMARY KEY,
  trip_id      TEXT    NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avail_start  DATE    NOT NULL,
  avail_end    DATE    NOT NULL,
  UNIQUE (trip_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_avail_trip ON availabilities(trip_id);
CREATE INDEX IF NOT EXISTS idx_avail_user ON availabilities(user_id);

-- 5) Users ↔ Trips (many-to-many) with status/role
CREATE TABLE IF NOT EXISTS trip_members (
  trip_id    TEXT    NOT NULL REFERENCES trips(id)   ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
  status     TEXT    NOT NULL DEFAULT 'joined' CHECK (status IN ('invited','joined','left')),
  joined_at  TIMESTAMPTZ     DEFAULT NOW(),
  updated_at TIMESTAMPTZ     DEFAULT NOW(),
  PRIMARY KEY (trip_id, user_id)
);

-- 5a) Touch updated_at automatically
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

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_trip_members_trip        ON trip_members (trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user        ON trip_members (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_trip_status ON trip_members (trip_id, status);

-- 5b) Maintain trips.member_count based on trip_members
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

-- 5c) Source-of-truth count (optional helper)
CREATE OR REPLACE FUNCTION count_joined_members(p_trip_id TEXT)
RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::int
  FROM trip_members
  WHERE trip_id = p_trip_id AND status = 'joined';
$$;

-- 6) Activities / user_choices (friend’s tables)
CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL PRIMARY KEY,
  trip_id     TEXT REFERENCES trips(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT,
  time_period TEXT,
  address     TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_trip_name_timeperiod_key'
  ) THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_trip_name_timeperiod_key
      UNIQUE (trip_id, name, time_period);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_activities_trip     ON activities(trip_id);
CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);

CREATE TABLE IF NOT EXISTS user_choices (
  id          SERIAL PRIMARY KEY,
  username    TEXT,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_choices_user     ON user_choices(username);
CREATE INDEX IF NOT EXISTS idx_user_choices_activity ON user_choices(activity_id);

-- 7) View with computed counts
DROP VIEW IF EXISTS trips_with_counts;

CREATE VIEW trips_with_counts AS
SELECT
  t.id,
  t.name,
  t.destination,
  t.duration,
  t.start_date,
  t.end_date,
  t.created_at,
  t.leader_id,
  t.member_count,
  t.deadline,
  COUNT(m.*) FILTER (WHERE m.status = 'joined')::int AS joined_count
FROM trips t
LEFT JOIN trip_members m ON m.trip_id = t.id
GROUP BY
  t.id,
  t.name,
  t.destination,
  t.duration,
  t.start_date,
  t.end_date,
  t.created_at,
  t.leader_id,
  t.member_count,
  t.deadline;
