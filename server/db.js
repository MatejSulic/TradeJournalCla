const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB_PATH env overrides the default (scratch DBs for tests / UI verification);
// uploads then move next to that DB (or UPLOADS_DIR) so a scratch server never touches server/uploads.
const { DB_PATH, UPLOADS_DIR } = require('./paths').resolvePaths(process.env, __dirname);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let _db = new Database(DB_PATH);

function initPragmas() {
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
}

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

function runSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS series (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS entry_models (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS trades (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      asset            TEXT    NOT NULL,
      session_type     TEXT    NOT NULL DEFAULT 'live',
      series_id        INTEGER REFERENCES series(id) ON DELETE SET NULL,
      direction        TEXT    NOT NULL CHECK(direction IN ('long', 'short')),
      pnl              TEXT    NOT NULL CHECK(pnl IN ('win', 'loss', 'breakeven')),
      risk_reward      REAL,
      risk_amount      REAL,
      entry_time       TEXT    NOT NULL,
      premarket_analysis TEXT,
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

    -- Prop firm expenses
    CREATE TABLE IF NOT EXISTS prop_accounts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_name      TEXT    NOT NULL,
      account_size   REAL    NOT NULL,
      purchase_price REAL    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'eval'
                               CHECK(status IN ('eval', 'funded', 'blown')),
      purchased_at   TEXT    NOT NULL,
      notes          TEXT,
      created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS prop_payouts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id   INTEGER NOT NULL REFERENCES prop_accounts(id) ON DELETE CASCADE,
      amount       REAL    NOT NULL,
      payout_date  TEXT    NOT NULL,
      notes        TEXT,
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- AI Analyst conversations (context = frozen serialized journal data)
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT    NOT NULL,
      provider      TEXT    NOT NULL,
      model         TEXT    NOT NULL,
      filters       TEXT,
      context       TEXT    NOT NULL,
      trade_count   INTEGER NOT NULL,
      notrade_count INTEGER NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role            TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
      content         TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);

    -- Strategies: named checklists of entry-model rules (a rule is met when the trade has any of its options)
    CREATE TABLE IF NOT EXISTS strategies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS strategy_rules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
      label       TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS strategy_rule_options (
      rule_id        INTEGER NOT NULL REFERENCES strategy_rules(id) ON DELETE CASCADE,
      entry_model_id INTEGER NOT NULL REFERENCES entry_models(id) ON DELETE CASCADE,
      PRIMARY KEY (rule_id, entry_model_id)
    );

    -- Strategies: named checklists of entry-model rules (a rule is met when the trade has any of its options)
    CREATE TABLE IF NOT EXISTS strategies (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS strategy_rules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
      label       TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS strategy_rule_options (
      rule_id        INTEGER NOT NULL REFERENCES strategy_rules(id) ON DELETE CASCADE,
      entry_model_id INTEGER NOT NULL REFERENCES entry_models(id) ON DELETE CASCADE,
      PRIMARY KEY (rule_id, entry_model_id)
    );

  `);

  // Migrations for existing DBs (idempotent)
  try { db.exec(`ALTER TABLE trades ADD COLUMN session_type TEXT NOT NULL DEFAULT 'live'`); } catch (_) {}
  try { db.exec(`ALTER TABLE trades ADD COLUMN series_id INTEGER REFERENCES series(id) ON DELETE SET NULL`); } catch (_) {}
  try { db.exec(`ALTER TABLE entry_models ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE trades ADD COLUMN pnl_dollars REAL`); } catch (_) {}
  try { db.exec(`ALTER TABLE prop_accounts ADD COLUMN passed_at TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE prop_accounts ADD COLUMN blown_at TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE trades ADD COLUMN premarket_analysis TEXT`); } catch (_) {}
  migrateNoTradeDays();
  try { db.exec(`ALTER TABLE trades ADD COLUMN strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL`); } catch (_) {}
  try { db.exec(`ALTER TABLE trades ADD COLUMN strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL`); } catch (_) {}
  // What a breakeven trade would have become (win / loss) — only set when pnl = 'breakeven'
  try { db.exec(`ALTER TABLE trades ADD COLUMN be_outcome TEXT CHECK(be_outcome IN ('win', 'loss') OR be_outcome IS NULL)`); } catch (_) {}

  // Migrate legacy "X Backtest" asset names
  db.exec(`
    UPDATE trades
    SET session_type = 'backtest', asset = REPLACE(asset, ' Backtest', '')
    WHERE asset LIKE '% Backtest'
  `);
}

// No-trade days live in `trades` with day_type = 'notrade' and no asset/direction/pnl.
// Dropping NOT NULL needs a table rebuild (SQLite can't ALTER constraints).
function migrateNoTradeDays() {
  const cols = db.prepare('PRAGMA table_info(trades)').all();
  if (cols.some(c => c.name === 'day_type')) return;

  const keep = cols.map(c => c.name);
  // Old DBs may carry unrelated FK orphans (e.g. leftover gamification rows) — only fail on new ones
  const fkBefore = db.pragma('foreign_key_check').length;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE trades_new (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          day_type           TEXT    NOT NULL DEFAULT 'trade' CHECK(day_type IN ('trade', 'notrade')),
          asset              TEXT,
          session_type       TEXT    NOT NULL DEFAULT 'live',
          series_id          INTEGER REFERENCES series(id) ON DELETE SET NULL,
          direction          TEXT    CHECK(direction IN ('long', 'short') OR direction IS NULL),
          pnl                TEXT    CHECK(pnl IN ('win', 'loss', 'breakeven') OR pnl IS NULL),
          risk_reward        REAL,
          risk_amount        REAL,
          pnl_dollars        REAL,
          entry_time         TEXT    NOT NULL,
          premarket_analysis TEXT,
          why_entered        TEXT,
          no_trade_reason    TEXT,
          faded_setups       TEXT,
          psychology         TEXT,
          improvements       TEXT,
          risk_management    TEXT    CHECK(risk_management IN ('low', 'perfect', 'high') OR risk_management IS NULL),
          created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          CHECK(day_type = 'notrade' OR (asset IS NOT NULL AND direction IS NOT NULL AND pnl IS NOT NULL))
        );
      `);
      db.exec(`INSERT INTO trades_new (${keep.join(', ')}) SELECT ${keep.join(', ')} FROM trades`);
      db.exec('DROP TABLE trades');
      db.exec('ALTER TABLE trades_new RENAME TO trades');
      const fkErrors = db.pragma('foreign_key_check');
      if (fkErrors.length > fkBefore) throw new Error(`no-trade migration FK check failed: ${JSON.stringify(fkErrors)}`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function reinitDb() {
  _db = new Database(DB_PATH);
  initPragmas();
  runSchema();
}

initPragmas();
runSchema();

module.exports = { db, UPLOADS_DIR, DB_PATH, reinitDb };
