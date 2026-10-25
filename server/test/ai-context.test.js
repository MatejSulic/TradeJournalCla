const test = require('node:test');
const assert = require('node:assert/strict');
const { buildContext, estimateTokens } = require('../ai/context');
const { SYSTEM_PROMPT } = require('../ai/prompt');

const base = { day_type: 'trade', session_type: 'live', series_name: null, entry_models: [], psychology: null };
const trades = [
  { ...base, id: 3, entry_time: '2026-10-23T09:41', asset: 'NQ', direction: 'short', pnl: 'loss', risk_reward: 2, pnl_dollars: -300,
    series_name: 'Oct eval', entry_models: [{ id: 1, name: 'FVG' }, { id: 2, name: 'OB' }], risk_management: 'high',
    premarket_analysis: 'Saw #12 and **bold**\nsecond line', why_entered: 'sweep' },
  { ...base, id: 1, entry_time: '2026-10-21T10:00:00Z', asset: 'ES', direction: 'long', pnl: 'win', risk_reward: 2 },
  { ...base, id: 2, entry_time: '2026-10-22T10:15', asset: 'ES', direction: 'long', pnl: 'win', risk_reward: 1.5 },
  { ...base, id: 4, entry_time: '2026-10-24T11:00', asset: 'MNQ', direction: 'long', pnl: 'breakeven', be_outcome: 'win', risk_reward: null },
];
const noTrade = [{ id: 9, day_type: 'notrade', entry_time: '2026-10-24', premarket_analysis: 'choppy', no_trade_reason: 'No A+ setup', faded_setups: null }];

test('summary line', () => {
  const { text, summary } = buildContext(trades, noTrade);
  assert.ok(text.startsWith('SUMMARY: 4 trades (2W / 1L / 1BE, win rate 67%, net +2.5R) · 1 no-trade days · 2026-10-21 → 2026-10-24'));
  assert.deepEqual(summary, { trades: 4, wins: 2, losses: 1, breakevens: 1, winRate: 67, netR: 2.5, notrade: 1, from: '2026-10-21', to: '2026-10-24' });
});

test('trade and no-trade formatting', () => {
  const { text } = buildContext(trades, noTrade);
  assert.ok(text.includes('TRADE #3 · 2026-10-23 Fri 09:41 · NQ · Short · LOSS · R:R 2.0 · -$300 · Live · Series: Oct eval'));
  assert.ok(text.includes('BREAKEVEN (would have been WIN)'));
  assert.ok(text.includes('Entry models: FVG, OB'));
  assert.ok(text.includes('Risk management: high'));
  assert.ok(text.includes('NO-TRADE DAY #9 · 2026-10-24 Sat'));
  assert.ok(text.includes('Why no trade: No A+ setup'));
  assert.ok(!text.includes('Faded setups'));
});

test('empty fields omitted', () => {
  const { text } = buildContext(trades, noTrade);
  assert.ok(!text.includes('Psychology:'));
  assert.ok(!text.includes('null') && !text.includes('undefined'));
});

test('ordered by entry_time ascending, trades and no-trade days interleaved (date-only no-trade sorts before same-day trade)', () => {
  const { text } = buildContext(trades, noTrade);
  const pos = ['TRADE #1 ', 'TRADE #2 ', 'TRADE #3 ', 'NO-TRADE DAY #9', 'TRADE #4 '].map(s => text.indexOf(s));
  assert.ok(pos.every(p => p >= 0));
  assert.deepEqual([...pos], [...pos].sort((a, b) => a - b));
});

test('notes kept verbatim', () => {
  const { text } = buildContext(trades, noTrade);
  assert.ok(text.includes('Premarket: Saw #12 and **bold**\nsecond line\n'));
});

test('zero trades', () => {
  const { text, summary } = buildContext([], noTrade);
  assert.ok(text.startsWith('SUMMARY: 0 trades (0W / 0L / 0BE, win rate —, net +0.0R) · 1 no-trade days'));
  assert.ok(!text.includes('NaN'));
  assert.equal(summary.winRate, null);
  assert.equal(buildContext([], []).summary.from, null);
});

test('estimateTokens', () => {
  assert.equal(estimateTokens('a'.repeat(35)), 10);
});

test('system prompt', () => {
  assert.match(SYSTEM_PROMPT, /#id/);
});
