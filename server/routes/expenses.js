const express = require('express');
const router = express.Router();
const { db } = require('../db');

const getPayouts = () => db.prepare('SELECT * FROM prop_payouts WHERE account_id = ? ORDER BY payout_date DESC');

function fetchAccount(id) {
  const account = db.prepare(`
    SELECT pa.*, COALESCE(SUM(pp.amount), 0) AS total_payouts
    FROM prop_accounts pa
    LEFT JOIN prop_payouts pp ON pp.account_id = pa.id
    WHERE pa.id = ?
    GROUP BY pa.id
  `).get(id);
  if (!account) return null;
  return { ...account, payouts: getPayouts().all(id) };
}

// GET /api/expenses/accounts
router.get('/accounts', (req, res) => {
  const accounts = db.prepare(`
    SELECT pa.*, COALESCE(SUM(pp.amount), 0) AS total_payouts
    FROM prop_accounts pa
    LEFT JOIN prop_payouts pp ON pp.account_id = pa.id
    GROUP BY pa.id
    ORDER BY CASE pa.status WHEN 'funded' THEN 1 WHEN 'eval' THEN 2 WHEN 'blown' THEN 3 END, pa.created_at DESC
  `).all();

  const result = accounts.map(a => ({ ...a, payouts: getPayouts().all(a.id) }));
  res.json(result);
});

// POST /api/expenses/accounts
router.post('/accounts', (req, res) => {
  const { firm_name, account_size, purchase_price, status, purchased_at, passed_at, blown_at, notes } = req.body;
  if (!firm_name || account_size == null || purchase_price == null || !purchased_at) {
    return res.status(400).json({ error: 'firm_name, account_size, purchase_price, and purchased_at are required' });
  }

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO prop_accounts (firm_name, account_size, purchase_price, status, purchased_at, passed_at, blown_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(firm_name, account_size, purchase_price, status || 'eval', purchased_at, passed_at || null, blown_at || null, notes || null);

  res.status(201).json(fetchAccount(lastInsertRowid));
});

// PUT /api/expenses/accounts/:id
router.put('/accounts/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM prop_accounts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Account not found' });

  const { firm_name, account_size, purchase_price, status, purchased_at, passed_at, blown_at, notes } = req.body;
  db.prepare(`
    UPDATE prop_accounts
    SET firm_name = ?, account_size = ?, purchase_price = ?, status = ?,
        purchased_at = ?, passed_at = ?, blown_at = ?, notes = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = ?
  `).run(
    firm_name      ?? existing.firm_name,
    account_size   ?? existing.account_size,
    purchase_price ?? existing.purchase_price,
    status         ?? existing.status,
    purchased_at   ?? existing.purchased_at,
    passed_at !== undefined ? (passed_at || null) : existing.passed_at,
    blown_at  !== undefined ? (blown_at  || null) : existing.blown_at,
    notes !== undefined ? notes : existing.notes,
    id
  );

  res.json(fetchAccount(id));
});

// DELETE /api/expenses/accounts/:id
router.delete('/accounts/:id', (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM prop_accounts WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Account not found' });
  }
  db.prepare('DELETE FROM prop_accounts WHERE id = ?').run(id);
  res.json({ ok: true });
});

// POST /api/expenses/accounts/:id/payouts
router.post('/accounts/:id/payouts', (req, res) => {
  const { id } = req.params;
  const { amount, payout_date, notes } = req.body;
  if (amount == null || !payout_date) {
    return res.status(400).json({ error: 'amount and payout_date are required' });
  }
  if (!db.prepare('SELECT id FROM prop_accounts WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO prop_payouts (account_id, amount, payout_date, notes)
    VALUES (?, ?, ?, ?)
  `).run(id, amount, payout_date, notes || null);

  res.status(201).json(db.prepare('SELECT * FROM prop_payouts WHERE id = ?').get(lastInsertRowid));
});

// DELETE /api/expenses/payouts/:id
router.delete('/payouts/:id', (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM prop_payouts WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Payout not found' });
  }
  db.prepare('DELETE FROM prop_payouts WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
