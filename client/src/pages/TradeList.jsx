import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getTrades, getEntryModels } from '../api';

const PNL_STYLE = {
  win:       'bg-profit/10 text-profit',
  loss:      'bg-loss/10 text-loss',
  breakeven: 'bg-slate-700/40 text-slate-300',
};

export default function TradeList() {
  const navigate = useNavigate();
  const [trades, setTrades] = useState([]);
  const [models, setModels] = useState([]);
  const [filters, setFilters] = useState({ asset: '', direction: '', pnl: '', entry_model_id: '', from: '', to: '' });

  const load = useCallback(() => {
    getTrades(filters).then(setTrades);
  }, [filters]);

  useEffect(() => {
    getEntryModels().then(setModels);
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Trades</h1>
        <Link to="/trades/new" className="btn-primary">+ New Trade</Link>
      </div>

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

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr className="text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">Date / Time</th>
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Dir</th>
              <th className="px-4 py-3 font-medium">Setup</th>
              <th className="px-4 py-3 font-medium text-right">Risk</th>
              <th className="px-4 py-3 font-medium text-right">R:R</th>
              <th className="px-4 py-3 font-medium text-right">Result</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {trades.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No trades found.{' '}
                  <Link to="/trades/new" className="text-accent hover:underline">Add one.</Link>
                </td>
              </tr>
            )}
            {trades.map(t => (
              <tr
                key={t.id}
                className="hover:bg-surface-raised/40 cursor-pointer transition-colors"
                onClick={() => navigate(`/trades/${t.id}`)}
              >
                <td className="px-4 py-3 text-slate-400">{fmtDate(t.entry_time)}</td>
                <td className="px-4 py-3 text-slate-100 font-medium">{t.asset}</td>
                <td className={`px-4 py-3 capitalize text-xs font-semibold ${t.direction === 'long' ? 'text-profit' : 'text-loss'}`}>
                  {t.direction}
                </td>
                <td className="px-4 py-3 text-slate-400 max-w-[160px]">
                  {t.entry_models?.length
                    ? t.entry_models.map(m => m.name).join(', ')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {t.risk_amount != null ? `$${t.risk_amount.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {t.risk_reward != null ? `${t.risk_reward.toFixed(2)}R` : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded ${PNL_STYLE[t.pnl] ?? ''}`}>
                    {t.pnl}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/trades/${t.id}/edit`}
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-slate-500 hover:text-accent"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d, yyyy HH:mm'); } catch { return str; }
}
