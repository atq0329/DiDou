// Import libraries
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

// Create app and set port
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());          // allow frontend to connect
app.use(express.json());  // allow reading JSON body

// Connect to SQLite database 
const db = new sqlite3.Database("travel.db", (err) => {
  if (err) console.error(err.message);
  console.log("Connected to SQLite database.");
});

// Routes
// Get all activities
app.get("/activities", (req, res) => {
  db.all("SELECT * FROM activities", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Add a new activity
app.post("/activities", (req, res) => {
  const { name, category, time_period, address } = req.body;

  // Validate input (address is optional)
  if (!name || !category || !time_period) {
    return res.status(400).json({ error: "Activity name, category, and time period are required" });
  }

  // Insert into database (4 columns → 4 placeholders)
  const sql = "INSERT INTO activities (name, category, time_period, address) VALUES (?, ?, ?, ?)";
  db.run(sql, [name, category, time_period, address || null], function (err) {
    if (err) {
      console.error("DB Insert Error:", err.message);
      return res.status(400).json({ error: err.message });
    }

    // Success response
    res.json({
      id: this.lastID,
      name,
      category,
      time_period,
      address: address || null
    });
  });
});



// Get one user's choices
app.get("/choices/:user", (req, res) => {
  const user = req.params.user;
  db.all(
    `SELECT user_choices.id, activities.name AS activity, activities.category, activities.time_period, activities.address
     FROM user_choices 
     JOIN activities ON user_choices.activity_id = activities.id
     WHERE user_choices.user = ?`,
    [user],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Add a new choice for a user
app.post("/choices", (req, res) => {
  const { user, activity_id } = req.body;

  if (!user || !activity_id) {
    return res.status(400).json({ error: "User and activity_id are required" });
  }

  const sql = "INSERT INTO user_choices (user, activity_id) VALUES (?, ?)";
  db.run(sql, [user, activity_id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, user, activity_id });
  });
});

// Delete one choice
app.delete("/choices/:id", (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM user_choices WHERE id = ?", id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Choice removed", id });
  });
});

// Get all choices (all users)
app.get("/choices", (req, res) => {
  db.all(
    `SELECT user_choices.id, user_choices.user, activities.name AS activity,
            activities.category, activities.time_period, activities.address
     FROM user_choices
     JOIN activities ON user_choices.activity_id = activities.id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Start server 
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
