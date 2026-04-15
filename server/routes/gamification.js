const express = require('express');
const { getProfile, LEVELS } = require('../gamification');

const router = express.Router();

// GET /api/gamification/profile
router.get('/profile', (_req, res) => {
  res.json(getProfile('local'));
});

// GET /api/gamification/levels  — static reference, useful for the frontend
router.get('/levels', (_req, res) => {
  res.json(LEVELS);
});

module.exports = router;
