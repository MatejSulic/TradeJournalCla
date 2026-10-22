import { useId, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useThemeColors, tooltipProps } from '../../hooks/useThemeColors';

const fmt = (v, f) => { try { return format(parseISO(v), f); } catch { return v; } };

const MODES = {
  // Same rule as the Net R card: wins add their R:R, losses cost 1R
  r: { label: 'R', sub: 'Cumulative R · win +R:R / loss −1R', step: t => (t.pnl === 'win' ? Number(t.risk_reward) || 0 : t.pnl === 'loss' ? -1 : 0) },
  score: { label: 'Score', sub: 'Cumulative score · +1 win / −1 loss', step: t => (t.pnl === 'win' ? 1 : t.pnl === 'loss' ? -1 : 0) },
};

const readMode = () => { try { return localStorage.getItem('perfMode') === 'score' ? 'score' : 'r'; } catch { return 'r'; } };

// Cumulative curve ordered by created_at, as score (+1/−1) or in R
export default function PerformanceCurve({ trades }) {
  const colors = useThemeColors();
  const gradId = `perf-${useId().replace(/:/g, '')}`;
  const [mode, setMode] = useState(readMode);
  const isR = mode === 'r';

  const changeMode = m => {
    setMode(m);
    try { localStorage.setItem('perfMode', m); } catch { /* storage unavailable */ }
  };

  const data = useMemo(() => {
    let score = 0;
    return [...trades]
      .filter(t => t.created_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(t => {
        score += MODES[mode].step(t);
        return { date: t.created_at, score: Math.round(score * 100) / 100 };
      });
  }, [trades, mode]);

  const current = data.length ? data[data.length - 1].score : 0;
  const shown = isR ? `${Math.abs(current).toFixed(2)}R` : Math.abs(current);

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <div className="flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="card-title">Performance</h2>
            <div className="seg !p-0.5">
              {Object.entries(MODES).map(([k, m]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => changeMode(k)}
                  className={`seg-item !px-2.5 !py-1 ${mode === k ? 'seg-item-active' : ''}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <p className="stat-label mt-1">{MODES[mode].sub}</p>
        </div>
        <div className="text-right">
          <span className={`text-3xl font-semibold tabular-nums tracking-tight leading-none ${current < 0 ? 'text-loss' : 'text-slate-900 dark:text-white'}`}>
            {current > 0 ? '+' : current < 0 ? '−' : ''}{shown}
          </span>
          <p className="stat-label mt-1">{isR ? 'net R' : 'current score'}</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 mt-3 -mx-2">
        {data.length < 2 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-400 dark:text-slate-500">Not enough trades to draw a curve.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.colorMain} stopOpacity={colors.isDark ? 0.45 : 0.22} />
                  <stop offset="100%" stopColor={colors.colorMain} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={v => fmt(v, 'MMM d')}
                tick={{ fill: colors.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
                tickMargin={8}
              />
              <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={isR} tickFormatter={v => (isR ? `${v}R` : v)} />
              <Tooltip
                {...tooltipProps(colors)}
                formatter={v => [isR ? `${v.toFixed(2)}R` : v, isR ? 'Net R' : 'Score']}
                labelFormatter={v => fmt(v, 'MMM d, yyyy HH:mm')}
                cursor={{ stroke: colors.cursorStroke, strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke={colors.colorMain}
                strokeWidth={2.5}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 5, fill: colors.colorMain, stroke: colors.tooltipBg, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
