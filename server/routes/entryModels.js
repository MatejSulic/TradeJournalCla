const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM entry_models ORDER BY sort_order ASC, id ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM entry_models').get().n;
    const stmt = db.prepare('INSERT INTO entry_models (name, sort_order) VALUES (?, ?)');
    const result = stmt.run(name.trim(), nextOrder);
    res.status(201).json({ id: result.lastInsertRowid, name: name.trim(), sort_order: nextOrder });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'already exists' });
    throw e;
  }
});

router.patch('/reorder', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'expected array' });
  const update = db.prepare('UPDATE entry_models SET sort_order = ? WHERE id = ?');
  const run = db.transaction(() => {
    for (const { id, sort_order } of items) update.run(sort_order, id);
  });
  run();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM entry_models WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
