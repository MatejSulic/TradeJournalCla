const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM entry_models ORDER BY name ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const stmt = db.prepare('INSERT INTO entry_models (name) VALUES (?)');
    const result = stmt.run(name.trim());
    res.status(201).json({ id: result.lastInsertRowid, name: name.trim() });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'already exists' });
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM entry_models WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
