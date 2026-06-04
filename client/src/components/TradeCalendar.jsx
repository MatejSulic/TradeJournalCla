import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO,
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  addDays, addMonths, subMonths,
  isSameMonth, isToday, getISOWeek,
} from 'date-fns';

const COLOR_MAIN = '#c6f135';

const HATCH = {
  background:
    'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.025) 5px, rgba(255,255,255,0.025) 10px)',
};

export default function TradeCalendar({ trades }) {
  const navigate = useNavigate();
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [popup, setPopup] = useState(null); // { date, trades } | null

  const handleDayClick = (date, info) => {
    if (!info) return;
    if (info.count === 1) {
      navigate(`/trades/${info.ts[0].id}`);
    } else {
      setPopup({ date, trades: info.ts });
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
    return { ts, wins, losses, breakevens, winRate, result, count: ts.length };
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

  const pnlColor = (result) =>
    result === 'win'  ? COLOR_MAIN :
    result === 'loss' ? '#fb923c'  : // orange-400
    '#94a3b8'; // slate-400

  const DAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div className="card !p-0 overflow-hidden h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-surface-border">
        <h2 className="text-sm font-semibold text-white">Trading Calendar</h2>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCalMonth(m => subMonths(m, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-slate-400 hover:text-white transition-colors text-base"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-white w-[130px] text-center">
            {format(calMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCalMonth(m => addMonths(m, 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-slate-400 hover:text-white transition-colors text-base"
          >
            ›
          </button>
        </div>

        <button
          onClick={goToCurrent}
          className="text-xs px-3 py-1 rounded-lg border border-surface-border text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        >
          Current Month
        </button>

        {/* Legend */}
        <div className="flex items-center gap-3 ml-auto">
          {[['win', COLOR_MAIN, 'W'], ['loss', '#fb923c', 'L'], ['breakeven', '#94a3b8', 'BE']].map(([k, c, l]) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: c, opacity: 0.6 }} />
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="overflow-x-auto flex-1">
        <div className="h-full flex flex-col" style={{ minWidth: 520 }}>

          {/* Day-of-week header row */}
          <div
            className="grid border-b border-surface-border"
            style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}
          >
            {DAY_HEADERS.map(d => (
              <div key={d} className="py-2 text-center text-[10px] font-semibold text-slate-600 uppercase tracking-widest border-r border-surface-border">
                {d}
              </div>
            ))}
            <div className="py-2 text-center text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
              WEEKLY
            </div>
          </div>

          {/* Week rows — flex-1 so they fill remaining height evenly */}
          <div className="flex flex-col flex-1">
          {weeks.map((week, wi) => {
            const wi_info = weekInfo(week);

            return (
              <div
                key={wi}
                className="grid flex-1 border-b border-surface-border last:border-b-0"
                style={{ gridTemplateColumns: 'repeat(7, 1fr) 120px' }}
              >
                {/* Day cells */}
                {week.map((date, di) => {
                  const info      = dayInfo(date);
                  const inMonth   = isSameMonth(date, calMonth);
                  const todayFlag = isToday(date);

                  // Determine border/bg tint based on result
                  let cellBorder = 'border border-transparent';
                  let cellBg     = '';
                  if (info && inMonth) {
                    if (info.result === 'win') {
                      cellBorder = 'border border-[#c6f135]/25';
                      cellBg     = 'bg-[#c6f135]/[0.04]';
                    } else if (info.result === 'loss') {
                      cellBorder = 'border border-orange-500/25';
                      cellBg     = 'bg-orange-500/[0.04]';
                    }
                  }

                  const clickable = !!(info && inMonth);
                  return (
                    <div
                      key={di}
                      onClick={() => clickable && handleDayClick(date, info)}
                      className={`relative border-r border-surface-border p-2.5 ${cellBorder} ${cellBg} ${
                        todayFlag ? 'ring-1 ring-inset ring-accent/30' : ''
                      } ${clickable ? 'cursor-pointer hover:brightness-110 transition-all' : ''}`}
                      style={!inMonth ? HATCH : undefined}
                    >
                      {/* Date number */}
                      <span className={`absolute top-2 right-2.5 text-xs font-semibold ${
                        todayFlag
                          ? 'text-accent'
                          : inMonth
                          ? 'text-slate-500'
                          : 'text-slate-700'
                      }`}>
                        {format(date, 'd')}
                      </span>

                      {/* Trade summary */}
                      {info && inMonth && (
                        <div className="mt-5 flex flex-col gap-1 pr-4">
                          {/* Main result label — W / L / BE or multi */}
                          <span
                            className="text-sm font-bold leading-tight"
                            style={{ color: pnlColor(info.result) }}
                          >
                            {info.count === 1
                              ? ({ win: 'W', loss: 'L', breakeven: 'BE' }[info.ts[0].pnl])
                              : `${info.wins}W / ${info.losses}L`}
                          </span>

                          {/* Trade count */}
                          <span className="text-[11px] text-slate-500 leading-tight">
                            {info.count} {info.count === 1 ? 'trade' : 'trades'}
                          </span>

                          {/* Win rate (only when multiple trades) */}
                          {info.count > 1 && info.winRate !== null && (
                            <span
                              className="text-[11px] leading-tight"
                              style={{ color: info.winRate >= 50 ? `${COLOR_MAIN}99` : '#fb923c99' }}
                            >
                              {info.winRate}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Weekly summary cell */}
                <div className="p-3 flex flex-col justify-center gap-1 border-l border-surface-border bg-surface-raised/20">
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider">
                    W{getISOWeek(week[3])}
                  </span>
                  {wi_info.count > 0 ? (
                    <>
                      <span
                        className="text-sm font-bold"
                        style={{ color: pnlColor(wi_info.wins > wi_info.losses ? 'win' : wi_info.losses > wi_info.wins ? 'loss' : 'breakeven') }}
                      >
                        {wi_info.wins}W / {wi_info.losses}L
                      </span>
                      {wi_info.netRR !== null && (
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: wi_info.netRR >= 0 ? COLOR_MAIN : '#fb923c' }}
                        >
                          {wi_info.netRR >= 0 ? '+' : ''}{wi_info.netRR.toFixed(2)}R
                        </span>
                      )}
                      <span className="text-[10px] text-slate-600">
                        {wi_info.days}d
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-slate-700">—</span>
                      <span className="text-[10px] text-slate-700">0d</span>
                    </>
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPopup(null)}
        >
          <div
            className="card w-full max-w-sm flex flex-col gap-3"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                {format(popup.date, 'EEEE, d. MMMM yyyy')}
              </span>
              <button
                onClick={() => setPopup(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-slate-400 hover:text-white transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Trade list */}
            <div className="flex flex-col gap-2">
              {popup.trades.map(t => {
                const col =
                  t.pnl === 'win' ? COLOR_MAIN :
                  t.pnl === 'loss' ? '#fb923c' :
                  '#94a3b8';
                const label = t.pnl === 'win' ? 'W' : t.pnl === 'loss' ? 'L' : 'BE';
                return (
                  <button
                    key={t.id}
                    onClick={() => { setPopup(null); navigate(`/trades/${t.id}`); }}
                    className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-raised/40 px-4 py-3 hover:bg-surface-raised transition-colors text-left"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-white">
                        {t.asset}
                        <span className="ml-2 text-xs text-slate-500 font-normal capitalize">{t.direction}</span>
                      </span>
                      {t.risk_reward && (
                        <span className="text-[11px] text-slate-500">{t.risk_reward}R</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        {format(parseISO(t.entry_time), 'HH:mm')}
                      </span>
                      <span className="text-sm font-bold" style={{ color: col }}>{label}</span>
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
