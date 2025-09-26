const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 4000;
const DB_FILE = path.join(__dirname, 'didou.db');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(DB_FILE);

// ---- schema ----
const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  name_norm     TEXT    GENERATED ALWAYS AS (lower(trim(name))) STORED,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  password_salt TEXT    NOT NULL,
  trip_role     TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name_norm)
);

CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT    NOT NULL UNIQUE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_name_norm ON users(name_norm);
`;
db.exec(schema, (err) => {
  if (err) console.error('Schema error:', err);
  // remove migration check for role (no longer needed)
});

// ---- helpers ----
const normName = (s) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
function hash(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.createHash('sha256').update(s + password).digest('hex');
  return { hash: h, salt: s };
}
function getUserByEmail(email, cb) {
  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()], cb);
}
function nameTaken(nameKey, cb) {
  db.get('SELECT 1 FROM users WHERE name_norm = ?', [nameKey], cb);
}
function createUser(name, email, password, cb) {
  const { hash: h, salt } = hash(password);
  db.run(
    'INSERT INTO users (name, email, password_hash, password_salt) VALUES (?,?,?,?)',
    [name, email.toLowerCase().trim(), h, salt],
    cb
  );
}
function updatePassword(email, newPw, cb) {
  const { hash: h, salt } = hash(newPw);
  db.run(
    'UPDATE users SET password_hash=?, password_salt=? WHERE email=?',
    [h, salt, email.toLowerCase().trim()],
    cb
  );
}

// ---- routes ----
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// One-step sign-in
app.post('/api/signin', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Missing fields.' });
  }

  const emailNorm = String(email).toLowerCase().trim();
  const nameKey = normName(String(name));

  getUserByEmail(emailNorm, (err, user) => {
    if (err) return res.status(500).json({ ok: false, error: 'DB error' });

    if (user) {
      // Existing user
      const { hash: h } = hash(password, user.password_salt);
      const okName = normName(user.name) === nameKey;
      const okPw = h === user.password_hash;
      if (!okName || !okPw) {
        return res.status(401).json({ ok: false, error: 'Invalid email, name, or password.' });
      }
      return res.json({
        ok: true,
        user: { name: user.name, email: user.email, trip_role: user.trip_role }
      });
    }

    // New user
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
    }

    nameTaken(nameKey, (e2, row) => {
      if (e2) return res.status(500).json({ ok: false, error: 'DB error' });
      if (row) return res.status(409).json({ ok: false, error: 'That name is already in use. Choose another.' });

      createUser(name, emailNorm, password, (e3) => {
        if (e3) return res.status(409).json({ ok: false, error: 'Email or name already in use.' });
        return res.json({
          ok: true,
          user: { name, email: emailNorm, trip_role: null }
        });
      });
    });
  });
});

// Reset password
app.post('/api/reset', (req, res) => {
  const { name, email, newPassword } = req.body || {};
  if (!name || !email || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Missing fields.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  }

  getUserByEmail(email, (err, user) => {
    if (err) return res.status(500).json({ ok: false, error: 'DB error' });
    if (!user) return res.status(404).json({ ok: false, error: 'No account for this email.' });
    if (normName(user.name) !== normName(name)) {
      return res.status(401).json({ ok: false, error: 'Name does not match this email.' });
    }

    updatePassword(email, newPassword, (e2) => {
      if (e2) return res.status(500).json({ ok: false, error: 'DB error' });
      return res.json({ ok: true, message: 'Password updated.' });
    });
  });
});

// Save trip role
app.post('/api/trip-role', (req, res) => {
  const { email, tripRole } = req.body || {};
  if (!email || !tripRole) return res.status(400).json({ ok: false, error: 'Missing fields.' });
  if (!['leader', 'member'].includes(tripRole)) {
    return res.status(400).json({ ok: false, error: 'Invalid role.' });
  }

  getUserByEmail(email, (err, user) => {
    if (err) return res.status(500).json({ ok: false, error: 'DB error' });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

    db.run('UPDATE users SET trip_role=? WHERE email=?',
      [tripRole, email.toLowerCase().trim()],
      (e2) => {
        if (e2) return res.status(500).json({ ok: false, error: 'DB error' });
        return res.json({
          ok: true,
          user: { name: user.name, email: user.email, trip_role: tripRole }
        });
      });
  });
});

app.get('/', (_req, res) => res.send('DiDou API is running. Try GET /api/health'));
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
