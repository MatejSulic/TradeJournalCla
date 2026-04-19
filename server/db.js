const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'journal.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let _db = new Database(DB_PATH);

function initPragmas() {
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
}

function reinitDb() {
  _db = new Database(DB_PATH);
  initPragmas();
}

initPragmas();

// Proxy so all consumers keep their existing `db.prepare(...)` calls working
// even after reinitDb() swaps the underlying instance.
const db = new Proxy({}, {
  get(_, prop) {
    const val = _db[prop];
    return typeof val === 'function' ? val.bind(_db) : val;
  },
  set(_, prop, value) {
    _db[prop] = value;
    return true;
  },
});

db.exec(`
  CREATE TABLE IF NOT EXISTS entry_models (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS trades (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    asset            TEXT    NOT NULL,
    session_type     TEXT    NOT NULL DEFAULT 'live',
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

  -- Gamification tables
  CREATE TABLE IF NOT EXISTS player_profile (
    user_id         TEXT    PRIMARY KEY DEFAULT 'local',
    xp              INTEGER NOT NULL DEFAULT 0,
    level           INTEGER NOT NULL DEFAULT 1,
    streak_days     INTEGER NOT NULL DEFAULT 0,
    last_trade_date TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS achievements (
    key         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    icon        TEXT NOT NULL,
    xp_reward   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS player_achievements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT    NOT NULL DEFAULT 'local',
    achievement_key TEXT    NOT NULL REFERENCES achievements(key),
    trade_id        INTEGER REFERENCES trades(id) ON DELETE SET NULL,
    unlocked_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(user_id, achievement_key)
  );

  CREATE TABLE IF NOT EXISTS xp_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL DEFAULT 'local',
    trade_id   INTEGER REFERENCES trades(id) ON DELETE SET NULL,
    source     TEXT    NOT NULL,
    amount     INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);

// Migration: add session_type column if it doesn't exist yet (existing DBs)
try {
  db.exec(`ALTER TABLE trades ADD COLUMN session_type TEXT NOT NULL DEFAULT 'live'`);
} catch (_) { /* already exists */ }

// Migrate legacy "X Backtest" asset names to session_type = 'backtest'
db.exec(`
  UPDATE trades
  SET session_type = 'backtest', asset = REPLACE(asset, ' Backtest', '')
  WHERE asset LIKE '% Backtest'
`);

// Seed achievement definitions (idempotent)
const seedAchievement = db.prepare(`
  INSERT OR IGNORE INTO achievements (key, name, description, icon, xp_reward)
  VALUES (?, ?, ?, ?, ?)
`);

const achievementSeeds = [
  ['first_trade',     'First Blood',      'Log your first trade',                        '🩸', 100],
  ['hat_trick',       'Hat Trick',        'Win 3 trades in a row',                       '🎩', 150],
  ['deep_reflection', 'Deep Reflection',  'Complete all 3 notes on 10 different trades', '🧠', 200],
  ['full_chart',      'Chart Surgeon',    'Upload all 3 screenshot types on one trade',  '🔬', 75],
  ['perfect_risk',    'Iron Discipline',  'Log 10 trades with Perfect risk management',  '🛡️', 250],
  ['setup_collector', 'Setup Collector',  'Create and use 5+ different entry models',    '🗂️', 100],
  ['streak_7',        'Consistent',       'Maintain a 7-day logging streak',             '🔥', 300],
  ['century',         'Century Club',     'Log 100 trades total',                        '💯', 500],
  ['high_conviction', 'High Conviction',  'Log 5 trades with R:R ≥ 3.0',               '💎', 200],
  ['diversified',     'Asset Explorer',   'Trade 5 different assets',                    '🗺️', 150],
];

for (const row of achievementSeeds) seedAchievement.run(...row);

module.exports = { db, UPLOADS_DIR, DB_PATH, reinitDb };
