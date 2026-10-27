// Helpers for the AI Analyst filter snapshot (kept out of the page file so react-refresh keeps working).

/** URL params → plain object: single-valued keys stay strings, repeated keys become arrays (e.g. entry_model_id). */
export function searchParamsToObject(searchParams) {
  const out = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

/** Inverse of searchParamsToObject. */
export function objectToSearchParams(obj) {
  const sp = new URLSearchParams();
  for (const [key, v] of Object.entries(obj || {})) {
    if (Array.isArray(v)) v.forEach(x => sp.append(key, x));
    else if (v != null) sp.append(key, v);
  }
  return sp;
}

const SESSION_LABELS = { live: 'Live', backtest: 'Backtest', all: 'Live + Backtest' };
const PNL_LABELS = { win: 'Win', loss: 'Loss', breakeven: 'Breakeven', be_win: 'BE → Win', be_loss: 'BE → Loss' };
const DOW_LABELS = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };

const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

/**
 * Read-only chip labels for a saved filter snapshot (conversation header).
 * `seriesList` / `models` / `strategies` resolve names; unknown ids fall back to a generic label.
 */
export function snapshotChips(filters, { seriesList = [], models = [], strategies = [] } = {}) {
  if (!filters || typeof filters !== 'object') return [];
  const f = filters;
  const chips = [];
  chips.push(SESSION_LABELS[f.session_type] || 'Live');
  if (f.asset) chips.push(f.asset);
  if (f.series_id) chips.push(seriesList.find(s => String(s.id) === String(f.series_id))?.name || 'Series');
  if (f.strategy_id) chips.push(f.strategy_id === 'none' ? 'No strategy' : strategies.find(s => String(s.id) === String(f.strategy_id))?.name || 'Strategy');
  if (f.direction) chips.push(f.direction === 'long' ? 'Long' : f.direction === 'short' ? 'Short' : f.direction);
  if (f.pnl) chips.push(PNL_LABELS[f.pnl] || f.pnl);
  if (f.from && f.to) chips.push(`${f.from} → ${f.to}`);
  else if (f.from) chips.push(`From ${f.from}`);
  else if (f.to) chips.push(`To ${f.to}`);
  if (f.dow && DOW_LABELS[f.dow]) chips.push(DOW_LABELS[f.dow]);
  const setupIds = list(f.entry_model_id);
  if (setupIds.length) {
    const names = setupIds.map(id => models.find(m => String(m.id) === String(id))?.name).filter(Boolean);
    chips.push(names.length === setupIds.length ? names.join(' + ') : `${setupIds.length} setup${setupIds.length === 1 ? '' : 's'}`);
  }
  if (f.nt === '0') chips.push('No-trade days excluded');
  return chips;
}
