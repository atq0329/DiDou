DROP TABLE IF EXISTS user_choices;
DROP TABLE IF EXISTS activities;

CREATE TABLE activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    category TEXT,
    time_period TEXT,
    address TEXT
);

CREATE TABLE user_choices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    activity_id INTEGER,
    FOREIGN KEY(activity_id) REFERENCES activities(id)
);