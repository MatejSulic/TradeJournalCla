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

const COLOR_MAIN = '#c6f135';
const COLOR_NEG  = '#7c3aed';
const PIE_COLORS = { win: COLOR_MAIN, loss: COLOR_NEG, breakeven: '#3f3f3f' };
const PNL_STYLE = {
  win:       'bg-profit/10 text-profit border border-profit/20',
  loss:      'bg-loss/10 text-loss border border-loss/20',
  breakeven: 'bg-white/5 text-slate-400 border border-white/10',
};

export default function Dashboard() {
  const [trades, setTrades] = useState([]);
  const [models, setModels] = useState([]);
  const [filters, setFilters] = useState({ asset: '', direction: '', pnl: '', entry_model_id: [], from: '', to: '' });

  const load = useCallback(() => {
    getTrades(filters).then(setTrades);
  }, [filters]);

  useEffect(() => { getEntryModels().then(setModels); }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const toggleModelFilter = (id) => {
    setFilters(f => ({
      ...f,
      entry_model_id: f.entry_model_id.includes(id)
        ? f.entry_model_id.filter(x => x !== id)
        : [...f.entry_model_id, id],
    }));
  };

  const wins       = trades.filter(t => t.pnl === 'win').length;
  const losses     = trades.filter(t => t.pnl === 'loss').length;
  const breakevens = trades.filter(t => t.pnl === 'breakeven').length;
  const decided    = wins + losses;
  const winRate    = decided ? (wins / decided) * 100 : 0;
  const rrTrades   = trades.filter(t => t.risk_reward != null);
  const avgRR      = rrTrades.length ? rrTrades.reduce((s, t) => s + t.risk_reward, 0) / rrTrades.length : 0;

  let score = 0;
  const equityData = [...trades]
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time))
    .map(t => {
      if (t.pnl === 'win')  score += 1;
      if (t.pnl === 'loss') score -= 1;
      return { date: t.entry_time, score };
    });

  const pieData = [
    { name: 'Win', value: wins, key: 'win' },
    { name: 'Loss', value: losses, key: 'loss' },
    { name: 'BE', value: breakevens, key: 'breakeven' },
  ].filter(d => d.value > 0);

  const hasFilters = Object.values(filters).some(v => (Array.isArray(v) ? v.length > 0 : Boolean(v)));

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your trading performance overview</p>
        </div>
        <Link to="/trades/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Trade
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Trades" value={trades.length} />
        <StatCard
          label="Win Rate"
          value={decided ? `${winRate.toFixed(1)}%` : '—'}
          valueClass={decided ? (winRate >= 50 ? 'text-profit' : 'text-loss') : ''}
        />
        <StatCard label="Avg R:R" value={rrTrades.length ? `${avgRR.toFixed(2)}R` : '—'} />
        <StatCard label="Wins" value={wins} valueClass="text-profit" />
        <StatCard label="Losses" value={losses} valueClass="text-loss" />
        <StatCard label="Breakevens" value={breakevens} valueClass="text-slate-400" />
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Filters</p>
          {hasFilters && (
            <button
              className="text-xs text-accent hover:underline"
              onClick={() => setFilters({ asset: '', direction: '', pnl: '', entry_model_id: [], from: '', to: '' })}
            >
              Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-32" value={filters.asset} onChange={e => set('asset', e.target.value)}>
            <option value="">All assets</option>
            {['NQ','MNQ','ES','MES','NQ Backtest','MNQ Backtest','ES Backtest','MES Backtest'].map(a => (
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
          <div className="flex items-center gap-2">
            <input type="date" className="input w-38" value={filters.from} onChange={e => set('from', e.target.value)} />
            <span className="text-slate-600 text-sm">–</span>
            <input type="date" className="input w-38" value={filters.to} onChange={e => set('to', e.target.value)} />
          </div>
        </div>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-surface-border">
            <span className="text-[11px] text-slate-600 self-center mr-1 uppercase tracking-wide">Setups:</span>
            {models.map(m => {
              const active = filters.entry_model_id.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleModelFilter(m.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all duration-150 ${
                    active
                      ? 'bg-accent text-black border-accent'
                      : 'bg-transparent text-slate-500 border-surface-border hover:border-accent/40 hover:text-white'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Performance curve */}
        <div className="card lg:col-span-2">
          <h2 className="text-sm font-semibold text-white mb-5">Performance Curve</h2>
          {equityData.length < 2 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600 text-sm">Not enough trades to display chart.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={equityData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }}
                  tick={{ fill: '#4b5563', fontSize: 11 }}
                  axisLine={{ stroke: '#1f1f1f' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#4b5563', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: '#111111', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12, color: '#fff' }}
                  labelStyle={{ color: '#6b7280' }}
                  formatter={v => [v, 'Score']}
                  labelFormatter={v => { try { return format(parseISO(v), 'MMM d, yyyy HH:mm'); } catch { return v; } }}
                  cursor={{ stroke: '#2a2a2a' }}
                />
                <ReferenceLine y={0} stroke="#2a2a2a" />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={COLOR_MAIN}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: COLOR_MAIN, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div className="card flex flex-col">
          <h2 className="text-sm font-semibold text-white mb-5">Win / Loss / BE</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center flex-1 py-12">
              <p className="text-slate-600 text-sm">No trades yet.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map(entry => (
                    <Cell key={entry.key} fill={PIE_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#111111', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12, color: '#fff' }}
                  formatter={(v, name) => [v, name]}
                />
                <Legend
                  formatter={value => <span style={{ color: '#6b7280', fontSize: 12 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent trades */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-white">
            {hasFilters ? 'Filtered Trades' : 'Recent Trades'}
          </h2>
          <Link to="/trades" className="text-xs text-slate-500 hover:text-accent transition-colors">
            View all →
          </Link>
        </div>
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-slate-500 text-sm">No trades found.</p>
            <Link to="/trades/new" className="text-xs text-accent hover:underline">Add your first trade →</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-surface-border">
                <th className="pb-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                <th className="pb-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Asset</th>
                <th className="pb-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Dir</th>
                <th className="pb-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Setup</th>
                <th className="pb-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide text-right">R:R</th>
                <th className="pb-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 10).map(t => (
                <tr key={t.id} className="border-b border-surface-border/50 hover:bg-surface-raised/60 transition-colors group">
                  <td className="py-3 text-slate-500">
                    <Link to={`/trades/${t.id}`} className="group-hover:text-white transition-colors">
                      {fmtDate(t.entry_time)}
                    </Link>
                  </td>
                  <td className="py-3 text-white font-medium">{t.asset}</td>
                  <td className={`py-3 capitalize text-xs font-semibold ${t.direction === 'long' ? 'text-profit' : 'text-loss'}`}>
                    {t.direction}
                  </td>
                  <td className="py-3 text-slate-500 max-w-[140px] truncate">
                    {t.entry_models?.length ? t.entry_models.map(m => m.name).join(', ') : '—'}
                  </td>
                  <td className="py-3 text-right text-slate-500">
                    {t.risk_reward != null ? `${t.risk_reward.toFixed(2)}R` : '—'}
                  </td>
                  <td className="py-3 text-right">
                    <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-lg ${PNL_STYLE[t.pnl] ?? ''}`}>
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
