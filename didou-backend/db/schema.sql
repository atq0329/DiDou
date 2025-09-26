-- db/schema.sql
CREATE TABLE IF NOT EXISTS trips (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  duration    TEXT NOT NULL,  
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  leader_id   INTEGER FOREIGN KEY,
);