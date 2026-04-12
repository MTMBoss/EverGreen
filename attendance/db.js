const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || "";

if (!connectionString) {
  throw new Error("DATABASE_URL non configurata.");
}

const isLocalConnection =
  connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

const pool = new Pool({
  connectionString,
  ssl: isLocalConnection ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

let initPromise = null;

async function ensureDbReady() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        discord_user_id TEXT UNIQUE NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        display_name TEXT NOT NULL,
        tracked_roles_json TEXT NOT NULL DEFAULT '[]',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_synced_at TIMESTAMPTZ NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_days (
        id SERIAL PRIMARY KEY,
        day_date DATE UNIQUE NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_entries (
        id SERIAL PRIMARY KEY,
        day_id INTEGER NOT NULL REFERENCES attendance_days(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        slot_21_22 BOOLEAN NOT NULL DEFAULT FALSE,
        slot_22_23 BOOLEAN NOT NULL DEFAULT FALSE,
        slot_23_00 BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT NOT NULL DEFAULT '',
        updated_by_discord_user_id TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE(day_id, member_id)
      )
    `);
  })().catch(error => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

module.exports = {
  pool,
  ensureDbReady,
};
