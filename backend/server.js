// server.js (PostgreSQL)
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

// ---- DB pool ----
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://didou:didoupass@localhost:5432/didou',
});

// Ensure schema exists on boot (reads your .sql file)
async function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'didou.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema ensured.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- ROUTES ----
const bcrypt = require('bcryptjs');

app.post('/api/signin', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Please provide name, email, and a 6+ char password.' });
    }

    // 1) find by email
    const u = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (u.rows.length) {
      // existing user -> verify
      const user = u.rows[0];
      const okPw = await bcrypt.compare(password, user.password_hash);
      if (!okPw) return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      return res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
    }

    // 2) create new user (dev sign-up)
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const ins = await pool.query(
      `INSERT INTO users (name, email, password_hash, password_salt)
       VALUES ($1,$2,$3,$4)
       RETURNING id, name, email`,
      [name, email, hash, salt]
    );
    const newUser = ins.rows[0];
    return res.json({ ok: true, user: newUser });

  } catch (e) {
    console.error('signin error:', e);
    return res.status(500).json({ ok: false, error: e.message }); // keep for now while debugging
  }
});


/** POST /api/reset
 * Update password for an existing user (match by email and optionally name).
 */
app.post('/api/reset', async (req, res) => {
  try {
    const { name, email, newPassword } = req.body || {};
    if (!name || !email || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'Please provide name, email, and a 6+ char new password.' });
    }

    const u = await pool.query('SELECT id, name FROM users WHERE email = $1', [email]);
    if (!u.rows.length) return res.status(404).json({ ok: false, error: 'User not found.' });
    if (u.rows[0].name !== name) {
      return res.status(400).json({ ok: false, error: 'Name/email do not match.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await pool.query(
      'UPDATE users SET password_hash = $1, password_salt = $2 WHERE email = $3',
      [hash, salt, email]
    );
    return res.json({ ok: true });

  } catch (e) {
    console.error('reset error:', e);
    return res.status(500).json({ ok: false, error: e.message }); // keep for now while debugging
  }
});

// Create trip
app.post('/api/trips', async (req, res) => {
  try {
    // In the POST /api/trips handler:
const { name, destination, duration, start_date, end_date, leader_id, deadline } = req.body || {};

const { rows } = await pool.query(
  `INSERT INTO trips (name, destination, duration, start_date, end_date, leader_id, deadline)
   VALUES ($1,$2,$3,$4,$5,$6,$7)
   RETURNING *`,
  [name, destination, duration, start_date || null, end_date || null, leader_id || null, deadline || null]
);

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// LIST trips  <-- this fixes "Cannot GET /api/trips"
app.get('/api/trips', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM trips ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET one trip (with leader name)
app.get('/api/trips/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT t.*, count_joined_members(t.id) AS member_count
     FROM trips t WHERE t.id = $1`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ---- BOOT ----
ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
      console.log(`Open http://localhost:${PORT}/LeaderPage.html`);
    });
  })
  .catch((err) => {
    console.error('Failed to ensure schema:', err.message);
    process.exit(1);
  });
