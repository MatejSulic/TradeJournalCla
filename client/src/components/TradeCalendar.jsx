import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  addDays, addMonths, subMonths,
  isSameMonth, isToday, getISOWeek,
} from 'date-fns';

export default function TradeCalendar({ trades, noTradeDays = [], passedDates = new Set() }) {
  const navigate = useNavigate();
  // Shown month survives leaving the Dashboard (open a trade → come back) within the browser tab
  const [calMonth, setCalMonthState] = useState(() => {
    try {
      const saved = sessionStorage.getItem('calMonth');
      if (saved && /^\d{4}-\d{2}$/.test(saved)) return new Date(Number(saved.slice(0, 4)), Number(saved.slice(5)) - 1, 1);
    } catch { /* storage unavailable */ }
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const setCalMonth = update => setCalMonthState(m => {
    const next = typeof update === 'function' ? update(m) : update;
    try { sessionStorage.setItem('calMonth', format(next, 'yyyy-MM')); } catch { /* storage unavailable */ }
    return next;
  });
  const [popup, setPopup] = useState(null); // { date, trades } | null
  const [showPnl, setShowPnl] = useState(true);

  const handleDayClick = (date, info) => {
    if (!info) return;
    // A no-trade entry on a day with trades is only reachable from the popup
    const extra = noTradeByDate[format(date, 'yyyy-MM-dd')];
    if (info.count === 1 && !extra) {
      navigate(`/trades/${info.ts[0].id}`);
    } else {
      setPopup({ date, trades: extra ? [...info.ts, extra] : info.ts });
    }
  };

  const goToCurrent = () => {
    const n = new Date();
    setCalMonth(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  // ── group trades by yyyy-MM-dd ──────────────────────────────────────
  const byDate = {};
  trades.forEach(t => {
    if (!t.entry_time) return;
    try {
      const key = format(parseISO(t.entry_time), 'yyyy-MM-dd');
      (byDate[key] ??= []).push(t);
    } catch { /* ignore bad dates */ }
  });

  const noTradeByDate = {};
  noTradeDays.forEach(d => {
    try { noTradeByDate[format(parseISO(d.entry_time), 'yyyy-MM-dd')] ??= d; } catch { /* ignore bad dates */ }
  });

  // ── build 6-week grid (Sun → Sat) ───────────────────────────────────
  const monthStart = startOfMonth(calMonth);
  const monthEnd   = endOfMonth(calMonth);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 0 });

  const weeks = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cursor)); cursor = addDays(cursor, 1); }
    weeks.push(week);
  }

  // ── helpers ─────────────────────────────────────────────────────────
  const dayInfo = (date) => {
    const key = format(date, 'yyyy-MM-dd');
    const ts  = byDate[key] || [];
    if (!ts.length) return null;
    const wins      = ts.filter(t => t.pnl === 'win').length;
    const losses    = ts.filter(t => t.pnl === 'loss').length;
    const breakevens = ts.filter(t => t.pnl === 'breakeven').length;
    const decided   = wins + losses;
    const winRate   = decided ? Math.round((wins / decided) * 100) : null;
    let result = 'breakeven';
    if (wins > losses)  result = 'win';
    if (losses > wins)  result = 'loss';
    const winRR  = ts.filter(t => t.pnl === 'win' && t.risk_reward != null).reduce((s, t) => s + t.risk_reward, 0);
    const lossRR = ts.filter(t => t.pnl === 'loss').length;
    const hasRR  = ts.some(t => t.pnl === 'win' && t.risk_reward != null) || lossRR > 0;
    const netRR  = hasRR ? winRR - lossRR : null;
    const dollarTs = ts.filter(t => t.pnl_dollars != null);
    const netDollars = dollarTs.length > 0 ? dollarTs.reduce((s, t) => s + t.pnl_dollars, 0) : null;
    const strong = result === 'win' && ((netRR != null && netRR >= 2) || (wins >= 2 && losses === 0));
    return { ts, wins, losses, breakevens, winRate, result, strong, count: ts.length, netRR, netDollars };
  };

  const weekInfo = (week) => {
    const ts  = week.flatMap(d => byDate[format(d, 'yyyy-MM-dd')] || []);
    const wins      = ts.filter(t => t.pnl === 'win').length;
    const losses    = ts.filter(t => t.pnl === 'loss').length;
    const breakevens = ts.filter(t => t.pnl === 'breakeven').length;
    const decided   = wins + losses;
    const winRate   = decided ? Math.round((wins / decided) * 100) : null;
    const days      = week.filter(d => (byDate[format(d, 'yyyy-MM-dd')] || []).length > 0).length;
    const winRR  = ts.filter(t => t.pnl === 'win' && t.risk_reward != null).reduce((s, t) => s + t.risk_reward, 0);
    const lossRR = ts.filter(t => t.pnl === 'loss').length;
    const hasRR  = ts.some(t => t.pnl === 'win' && t.risk_reward != null) || lossRR > 0;
    const netRR  = hasRR ? winRR - lossRR : null;
    return { count: ts.length, wins, losses, breakevens, winRate, days, netRR };
  };

  // Subtle diagonal stripes for days outside the visible month (theme-aware via CSS variable)
  const HATCH = {
    backgroundImage:
      'repeating-linear-gradient(135deg, rgb(var(--color-surface-border) / 0.9) 0 1.5px, transparent 1.5px 7px)',
  };

  const resultText = {
    win: 'text-accent',
    loss: 'text-loss',
    breakeven: 'text-slate-500 dark:text-slate-400',
  };

  // Compact so it fits narrow tiles: +$420, -$1.3k
  const fmtDollars = (v) => {
    const a = Math.abs(v);
    const body = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : a.toFixed(0);
    return `${v >= 0 ? '+' : '-'}$${body}`;
  };

  const resultLabel = (info) =>
    info.count === 1
      ? ({ win: 'W', loss: 'L', breakeven: 'BE' }[info.ts[0].pnl])
      : `${info.wins}W/${info.losses}L`;

  const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const COLS = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) minmax(84px, 110px)' };

  const LEGEND = [
    ['Win', 'bg-accent-soft'],
    ['Strong win', 'bg-accent'],
    ['Loss', 'bg-loss/15'],
    ['BE', 'bg-neutral/30'],
  ];

  return (
    <div className="card !p-0 overflow-hidden h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-5 pb-3">
        <h2 className="card-title mr-1">Trading Calendar</h2>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCalMonth(m => subMonths(m, 1))}
            aria-label="Previous month"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-slate-500 dark:text-slate-400 dark:hover:text-white hover:text-slate-900 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white w-[118px] text-center">
            {format(calMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setCalMonth(m => addMonths(m, 1))}
            aria-label="Next month"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-slate-500 dark:text-slate-400 dark:hover:text-white hover:text-slate-900 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        <div className="seg">
          <button type="button" onClick={goToCurrent} className="seg-item">
            Current Month
          </button>
          <button
            type="button"
            onClick={() => setShowPnl(v => !v)}
            title={showPnl ? 'Hide P&L' : 'Show P&L'}
            className={`seg-item flex items-center gap-1.5 ${showPnl ? 'seg-item-active' : ''}`}
          >
            {showPnl ? (
              <svg className="w-3.5 h-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            )}
            P&L
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto">
          {LEGEND.map(([label, cls]) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className={`w-2.5 h-2.5 rounded-[4px] flex-shrink-0 ${cls}`} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-[4px] flex-shrink-0 border border-dashed border-neutral" />
            No trade
          </span>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 min-h-0 px-5 pb-5">
        <div className="h-full flex flex-col gap-1.5 min-w-0">

          {/* Day-of-week header row */}
          <div className="grid gap-1.5" style={COLS}>
            {DAY_HEADERS.map(d => (
              <div key={d} className="pb-1 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
                {d}
              </div>
            ))}
            <div className="pb-1 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
              Week
            </div>
          </div>

          {/* Week rows — flex-1 so they fill remaining height evenly */}
          <div className="flex flex-col flex-1 min-h-0 gap-1.5">
          {weeks.map((week, wi) => {
            const wk = weekInfo(week);
            const wkResult = wk.wins > wk.losses ? 'win' : wk.losses > wk.wins ? 'loss' : 'breakeven';

            return (
              <div key={wi} className="grid flex-1 min-h-[52px] gap-1.5" style={COLS}>
                {/* Day cells */}
                {week.map((date, di) => {
                  const info      = dayInfo(date);
                  const inMonth   = isSameMonth(date, calMonth);
                  const todayFlag = isToday(date);
                  const key       = format(date, 'yyyy-MM-dd');
                  const shown     = info && inMonth ? info : null;
                  const isPassed  = !!shown && shown.result === 'win' && passedDates.has(key);
                  const noTrade   = !info && inMonth ? noTradeByDate[key] : null;
                  const strong    = !!shown?.strong;

                  let tile = 'bg-surface-raised/50';
                  if (!inMonth) tile = 'opacity-60';
                  else if (shown) {
                    tile =
                      strong                       ? 'bg-accent text-white' :
                      shown.result === 'win'       ? 'bg-accent-soft' :
                      shown.result === 'loss'      ? 'bg-loss/10' :
                                                     'bg-neutral/15 dark:bg-neutral/20';
                  } else if (noTrade) {
                    tile = 'border border-dashed border-neutral/60';
                  }

                  const ring = isPassed
                    ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-card'
                    : todayFlag && inMonth
                    ? 'ring-1 ring-inset ring-accent/50'
                    : '';

                  const clickable = !!shown || !!noTrade;
                  const muted = strong ? 'text-white/75' : 'text-slate-400 dark:text-slate-500';

                  return (
                    <div
                      key={di}
                      onClick={() => noTrade ? navigate(`/trades/${noTrade.id}`) : shown && handleDayClick(date, shown)}
                      className={`relative rounded-xl overflow-hidden min-w-0 ${tile} ${ring} ${
                        clickable ? 'cursor-pointer hover:brightness-[1.04] dark:hover:brightness-125 transition-[filter]' : ''
                      }`}
                      style={!inMonth ? HATCH : undefined}
                    >
                      {/* Date number */}
                      <span className={`absolute top-1.5 right-2 flex items-center gap-1 text-[11px] font-medium tabular-nums ${
                        todayFlag && inMonth && !strong ? 'text-accent font-semibold' : inMonth ? muted : 'text-slate-400/70 dark:text-slate-600'
                      }`}>
                        {todayFlag && inMonth && (
                          <span className={`w-1.5 h-1.5 rounded-full ${strong ? 'bg-white' : 'bg-accent'}`} />
                        )}
                        {format(date, 'd')}
                      </span>

                      {isPassed && (
                        <span className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-md ${
                          strong ? 'bg-white/20 text-white' : 'bg-accent text-white'
                        }`}>
                          PASS
                        </span>
                      )}

                      {noTrade && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pt-3 px-0.5 text-center">
                          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">No trade</span>
                          {noTrade.faded_setups && (
                            <span className="text-[10px] text-slate-400/80 dark:text-slate-500/80">faded setup</span>
                          )}
                        </div>
                      )}

                      {/* Trade summary */}
                      {shown && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pt-3 px-0.5 text-center">
                          {shown.netDollars !== null && showPnl ? (
                            <>
                              <span className={`text-xs 2xl:text-sm font-semibold leading-tight tabular-nums tracking-tight whitespace-nowrap ${
                                strong ? 'text-white' : shown.netDollars >= 0 ? 'text-accent' : 'text-loss'
                              }`}>
                                {fmtDollars(shown.netDollars)}
                              </span>
                              <span className={`text-[10px] font-semibold leading-tight whitespace-nowrap truncate max-w-full ${strong ? 'text-white/80' : resultText[shown.result]}`}>
                                {resultLabel(shown)}
                                <span className={`font-normal ${muted}`}> · {shown.count}</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`text-xs 2xl:text-sm font-semibold leading-tight whitespace-nowrap ${strong ? 'text-white' : resultText[shown.result]}`}>
                                {resultLabel(shown)}
                              </span>
                              <span className={`text-[10px] leading-tight whitespace-nowrap truncate max-w-full ${muted}`}>
                                {shown.count} {shown.count === 1 ? 'trade' : 'trades'}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Weekly summary cell */}
                <div className="rounded-xl bg-surface-raised px-2.5 py-1.5 flex flex-col justify-center gap-0.5 min-w-0">
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    W{getISOWeek(week[3])}
                  </span>
                  {wk.count > 0 ? (
                    <>
                      <span className={`text-xs font-semibold leading-tight ${resultText[wkResult]}`}>
                        {wk.wins}W / {wk.losses}L
                      </span>
                      <span className="flex items-baseline gap-1.5 text-[11px] leading-tight">
                        {wk.netRR !== null && (
                          <span className={`font-semibold tabular-nums ${wk.netRR >= 0 ? 'text-accent' : 'text-loss'}`}>
                            {wk.netRR >= 0 ? '+' : ''}{wk.netRR.toFixed(2)}R
                          </span>
                        )}
                        <span className="text-slate-400 dark:text-slate-500">{wk.days}d</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500 leading-tight">— · 0d</span>
                  )}
                </div>
              </div>
            );
          })}
          </div>{/* end flex weeks wrapper */}
        </div>
      </div>

      {popup && (
        <div
          className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPopup(null)}
        >
          <div
            className="card w-full max-w-sm flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="card-title">{format(popup.date, 'EEEE, MMMM d, yyyy')}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {popup.trades.filter(t => t.day_type !== 'notrade').length} trades
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                aria-label="Close"
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-slate-400 dark:hover:text-white hover:text-slate-900 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Trade list */}
            <div className="flex flex-col gap-1.5">
              {popup.trades.map(t => {
                if (t.day_type === 'notrade') return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => { setPopup(null); navigate(`/trades/${t.id}`); }}
                    className="flex items-center justify-between rounded-2xl border border-dashed border-neutral/60 px-4 py-3 hover:bg-surface-raised transition-colors text-left"
                  >
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">No-trade day</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t.faded_setups ? 'faded setup' : 'notes'}</span>
                  </button>
                );
                const pill =
                  t.pnl === 'win'  ? 'bg-accent-soft text-accent' :
                  t.pnl === 'loss' ? 'bg-loss/10 text-loss' :
                                     'bg-neutral/15 text-slate-500 dark:text-slate-300';
                const label = t.pnl === 'win' ? 'W' : t.pnl === 'loss' ? 'L'
                  : t.be_outcome ? `BE→${t.be_outcome === 'win' ? 'W' : 'L'}` : 'BE';
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => { setPopup(null); navigate(`/trades/${t.id}`); }}
                    className="flex items-center justify-between rounded-2xl bg-surface-raised/60 px-4 py-3 hover:bg-surface-raised transition-colors text-left"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t.asset}
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 font-normal capitalize">{t.direction}</span>
                      </span>
                      {t.risk_reward != null && t.risk_reward !== 0 && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{t.risk_reward}R</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {format(parseISO(t.entry_time), 'HH:mm')}
                      </span>
                      <span className={`min-w-[32px] text-center text-xs font-semibold px-2 py-1 rounded-lg ${pill}`}>{label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
