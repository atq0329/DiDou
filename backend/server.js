// server.js
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool, types } = require('pg');

// Force DATE (OID 1082) to come back as 'YYYY-MM-DD' string
types.setTypeParser(1082, s => s);

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB ---
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://didou:didoupass@localhost:5432/didou',
});

// Ensure schema on boot
async function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'didou.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema ensured.');
}

// --- helpers ---
const normName = s =>
  (s || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

function hash(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.createHash('sha256').update(s + password).digest('hex');
  return { hash: h, salt: s };
}

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [String(email).toLowerCase().trim()]
  );
  return rows[0] || null;
}

async function nameTaken(name) {
  const { rows } = await pool.query(
    `SELECT 1 FROM users WHERE lower(btrim(name)) = lower(btrim($1))`,
    [name]
  );
  return !!rows.length;
}

const ymd = s => String(s).slice(0, 10); // 'YYYY-MM-DD'

// --- middleware & static ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Root -> sign-in page
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- AUTH ----------
/**
 * POST /api/signin
 * body: { name, email, password }
 * If email exists => verify (name & password).
 * Else create (name must be unique site-wide).
 */
app.post('/api/signin', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Missing fields.' });
    }
    const emailNorm = String(email).toLowerCase().trim();
    const user = await getUserByEmail(emailNorm);

    if (user) {
      const { hash: h } = hash(password, user.password_salt);
      const okName = normName(user.name) === normName(name);
      const okPw = !!user.password_hash && h === user.password_hash;
      if (!okName || !okPw) {
        return res
          .status(401)
          .json({ ok: false, error: 'Invalid email, name, or password.' });
      }
      return res.json({
        ok: true,
        user: { id: user.id, name: user.name, email: user.email },
      });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ ok: false, error: 'Password must be at least 6 characters.' });
    }
    if (await nameTaken(name)) {
      return res
        .status(409)
        .json({ ok: false, error: 'That name is already in use. Choose another.' });
    }

    const { hash: h, salt } = hash(password);
    const ins = await pool.query(
      `INSERT INTO users (name, email, password_hash, password_salt)
       VALUES ($1,$2,$3,$4)
       RETURNING id, name, email`,
      [name, emailNorm, h, salt]
    );
    return res.json({ ok: true, user: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/reset
 * body: { name, email, newPassword }
 */
app.post('/api/reset', async (req, res) => {
  try {
    const { name, email, newPassword } = req.body || {};
    if (!name || !email || !newPassword) {
      return res.status(400).json({ ok: false, error: 'Missing fields.' });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ ok: false, error: 'Password must be at least 6 characters.' });
    }
    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ ok: false, error: 'No account for this email.' });
    if (normName(user.name) !== normName(name)) {
      return res.status(401).json({ ok: false, error: 'Name does not match this email.' });
    }
    const { hash: h, salt } = hash(newPassword);
    await pool.query(
      `UPDATE users SET password_hash=$1, password_salt=$2 WHERE id=$3`,
      [h, salt, user.id]
    );
    res.json({ ok: true, message: 'Password updated.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- TRIPS ----------
/** Create trip */
app.post('/api/trips', async (req, res) => {
  try {
    const { name, destination, duration, start_date, end_date, leader_id } = req.body || {};
    if (!name || !destination || !duration || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, destination, duration, start_date, end_date are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO trips (name, destination, duration, start_date, end_date, leader_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, destination, duration,
                 to_char(start_date,'YYYY-MM-DD') AS start_date,
                 to_char(end_date,'YYYY-MM-DD')   AS end_date,
                 leader_id`,
      [name, destination, Number(duration), ymd(start_date), ymd(end_date), leader_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Get one trip */
app.get('/api/trips/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         t.id, t.name, t.destination, t.duration,
         to_char(t.start_date,'YYYY-MM-DD') AS start_date,
         to_char(t.end_date,'YYYY-MM-DD')   AS end_date,
         u.name AS leader_name
       FROM trips t
       LEFT JOIN users u ON u.id = t.leader_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- AVAILABILITY ----------
/** List all availability for a trip */
app.get('/api/trips/:id/availability', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         a.id,
         to_char(a.avail_start,'YYYY-MM-DD') AS avail_start,
         to_char(a.avail_end,'YYYY-MM-DD')   AS avail_end,
         u.id AS user_id, u.name, u.email
       FROM availabilities a
       JOIN users u ON u.id = a.user_id
       WHERE a.trip_id = $1
       ORDER BY a.avail_start, u.name`,
      [req.params.id]
    );
    res.json({ ok: true, list: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Upsert availability */
app.post('/api/trips/:id/availability', async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const { user_id, avail_start, avail_end } = req.body || {};
    if (!tripId || !user_id || !avail_start || !avail_end) {
      return res.status(400).json({ ok: false, error: 'Missing fields.' });
    }

    // read trip window
    const t = await pool.query(
      `SELECT duration,
              to_char(start_date,'YYYY-MM-DD') AS start_date,
              to_char(end_date,'YYYY-MM-DD')   AS end_date
       FROM trips WHERE id=$1`,
      [tripId]
    );
    if (!t.rows.length) return res.status(404).json({ ok: false, error: 'Trip not found.' });
    const trip = t.rows[0];

    // validate inside window
    const inside =
      trip.start_date <= avail_start &&
      avail_start <= trip.end_date   &&
      trip.start_date <= avail_end   &&
      avail_end   <= trip.end_date   &&
      avail_start <= avail_end;
    if (!inside) {
      return res.status(400).json({ ok: false, error: 'Pick dates within the trip window; end ≥ start.' });
    }

    // min length
    const days = (a,b)=> Math.floor((new Date(b)-new Date(a))/86400000)+1;
    const len = days(avail_start, avail_end);
    if (len < Number(trip.duration)) {
      return res.status(400).json({ ok: false, error: `Select at least ${trip.duration} days.` });
    }

    await pool.query(
      `INSERT INTO availabilities (trip_id, user_id, avail_start, avail_end)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (trip_id, user_id)
       DO UPDATE SET avail_start = EXCLUDED.avail_start, avail_end = EXCLUDED.avail_end`,
      [tripId, user_id, ymd(avail_start), ymd(avail_end)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- boot ---
ensureSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to ensure schema:', err.message);
  process.exit(1);
});