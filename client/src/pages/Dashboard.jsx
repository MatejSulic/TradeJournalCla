import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { getStats, getEquity, getTrades } from '../api';
import StatCard from '../components/StatCard';

const PNL_STYLE = {
  win:       'bg-profit/10 text-profit',
  loss:      'bg-loss/10 text-loss',
  breakeven: 'bg-slate-700/40 text-slate-300',
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [equity, setEquity] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    getStats().then(setStats);
    getEquity().then(setEquity);
    getTrades().then(t => setRecent(t.slice(0, 8)));
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Trades" value={stats?.total ?? '—'} />
        <StatCard
          label="Win Rate"
          value={stats ? `${stats.winRate.toFixed(1)}%` : '—'}
          valueClass={stats ? (stats.winRate >= 50 ? 'text-profit' : 'text-loss') : ''}
        />
        <StatCard label="Avg R:R" value={stats ? `${stats.avgRR.toFixed(2)}R` : '—'} />
        <StatCard label="Wins" value={stats?.wins ?? '—'} valueClass="text-profit" />
        <StatCard label="Losses" value={stats?.losses ?? '—'} valueClass="text-loss" />
        <StatCard label="Breakevens" value={stats?.breakevens ?? '—'} />
      </div>

      {/* Performance curve */}
      <div className="card">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Performance Curve</h2>
        {equity.length < 2 ? (
          <p className="text-slate-500 text-sm text-center py-8">Not enough trades to display chart.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={equity} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3047" />
              <XAxis
                dataKey="date"
                tickFormatter={v => {
                  try { return format(parseISO(v), 'MMM d'); } catch { return v; }
                }}
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
                formatter={(v) => [v, 'Score']}
                labelFormatter={v => {
                  try { return format(parseISO(v), 'MMM d, yyyy HH:mm'); } catch { return v; }
                }}
              />
              <ReferenceLine y={0} stroke="#2a3047" />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#818cf8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#818cf8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent trades */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-300">Recent Trades</h2>
          <Link to="/trades" className="text-xs text-accent hover:underline">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">No trades yet. <Link to="/trades/new" className="text-accent hover:underline">Add your first trade.</Link></p>
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
              {recent.map(t => (
                <tr key={t.id} className="hover:bg-surface-raised/50 transition-colors">
                  <td className="py-2.5 text-slate-400">
                    <Link to={`/trades/${t.id}`} className="hover:text-slate-200">
                      {formatDate(t.entry_time)}
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

function formatDate(str) {
  try { return format(parseISO(str), 'MMM d, HH:mm'); } catch { return str; }
}
