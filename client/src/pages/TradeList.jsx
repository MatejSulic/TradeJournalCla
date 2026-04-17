import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getTrades, getEntryModels, downloadBackup, restoreBackup } from '../api';

const PNL_STYLE = {
  win:       'bg-profit/10 text-profit border border-profit/20',
  loss:      'bg-loss/10 text-loss border border-loss/20',
  breakeven: 'bg-white/5 text-slate-400 border border-white/10',
};

export default function TradeList() {
  const navigate = useNavigate();
  const [trades, setTrades] = useState([]);
  const [models, setModels] = useState([]);
  const [filters, setFilters] = useState({ asset: '', direction: '', pnl: '', entry_model_id: '', from: '', to: '' });
  const [backupMsg, setBackupMsg] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [page, setPage] = useState(1);
  const restoreRef = useRef(null);

  const PAGE_SIZE = 25;

  const load = useCallback(() => {
    getTrades(filters).then(data => { setTrades(data); setPage(1); });
  }, [filters]);

  useEffect(() => {
    getEntryModels().then(setModels);
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const hasFilters = Object.values(filters).some(Boolean);

  const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const pageTrades = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleDownloadBackup() {
    try {
      await downloadBackup();
    } catch (err) {
      setBackupMsg({ type: 'error', text: err.message });
    }
  }

  function handleRestoreSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupMsg(null);
    setPendingRestore(file);
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    const file = pendingRestore;
    setPendingRestore(null);
    setRestoring(true);
    try {
      await restoreBackup(file);
      window.location.reload();
    } catch (err) {
      setRestoring(false);
      setBackupMsg({ type: 'error', text: `Obnova selhala: ${err.message}` });
    }
  }

  return (
    <div className="p-8 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Trades</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {trades.length === 0 ? 'No trades found' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, trades.length)} of ${trades.length} trade${trades.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadBackup} className="btn-secondary" title="Stáhnout zálohu databáze">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Záloha
          </button>
          <button onClick={() => restoreRef.current?.click()} className="btn-secondary" disabled={restoring} title="Obnovit databázi ze zálohy">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {restoring ? 'Obnovuji…' : 'Obnovit'}
          </button>
          <input ref={restoreRef} type="file" accept=".zip" className="hidden" onChange={handleRestoreSelect} />
          <Link to="/trades/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Trade
          </Link>
        </div>
      </div>

      {/* Restore confirmation */}
      {pendingRestore && (
        <div className="card border-loss/30 bg-loss/5 flex items-center justify-between gap-4">
          <p className="text-sm text-white">
            Soubor <span className="font-semibold text-loss">{pendingRestore.name}</span> nahradí celou databázi. Tato akce je nevratná. Pokračovat?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setPendingRestore(null)} className="btn-ghost text-xs py-1.5 px-3">
              Zrušit
            </button>
            <button onClick={confirmRestore} className="btn-primary text-xs py-1.5 px-3">
              Obnovit databázi
            </button>
          </div>
        </div>
      )}

      {/* Backup/restore message */}
      {backupMsg && (
        <div className={`text-sm px-4 py-3 rounded-lg border ${backupMsg.type === 'success' ? 'bg-profit/10 text-profit border-profit/20' : 'bg-loss/10 text-loss border-loss/20'}`}>
          {backupMsg.text}
          <button onClick={() => setBackupMsg(null)} className="ml-3 opacity-60 hover:opacity-100 text-xs">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="card space-y-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Filters</p>
          {hasFilters && (
            <button
              className="text-xs text-accent hover:underline"
              onClick={() => setFilters({ asset: '', direction: '', pnl: '', entry_model_id: '', from: '', to: '' })}
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
          <select className="input w-44" value={filters.entry_model_id} onChange={e => set('entry_model_id', e.target.value)}>
            <option value="">All setups</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input type="date" className="input w-38" value={filters.from} onChange={e => set('from', e.target.value)} />
            <span className="text-slate-600 text-sm">–</span>
            <input type="date" className="input w-38" value={filters.to} onChange={e => set('to', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-5 py-4 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Date / Time</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Asset</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Dir</th>
              <th className="px-5 py-4 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Setup</th>
              <th className="px-5 py-4 text-right text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Risk</th>
              <th className="px-5 py-4 text-right text-[11px] font-semibold text-slate-600 uppercase tracking-wide">R:R</th>
              <th className="px-5 py-4 text-right text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Result</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <p className="text-slate-500 text-sm mb-2">No trades found.</p>
                  <Link to="/trades/new" className="text-xs text-accent hover:underline">Add your first trade →</Link>
                </td>
              </tr>
            )}
            {pageTrades.map(t => (
              <tr
                key={t.id}
                className="border-b border-surface-border/50 hover:bg-surface-raised/50 cursor-pointer transition-colors group"
                onClick={() => navigate(`/trades/${t.id}`)}
              >
                <td className="px-5 py-3.5 text-slate-500 group-hover:text-slate-300 transition-colors">{fmtDate(t.entry_time)}</td>
                <td className="px-5 py-3.5 text-white font-semibold">{t.asset}</td>
                <td className={`px-5 py-3.5 capitalize text-xs font-semibold ${t.direction === 'long' ? 'text-profit' : 'text-loss'}`}>
                  {t.direction}
                </td>
                <td className="px-5 py-3.5 text-slate-500 max-w-[160px] truncate">
                  {t.entry_models?.length
                    ? t.entry_models.map(m => m.name).join(', ')
                    : '—'}
                </td>
                <td className="px-5 py-3.5 text-right text-slate-500">
                  {t.risk_amount != null ? `$${t.risk_amount.toFixed(2)}` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right text-slate-500">
                  {t.risk_reward != null ? `${t.risk_reward.toFixed(2)}R` : '—'}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-lg ${PNL_STYLE[t.pnl] ?? ''}`}>
                    {t.pnl}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    to={`/trades/${t.id}/edit`}
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-slate-600 hover:text-accent transition-colors"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            «
          </button>
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce((acc, p, idx, arr) => {
              if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
              acc.push(p);
              return acc;
            }, [])
            .map((p, idx) =>
              p === '...'
                ? <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-xs text-slate-600">…</span>
                : <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-accent text-black' : 'text-slate-400 hover:text-white hover:bg-surface-raised'}`}
                  >
                    {p}
                  </button>
            )}
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-surface-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d, yyyy HH:mm'); } catch { return str; }
}
