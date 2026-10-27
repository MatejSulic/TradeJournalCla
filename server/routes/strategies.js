const express = require('express');
const { db } = require('../db');
const { listStrategies, getStrategy, saveStrategy } = require('../strategyStore');

const router = express.Router();

function save(id, req, res, status) {
  try {
    res.status(status).json(saveStrategy(id, req.body));
  } catch (e) {
    if (!e.status) throw e;
    res.status(e.status).json({ error: e.message });
  }
}

router.get('/', (_req, res) => res.json(listStrategies()));

router.get('/:id', (req, res) => {
  const s = getStrategy(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});

router.post('/', (req, res) => save(null, req, res, 201));
router.put('/:id', (req, res) => save(req.params.id, req, res, 200));

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM strategies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
