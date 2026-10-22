import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts';
import { parseISO, getDay } from 'date-fns';
import { useThemeColors, tooltipProps } from '../../hooks/useThemeColors';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function WinRateByDay({ trades }) {
  const colors = useThemeColors();

  const { data, best } = useMemo(() => {
    const data = DAYS.map((day, i) => {
      const dt = trades.filter(t => t.entry_time && getDay(parseISO(t.entry_time)) === i + 1);
      const w = dt.filter(t => t.pnl === 'win').length;
      const l = dt.filter(t => t.pnl === 'loss').length;
      return { day, wins: w, losses: l, winRate: w + l ? Math.round((w / (w + l)) * 100) : null };
    });
    let best = null;
    data.forEach((d, i) => { if (d.winRate != null && (best == null || d.winRate > data[best].winRate)) best = i; });
    return { data, best };
  }, [trades]);

  const empty = best == null;
  // Days without decided trades get a faint stub so the row stays readable
  const chartData = data.map(d => ({ ...d, bar: d.winRate == null ? 4 : Math.max(d.winRate, 4) }));

  const Tick = ({ x, y, payload, index }) => (
    <text
      x={x} y={y + 12} textAnchor="middle"
      fontSize={11} fontWeight={index === best ? 600 : 400}
      fill={index === best ? colors.colorMain : colors.tick}
    >
      {payload.value}
    </text>
  );

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <h2 className="card-title flex-shrink-0">Win Rate by Day</h2>
      <div className="flex-1 min-h-0 mt-2">
        {empty ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-400 dark:text-slate-500">No decided trades yet.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={<Tick />} interval={0} height={22} />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                {...tooltipProps(colors)}
                cursor={false}
                formatter={(_, __, { payload }) => [
                  payload.winRate != null ? `${payload.winRate}% · ${payload.wins}W ${payload.losses}L` : '—',
                  'Win rate',
                ]}
              />
              <Bar dataKey="bar" radius={[8, 8, 8, 8]} isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell
                    key={d.day}
                    fill={i === best ? colors.colorMain : colors.breakeven}
                    fillOpacity={i === best ? 1 : d.winRate == null ? 0.12 : 0.25}
                  />
                ))}
                <LabelList
                  dataKey="winRate"
                  content={({ x, y, width, index }) => index === best ? (
                    <text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize={12} fontWeight={600} fill={colors.colorMain}>
                      {data[index].winRate}%
                    </text>
                  ) : null}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
