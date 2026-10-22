import { parseISO, getISOWeek, getISOWeekYear } from 'date-fns';

// Pure stats from the (already filtered) trade list — no NaN / Infinity, ever.
export function computeStats(trades = []) {
  const total = trades.length;

  const weeks = new Set(
    trades.filter(t => t.entry_time).map(t => {
      const d = parseISO(t.entry_time);
      return `${getISOWeekYear(d)}-${getISOWeek(d)}`;
    })
  ).size;
  const perWeek = weeks > 0 ? total / weeks : null;

  const wins       = trades.filter(t => t.pnl === 'win').length;
  const losses     = trades.filter(t => t.pnl === 'loss').length;
  const breakevens = trades.filter(t => t.pnl === 'breakeven').length;
  const decided    = wins + losses;
  const winRate    = decided ? (wins / decided) * 100 : null;

  const winR = trades
    .filter(t => t.pnl === 'win' && t.risk_reward != null)
    .reduce((s, t) => s + Number(t.risk_reward), 0);
  // Same as before the redesign: no net R when no win has R:R and there are no losses
  const hasR = trades.some(t => t.pnl === 'win' && t.risk_reward != null) || losses > 0;
  const netR = hasR ? winR - losses : null;

  const rrTrades = trades.filter(t => t.risk_reward != null && Number(t.risk_reward) !== 0);
  const avgRR = rrTrades.length ? rrTrades.reduce((s, t) => s + Number(t.risk_reward), 0) / rrTrades.length : null;

  const riskTrades = trades.filter(t => t.risk_amount != null);
  const avgRisk = riskTrades.length ? riskTrades.reduce((s, t) => s + Number(t.risk_amount), 0) / riskTrades.length : null;

  const dollarTrades = trades.filter(t => t.pnl_dollars != null && t.pnl_dollars !== '');
  const totalDollars = dollarTrades.length ? dollarTrades.reduce((s, t) => s + Number(t.pnl_dollars), 0) : null;

  return {
    total, perWeek, wins, losses, breakevens, winRate, netR, avgRR, avgRisk, totalDollars,
    rrCount: rrTrades.length, riskCount: riskTrades.length, dollarCount: dollarTrades.length,
  };
}

const fmtMoney = (v) => `$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const signed = (v, fmt) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

function Icon({ d, className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  trend: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a4 4 0 006 0L5 7zm14 0l-3 7a4 4 0 006 0l-3-7z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z',
  dollar: 'M12 3v18m4-14.5C15 5.6 13.6 5 12 5c-2.2 0-4 1.3-4 3s1.8 2.6 4 3 4 1.3 4 3-1.8 3-4 3c-1.7 0-3.2-.7-4-1.8',
};

function Tile({ label, icon, value, valueClass = 'text-slate-900 dark:text-white', children }) {
  return (
    <div className="card !p-5 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label text-sm">{label}</span>
        <span className="w-8 h-8 rounded-xl bg-surface-raised text-slate-400 dark:text-slate-500 flex items-center justify-center flex-shrink-0">
          <Icon d={ICONS[icon]} />
        </span>
      </div>
      <span className={`stat-value mt-2 leading-none truncate ${valueClass}`}>{value}</span>
      <div className="mt-auto pt-3 text-xs text-slate-500 dark:text-slate-400 min-h-[1.75rem] flex flex-col justify-end">{children}</div>
    </div>
  );
}

export default function StatCards({ stats }) {
  const s = stats;
  const decided = s.wins + s.losses + s.breakevens;
  const seg = (n) => (decided ? `${(n / decided) * 100}%` : '0%');

  return (
    <div className="grid grid-cols-5 gap-4 flex-shrink-0">
      {/* Hero — Net R */}
      <div className="card-hero !p-5 flex flex-col min-w-0 relative overflow-hidden">
        <div className="absolute -right-10 -top-12 w-40 h-40 rounded-full bg-white/10" aria-hidden />
        <div className="absolute right-6 -bottom-16 w-28 h-28 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-white/80">Net R</span>
          <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon d={ICONS.trend} />
          </span>
        </div>
        <span className="relative text-4xl font-semibold tabular-nums tracking-tight leading-none mt-2 truncate">
          {s.netR == null ? '—' : `${signed(s.netR, v => v.toFixed(2))}R`}
        </span>
        <span className="relative mt-auto pt-3 text-xs text-white/80 min-h-[1.75rem] flex items-end">
          {s.total} trade{s.total === 1 ? '' : 's'} · {s.perWeek != null ? s.perWeek.toFixed(1) : '—'} / week
        </span>
      </div>

      {/* Win rate */}
      <Tile label="Win Rate" icon="target" value={s.winRate != null ? `${Math.round(s.winRate)}%` : '—'}>
        <div className="flex h-1.5 w-full gap-0.5 rounded-full overflow-hidden bg-surface-raised">
          {s.wins > 0 && <div className="bg-accent rounded-full" style={{ width: seg(s.wins) }} />}
          {s.losses > 0 && <div className="bg-loss rounded-full" style={{ width: seg(s.losses) }} />}
          {s.breakevens > 0 && <div className="bg-neutral rounded-full" style={{ width: seg(s.breakevens) }} />}
        </div>
        <div className="flex gap-3 mt-1.5 tabular-nums font-medium">
          <span className="text-accent">{s.wins}W</span>
          <span className="text-loss">{s.losses}L</span>
          <span className="text-neutral">{s.breakevens}BE</span>
        </div>
      </Tile>

      <Tile label="Avg R:R" icon="scale" value={s.avgRR != null ? `${s.avgRR.toFixed(2)}R` : '—'}>
        {s.rrCount ? `across ${s.rrCount} trade${s.rrCount === 1 ? '' : 's'}` : 'no R:R data'}
      </Tile>

      <Tile label="Avg $ Risk" icon="shield" value={s.avgRisk != null ? fmtMoney(s.avgRisk) : '—'}>
        {s.riskCount ? 'per trade' : 'no risk data'}
      </Tile>

      <Tile
        label="Total P&L $"
        icon="dollar"
        value={s.totalDollars != null ? signed(s.totalDollars, fmtMoney) : '—'}
        valueClass={s.totalDollars == null ? 'text-slate-900 dark:text-white' : s.totalDollars >= 0 ? 'text-accent' : 'text-loss'}
      >
        {s.dollarCount ? `${s.dollarCount} trade${s.dollarCount === 1 ? '' : 's'} with $ result` : 'no $ data'}
      </Tile>
    </div>
  );
}
