// server.js (PostgreSQL)
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ---- DB pool ----
const pool = new Pool({
  connectionString: 'postgresql://didou:didoupass@localhost:5432/didou',
});

// Ensure schema exists on boot (reads your .sql file)
async function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema ensured.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create trip
app.post('/api/trips', async (req, res) => {
  try {
    const { name, destination, duration, start_date, end_date } = req.body || {};
    if (!name || !destination || !duration) {
      return res.status(400).json({ error: 'name, destination, duration are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO trips (name, destination, duration, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [name, destination, duration, start_date || null, end_date || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// List trips
app.get('/api/trips', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM trips ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

ensureSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/LeaderPage.html`);
  });
}).catch(err => {
  console.error('Failed to ensure schema:', err.message);
  process.exit(1);
});
app.get('/api/trips/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM trips WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
