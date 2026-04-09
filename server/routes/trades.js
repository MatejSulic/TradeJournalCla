const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, UPLOADS_DIR } = require('../db');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const uploadFields = upload.fields([
  { name: 'ltf_screenshots', maxCount: 10 },
  { name: 'htf_screenshots', maxCount: 10 },
  { name: 'daily_bias_screenshots', maxCount: 5 },
]);

// Attach entry model names and screenshots to a trade row
function hydrateTrade(trade) {
  const models = db.prepare(`
    SELECT em.id, em.name FROM entry_models em
    JOIN trade_entry_models tem ON tem.entry_model_id = em.id
    WHERE tem.trade_id = ?
  `).all(trade.id);
  return { ...trade, entry_models: models };
}

// List all trades
router.get('/', (req, res) => {
  const { asset, direction, entry_model_id, from, to, pnl } = req.query;
  let sql = 'SELECT DISTINCT t.* FROM trades t';
  const joins = [];
  const where = ['1=1'];
  const params = [];

  const modelIds = entry_model_id
    ? (Array.isArray(entry_model_id) ? entry_model_id : [entry_model_id]).map(Number).filter(Boolean)
    : [];
  if (modelIds.length) {
    // AND logic: trade must have ALL selected setups
    where.push(`t.id IN (
      SELECT trade_id FROM trade_entry_models
      WHERE entry_model_id IN (${modelIds.map(() => '?').join(',')})
      GROUP BY trade_id
      HAVING COUNT(DISTINCT entry_model_id) = ?
    )`);
    params.push(...modelIds, modelIds.length);
  }

  if (joins.length) sql += ' ' + joins.join(' ');
  sql += ' WHERE ' + where.join(' AND ');

  if (asset)      { sql += ' AND t.asset = ?';      params.push(asset); }
  if (direction)  { sql += ' AND t.direction = ?';  params.push(direction); }
  if (pnl)        { sql += ' AND t.pnl = ?';        params.push(pnl); }
  if (from)       { sql += ' AND t.entry_time >= ?'; params.push(from); }
  if (to)         { sql += ' AND t.entry_time <= ?'; params.push(to); }

  sql += ' ORDER BY t.entry_time DESC';

  const trades = db.prepare(sql).all(...params).map(hydrateTrade);
  res.json(trades);
});

// Stats for dashboard
router.get('/stats', (_req, res) => {
  const trades = db.prepare('SELECT pnl, risk_reward FROM trades').all();
  if (!trades.length) return res.json({ total: 0, wins: 0, losses: 0, breakevens: 0, winRate: 0, avgRR: 0 });

  const wins       = trades.filter(t => t.pnl === 'win').length;
  const losses     = trades.filter(t => t.pnl === 'loss').length;
  const breakevens = trades.filter(t => t.pnl === 'breakeven').length;
  const rrTrades   = trades.filter(t => t.risk_reward != null);
  const avgRR      = rrTrades.length ? rrTrades.reduce((s, t) => s + t.risk_reward, 0) / rrTrades.length : 0;
  const decidedTrades = wins + losses;

  res.json({
    total: trades.length,
    wins,
    losses,
    breakevens,
    winRate: decidedTrades ? (wins / decidedTrades) * 100 : 0,
    avgRR,
  });
});

// Win/loss performance curve
router.get('/equity', (_req, res) => {
  const rows = db.prepare('SELECT entry_time, pnl FROM trades ORDER BY entry_time ASC').all();
  let score = 0;
  const data = rows.map(r => {
    if (r.pnl === 'win')  score += 1;
    if (r.pnl === 'loss') score -= 1;
    return { date: r.entry_time, pnl: r.pnl, score };
  });
  res.json(data);
});

// Get single trade with screenshots
router.get('/:id', (req, res) => {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return res.status(404).json({ error: 'not found' });
  const screenshots = db.prepare('SELECT * FROM screenshots WHERE trade_id = ? ORDER BY type, created_at').all(trade.id);
  res.json({ ...hydrateTrade(trade), screenshots });
});

// Create trade
router.post('/', uploadFields, (req, res) => {
  const { asset, direction, pnl, risk_reward, risk_amount, entry_time,
          why_entered, psychology, improvements, risk_management, entry_model_ids } = req.body;

  if (!asset || !direction || !pnl || !entry_time)
    return res.status(400).json({ error: 'asset, direction, pnl, entry_time required' });

  const insert = db.prepare(`
    INSERT INTO trades (asset, direction, pnl, risk_reward, risk_amount,
                        entry_time, why_entered, psychology, improvements, risk_management)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insert.run(
    asset, direction, pnl,
    risk_reward ? parseFloat(risk_reward) : null,
    risk_amount ? parseFloat(risk_amount) : null,
    entry_time,
    why_entered || null, psychology || null,
    improvements || null, risk_management || null
  );

  const tradeId = result.lastInsertRowid;

  saveEntryModels(tradeId, entry_model_ids);
  saveScreenshots(req.files, tradeId);

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  const screenshots = db.prepare('SELECT * FROM screenshots WHERE trade_id = ?').all(tradeId);
  res.status(201).json({ ...hydrateTrade(trade), screenshots });
});

// Update trade
router.put('/:id', uploadFields, (req, res) => {
  const trade = db.prepare('SELECT id FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return res.status(404).json({ error: 'not found' });

  const { asset, direction, pnl, risk_reward, risk_amount, entry_time,
          why_entered, psychology, improvements, risk_management,
          delete_screenshot_ids, entry_model_ids } = req.body;

  db.prepare(`
    UPDATE trades SET
      asset = ?, direction = ?, pnl = ?, risk_reward = ?,
      risk_amount = ?, entry_time = ?, why_entered = ?, psychology = ?,
      improvements = ?, risk_management = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(
    asset, direction, pnl,
    risk_reward ? parseFloat(risk_reward) : null,
    risk_amount ? parseFloat(risk_amount) : null,
    entry_time,
    why_entered || null, psychology || null,
    improvements || null, risk_management || null,
    req.params.id
  );

  // Replace entry models
  db.prepare('DELETE FROM trade_entry_models WHERE trade_id = ?').run(req.params.id);
  saveEntryModels(req.params.id, entry_model_ids);

  // Delete specified screenshots
  if (delete_screenshot_ids) {
    const ids = (Array.isArray(delete_screenshot_ids) ? delete_screenshot_ids : [delete_screenshot_ids])
      .map(Number).filter(Boolean);
    for (const sid of ids) {
      const ss = db.prepare('SELECT filename FROM screenshots WHERE id = ? AND trade_id = ?').get(sid, req.params.id);
      if (ss) {
        const fp = path.join(UPLOADS_DIR, ss.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        db.prepare('DELETE FROM screenshots WHERE id = ?').run(sid);
      }
    }
  }

  saveScreenshots(req.files, req.params.id);

  const updated = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  const screenshots = db.prepare('SELECT * FROM screenshots WHERE trade_id = ?').all(req.params.id);
  res.json({ ...hydrateTrade(updated), screenshots });
});

// Delete trade
router.delete('/:id', (req, res) => {
  const screenshots = db.prepare('SELECT filename FROM screenshots WHERE trade_id = ?').all(req.params.id);
  for (const ss of screenshots) {
    const fp = path.join(UPLOADS_DIR, ss.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function saveEntryModels(tradeId, entry_model_ids) {
  if (!entry_model_ids) return;
  const ids = (Array.isArray(entry_model_ids) ? entry_model_ids : [entry_model_ids])
    .map(Number).filter(Boolean);
  const insertTem = db.prepare('INSERT OR IGNORE INTO trade_entry_models (trade_id, entry_model_id) VALUES (?, ?)');
  for (const mid of ids) {
    insertTem.run(tradeId, mid);
  }
}

function saveScreenshots(files, tradeId) {
  if (!files) return;
  const insertSS = db.prepare(
    'INSERT INTO screenshots (trade_id, type, filename, original_name) VALUES (?, ?, ?, ?)'
  );
  for (const type of ['ltf', 'htf', 'daily_bias']) {
    const key = `${type}_screenshots`;
    if (files[key]) {
      for (const f of files[key]) {
        insertSS.run(tradeId, type, f.filename, f.originalname);
      }
    }
  }
}

module.exports = router;
