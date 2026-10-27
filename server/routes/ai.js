const express = require('express');
const { db } = require('../db');
const { getStatus, getProvider, defaultProvider } = require('../ai');
const { buildContext, estimateTokens } = require('../ai/context');
const { SYSTEM_PROMPT } = require('../ai/prompt');

const router = express.Router();

// Conversation ids with a stream in progress (double submit -> 409 busy)
const active = new Set();

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
const LIST_COLUMNS = 'id, title, provider, model, trade_count, notrade_count, created_at, updated_at';

const isPosInt = (n) => Number.isInteger(n) && n > 0;

// Path id -> positive int or null (null => 404)
function pathId(raw) {
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return isPosInt(n) ? n : null;
}

// Body id list -> unique positive ints; missing = []; anything else invalid => null (400)
function idList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids = value.map((v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v));
  if (!ids.every(isPosInt)) return null;
  return [...new Set(ids)];
}

function parseIds(body) {
  const tradeIds = idList(body.trade_ids);
  const notradeIds = idList(body.notrade_ids);
  if (!tradeIds || !notradeIds) return { error: 'trade_ids and notrade_ids must be arrays of positive integers' };
  return { tradeIds, notradeIds };
}

// Same row shape as GET /api/trades/:id (series_name join + entry_models), filtered by day_type.
// Unknown ids / wrong day_type are silently dropped.
function loadRows(ids, dayType) {
  if (!ids.length) return [];
  const json = JSON.stringify(ids);
  const rows = db.prepare(`
    SELECT t.*, s.name as series_name, st.name as strategy_name FROM trades t
    LEFT JOIN series s ON s.id = t.series_id
    LEFT JOIN strategies st ON st.id = t.strategy_id
    WHERE t.id IN (SELECT value FROM json_each(?)) AND t.day_type = ?
  `).all(json, dayType);
  const models = db.prepare(`
    SELECT tem.trade_id, em.id, em.name FROM trade_entry_models tem
    JOIN entry_models em ON em.id = tem.entry_model_id
    WHERE tem.trade_id IN (SELECT value FROM json_each(?))
    ORDER BY em.sort_order, em.name
  `).all(json);
  const byTrade = new Map();
  for (const m of models) {
    if (!byTrade.has(m.trade_id)) byTrade.set(m.trade_id, []);
    byTrade.get(m.trade_id).push({ id: m.id, name: m.name });
  }
  return rows.map((r) => ({ ...r, entry_models: byTrade.get(r.id) || [] }));
}

function loadSelection(body) {
  const ids = parseIds(body);
  if (ids.error) return ids;
  const trades = loadRows(ids.tradeIds, 'trade');
  const noTradeDays = loadRows(ids.notradeIds, 'notrade');
  return { ids, trades, noTradeDays };
}

function parseFilters(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function getMessages(conversationId) {
  return db.prepare(
    'SELECT id, role, content, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY id'
  ).all(conversationId);
}

// Conversation without `context` + messages + context_tokens (shape of GET /conversations/:id)
function getConversation(id) {
  const c = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id);
  if (!c) return null;
  const { context, filters, ...rest } = c;
  return { ...rest, filters: parseFilters(filters), context_tokens: estimateTokens(context), messages: getMessages(id) };
}

function touch(id) {
  db.prepare(`UPDATE ai_conversations SET updated_at = ${NOW} WHERE id = ?`).run(id);
}

router.get('/status', (_req, res) => {
  res.json(getStatus());
});

router.post('/estimate', (req, res) => {
  const sel = loadSelection(req.body || {});
  if (sel.error) return res.status(400).json({ error: sel.error });
  const { text } = buildContext(sel.trades, sel.noTradeDays);
  res.json({ tokens: estimateTokens(text), trade_count: sel.trades.length, notrade_count: sel.noTradeDays.length });
});

router.get('/conversations', (_req, res) => {
  res.json(db.prepare(`SELECT ${LIST_COLUMNS} FROM ai_conversations ORDER BY updated_at DESC, id DESC`).all());
});

router.post('/conversations', (req, res) => {
  const body = req.body || {};
  const sel = loadSelection(body);
  if (sel.error) return res.status(400).json({ error: sel.error });
  if (!sel.ids.tradeIds.length && !sel.ids.notradeIds.length) {
    return res.status(400).json({ error: 'select at least one trade or no-trade day' });
  }
  const provider = defaultProvider();
  if (!provider) return res.status(400).json({ error: 'no AI provider configured' });
  if (!sel.trades.length && !sel.noTradeDays.length) {
    return res.status(400).json({ error: 'none of the selected trades exist' });
  }

  const { text } = buildContext(sel.trades, sel.noTradeDays);
  const title = (typeof body.title === 'string' && body.title.trim()) ? body.title.trim().slice(0, 200) : 'New analysis';
  const filters = body.filters && typeof body.filters === 'object' ? JSON.stringify(body.filters) : null;

  const result = db.prepare(`
    INSERT INTO ai_conversations (title, provider, model, filters, context, trade_count, notrade_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, provider.id, provider.model, filters, text, sel.trades.length, sel.noTradeDays.length);

  res.status(201).json(getConversation(result.lastInsertRowid));
});

router.get('/conversations/:id', (req, res) => {
  const id = pathId(req.params.id);
  const c = id && getConversation(id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

router.patch('/conversations/:id', (req, res) => {
  const id = pathId(req.params.id);
  if (!id || !db.prepare('SELECT 1 FROM ai_conversations WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'not found' });
  }
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'title is required' });
  // Rename does not bump updated_at, so the conversation keeps its place in the list
  db.prepare('UPDATE ai_conversations SET title = ? WHERE id = ?').run(title.slice(0, 200), id);
  res.json(getConversation(id));
});

router.delete('/conversations/:id', (req, res) => {
  const id = pathId(req.params.id);
  const result = id ? db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(id) : { changes: 0 };
  if (!result.changes) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Send a message (or { retry: true }) -> SSE: delta* then done | error
router.post('/conversations/:id/messages', async (req, res) => {
  const id = pathId(req.params.id);
  const conv = id && db.prepare('SELECT id, provider, model, context FROM ai_conversations WHERE id = ?').get(id);
  if (!conv) return res.status(404).json({ error: 'not found' });

  const body = req.body || {};
  const retry = body.retry === true;
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (retry) {
    const last = db.prepare('SELECT role FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(id);
    if (!last || last.role !== 'user') return res.status(400).json({ error: 'nothing to retry' });
  } else if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  if (active.has(id)) return res.status(409).json({ error: 'busy' });
  // Follow-ups use the conversation's stored provider + model, not today's env model
  const provider = getProvider(conv.provider, process.env, { model: conv.model });
  if (!provider) {
    return res.status(409).json({ error: `AI provider "${conv.provider}" is not available (API key missing?)` });
  }

  active.add(id);
  const ac = new AbortController();
  let finished = false;
  // res 'close' fires on client disconnect (req 'close' fires once the body is read)
  res.on('close', () => { if (!finished) ac.abort(); });
  const send = (event) => {
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    if (!retry) {
      db.prepare('INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)').run(id, 'user', content);
      touch(id);
    }
    const messages = getMessages(id).map(({ role, content: c }) => ({ role, content: c }));

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();

    const { text } = await provider.stream({
      system: SYSTEM_PROMPT,
      context: conv.context,
      messages,
      signal: ac.signal,
      onText: (t) => send({ type: 'delta', text: t }),
    });
    if (ac.signal.aborted) return; // client gone: do not save a partial answer

    const r = db.prepare('INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)').run(id, 'assistant', text);
    touch(id);
    const message = db.prepare('SELECT id, role, content, created_at FROM ai_messages WHERE id = ?').get(r.lastInsertRowid);
    send({ type: 'done', message });
  } catch (err) {
    if (!ac.signal.aborted) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'AI request failed' });
      } else {
        send({ type: 'error', code: err.code || 'unavailable', message: err.message || 'AI request failed' });
      }
    }
  } finally {
    finished = true;
    active.delete(id);
    if (!res.writableEnded) res.end();
  }
});

module.exports = router;
