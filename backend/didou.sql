-- USERS (with passwords + unique normalized name + optional trip_role)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- unique on normalized (lower, trimmed) name
CREATE UNIQUE INDEX IF NOT EXISTS users_name_norm_unique
  ON users ((lower(btrim(name))));

-- TRIPS (leader defines duration + scheduling window)
CREATE TABLE IF NOT EXISTS trips (
  id          SERIAL PRIMARY KEY,
  name        TEXT    NOT NULL,
  destination TEXT    NOT NULL,
  duration    INTEGER NOT NULL,      -- minimum days each member must supply
  start_date  DATE    NOT NULL,      -- <- DATE = no timezone
  end_date    DATE    NOT NULL,      -- <- DATE
  leader_id   INTEGER REFERENCES users(id)
);

-- AVAILABILITY (one window per user per trip)
CREATE TABLE IF NOT EXISTS availabilities (
  id           SERIAL PRIMARY KEY,
  trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avail_start  DATE    NOT NULL,   -- <- DATE
  avail_end    DATE    NOT NULL,   -- <- DATE
  UNIQUE (trip_id, user_id)        -- each member 1 row per trip (upsert)
);

CREATE INDEX IF NOT EXISTS idx_trips_leader ON trips(leader_id);
CREATE INDEX IF NOT EXISTS idx_avail_trip   ON availabilities(trip_id);
CREATE INDEX IF NOT EXISTS idx_avail_user   ON availabilities(user_id);
