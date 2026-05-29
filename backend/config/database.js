const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY,
      name          VARCHAR(100)  NOT NULL,
      email         VARCHAR(254)  UNIQUE NOT NULL,
      password_hash VARCHAR(255)  NOT NULL,
      created_at    TIMESTAMPTZ   DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS glucose_entries (
      id           UUID PRIMARY KEY,
      user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      value        INTEGER      NOT NULL,
      date         TIMESTAMPTZ  NOT NULL,
      note         TEXT,
      meal_context VARCHAR(50),
      created_at   TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stats (
      key   VARCHAR PRIMARY KEY,
      value INTEGER DEFAULT 0
    );

    INSERT INTO stats (key, value) VALUES ('food_scans', 0) ON CONFLICT DO NOTHING;
  `);
  console.log('[DB] Tables prêtes');
}

module.exports = { pool, createTables };
