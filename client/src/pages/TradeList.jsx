import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getTrades, getEntryModels, getSeries, getStrategies, downloadBackup, restoreBackup } from '../api';
import DatePicker from '../components/DatePicker';

const PNL_PILL = {
  win:       ['W', 'bg-accent-soft text-accent'],
  loss:      ['L', 'bg-loss/10 text-loss'],
  breakeven: ['BE', 'bg-neutral/15 text-slate-500 dark:bg-neutral/25 dark:text-slate-300'],
};

const FILTER_KEYS = ['asset', 'session_type', 'series_id', 'strategy_id', 'direction', 'pnl', 'entry_model_id', 'from', 'to'];

const PAGER_BTN = 'btn-ghost !px-2.5 !py-1.5 text-xs';

export default function TradeList() {
  const navigate = useNavigate();
  // Filters + page live in the URL so returning from a trade restores the same view
  const [searchParams, setSearchParams] = useSearchParams();
  const [trades, setTrades] = useState([]);
  const [models, setModels] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const filters = useMemo(
    () => Object.fromEntries(FILTER_KEYS.map(k => [k, searchParams.get(k) || ''])),
    [searchParams],
  );
  const [backupMsg, setBackupMsg] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const rawPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const setPage = p => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    const n = typeof p === 'function' ? p(page) : p;
    if (n > 1) next.set('page', n); else next.delete('page');
    return next;
  }, { replace: true });
  const restoreRef = useRef(null);

  const PAGE_SIZE = 25;

  const load = useCallback(() => {
    getTrades(filters).then(setTrades);
  }, [filters]);

  useEffect(() => {
    getEntryModels().then(setModels);
    getSeries().then(setSeriesList);
    getStrategies().then(setStrategies).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Changing a filter resets to page 1
  const set = (k, v) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (v) next.set(k, v); else next.delete(k);
    next.delete('page');
    return next;
  }, { replace: true });

  const hasFilters = Object.values(filters).some(Boolean);

  const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const page = Math.min(rawPage, totalPages); // e.g. after deleting the last trade of the last page
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
      setBackupMsg({ type: 'error', text: `Restore failed: ${err.message}` });
    }
  }

  return (
    <div className="p-6 flex flex-col gap-4 mx-auto" style={{ maxWidth: '96vw', height: '96vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight dark:text-white text-slate-900">Trades</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {trades.length === 0 ? 'No trades found' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, trades.length)} of ${trades.length} trade${trades.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadBackup} className="btn-secondary" title="Stáhnout zálohu databáze">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          <button onClick={() => restoreRef.current?.click()} className="btn-secondary" disabled={restoring} title="Restore database from backup">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {restoring ? 'Restoring…' : 'Restore'}
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
        <div className="card !py-4 !bg-loss/10 !shadow-none flex items-center justify-between gap-4 flex-shrink-0">
          <p className="text-sm dark:text-white text-slate-900">
            File <span className="font-semibold text-loss">{pendingRestore.name}</span> will replace the entire database. This action is irreversible. Continue?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setPendingRestore(null)} className="btn-ghost text-xs !py-1.5 !px-3">
              Cancel
            </button>
            <button onClick={confirmRestore} className="btn-danger !bg-loss !text-white hover:!brightness-110 text-xs !py-1.5 !px-3">
              Restore Database
            </button>
          </div>
        </div>
      )}

      {/* Backup/restore message */}
      {backupMsg && (
        <div className={`text-sm px-4 py-3 rounded-2xl flex-shrink-0 ${backupMsg.type === 'success' ? 'bg-accent-soft text-accent' : 'bg-loss/10 text-loss'}`}>
          {backupMsg.text}
          <button onClick={() => setBackupMsg(null)} className="ml-3 opacity-60 hover:opacity-100 text-xs">✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="seg">
          {[['', 'All'], ['live', 'Live'], ['backtest', 'Backtest']].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => set('session_type', val)}
              className={`seg-item ${filters.session_type === val ? 'seg-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select className="input !w-32 !py-2" value={filters.asset} onChange={e => set('asset', e.target.value)}>
          <option value="">All assets</option>
          {['NQ','MNQ','ES','MES'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className="input !w-40 !py-2" value={filters.series_id} onChange={e => set('series_id', e.target.value)}>
          <option value="">All series</option>
          {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="input !w-40 !py-2" value={filters.strategy_id} onChange={e => set('strategy_id', e.target.value)}>
          <option value="">All strategies</option>
          <option value="none">No strategy</option>
          {strategies.map(s => <option key={s.id} value={s.id}>{s.name}{s.archived ? ' (archived)' : ''}</option>)}
        </select>
        <select className="input !w-36 !py-2" value={filters.direction} onChange={e => set('direction', e.target.value)}>
          <option value="">All directions</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select className="input !w-36 !py-2" value={filters.pnl} onChange={e => set('pnl', e.target.value)}>
          <option value="">All results</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="breakeven">Breakeven</option>
          <option value="be_win">BE → Win</option>
          <option value="be_loss">BE → Loss</option>
        </select>
        <select className="input !w-44 !py-2" value={filters.entry_model_id} onChange={e => set('entry_model_id', e.target.value)}>
          <option value="">All setups</option>
          {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <DatePicker className="w-40" value={filters.from} onChange={v => set('from', v)} placeholder="From" />
          <span className="text-slate-400 text-sm">–</span>
          <DatePicker className="w-40" value={filters.to} onChange={v => set('to', v)} placeholder="To" />
        </div>
        {hasFilters && (
          <button
            className="btn-ghost !px-3 !py-2 text-xs"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto flex-1 min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-card z-10">
            <tr className="bg-surface-raised/50">
              {[
                ['Date', 'text-left'], ['Asset', 'text-left'], ['Type', 'text-left'], ['Direction', 'text-left'],
                ['Setup', 'text-left'], ['Strategy', 'text-left'], ['Risk', 'text-right'], ['R:R', 'text-right'], ['Result', 'text-center'], ['', ''],
              ].map(([h, align], i) => (
                <th key={i} className={`px-5 py-3 ${align} text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {trades.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-16 text-center">
                  <p className="text-slate-500 text-sm mb-2">No trades found.</p>
                  <Link to="/trades/new" className="text-xs font-medium text-accent hover:underline">Add your first trade →</Link>
                </td>
              </tr>
            )}
            {pageTrades.map(t => {
              const [pillText, pillCls] = PNL_PILL[t.pnl] ?? [t.pnl, 'bg-surface-raised text-slate-500'];
              return (
              <tr
                key={t.id}
                className="hover:bg-surface-raised/60 cursor-pointer transition-colors group"
                onClick={() => navigate(`/trades/${t.id}`)}
              >
                <td className="px-5 py-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">{fmtDate(t.entry_time)}</td>
                <td className="px-5 py-3 dark:text-white text-slate-900 font-semibold">{t.asset}</td>
                <td className="px-5 py-3">
                  {t.session_type === 'backtest'
                    ? <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral/15 text-slate-500 dark:bg-neutral/25 dark:text-slate-300">Backtest</span>
                    : <span className="text-slate-500 dark:text-slate-400">Live</span>}
                </td>
                <td className={`px-5 py-3 text-xs font-semibold whitespace-nowrap ${t.direction === 'long' ? 'text-accent' : 'text-loss'}`}>
                  {t.direction === 'long' ? '↑ Long' : '↓ Short'}
                </td>
                <td className="px-5 py-3 max-w-[280px]">
                  {t.entry_models?.length ? (
                    <div className="flex items-center gap-1 overflow-hidden" title={t.entry_models.map(m => m.name).join(', ')}>
                      {t.entry_models.slice(0, 2).map(m => (
                        <span key={m.id} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-raised text-slate-600 dark:text-slate-300 whitespace-nowrap truncate max-w-[120px]">
                          {m.name}
                        </span>
                      ))}
                      {t.entry_models.length > 2 && (
                        <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">+{t.entry_models.length - 2}</span>
                      )}
                    </div>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-3 max-w-[160px]">
                  {t.strategy?.name
                    ? <span className="block truncate text-xs font-medium text-slate-600 dark:text-slate-300" title={t.strategy.name}>{t.strategy.name}</span>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {t.risk_amount != null ? `$${t.risk_amount.toFixed(2)}` : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {t.risk_reward != null ? `${t.risk_reward.toFixed(2)}R` : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-3 text-center">
                  <span title={t.pnl} className={`inline-flex items-center justify-center min-w-[2.25rem] text-xs font-semibold px-2.5 py-1 rounded-full ${pillCls}`}>
                    {pillText}
                    {t.pnl === 'breakeven' && t.be_outcome && (
                      <span className={`ml-0.5 ${t.be_outcome === 'win' ? 'text-accent' : 'text-loss'}`}>→{t.be_outcome === 'win' ? 'W' : 'L'}</span>
                    )}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    to={`/trades/${t.id}/edit`}
                    onClick={e => e.stopPropagation()}
                    className="text-xs font-medium text-slate-400 hover:text-accent opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 flex-shrink-0">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className={PAGER_BTN}
          >
            «
          </button>
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className={PAGER_BTN}
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
                ? <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-xs text-slate-400">…</span>
                : <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={p === page ? 'btn-primary !px-3 !py-1.5 text-xs' : `${PAGER_BTN} !px-3`}
                  >
                    {p}
                  </button>
            )}
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
            className={PAGER_BTN}
          >
            ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className={PAGER_BTN}
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
