// server.js (PostgreSQL)
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
// NOTE: keep 3000 only if you’re serving both static HTML and API from same origin.
// If you run a separate front-end dev server on :3000, change this to 5000.
const PORT = 3000;

// ---- DB pool ----
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://didou:didoupass@localhost:5432/didou',
});

// Ensure schema exists on boot (reads your .sql file) + ensure availability table
async function ensureSchema() {
  const sqlPath = path.join(__dirname, 'didou.sql');
  if (fs.existsSync(sqlPath)) {
    const schema = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(schema);
  }
  // Ensure trip_availability exists (frontend depends on it)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_availability (
      trip_id    TEXT    NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      avail_start DATE   NOT NULL,
      avail_end   DATE   NOT NULL,
      PRIMARY KEY (trip_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_trip_avail_trip ON trip_availability(trip_id);
  `);
  console.log('Schema ensured.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- AUTH ----------------
app.post('/api/signin', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Please provide name, email, and a 6+ char password.' });
    }

    const u = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (u.rows.length) {
      const user = u.rows[0];
      const okPw = await bcrypt.compare(password, user.password_hash);
      if (!okPw) return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      return res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
    }

    // create new user (dev sign-up)
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const ins = await pool.query(
      `INSERT INTO users (name, email, password_hash, password_salt)
       VALUES ($1,$2,$3,$4)
       RETURNING id, name, email`,
      [name, email, hash, salt]
    );
    return res.json({ ok: true, user: ins.rows[0] });
  } catch (e) {
    console.error('signin error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

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
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------- TRIPS ----------------
app.post('/api/trips', async (req, res) => {
  try {
    const { name, destination, duration, start_date, end_date, leader_id, deadline } = req.body || {};

    const { rows } = await pool.query(
      `INSERT INTO trips (name, destination, duration, start_date, end_date, leader_id, deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [name, destination, duration, start_date || null, end_date || null, leader_id || null, deadline || null]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('create trip error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/trips', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM trips ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    console.error('list trips error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET one trip (includes member_count if your SQL function exists)
app.get('/api/trips/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // If count_joined_members() exists (from your SQL), this includes the count; otherwise drop that column.
    const { rows } = await pool.query(
      `SELECT t.*, 
              COALESCE(count_joined_members(t.id), 0) AS member_count
       FROM trips t
       WHERE t.id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('get trip error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------- AVAILABILITY (needed by your page) ----------------

// GET /api/trips/:id/availability  -> { ok:true, list:[{user_id,name,email,avail_start,avail_end}] }
app.get('/api/trips/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT a.user_id, u.name, u.email, a.avail_start, a.avail_end
         FROM trip_availability a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.trip_id = $1
        ORDER BY a.avail_start`,
      [id]
    );
    res.json({ ok: true, list: rows });
  } catch (e) {
    console.error('get availability error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/trips/:id/availability  body: { user_id, avail_start, avail_end, name?, email? }
app.post('/api/trips/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    let { user_id, avail_start, avail_end, name, email } = req.body || {};
    if (!user_id || !avail_start || !avail_end) {
      return res.status(400).json({ ok: false, error: 'Missing fields: user_id, avail_start, avail_end' });
    }
    user_id = Number(user_id);

    // optional: if the user exists, we can ignore provided name/email
    // If user doesn't exist yet, you could auto-create; for now we just upsert availability.

    await pool.query(
      `INSERT INTO trip_availability (trip_id, user_id, avail_start, avail_end)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (trip_id, user_id)
       DO UPDATE SET avail_start = EXCLUDED.avail_start,
                     avail_end   = EXCLUDED.avail_end`,
      [id, user_id, avail_start, avail_end]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('post availability error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------- BOOT ----------------
ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API running at http://localhost:${PORT}`);
      console.log(`Open http://localhost:${PORT}/MemberAvailability.html?tripId=F00V9QPW&userId=4`);
    });
  })
  .catch((err) => {
    console.error('Failed to ensure schema:', err.message);
    process.exit(1);
  });