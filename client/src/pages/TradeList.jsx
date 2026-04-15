import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getTrades, getEntryModels, importTrades } from '../api';

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
  const [importMsg, setImportMsg] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [page, setPage] = useState(1);
  const importRef = useRef(null);

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

  function exportToCSV() {
    const HEADERS = ['asset','direction','pnl','risk_reward','risk_amount','entry_time',
                     'why_entered','psychology','improvements','risk_management','entry_models'];
    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [HEADERS.join(',')];
    for (const t of trades) {
      const models = (t.entry_models || []).map(m => m.name).join(';');
      lines.push([
        escape(t.asset), escape(t.direction), escape(t.pnl),
        escape(t.risk_reward), escape(t.risk_amount), escape(t.entry_time),
        escape(t.why_entered), escape(t.psychology), escape(t.improvements),
        escape(t.risk_management), escape(models),
      ].join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportMsg(null);
    const text = await file.text();
    const cleaned = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const rows = parseCSV(cleaned);
    if (rows.length === 0) {
      setImportMsg({ type: 'error', text: 'CSV soubor neobsahuje žádné řádky.' });
      return;
    }
    setPendingImport(rows);
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const rows = pendingImport;
    setPendingImport(null);
    try {
      const { imported, errors } = await importTrades(rows);
      let msg = `Importováno ${imported} obchod${imported === 1 ? '' : imported < 5 ? 'y' : 'ů'}.`;
      if (errors.length) msg += ` ${errors.length} řádek přeskočen: ${errors.map(e => `Řádek ${e.row}: ${e.message}`).join('; ')}`;
      setImportMsg({ type: errors.length && imported === 0 ? 'error' : 'success', text: msg });
      if (imported > 0) load();
    } catch (err) {
      setImportMsg({ type: 'error', text: `Import selhal: ${err.message}` });
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
          <button onClick={exportToCSV} className="btn-secondary" disabled={trades.length === 0} title="Exportovat zobrazené obchody do CSV">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button onClick={() => importRef.current?.click()} className="btn-secondary" title="Importovat obchody z CSV">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Import CSV
          </button>
          <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Link to="/trades/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Trade
          </Link>
        </div>
      </div>

      {/* Import confirmation */}
      {pendingImport && (
        <div className="card border-accent/30 bg-accent/5 flex items-center justify-between gap-4">
          <p className="text-sm text-white">
            Načteno <span className="font-semibold text-accent">{pendingImport.length}</span> obchod{pendingImport.length === 1 ? '' : pendingImport.length < 5 ? 'y' : 'ů'} z CSV. Chceš je importovat?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setPendingImport(null)} className="btn-ghost text-xs py-1.5 px-3">
              Zrušit
            </button>
            <button onClick={confirmImport} className="btn-primary text-xs py-1.5 px-3">
              Importovat
            </button>
          </div>
        </div>
      )}

      {/* Import result message */}
      {importMsg && (
        <div className={`text-sm px-4 py-3 rounded-lg border ${importMsg.type === 'success' ? 'bg-profit/10 text-profit border-profit/20' : 'bg-loss/10 text-loss border-loss/20'}`}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-3 opacity-60 hover:opacity-100 text-xs">✕</button>
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

// Minimal RFC-4180-compatible CSV parser
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h.trim()] = vals[idx] ?? ''; });
    // entry_models: split by semicolon into array
    if (typeof obj.entry_models === 'string') {
      obj.entry_models = obj.entry_models ? obj.entry_models.split(';').map(s => s.trim()).filter(Boolean) : [];
    }
    result.push(obj);
  }
  return result;
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}
