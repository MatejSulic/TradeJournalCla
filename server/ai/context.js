// Serialises journal rows to compact plain text for the AI. Pure functions; no DB access.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function datePart(entryTime) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(entryTime || '');
  return m ? m[0] : null;
}

function dayName(date) {
  const [y, mo, d] = date.split('-').map(Number);
  return DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
}

function timePart(entryTime) {
  const m = /[T ](\d{2}:\d{2})/.exec(entryTime || '');
  return m ? m[1] : null;
}

const has = v => v !== null && v !== undefined && String(v).trim() !== '';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function fmtRR(n) {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

function fmtMoney(n) {
  const abs = Math.abs(n);
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return `${n < 0 ? '-' : '+'}$${s}`;
}

function fmtNetR(n) {
  const r = Math.round(n * 10) / 10;
  return `${r < 0 ? '-' : '+'}${Math.abs(r).toFixed(1)}R`;
}

function field(lines, label, value) {
  if (has(value)) lines.push(`${label}: ${value}`);
}

function serializeTrade(t) {
  const date = datePart(t.entry_time);
  const time = timePart(t.entry_time);
  let when = date ? `${date} ${dayName(date)}` : 'unknown date';
  if (date && time) when += ` ${time}`;
  let result = (t.pnl || '').toUpperCase();
  if (t.pnl === 'breakeven') {
    result = 'BREAKEVEN';
    if (t.be_outcome) result += ` (would have been ${t.be_outcome.toUpperCase()})`;
  }
  const head = ['TRADE #' + t.id, when, t.asset, t.direction && cap(t.direction), result || null];
  if (has(t.risk_reward) && Number(t.risk_reward) !== 0) head.push(`R:R ${fmtRR(Number(t.risk_reward))}`);
  if (has(t.pnl_dollars)) head.push(fmtMoney(Number(t.pnl_dollars)));
  if (has(t.session_type)) head.push(cap(t.session_type));
  if (has(t.series_name)) head.push(`Series: ${t.series_name}`);
  const lines = [head.filter(has).join(' · ')];
  const models = (t.entry_models || []).map(m => m.name).filter(has);
  if (models.length) lines.push(`Entry models: ${models.join(', ')}`);
  field(lines, 'Risk management', t.risk_management);
  field(lines, 'Premarket', t.premarket_analysis);
  field(lines, 'Why entered', t.why_entered);
  field(lines, 'Psychology', t.psychology);
  field(lines, 'Improvements', t.improvements);
  return lines.join('\n');
}

function serializeNoTrade(d) {
  const date = datePart(d.entry_time);
  const lines = [`NO-TRADE DAY #${d.id}${date ? ` · ${date} ${dayName(date)}` : ''}`];
  field(lines, 'Premarket', d.premarket_analysis);
  field(lines, 'Why no trade', d.no_trade_reason);
  field(lines, 'Faded setups', d.faded_setups);
  field(lines, 'Psychology', d.psychology);
  return lines.join('\n');
}

function buildContext(trades = [], noTradeDays = []) {
  const wins = trades.filter(t => t.pnl === 'win');
  const losses = trades.filter(t => t.pnl === 'loss').length;
  const breakevens = trades.filter(t => t.pnl === 'breakeven').length;
  const decided = wins.length + losses;
  const winRate = decided ? Math.round((wins.length / decided) * 100) : null;
  const netR = wins.reduce((s, t) => s + (Number(t.risk_reward) || 0), 0) - losses;

  const items = [
    ...trades.map(t => ({ row: t, text: serializeTrade(t) })),
    ...noTradeDays.map(d => ({ row: d, text: serializeNoTrade(d) })),
  ].sort((a, b) => (a.row.entry_time || '').localeCompare(b.row.entry_time || '') || a.row.id - b.row.id);

  const dates = items.map(i => datePart(i.row.entry_time)).filter(Boolean).sort();
  const from = dates[0] || null;
  const to = dates[dates.length - 1] || null;

  const summary = { trades: trades.length, wins: wins.length, losses, breakevens, winRate, netR, notrade: noTradeDays.length, from, to };
  const range = from ? ` · ${from} → ${to}` : '';
  const head = `SUMMARY: ${trades.length} trades (${wins.length}W / ${losses}L / ${breakevens}BE, win rate ${winRate === null ? '—' : winRate + '%'}, net ${fmtNetR(netR)}) · ${noTradeDays.length} no-trade days${range}`;
  return { text: [head, ...items.map(i => i.text)].join('\n\n') + '\n', summary };
}

const estimateTokens = text => Math.ceil(text.length / 3.5);

module.exports = { buildContext, estimateTokens };
