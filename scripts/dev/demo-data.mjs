// Fills a SCRATCH Ascend server with fictional, deterministic demo data (README screenshots, demos).
// Usage:
//   DB_PATH=/tmp/ascend-demo/journal.db AI_PROVIDER=mock PORT=3997 node server/index.js   # empty scratch server
//   node scripts/dev/demo-data.mjs http://127.0.0.1:3997 /tmp/ascend-demo/journal.db
// Everything goes through the public API except (a) created_at timestamps, which are back-dated to each
// trade's entry day so the performance curve is chronological, and (b) the AI Analyst demo conversation
// (no provider is called). Both only ever touch the scratch DB file passed as the 2nd argument.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'server', 'package.json'));

const [baseArg, dbArg] = process.argv.slice(2);
if (!baseArg || !dbArg) {
  console.error('Usage: node scripts/dev/demo-data.mjs <baseUrl> <scratchDbPath>');
  process.exit(2);
}
const BASE = baseArg.replace(/\/$/, '');

// ── Safety: never the real DB / app ─────────────────────────────────────────
const realPath = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const dbPath = realPath(dbArg);
const realDataDir = realPath(path.join(ROOT, 'server', 'data'));
if (dbPath === realPath(path.join(ROOT, 'server', 'data', 'journal.db')) || dbPath.startsWith(realDataDir + path.sep)) {
  console.error(`Refusing: ${dbPath} is the real journal DB (or inside server/data).`);
  process.exit(1);
}
if (!fs.existsSync(dbPath)) {
  console.error(`Refusing: ${dbPath} does not exist — start the scratch server with DB_PATH first.`);
  process.exit(1);
}
const port = new URL(BASE).port;
if (port === '7420' || port === '3001') {
  console.error(`Refusing: ${BASE} looks like the real app (port ${port}). Use a scratch server.`);
  process.exit(1);
}

// ── API helpers ─────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(BASE + url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const existing = await api('GET', '/api/trades?day_type=all');
if (existing.length) {
  console.error(`Refusing: the server at ${BASE} already has ${existing.length} rows — demo data needs an empty scratch DB.`);
  process.exit(1);
}

// ── Deterministic RNG ───────────────────────────────────────────────────────
let seed = Number(process.env.DEMO_SEED) || 6;
function rnd() { // mulberry32
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const chance = p => rnd() < p;
const weighted = pairs => { // [[value, weight], …]
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
  return pairs[pairs.length - 1][0];
};
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const round5 = n => Math.round(n / 5) * 5;

// ── Synthetic chart screenshots (rendered with Playwright) ──────────────────
async function renderCharts(dir) {
  const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
  const specs = [
    { file: 'nq-5m-entry.png', title: 'NQ · 5m', sub: 'Entry — FVG fill after the 9:30 sweep', tf: 'ltf', trend: 0.9, n: 64, box: true },
    { file: 'nq-1m-execution.png', title: 'NQ · 1m', sub: 'Execution — CISD + retrace into FVG', tf: 'ltf', trend: 0.6, n: 72, box: true },
    { file: 'nq-1h-context.png', title: 'NQ · 1H', sub: 'HTF — draw on liquidity: PDH', tf: 'htf', trend: 0.9, n: 60, box: false },
    { file: 'nq-4h-structure.png', title: 'NQ · 4H', sub: 'HTF — bullish order flow, 4H FVG respected', tf: 'htf', trend: 1, n: 56, box: false },
    { file: 'nq-daily-bias.png', title: 'NQ · D', sub: 'Daily bias — bullish, targeting weekly high', tf: 'daily', trend: 1.2, n: 48, box: false },
  ];
  const W = 1600, H = 900;
  const svgFor = (s, i) => {
    let local = 9000 + i * 7919;
    const r = () => { local = (local * 16807) % 2147483647; return local / 2147483647; };
    const candles = [];
    let price = 20000 + i * 140;
    for (let k = 0; k < s.n; k++) {
      // sweep the lows early, then trend up (bullish narrative across all shots)
      const phase = k < s.n * 0.25 ? -0.8 : k < s.n * 0.35 ? -2.2 : s.trend;
      const o = price;
      const c = o + (r() - 0.5) * 18 + phase * 6;
      const h = Math.max(o, c) + r() * 9;
      const l = Math.min(o, c) - r() * 9;
      candles.push({ o, h, l, c });
      price = c;
    }
    const lo = Math.min(...candles.map(c => c.l)), hi = Math.max(...candles.map(c => c.h));
    const top = 130, bottom = H - 70, left = 40, right = W - 120;
    const y = v => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const step = (right - left) / s.n;
    const bodyW = Math.max(3, step * 0.62);
    let g = '';
    // grid + price scale
    for (let k = 0; k < 6; k++) {
      const v = lo + ((hi - lo) * k) / 6;
      g += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#1E2433" stroke-width="1"/>`;
      g += `<text x="${right + 14}" y="${y(v) + 5}" fill="#6B7280" font-size="20">${v.toFixed(2)}</text>`;
    }
    for (let k = 0; k < s.n; k += Math.round(s.n / 8)) {
      g += `<line y1="${top}" y2="${bottom}" x1="${left + k * step}" x2="${left + k * step}" stroke="#1E2433" stroke-width="1"/>`;
    }
    const sweepIdx = candles.reduce((m, c, k) => (c.l < candles[m].l ? k : m), 0);
    if (s.box) {
      // FVG zone + long position (SL / TP) drawn like a charting tool
      const e = candles[Math.min(s.n - 1, sweepIdx + 6)];
      const entry = (e.o + e.c) / 2, sl = candles[sweepIdx].l - 4, tp = entry + (entry - sl) * 3.2;
      const x0 = left + (sweepIdx + 6) * step, x1 = Math.min(right, x0 + step * 28);
      g += `<rect x="${x0}" y="${y(tp)}" width="${x1 - x0}" height="${y(entry) - y(tp)}" fill="#26A69A" fill-opacity="0.16"/>`;
      g += `<rect x="${x0}" y="${y(entry)}" width="${x1 - x0}" height="${y(sl) - y(entry)}" fill="#EF5350" fill-opacity="0.16"/>`;
      g += `<line x1="${x0}" x2="${x1}" y1="${y(entry)}" y2="${y(entry)}" stroke="#9CA3AF" stroke-width="1.5"/>`;
      const f = candles[sweepIdx + 3];
      g += `<rect x="${left + (sweepIdx + 2) * step}" y="${y(Math.max(f.o, f.c))}" width="${step * 16}" height="${Math.max(6, Math.abs(y(f.o) - y(f.c)))}" fill="#5B7CFA" fill-opacity="0.22" stroke="#5B7CFA" stroke-opacity="0.5"/>`;
      g += `<text x="${left + (sweepIdx + 2) * step + 8}" y="${y(Math.max(f.o, f.c)) - 8}" fill="#8EA4FF" font-size="20">FVG</text>`;
      g += `<text x="${x1 + 8}" y="${y(tp) + 5}" fill="#26A69A" font-size="18">TP 3.2R</text>`;
      g += `<text x="${x1 + 8}" y="${y(sl) + 5}" fill="#EF5350" font-size="18">SL</text>`;
    } else {
      const ph = Math.max(...candles.slice(0, Math.floor(s.n * 0.5)).map(c => c.h));
      g += `<line x1="${left}" x2="${right}" y1="${y(ph)}" y2="${y(ph)}" stroke="#F59E0B" stroke-dasharray="8 6" stroke-width="1.5"/>`;
      g += `<text x="${left + 10}" y="${y(ph) - 8}" fill="#F59E0B" font-size="20">${s.tf === 'daily' ? 'Weekly high' : 'PDH'}</text>`;
    }
    g += `<text x="${left + sweepIdx * step - 20}" y="${y(candles[sweepIdx].l) + 28}" fill="#9CA3AF" font-size="18">sweep</text>`;
    candles.forEach((c, k) => {
      const up = c.c >= c.o, col = up ? '#26A69A' : '#EF5350';
      const cx = left + k * step + step / 2;
      g += `<line x1="${cx}" x2="${cx}" y1="${y(c.h)}" y2="${y(c.l)}" stroke="${col}" stroke-width="1.4"/>`;
      g += `<rect x="${cx - bodyW / 2}" y="${y(Math.max(c.o, c.c))}" width="${bodyW}" height="${Math.max(1.5, Math.abs(y(c.o) - y(c.c)))}" fill="${col}"/>`;
    });
    const last = candles[candles.length - 1].c;
    g += `<rect x="${right + 6}" y="${y(last) - 12}" width="96" height="24" rx="3" fill="#26A69A"/><text x="${right + 14}" y="${y(last) + 5}" fill="#fff" font-size="20">${last.toFixed(2)}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Inter, Helvetica, Arial, sans-serif">
      <rect width="100%" height="100%" fill="#131722"/>
      <text x="40" y="52" fill="#E5E7EB" font-size="40" font-weight="700">${s.title}</text>
      <text x="40" y="92" fill="#9CA3AF" font-size="26">${s.sub}</text>
      ${g}
      <text x="${W - 40}" y="${H - 28}" fill="#4B5563" font-size="18" text-anchor="end">synthetic demo chart</text>
    </svg>`;
  };
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium' });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const [i, s] of specs.entries()) {
    await page.setContent(`<html><body style="margin:0">${svgFor(s, i)}</body></html>`);
    await page.screenshot({ path: path.join(dir, s.file) });
  }
  await browser.close();
  return Object.fromEntries(specs.map(s => [s.file, path.join(dir, s.file)]));
}

// ── Text fragments (fictional journal voice) ────────────────────────────────
const PREMARKET = {
  context: [
    'Asia held a tight range, London swept the Asia low around 4:10 ET.',
    'Price is trading back into last Thursday\'s 4H FVG.',
    'PDH untouched for two sessions — the obvious draw on liquidity.',
    'Overnight gap up into a daily bearish order block.',
    'CPI at 8:30, expecting expansion after the release settles.',
    'Weekly profile looks like a Tuesday low, Wednesday expansion.',
    'Equal lows resting below the overnight range, likely engineered liquidity.',
    'ES and NQ diverged at the London high, watching for SMT at the open.',
    'Quiet overnight, inside day on the daily — patience needed.',
    'Previous week closed strong; still respecting the daily bullish FVG.',
  ],
  plan: [
    'Plan: wait for a sweep of the 9:30 open, then look for a 1m CISD.',
    'Only trade with HTF sponsorship; no counter-trend scalps.',
    'If the opening range breaks lower first, look for longs from the discount FVG.',
    'Targets: PDH first, then the weekly high if momentum holds.',
    'Done by 11:00 — no trades in the lunch chop.',
    'Max one re-entry if the first idea stops out cleanly.',
  ],
};
const WHY = {
  'FVG Fill': 'Clean retrace into the 5m FVG after displacement.',
  'Liquidity Sweep': 'Sell-side swept below the overnight low, then strong rejection.',
  'Break & Retest': 'Broke the opening range high and retested it as support.',
  'Order Block': 'Tap of the 15m bullish order block with a CISD on the 1m.',
  'Po3 / AMD': 'Accumulation in the first 15 minutes, manipulation below, distribution expected up.',
  'SMT Divergence': 'NQ made a lower low while ES held — SMT at a key level.',
  'Opening Range': 'Took the opening range breakout without waiting for a retrace.',
  'HTF Sponsorship': 'Aligned with the 1H/4H order flow toward the draw.',
};
const PSYCH = {
  calm: [
    'Calm and patient, waited for the setup to come to me.',
    'Felt focused. Executed the plan without hesitation.',
    'Good state — slept well and kept the screen time short.',
    'No urge to over-manage; let the trade breathe to target.',
  ],
  nervous: [
    'A bit hesitant on the entry after yesterday\'s loss, but followed the rules.',
    'Moved my stop to BE too early out of fear of giving it back.',
    'Slight anxiety into the news, sized down accordingly.',
  ],
  fomo: [
    'FOMO after missing the first move — chased the re-entry.',
    'Wanted to make back yesterday\'s loss. Revenge-ish entry.',
    'Impatient; entered before the candle closed.',
    'Sized up because I was "sure". Classic overconfidence.',
  ],
};
const IMPROVE = {
  win: [
    'Could have held a runner to the weekly high.',
    'Entry was fine; partials at 2R would smooth the equity curve.',
    'Mark the FVG before the open so I am not hunting for it live.',
    'Nothing major — repeat this exact process.',
  ],
  loss: [
    'Stop trading after 10:30 — the late setups keep failing.',
    'Respect max size. One contract over plan turned a normal loss into a bad one.',
    'Wait for the 1m CISD instead of anticipating it.',
    'If I miss the first move, I am done for the day.',
    'Opening range breakouts without HTF sponsorship are a coin flip — skip them.',
  ],
  be: [
    'BE stop was too tight; give the trade room below the FVG.',
    'Define in advance when to move to BE (only after 1.5R).',
    'Should have trusted the HTF draw and held.',
  ],
};
const NO_TRADE = [
  { date: '2026-06-11', reason: 'Choppy overnight, no clear draw on liquidity. Sat on my hands.', faded: 'Opening range breakout long at 9:42 — failed within 10 minutes.', psych: 'Proud of the patience.' },
  { date: '2026-07-02', reason: 'Pre-holiday session, thin volume. Not my conditions.', faded: null, psych: 'Used the time to review June trades.' },
  { date: '2026-07-29', reason: 'FOMC day — I do not trade before the 2pm release.', faded: 'Liquidity sweep short at 10:05 worked, but it is outside my rules on FOMC days.', psych: 'Fine with missing it. Rules > one trade.' },
  { date: '2026-08-14', reason: 'Two losses yesterday; taking a reset day as per my rules.', faded: null, psych: 'Felt the urge to trade. Journaled instead.' },
  { date: '2026-09-04', reason: 'NFP morning, wild spikes both ways. No clean structure until 11:00.', faded: 'Order block long at 10:20 — would have hit 2R, but the spread was huge.', psych: 'Calm.' },
  { date: '2026-09-17', reason: 'Inside day, price stuck in the middle of the range. Nothing at my levels.', faded: 'SMT divergence at 9:50, but no HTF sponsorship.', psych: 'Patient. Good discipline day.' },
  { date: '2026-10-08', reason: 'No sweep of either side of the overnight range by 10:30. No setup = no trade.', faded: 'FVG fill long at 10:12 — skipped, it was against the 4H order flow.', psych: 'Relaxed. Happy to protect the eval.' },
  { date: '2026-10-21', reason: 'Eval target almost reached — only A+ setups. None showed up.', faded: 'Break & retest of the 10:00 high, but already late and extended.', psych: 'Disciplined. Not forcing it.' },
];
// The detail-view trade: matches the synthetic charts (bullish sweep → FVG long)
const HERO = {
  asset: 'NQ',
  models: ['Liquidity Sweep', 'FVG Fill', 'HTF Sponsorship'],
  override: {
    direction: 'long',
    premarket_analysis: 'Bullish bias. Daily bias still pointing at the weekly high; London swept the Asia low at 4:10 ET. Plan: wait for the 9:30 open to take the overnight low, then look for a 1m CISD into a 5m FVG.',
    why_entered: 'Sell-side swept below the overnight low at 9:33, strong displacement up. Entered on the retrace into the 5m FVG — 1H/4H order flow bullish, PDH as the draw.',
    psychology: 'Calm and patient. Waited for the candle close instead of anticipating the entry.',
    improvements: 'Could have held a runner to the weekly high. Partials at 2R felt right.',
  },
};
const HOLIDAYS = new Set(['2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07']);

const MODELS = ['FVG Fill', 'Liquidity Sweep', 'Break & Retest', 'Order Block', 'Po3 / AMD', 'SMT Divergence', 'Opening Range', 'HTF Sponsorship'];
const RISK = { NQ: [400, 600], MNQ: [150, 250], ES: [300, 500], MES: [100, 180] };

// ── Trade generation ────────────────────────────────────────────────────────
function makeTrade({ date, minute, outcome, rr, rm, asset, session = 'live', series = null, beOutcome = null, override = null, models: fixedModels = null }) {
  asset ||= weighted([['NQ', 45], ['MNQ', 30], ['ES', 15], ['MES', 10]]);
  minute ??= Math.floor(rnd() ** 1.6 * 120);
  const late = minute > 60;
  rm ||= weighted([['perfect', 60], ['low', 15], ['high', 25]]);
  if (!outcome) {
    let pWin = 0.7 - (late ? 0.2 : 0) - (rm === 'high' ? 0.22 : rm === 'low' ? 0.05 : 0);
    const r = rnd();
    outcome = r < 0.1 ? 'breakeven' : r < 0.1 + pWin * 0.9 ? 'win' : 'loss';
  }
  const models = new Set();
  if (outcome === 'win' ? chance(0.75) : chance(0.3)) models.add('HTF Sponsorship');
  if (outcome === 'loss' && chance(0.45)) models.add('Opening Range');
  models.add(pick(['FVG Fill', 'FVG Fill', 'Liquidity Sweep', 'Order Block', 'Break & Retest', 'Po3 / AMD', 'SMT Divergence']));
  if (chance(0.35)) models.add(pick(['Liquidity Sweep', 'SMT Divergence', 'Po3 / AMD', 'FVG Fill']));
  const planned = rr ?? pick([1.5, 1.8, 2, 2, 2.2, 2.5, 2.5, 3, 3.2, 3.5, 4]);
  const [lo, hi] = RISK[asset];
  let risk = round5(lo + rnd() * (hi - lo));
  if (rm === 'high') risk = round5(risk * 1.6);
  if (rm === 'low') risk = round5(risk * 0.6);
  const pnlDollars = outcome === 'win' ? Math.round(risk * planned) : outcome === 'loss' ? -risk : pick([0, 0, -15, 20, 35, -30]);
  const psychKind = outcome === 'loss' && (late || rm === 'high') ? (chance(0.75) ? 'fomo' : 'nervous')
    : outcome === 'breakeven' ? 'nervous' : chance(0.85) ? 'calm' : 'nervous';
  const h = 9 + Math.floor((30 + minute) / 60), m = (30 + minute) % 60;
  const modelList = MODELS.filter(x => (fixedModels ? new Set(fixedModels) : models).has(x));
  const why = modelList.slice(0, 2).map(x => WHY[x]).join(' ') + (late && outcome === 'loss' ? ' Was already 10:30+, but took it anyway.' : '');
  return {
    date, late, rm, outcome, psychKind,
    body: {
      day_type: 'trade', asset, session_type: session, series, direction: chance(0.56) ? 'long' : 'short',
      pnl: outcome, be_outcome: outcome === 'breakeven' ? (beOutcome || (chance(0.6) ? 'win' : 'loss')) : '',
      risk_reward: String(planned), risk_amount: String(risk),
      pnl_dollars: chance(0.9) || session === 'live' && date >= '2026-10-01' ? String(pnlDollars) : '',
      entry_time: `${date}T${pad(h)}:${pad(m)}`,
      premarket_analysis: `${pick(['Bullish', 'Bullish', 'Bearish', 'Neutral-to-bullish', 'Bearish into PDL'])} bias. ${pick(PREMARKET.context)} ${pick(PREMARKET.plan)}`,
      why_entered: why,
      psychology: pick(PSYCH[psychKind]),
      improvements: outcome === 'win' ? (chance(0.8) ? pick(IMPROVE.win) : '') : pick(outcome === 'loss' ? IMPROVE.loss : IMPROVE.be),
      risk_management: rm,
      ...override,
    },
    models: modelList,
  };
}

async function main() {
  const chartDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ascend-demo-charts-'));
  console.log('Rendering synthetic charts…');
  const charts = await renderCharts(chartDir);

  // Entry models + series
  const modelIds = {};
  for (const name of MODELS) modelIds[name] = (await api('POST', '/api/entry-models', { name })).id;
  await api('PATCH', '/api/entry-models/reorder', MODELS.map((name, i) => ({ id: modelIds[name], sort_order: i })));
  const series = {
    summer: (await api('POST', '/api/series', { name: 'Summer Consistency', description: 'June–August live trades, one A+ setup per day.' })).id,
    october: (await api('POST', '/api/series', { name: 'October Eval', description: '50K evaluation run — max 1R per trade.' })).id,
    backtest: (await api('POST', '/api/series', { name: 'Backtest — Silver Bullet', description: '10:00–11:00 FVG model on replay data.' })).id,
  };

  // Random history: 26 May → 30 Sep (live), plus backtest sessions
  const noTradeDates = new Set(NO_TRADE.map(n => n.date));
  const trades = [];
  for (let d = new Date(Date.UTC(2026, 4, 26)); ymd(d) <= '2026-09-30'; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = ymd(d), dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || HOLIDAYS.has(date) || noTradeDates.has(date)) continue;
    const s = date <= '2026-08-31' && date >= '2026-06-01' ? series.summer : null;
    if (chance(0.68)) {
      trades.push(makeTrade({ date, series: s }));
      if (chance(0.15)) trades.push(makeTrade({ date, series: s, minute: 70 + Math.floor(rnd() * 50) }));
    }
    if (chance(0.22)) trades.push(makeTrade({ date, session: 'backtest', series: series.backtest, minute: 30 + Math.floor(rnd() * 60) }));
  }
  // Hand-picked October (current month, live) so the calendar tells a story
  const OCT = [
    ['2026-10-01', 'win', 2.5, 12, 'perfect'], ['2026-10-02', 'loss', 2, 75, 'high'],
    ['2026-10-05', 'win', 3.2, 8, 'perfect'], ['2026-10-06', 'breakeven', 2.5, 20, 'perfect', 'win'],
    ['2026-10-07', 'win', 1.8, 35, 'perfect'], ['2026-10-09', 'win', 2, 10, 'perfect'], ['2026-10-09', 'win', 1.5, 48, 'low'],
    ['2026-10-12', 'loss', 2.5, 82, 'high'], ['2026-10-13', 'win', 2.2, 15, 'perfect'],
    ['2026-10-14', 'breakeven', 3, 25, 'perfect', 'loss'], ['2026-10-15', 'win', 4, 6, 'perfect'],
    ['2026-10-16', 'win', 2.6, 18, 'perfect'], ['2026-10-19', 'loss', 2, 95, 'high'],
    ['2026-10-20', 'win', 3, 11, 'perfect'], ['2026-10-22', 'win', 2.4, 22, 'perfect'],
    ['2026-10-23', 'win', 2.8, 9, 'perfect'], ['2026-10-23', 'loss', 2, 88, 'high'],
  ];
  for (const [date, outcome, rr, minute, rm, beOutcome] of OCT) {
    trades.push(makeTrade({ date, outcome, rr, minute, rm, beOutcome, series: series.october, ...(date === '2026-10-15' ? HERO : {}) }));
  }
  const octBacktest = ['2026-10-06', '2026-10-13', '2026-10-20'];
  for (const date of octBacktest) trades.push(makeTrade({ date, session: 'backtest', series: series.backtest, minute: 40 }));
  trades.sort((a, b) => a.body.entry_time.localeCompare(b.body.entry_time));

  // Screenshots: the 15 Oct trade (detail-view hero) gets all three types; a few others get one or two
  const shotPlan = new Map();
  const hero = trades.find(t => t.date === '2026-10-15' && t.body.session_type === 'live');
  shotPlan.set(hero, { ltf: ['nq-5m-entry.png', 'nq-1m-execution.png'], htf: ['nq-1h-context.png', 'nq-4h-structure.png'], daily_bias: ['nq-daily-bias.png'] });
  const shotDates = ['2026-10-01', '2026-10-05', '2026-10-09', '2026-10-13', '2026-10-16', '2026-10-20', '2026-10-22', '2026-10-23', '2026-09-24'];
  for (const d of shotDates) {
    const t = trades.find(x => x.date >= d && x.body.session_type === 'live' && !shotPlan.has(x));
    if (t) shotPlan.set(t, { ltf: [pick(['nq-5m-entry.png', 'nq-1m-execution.png'])], htf: chance(0.6) ? [pick(['nq-1h-context.png', 'nq-4h-structure.png'])] : [], daily_bias: chance(0.4) ? ['nq-daily-bias.png'] : [] });
  }

  // No-trade days interleave chronologically with trades (ids follow time order)
  const rows = [
    ...trades.map(t => ({ kind: 'trade', at: t.body.entry_time, t })),
    ...NO_TRADE.map(n => ({ kind: 'notrade', at: `${n.date}T09:00`, n })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  console.log(`Creating ${trades.length} trades + ${NO_TRADE.length} no-trade days…`);
  for (const row of rows) {
    const fd = new FormData();
    if (row.kind === 'trade') {
      const { body, models } = row.t;
      for (const [k, v] of Object.entries(body)) if (v !== null && v !== undefined && v !== '') fd.append(k, String(v));
      for (const m of models) fd.append('entry_model_ids', String(modelIds[m]));
      const shots = shotPlan.get(row.t);
      if (shots) {
        for (const type of ['ltf', 'htf', 'daily_bias']) {
          for (const f of shots[type]) fd.append(`${type}_screenshots`, new Blob([fs.readFileSync(charts[f])], { type: 'image/png' }), f);
        }
      }
      row.t.id = (await api('POST', '/api/trades', fd)).id;
    } else {
      const { n } = row;
      fd.append('day_type', 'notrade');
      fd.append('entry_time', row.at);
      fd.append('premarket_analysis', `${pick(PREMARKET.context)} ${pick(PREMARKET.plan)}`);
      fd.append('no_trade_reason', n.reason);
      if (n.faded) fd.append('faded_setups', n.faded);
      fd.append('psychology', n.psych);
      if (n.date === '2026-10-08') fd.append('daily_bias_screenshots', new Blob([fs.readFileSync(charts['nq-daily-bias.png'])], { type: 'image/png' }), 'nq-daily-bias.png');
      n.id = (await api('POST', '/api/trades', fd)).id;
    }
  }

  // Prop firm accounts (fictional firms) + payouts
  console.log('Creating prop accounts…');
  const accounts = [
    { firm_name: 'Northline Capital', account_size: 100000, purchase_price: 289, status: 'blown', purchased_at: '2026-05-28', passed_at: '2026-06-17', blown_at: '2026-08-27', notes: 'Passed in 9 days. Blew it on a news spike — trailing drawdown.', payouts: [[980, '2026-07-22', 'First payout']] },
    { firm_name: 'Summit Futures', account_size: 50000, purchase_price: 167, status: 'funded', purchased_at: '2026-06-02', passed_at: '2026-06-30', notes: 'Main funded account. 1 MNQ-equivalent risk max.', payouts: [[1250, '2026-08-12', null], [1840, '2026-09-18', 'Best month so far']] },
    { firm_name: 'Northline Capital', account_size: 100000, purchase_price: 289, status: 'blown', purchased_at: '2026-07-06', blown_at: '2026-07-24', notes: 'Eval failed — oversized after two losses. Lesson logged.', payouts: [] },
    { firm_name: 'Summit Futures', account_size: 50000, purchase_price: 167, status: 'funded', purchased_at: '2026-09-28', passed_at: '2026-10-16', notes: 'October Eval — passed on the 4R week.', payouts: [] },
    { firm_name: 'Ridgeway Prop', account_size: 150000, purchase_price: 359, status: 'eval', purchased_at: '2026-10-19', notes: 'Scaling plan: same rules, half size until +3K buffer.', payouts: [] },
  ];
  for (const { payouts, ...acc } of accounts) {
    const { id } = await api('POST', '/api/expenses/accounts', acc);
    for (const [amount, payout_date, notes] of payouts) await api('POST', `/api/expenses/accounts/${id}/payouts`, { amount, payout_date, notes });
  }

  // ── Direct scratch-DB writes ─────────────────────────────────────────────
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  // Sanity: the DB file must be the one the server just wrote to
  const check = db.prepare('SELECT entry_time FROM trades WHERE id = ?').get(trades[trades.length - 1].id);
  if (!check || check.entry_time !== trades[trades.length - 1].body.entry_time) {
    console.error('Refusing DB writes: the DB path does not match the server that received the data.');
    process.exit(1);
  }
  // Back-date created_at (logged ~6h after entry, as UTC) — the curve and lists sort by it
  const setCreated = db.prepare('UPDATE trades SET created_at = ?, updated_at = ? WHERE id = ?');
  const stamp = at => new Date(`${at}:00-04:00`).getTime() + 6 * 3600e3;
  db.transaction(() => {
    for (const row of rows) {
      const id = row.kind === 'trade' ? row.t.id : row.n.id;
      const iso = new Date(stamp(row.at)).toISOString().replace(/\.\d{3}Z$/, 'Z');
      setCreated.run(iso, iso, id);
    }
  })();

  // AI Analyst demo conversation (live trades since 1 Aug + no-trade days), frozen context like the real route
  const { buildContext } = require(path.join(ROOT, 'server', 'ai', 'context.js'));
  const live = trades.filter(t => t.body.session_type === 'live' && t.date >= '2026-08-01');
  const nts = NO_TRADE.filter(n => n.date >= '2026-08-01');
  const loadRow = id => {
    const r = db.prepare('SELECT t.*, s.name AS series_name FROM trades t LEFT JOIN series s ON s.id = t.series_id WHERE t.id = ?').get(id);
    const em = db.prepare(`SELECT em.id, em.name FROM trade_entry_models tem JOIN entry_models em ON em.id = tem.entry_model_id
      WHERE tem.trade_id = ? ORDER BY em.sort_order, em.name`).all(id);
    return { ...r, entry_models: em };
  };
  const { text: context } = buildContext(live.map(t => loadRow(t.id)), nts.map(n => loadRow(n.id)));
  const { q1, a1, q2, a2 } = writeAnalysis(live);
  const conv = db.prepare(`INSERT INTO ai_conversations (title, provider, model, filters, context, trade_count, notrade_count, created_at, updated_at)
    VALUES (?, 'gemini', 'gemini-3.8-flash', ?, ?, ?, ?, ?, ?)`)
    .run('What do my losing trades have in common?', JSON.stringify({ session_type: 'live', from: '2026-08-01' }), context, live.length, nts.length, '2026-10-24T16:02:00Z', '2026-10-24T16:09:00Z');
  const msg = db.prepare('INSERT INTO ai_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)');
  msg.run(conv.lastInsertRowid, 'user', q1, '2026-10-24T16:02:00Z');
  msg.run(conv.lastInsertRowid, 'assistant', a1, '2026-10-24T16:02:30Z');
  msg.run(conv.lastInsertRowid, 'user', q2, '2026-10-24T16:08:00Z');
  msg.run(conv.lastInsertRowid, 'assistant', a2, '2026-10-24T16:08:20Z');
  db.close();
  fs.rmSync(chartDir, { recursive: true, force: true });

  const liveAll = trades.filter(t => t.body.session_type === 'live');
  const s = stats(liveAll);
  console.log(JSON.stringify({
    trades: trades.length, live: liveAll.length, backtest: trades.length - liveAll.length, noTradeDays: NO_TRADE.length,
    liveWinRate: s.winRate, liveNetR: s.netR, W: s.w, L: s.l, BE: s.be,
    heroTradeId: hero.id, conversationId: Number(conv.lastInsertRowid), aiTrades: live.length,
  }));
}

function stats(list) {
  const w = list.filter(t => t.outcome === 'win'), l = list.filter(t => t.outcome === 'loss').length;
  const be = list.length - w.length - l;
  const netR = Math.round((w.reduce((s, t) => s + Number(t.body.risk_reward), 0) - l) * 10) / 10;
  return { n: list.length, w: w.length, l, be, winRate: w.length + l ? Math.round((w.length / (w.length + l)) * 100) : 0, netR };
}

// Assistant answers written from the actual demo numbers, so every #id and count is real
function writeAnalysis(live) {
  const all = stats(live);
  const losses = live.filter(t => t.outcome === 'loss');
  const early = live.filter(t => !t.late), late = live.filter(t => t.late);
  const se = stats(early), sl = stats(late);
  const lateLosses = losses.filter(t => t.late);
  const high = live.filter(t => t.rm === 'high'), sh = stats(high);
  const highLosses = losses.filter(t => t.rm === 'high');
  const fomo = losses.filter(t => t.psychKind === 'fomo');
  const orNoHtf = losses.filter(t => t.models.includes('Opening Range') && !t.models.includes('HTF Sponsorship'));
  const wins = live.filter(t => t.outcome === 'win');
  const winsHtf = wins.filter(t => t.models.includes('HTF Sponsorship'));
  const ids = (list, n = 4) => list.slice(-n).map(t => `#${t.id}`).join(', ');
  const longs = stats(live.filter(t => t.body.direction === 'long')), shorts = stats(live.filter(t => t.body.direction === 'short'));
  const fmtDate = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const q1 = 'What do my losing trades have in common?';
  const a1 = `## Short answer
Most of your losses are **execution problems, not setup problems**. Of the **${all.l} losses** in this sample (${all.n} live trades, ${fmtDate(live[0].date)} – ${fmtDate(live[live.length - 1].date)}), **${lateLosses.length}** were entered after 10:30 ET and **${highLosses.length}** were sized above plan.

## What the losing trades share
1. **Late entries (after 10:30 ET).** Your win rate is **${se.winRate}%** before 10:30 and **${sl.winRate}%** after (${sl.n} trades). The late losses read the same way in your notes — re-entries after the morning move already ran: ${ids(lateLosses)}.
2. **Risk management tagged "High".** ${sh.l} of the ${sh.n} oversized trades lost (win rate **${sh.winRate}%**), e.g. ${ids(highLosses, 3)}. Because these are larger, they cost more dollars than the R count suggests.
3. **Emotional state.** In **${fomo.length} of ${all.l}** losses your Psychology note mentions FOMO, revenge or impatience — almost never on winners.
4. **Opening Range without HTF Sponsorship.** ${orNoHtf.length} losses used the Opening Range model with no higher-timeframe alignment${orNoHtf.length ? ` (${ids(orNoHtf, 3)})` : ''}.

## What it is *not*
- **Direction:** longs win ${longs.winRate}% vs shorts ${shorts.winRate}% — ${Math.abs(longs.winRate - shorts.winRate) <= 8 ? 'no meaningful bias' : `${longs.winRate > shorts.winRate ? 'longs' : 'shorts'} look slightly better, but the split is too small to act on`}.
- **Setups in general:** ${winsHtf.length} of your ${wins.length} winners had HTF Sponsorship. When you wait for alignment, the model works.

## Rules worth testing
- **Hard cut-off at 10:30 ET** for new entries.
- **Fixed size** — no "high" risk tags for the next 20 trades.
- **One missed move = done for the day.** Your own improvement notes already say this; make it a checklist item.

> Sample size: ${all.l} losses is small. Treat these as hypotheses and re-check after another 30–40 trades.`;

  const filtered = live.filter(t => !t.late && t.rm !== 'high');
  const sf = stats(filtered);
  const q2 = 'If I had only taken trades before 10:30 with normal size, what would my numbers look like?';
  const a2 = `Filtering this sample to **entries before 10:30 ET** and **risk not tagged "High"**:

| | All trades | Filtered |
|---|---:|---:|
| Trades | ${all.n} | ${sf.n} |
| W / L / BE | ${all.w} / ${all.l} / ${all.be} | ${sf.w} / ${sf.l} / ${sf.be} |
| Win rate | ${all.winRate}% | ${sf.winRate}% |
| Net R | ${all.netR >= 0 ? '+' : ''}${all.netR}R | ${sf.netR >= 0 ? '+' : ''}${sf.netR}R |

You would have taken **${all.n - sf.n} fewer trades** and avoided **${all.l - sf.l} of your ${all.l} losses**. ${sf.netR >= all.netR ? `Net R would be **${Math.round((sf.netR - all.netR) * 10) / 10}R higher**` : `Net R would be **${Math.round((all.netR - sf.netR) * 10) / 10}R lower** — a few late trades were big winners — but`} the equity curve would be far smoother, with much shallower drawdowns.

**Caveat:** this is hindsight filtering on a small sample. The fair test is to apply both rules going forward and compare the next month against this one.`;
  return { q1, a1, q2, a2 };
}

await main();
