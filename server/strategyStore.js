const { db } = require('./db');

const fail = (status, message) => Object.assign(new Error(message), { status });

function loadRules(strategyId) {
  const options = db.prepare(`
    SELECT em.id, em.name FROM strategy_rule_options o
    JOIN entry_models em ON em.id = o.entry_model_id
    WHERE o.rule_id = ? ORDER BY em.sort_order, em.name
  `);
  return db.prepare('SELECT id, label FROM strategy_rules WHERE strategy_id = ? ORDER BY sort_order, id')
    .all(strategyId).map(r => ({ ...r, options: options.all(r.id) }));
}

function shape(row) {
  return row ? { ...row, archived: !!row.archived, rules: loadRules(row.id) } : null;
}

const SELECT = `
  SELECT s.*, (SELECT COUNT(*) FROM trades t WHERE t.strategy_id = s.id) AS trade_count FROM strategies s
`;

function listStrategies() {
  return db.prepare(`${SELECT} ORDER BY s.name COLLATE NOCASE`).all().map(shape);
}

function getStrategy(id) {
  return shape(db.prepare(`${SELECT} WHERE s.id = ?`).get(Number(id)));
}

// id = null creates. Throws { status, message } for the route to map.
function saveStrategy(id, body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw fail(400, 'name required');
  if (!Array.isArray(body.rules) || !body.rules.length) throw fail(400, 'at least one rule required');
  const exists = db.prepare('SELECT 1 FROM entry_models WHERE id = ?');
  const rules = body.rules.map(r => {
    const raw = Array.isArray(r?.entry_model_ids) ? r.entry_model_ids : [];
    const ids = [...new Set(raw.map(Number))].filter(n => n && exists.get(n));
    if (!ids.length) throw fail(400, 'every rule needs at least one entry model');
    return { label: typeof r.label === 'string' ? r.label.trim() || null : null, ids };
  });
  const description = typeof body.description === 'string' ? body.description.trim() || null : null;
  const archived = body.archived ? 1 : 0;

  try {
    return db.transaction(() => {
      if (id == null) {
        id = db.prepare('INSERT INTO strategies (name, description, archived) VALUES (?, ?, ?)')
          .run(name, description, archived).lastInsertRowid;
      } else {
        const r = db.prepare(`
          UPDATE strategies SET name = ?, description = ?, archived = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ?
        `).run(name, description, archived, Number(id));
        if (!r.changes) throw fail(404, 'not found');
        db.prepare('DELETE FROM strategy_rules WHERE strategy_id = ?').run(Number(id));
      }
      const insRule = db.prepare('INSERT INTO strategy_rules (strategy_id, label, sort_order) VALUES (?, ?, ?)');
      const insOpt = db.prepare('INSERT INTO strategy_rule_options (rule_id, entry_model_id) VALUES (?, ?)');
      rules.forEach((r, i) => {
        const ruleId = insRule.run(id, r.label, i).lastInsertRowid;
        for (const mid of r.ids) insOpt.run(ruleId, mid);
      });
      return getStrategy(id);
    })();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw fail(409, 'already exists');
    throw e;
  }
}

module.exports = { listStrategies, getStrategy, saveStrategy };
