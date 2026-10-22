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
  const { asset, direction, entry_model_id, from, to, pnl, session_type, series_id } = req.query;
  const day_type = req.query.day_type || 'trade'; // 'trade' | 'notrade' | 'all'
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

  if (day_type !== 'all') { sql += ' AND t.day_type = ?'; params.push(day_type); }
  if (asset)        { sql += ' AND t.asset = ?';          params.push(asset); }
  if (session_type) { sql += ' AND t.session_type = ?';   params.push(session_type); }
  if (series_id)    { sql += ' AND t.series_id = ?';      params.push(Number(series_id)); }
  if (direction)    { sql += ' AND t.direction = ?';      params.push(direction); }
  if (pnl === 'be_win' || pnl === 'be_loss') {
    sql += " AND t.pnl = 'breakeven' AND t.be_outcome = ?"; params.push(pnl.slice(3));
  } else if (pnl)   { sql += ' AND t.pnl = ?';            params.push(pnl); }
  if (from)         { sql += ' AND t.entry_time >= ?';    params.push(from); }
  if (to)           { sql += ' AND t.entry_time <= ?';    params.push(to); }

  sql += ' ORDER BY t.created_at DESC';

  const trades = db.prepare(sql).all(...params).map(hydrateTrade);
  res.json(trades);
});

// Get single trade with screenshots
router.get('/:id', (req, res) => {
  const trade = db.prepare(`
    SELECT t.*, s.name as series_name FROM trades t
    LEFT JOIN series s ON s.id = t.series_id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!trade) return res.status(404).json({ error: 'not found' });
  const screenshots = db.prepare('SELECT * FROM screenshots WHERE trade_id = ? ORDER BY type, created_at').all(trade.id);
  res.json({ ...hydrateTrade(trade), screenshots });
});

// Create trade
router.post('/', uploadFields, (req, res) => {
  const v = tradeValues(req.body);
  if (!v.error) v.error = duplicateNoTradeError(v);
  if (v.error) return rejectWithCleanup(req, res, v.error);

  const result = db.prepare(`
    INSERT INTO trades (${TRADE_COLUMNS.join(', ')})
    VALUES (${TRADE_COLUMNS.map(() => '?').join(', ')})
  `).run(...TRADE_COLUMNS.map(c => v[c]));

  const tradeId = result.lastInsertRowid;

  if (v.day_type === 'trade') saveEntryModels(tradeId, req.body.entry_model_ids);
  saveScreenshots(req.files, tradeId);

  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  const screenshots = db.prepare('SELECT * FROM screenshots WHERE trade_id = ?').all(tradeId);
  res.status(201).json({ ...hydrateTrade(trade), screenshots });
});

// Update trade
router.put('/:id', uploadFields, (req, res) => {
  const trade = db.prepare('SELECT id FROM trades WHERE id = ?').get(req.params.id);
  if (!trade) return rejectWithCleanup(req, res, 'not found', 404);

  const { delete_screenshot_ids, entry_model_ids } = req.body;
  const v = tradeValues(req.body);
  if (!v.error) v.error = duplicateNoTradeError(v, req.params.id);
  if (v.error) return rejectWithCleanup(req, res, v.error);

  db.prepare(`
    UPDATE trades SET
      ${TRADE_COLUMNS.map(c => `${c} = ?`).join(', ')},
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(...TRADE_COLUMNS.map(c => v[c]), req.params.id);

  // Replace entry models
  db.prepare('DELETE FROM trade_entry_models WHERE trade_id = ?').run(req.params.id);
  if (v.day_type === 'trade') saveEntryModels(req.params.id, entry_model_ids);

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

  // No-trade days have no LTF screenshots — drop any left over from a trade switched to no-trade
  if (v.day_type === 'notrade') {
    const ltf = db.prepare("SELECT id, filename FROM screenshots WHERE trade_id = ? AND type = 'ltf'").all(req.params.id);
    for (const ss of ltf) {
      const fp = path.join(UPLOADS_DIR, ss.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      db.prepare('DELETE FROM screenshots WHERE id = ?').run(ss.id);
    }
  }

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

const TRADE_COLUMNS = [
  'day_type', 'asset', 'session_type', 'series_id', 'direction', 'pnl', 'be_outcome', 'risk_reward', 'risk_amount',
  'pnl_dollars', 'entry_time', 'premarket_analysis', 'why_entered', 'no_trade_reason', 'faded_setups',
  'psychology', 'improvements', 'risk_management',
];

// Normalise request body into column values. No-trade days keep only their own notes.
function tradeValues(body) {
  const day_type = body.day_type === 'notrade' ? 'notrade' : 'trade';
  const text = k => body[k] || null;
  const num = k => body[k] !== undefined && body[k] !== '' ? parseFloat(body[k]) : null;

  if (!body.entry_time) return { error: 'entry_time required' };

  if (day_type === 'notrade') {
    return {
      day_type, asset: null, session_type: 'live', series_id: null, direction: null, pnl: null, be_outcome: null,
      risk_reward: null, risk_amount: null, pnl_dollars: null, entry_time: body.entry_time,
      premarket_analysis: text('premarket_analysis'), why_entered: null,
      no_trade_reason: text('no_trade_reason'), faded_setups: text('faded_setups'),
      psychology: text('psychology'), improvements: null, risk_management: null,
    };
  }

  if (!body.asset || !body.direction || !body.pnl)
    return { error: 'asset, direction, pnl, entry_time required' };
  if (!['long', 'short'].includes(body.direction)) return { error: 'invalid direction' };
  if (!['win', 'loss', 'breakeven'].includes(body.pnl)) return { error: 'invalid pnl' };
  if (body.be_outcome && !['win', 'loss'].includes(body.be_outcome)) return { error: 'invalid be_outcome' };
  if (body.session_type && !['live', 'backtest'].includes(body.session_type)) return { error: 'invalid session_type' };
  if (body.risk_management && !['low', 'perfect', 'high'].includes(body.risk_management))
    return { error: 'invalid risk_management' };

  return {
    day_type, asset: body.asset, session_type: body.session_type || 'live',
    series_id: body.series_id ? Number(body.series_id) : null,
    direction: body.direction, pnl: body.pnl,
    be_outcome: body.pnl === 'breakeven' ? body.be_outcome || null : null,
    risk_reward: body.risk_reward ? parseFloat(body.risk_reward) : null,
    risk_amount: body.risk_amount ? parseFloat(body.risk_amount) : null,
    pnl_dollars: num('pnl_dollars'), entry_time: body.entry_time,
    premarket_analysis: text('premarket_analysis'), why_entered: text('why_entered'),
    no_trade_reason: null, faded_setups: null,
    psychology: text('psychology'), improvements: text('improvements'), risk_management: text('risk_management'),
  };
}

// One no-trade day per date
function duplicateNoTradeError(v, ownId = null) {
  if (v.day_type !== 'notrade') return null;
  const dup = db.prepare(`
    SELECT id FROM trades WHERE day_type = 'notrade' AND substr(entry_time, 1, 10) = ? AND id != ?
  `).get(v.entry_time.slice(0, 10), ownId ?? -1);
  return dup ? 'a no-trade day for this date already exists' : null;
}

// Multer saves uploads before validation — remove them when the request is rejected
function rejectWithCleanup(req, res, error, status = 400) {
  for (const f of Object.values(req.files ?? {}).flat()) {
    try { fs.unlinkSync(f.path); } catch (_) {}
  }
  return res.status(status).json({ error });
}

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
