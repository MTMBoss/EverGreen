const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const defaultDbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "attendance.db");
const resolvedDbPath = path.resolve(defaultDbPath);

fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

const db = new Database(resolvedDbPath);
db.pragma("journal_mode = WAL");

module.exports = { db, resolvedDbPath };
