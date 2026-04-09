const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'journal.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS entry_models (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS trades (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    asset            TEXT    NOT NULL,
    direction        TEXT    NOT NULL CHECK(direction IN ('long', 'short')),
    pnl              TEXT    NOT NULL CHECK(pnl IN ('win', 'loss', 'breakeven')),
    risk_reward      REAL,
    risk_amount      REAL,
    entry_time       TEXT    NOT NULL,
    why_entered      TEXT,
    psychology       TEXT,
    improvements     TEXT,
    risk_management  TEXT    CHECK(risk_management IN ('low', 'perfect', 'high') OR risk_management IS NULL),
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS trade_entry_models (
    trade_id        INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    entry_model_id  INTEGER NOT NULL REFERENCES entry_models(id) ON DELETE CASCADE,
    PRIMARY KEY (trade_id, entry_model_id)
  );

  CREATE TABLE IF NOT EXISTS screenshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id      INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    type          TEXT    NOT NULL CHECK(type IN ('ltf', 'htf', 'daily_bias')),
    filename      TEXT    NOT NULL,
    original_name TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

module.exports = { db, UPLOADS_DIR };
