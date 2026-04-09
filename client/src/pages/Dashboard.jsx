import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { getTrades, getEntryModels } from '../api';
import StatCard from '../components/StatCard';

const PIE_COLORS = { win: '#22c55e', loss: '#ef4444', breakeven: '#64748b' };
const PNL_STYLE = {
  win:       'bg-profit/10 text-profit',
  loss:      'bg-loss/10 text-loss',
  breakeven: 'bg-slate-700/40 text-slate-300',
};

export default function Dashboard() {
  const [trades, setTrades] = useState([]);
  const [models, setModels] = useState([]);
  const [filters, setFilters] = useState({ asset: '', direction: '', pnl: '', entry_model_id: '', from: '', to: '' });

  const load = useCallback(() => {
    getTrades(filters).then(setTrades);
  }, [filters]);

  useEffect(() => { getEntryModels().then(setModels); }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  // Compute stats from filtered trades
  const wins       = trades.filter(t => t.pnl === 'win').length;
  const losses     = trades.filter(t => t.pnl === 'loss').length;
  const breakevens = trades.filter(t => t.pnl === 'breakeven').length;
  const decided    = wins + losses;
  const winRate    = decided ? (wins / decided) * 100 : 0;
  const rrTrades   = trades.filter(t => t.risk_reward != null);
  const avgRR      = rrTrades.length ? rrTrades.reduce((s, t) => s + t.risk_reward, 0) / rrTrades.length : 0;

  // Performance curve
  let score = 0;
  const equityData = [...trades]
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time))
    .map(t => {
      if (t.pnl === 'win')  score += 1;
      if (t.pnl === 'loss') score -= 1;
      return { date: t.entry_time, score };
    });

  // Pie data
  const pieData = [
    { name: 'Win', value: wins, key: 'win' },
    { name: 'Loss', value: losses, key: 'loss' },
    { name: 'BE', value: breakevens, key: 'breakeven' },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>

      {/* Filters */}
      <div className="card flex flex-wrap gap-3">
        <select className="input w-32" value={filters.asset} onChange={e => set('asset', e.target.value)}>
          <option value="">All assets</option>
          {['MNQ','NQ','MES','ES','MYM','YM','M2K','RTY','MCL','CL','MGC','GC','SI','ZB','ZN'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className="input w-36" value={filters.direction} onChange={e => set('direction', e.target.value)}>
          <option value="">All directions</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select className="input w-36" value={filters.pnl} onChange={e => set('pnl', e.target.value)}>
          <option value="">All results</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="breakeven">Breakeven</option>
        </select>
        <select className="input w-44" value={filters.entry_model_id} onChange={e => set('entry_model_id', e.target.value)}>
          <option value="">All setups</option>
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input type="date" className="input w-40" value={filters.from} onChange={e => set('from', e.target.value)} />
        <span className="self-center text-slate-500 text-sm">to</span>
        <input type="date" className="input w-40" value={filters.to} onChange={e => set('to', e.target.value)} />
        <button
          className="btn-ghost text-xs"
          onClick={() => setFilters({ asset: '', direction: '', pnl: '', entry_model_id: '', from: '', to: '' })}
        >
          Clear
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Trades" value={trades.length} />
        <StatCard
          label="Win Rate"
          value={decided ? `${winRate.toFixed(1)}%` : '—'}
          valueClass={decided ? (winRate >= 50 ? 'text-profit' : 'text-loss') : ''}
        />
        <StatCard label="Avg R:R" value={rrTrades.length ? `${avgRR.toFixed(2)}R` : '—'} />
        <StatCard label="Wins" value={wins} valueClass="text-profit" />
        <StatCard label="Losses" value={losses} valueClass="text-loss" />
        <StatCard label="Breakevens" value={breakevens} />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Performance curve */}
        <div className="card lg:col-span-2">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Performance Curve</h2>
          {equityData.length < 2 ? (
            <p className="text-slate-500 text-sm text-center py-8">Not enough trades to display chart.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={equityData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3047" />
                <XAxis
                  dataKey="date"
                  tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={{ stroke: '#2a3047' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: '#1e2436', border: '1px solid #2a3047', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={v => [v, 'Score']}
                  labelFormatter={v => { try { return format(parseISO(v), 'MMM d, yyyy HH:mm'); } catch { return v; } }}
                />
                <ReferenceLine y={0} stroke="#2a3047" />
                <Line type="monotone" dataKey="score" stroke="#818cf8" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#818cf8' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div className="card flex flex-col">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Win / Loss / BE</h2>
          {pieData.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8 flex-1 flex items-center justify-center">No trades yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map(entry => (
                    <Cell key={entry.key} fill={PIE_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e2436', border: '1px solid #2a3047', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [v, name]}
                />
                <Legend
                  formatter={value => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent trades */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-300">
            {Object.values(filters).some(Boolean) ? 'Filtered Trades' : 'Recent Trades'}
          </h2>
          <Link to="/trades" className="text-xs text-accent hover:underline">View all</Link>
        </div>
        {trades.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">
            No trades found. <Link to="/trades/new" className="text-accent hover:underline">Add your first trade.</Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-surface-border">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Asset</th>
                <th className="pb-2 font-medium">Dir</th>
                <th className="pb-2 font-medium">Setup</th>
                <th className="pb-2 font-medium text-right">R:R</th>
                <th className="pb-2 font-medium text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {trades.slice(0, 10).map(t => (
                <tr key={t.id} className="hover:bg-surface-raised/50 transition-colors">
                  <td className="py-2.5 text-slate-400">
                    <Link to={`/trades/${t.id}`} className="hover:text-slate-200">
                      {fmtDate(t.entry_time)}
                    </Link>
                  </td>
                  <td className="py-2.5 text-slate-200 font-medium">{t.asset}</td>
                  <td className={`py-2.5 capitalize text-xs font-medium ${t.direction === 'long' ? 'text-profit' : 'text-loss'}`}>
                    {t.direction}
                  </td>
                  <td className="py-2.5 text-slate-400">
                    {t.entry_models?.length ? t.entry_models.map(m => m.name).join(', ') : '—'}
                  </td>
                  <td className="py-2.5 text-right text-slate-400">
                    {t.risk_reward != null ? `${t.risk_reward.toFixed(2)}R` : '—'}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded ${PNL_STYLE[t.pnl] ?? ''}`}>
                      {t.pnl}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d, HH:mm'); } catch { return str; }
}
