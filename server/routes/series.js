const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT s.*, COUNT(t.id) as trade_count
    FROM series s
    LEFT JOIN trades t ON t.series_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const result = db.prepare(
      `INSERT INTO series (name, description) VALUES (?, ?)`
    ).run(name.trim(), description?.trim() || null);
    const row = db.prepare('SELECT * FROM series WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...row, trade_count: 0 });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    db.prepare(`
      UPDATE series SET name = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?
    `).run(name.trim(), description?.trim() || null, req.params.id);
    const row = db.prepare(`
      SELECT s.*, COUNT(t.id) as trade_count FROM series s
      LEFT JOIN trades t ON t.series_id = s.id
      WHERE s.id = ? GROUP BY s.id
    `).get(req.params.id);
    res.json(row);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'already exists' });
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM series WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
