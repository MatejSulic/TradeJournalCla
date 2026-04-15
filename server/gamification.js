const { db } = require('./db');

// ─── Level definitions ────────────────────────────────────────────────────────

const LEVELS = [
  // Bronze Tier (1–8): The painful beginning
  { level: 1,  tier: 'bronze',  name: 'CNBC Watcher',                 xpRequired: 0       },
  { level: 2,  tier: 'bronze',  name: 'Reddit Sent Me',               xpRequired: 200     },
  { level: 3,  tier: 'bronze',  name: 'Bought the Top',               xpRequired: 500     },
  { level: 4,  tier: 'bronze',  name: 'Diamond Hands (Wrong Stock)',   xpRequired: 900     },
  { level: 5,  tier: 'bronze',  name: "Leverage? What's That?",       xpRequired: 1400    },
  { level: 6,  tier: 'bronze',  name: 'Down Bad, Adding More',        xpRequired: 2100    },
  { level: 7,  tier: 'bronze',  name: 'Margin Call Waiting to Happen',xpRequired: 3100    },
  { level: 8,  tier: 'bronze',  name: 'Zero Balance, Full Confidence',xpRequired: 5000    },
  // Silver Tier (9–16): You're back. You've read some things.
  { level: 9,  tier: 'silver',  name: 'Stop Loss? Never Heard of Her',xpRequired: 5000    },
  { level: 10, tier: 'silver',  name: 'Revenge Trader',               xpRequired: 7000    },
  { level: 11, tier: 'silver',  name: 'Six Indicators, Zero Edge',    xpRequired: 9500    },
  { level: 12, tier: 'silver',  name: 'Overfit to Backtest',          xpRequired: 12500   },
  { level: 13, tier: 'silver',  name: 'Almost Profitable',            xpRequired: 16000   },
  { level: 14, tier: 'silver',  name: 'News Trader (Arrived Late)',   xpRequired: 20000   },
  { level: 15, tier: 'silver',  name: "I've Got It Figured Out Now",  xpRequired: 24500   },
  { level: 16, tier: 'silver',  name: 'Consistently Inconsistent',    xpRequired: 30000   },
  // Gold Tier (17–24): Something clicked. You're boring now. That's good.
  { level: 17, tier: 'gold',    name: 'Reads the Tape',               xpRequired: 30000   },
  { level: 18, tier: 'gold',    name: 'One Setup, Executed Well',     xpRequired: 38000   },
  { level: 19, tier: 'gold',    name: 'Journaling Pays Off',          xpRequired: 48000   },
  { level: 20, tier: 'gold',    name: 'Risk-Adjusted',                xpRequired: 60000   },
  { level: 21, tier: 'gold',    name: 'Patient Hunter',               xpRequired: 74000   },
  { level: 22, tier: 'gold',    name: 'Boring and Profitable',        xpRequired: 91000   },
  { level: 23, tier: 'gold',    name: 'Positively Skewed',            xpRequired: 110000  },
  { level: 24, tier: 'gold',    name: 'Process Over Outcome',         xpRequired: 130000  },
  // Diamond Tier (25–32): These people exist. They are unhinged in a profitable way.
  { level: 25, tier: 'diamond', name: 'I Am the Edge',                xpRequired: 130000  },
  { level: 26, tier: 'diamond', name: 'No Thesis, Just Levels',       xpRequired: 160000  },
  { level: 27, tier: 'diamond', name: 'Quant With a Soul',            xpRequired: 198000  },
  { level: 28, tier: 'diamond', name: 'The Market Is Priced In',      xpRequired: 244000  },
  { level: 29, tier: 'diamond', name: 'Retired (Unretired)',          xpRequired: 300000  },
  { level: 30, tier: 'diamond', name: 'Sees in R-Multiples',          xpRequired: 368000  },
  { level: 31, tier: 'diamond', name: 'It Was Never About the Money', xpRequired: 450000  },
  { level: 32, tier: 'diamond', name: 'Im the algorithm',          xpRequired: 550000  },
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getStreakMultiplier(streakDays) {
  if (streakDays >= 30) return 3.0;
  if (streakDays >= 14) return 2.0;
  if (streakDays >= 7)  return 1.5;
  if (streakDays >= 3)  return 1.25;
  return 1.0;
}

function getLevelInfo(xp) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.xpRequired) current = lvl;
    else break;
  }
  const next = LEVELS.find(l => l.level === current.level + 1) ?? null;
  return {
    ...current,
    nextLevelXP: next?.xpRequired ?? null,
    progress: next
      ? (xp - current.xpRequired) / (next.xpRequired - current.xpRequired)
      : 1,
  };
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Profile helpers ──────────────────────────────────────────────────────────

function getOrCreateProfile(userId) {
  db.prepare('INSERT OR IGNORE INTO player_profile (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM player_profile WHERE user_id = ?').get(userId);
}

function updateProfileXP(userId, deltaXP) {
  const profile = getOrCreateProfile(userId);
  const newXP = Math.max(0, profile.xp + deltaXP);
  const { level } = getLevelInfo(newXP);
  db.prepare(`
    UPDATE player_profile
    SET xp = ?, level = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE user_id = ?
  `).run(newXP, level, userId);
  return newXP;
}

// ─── Streak ───────────────────────────────────────────────────────────────────

// Advances the streak counter. Only call this when a brand-new trade is logged.
function advanceStreak(userId) {
  const profile = getOrCreateProfile(userId);
  const today = todayUTC();

  let newStreak;
  if (profile.last_trade_date === today) {
    newStreak = profile.streak_days; // already traded today
  } else if (profile.last_trade_date === yesterdayUTC()) {
    newStreak = profile.streak_days + 1;
  } else {
    newStreak = 1; // gap — reset
  }

  db.prepare(`
    UPDATE player_profile
    SET streak_days = ?, last_trade_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE user_id = ?
  `).run(newStreak, today, userId);

  return newStreak;
}

// ─── Achievement checks ───────────────────────────────────────────────────────

function checkAndAwardAchievements(userId, tradeId) {
  const earned = new Set(
    db.prepare('SELECT achievement_key FROM player_achievements WHERE user_id = ?')
      .all(userId)
      .map(r => r.achievement_key)
  );

  const unlocked = [];

  function tryUnlock(key, condition) {
    if (earned.has(key) || !condition) return;
    const def = db.prepare('SELECT * FROM achievements WHERE key = ?').get(key);
    if (!def) return;

    db.prepare(`
      INSERT OR IGNORE INTO player_achievements (user_id, achievement_key, trade_id)
      VALUES (?, ?, ?)
    `).run(userId, key, tradeId);

    db.prepare(`
      INSERT INTO xp_log (user_id, trade_id, source, amount) VALUES (?, ?, ?, ?)
    `).run(userId, tradeId, `achievement_${key}`, def.xp_reward);

    updateProfileXP(userId, def.xp_reward);
    earned.add(key);
    unlocked.push({ key, name: def.name, icon: def.icon, xpReward: def.xp_reward });
  }

  const totalTrades = db.prepare('SELECT COUNT(*) as c FROM trades').get().c;
  tryUnlock('first_trade', totalTrades >= 1);

  const lastThree = db.prepare('SELECT pnl FROM trades ORDER BY entry_time DESC, id DESC LIMIT 3').all();
  tryUnlock('hat_trick', lastThree.length === 3 && lastThree.every(t => t.pnl === 'win'));

  const reflectionCount = db.prepare(`
    SELECT COUNT(*) as c FROM trades
    WHERE why_entered  IS NOT NULL AND why_entered  != ''
      AND psychology   IS NOT NULL AND psychology   != ''
      AND improvements IS NOT NULL AND improvements != ''
  `).get().c;
  tryUnlock('deep_reflection', reflectionCount >= 10);

  const fullChart = db.prepare(`
    SELECT trade_id FROM screenshots
    GROUP BY trade_id HAVING COUNT(DISTINCT type) = 3 LIMIT 1
  `).get();
  tryUnlock('full_chart', !!fullChart);

  const perfectRisk = db.prepare(`
    SELECT COUNT(*) as c FROM trades WHERE risk_management = 'perfect'
  `).get().c;
  tryUnlock('perfect_risk', perfectRisk >= 10);

  const distinctModels = db.prepare(`
    SELECT COUNT(DISTINCT entry_model_id) as c FROM trade_entry_models
  `).get().c;
  tryUnlock('setup_collector', distinctModels >= 5);

  const profile = getOrCreateProfile(userId);
  tryUnlock('streak_7', profile.streak_days >= 7);

  tryUnlock('century', totalTrades >= 100);

  const highRR = db.prepare('SELECT COUNT(*) as c FROM trades WHERE risk_reward >= 3.0').get().c;
  tryUnlock('high_conviction', highRR >= 5);

  const assets = db.prepare('SELECT COUNT(DISTINCT asset) as c FROM trades').get().c;
  tryUnlock('diversified', assets >= 5);

  return unlocked;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called after a new trade is created (POST).
 */
function awardXP(tradeId, userId = 'local') {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  if (!trade) return null;

  const run = db.transaction(() => {
    const insertLog = db.prepare(`
      INSERT INTO xp_log (user_id, trade_id, source, amount) VALUES (?, ?, ?, ?)
    `);

    const streakDays = advanceStreak(userId);
    const multiplier = getStreakMultiplier(streakDays);
    const baseXP = Math.round(100 * multiplier);

    let totalXP = baseXP;
    insertLog.run(userId, tradeId, 'trade_base', baseXP);

    for (const field of ['why_entered', 'psychology', 'improvements']) {
      if (trade[field]?.trim()) {
        insertLog.run(userId, tradeId, `note_${field}`, 20);
        totalXP += 20;
      }
    }

    const newXP = updateProfileXP(userId, totalXP);
    const levelInfo = getLevelInfo(newXP);
    const unlockedAchievements = checkAndAwardAchievements(userId, tradeId);

    return { xpAwarded: totalXP, newXP, level: levelInfo, streakDays, unlockedAchievements };
  });

  return run();
}

/**
 * Called after a trade is edited (PUT).
 * Only diffs note-based XP — never touches base XP or streak.
 */
function recalcNoteXP(tradeId, userId = 'local') {
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId);
  if (!trade) return null;

  const run = db.transaction(() => {
    const existing = db.prepare(`
      SELECT source FROM xp_log
      WHERE trade_id = ? AND user_id = ? AND source LIKE 'note_%'
    `).all(tradeId, userId).map(r => r.source);
    const existingSet = new Set(existing);

    let delta = 0;
    const insertLog = db.prepare(`
      INSERT INTO xp_log (user_id, trade_id, source, amount) VALUES (?, ?, ?, ?)
    `);

    for (const field of ['why_entered', 'psychology', 'improvements']) {
      const source = `note_${field}`;
      const isFilled = !!trade[field]?.trim();
      const wasLogged = existingSet.has(source);

      if (isFilled && !wasLogged) {
        insertLog.run(userId, tradeId, source, 20);
        delta += 20;
      } else if (!isFilled && wasLogged) {
        db.prepare('DELETE FROM xp_log WHERE trade_id = ? AND user_id = ? AND source = ?')
          .run(tradeId, userId, source);
        delta -= 20;
      }
    }

    if (delta !== 0) updateProfileXP(userId, delta);

    const profile = getOrCreateProfile(userId);
    const levelInfo = getLevelInfo(profile.xp);
    const unlockedAchievements = checkAndAwardAchievements(userId, tradeId);

    return { xpDelta: delta, newXP: profile.xp, level: levelInfo, unlockedAchievements };
  });

  return run();
}

/**
 * Called before a trade is deleted (DELETE).
 * Revokes all XP logged for this trade.
 */
function revokeXP(tradeId, userId = 'local') {
  const run = db.transaction(() => {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM xp_log WHERE trade_id = ? AND user_id = ?
    `).get(tradeId, userId);

    const total = row.total;
    if (total > 0) {
      db.prepare('DELETE FROM xp_log WHERE trade_id = ? AND user_id = ?').run(tradeId, userId);
      updateProfileXP(userId, -total);
    }
    return { xpRevoked: total };
  });

  return run();
}

/**
 * Returns the full profile with level info and all achievements.
 */
function getProfile(userId = 'local') {
  const profile = getOrCreateProfile(userId);
  const levelInfo = getLevelInfo(profile.xp);

  const earned = db.prepare(`
    SELECT achievement_key, unlocked_at FROM player_achievements WHERE user_id = ?
  `).all(userId);
  const earnedMap = Object.fromEntries(earned.map(e => [e.achievement_key, e.unlocked_at]));

  const allDefs = db.prepare('SELECT * FROM achievements ORDER BY rowid').all();
  const achievements = allDefs.map(def => ({
    ...def,
    unlocked: def.key in earnedMap,
    unlockedAt: earnedMap[def.key] ?? null,
  }));

  return {
    xp: profile.xp,
    level: levelInfo,
    streakDays: profile.streak_days,
    lastTradeDate: profile.last_trade_date,
    achievements,
  };
}

module.exports = { awardXP, recalcNoteXP, revokeXP, getProfile, getLevelInfo, LEVELS };
