-- db/schema.sql
CREATE TABLE IF NOT EXISTS trips (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  duration    TEXT NOT NULL,  -- 'lt1w' | '1w' | 'gt1w' | 'gt1m'
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);