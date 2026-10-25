import { memo, useEffect, useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';

const RESULT = {
  win:       ['W',  'bg-accent-soft text-accent'],
  loss:      ['L',  'bg-loss/10 text-loss'],
  breakeven: ['BE', 'bg-neutral/15 text-slate-500 dark:bg-neutral/25 dark:text-slate-300'],
};

const GRID = 'grid grid-cols-[1.25rem_8.5rem_3rem_3.5rem_3.25rem_3.5rem_minmax(0,1fr)] items-center gap-x-3';

const fmt = (s, pattern) => { try { return format(parseISO(s), pattern); } catch { return '—'; } };

/**
 * Checkbox list of the trades + no-trade days that go into an AI analysis (scrolls internally).
 * - `trades`, `noTradeDays`: rows as returned by GET /api/trades (already filtered by the page).
 * - `excluded`: Set of unchecked ids (trades and no-trade days share the `trades.id` space).
 * - `onToggle(id)`, `onAll()`, `onNone()`: the header checkbox calls onAll / onNone.
 */
export default function SelectionList({ trades, noTradeDays, excluded, onToggle, onAll, onNone }) {
  const rows = useMemo(() => {
    const all = [
      ...trades.map(t => ({ kind: 'trade', t })),
      ...noTradeDays.map(t => ({ kind: 'notrade', t })),
    ];
    return all.sort((a, b) => (b.t.entry_time || '').localeCompare(a.t.entry_time || '') || b.t.id - a.t.id);
  }, [trades, noTradeDays]);

  const selectedCount = rows.reduce((n, r) => n + (excluded.has(r.t.id) ? 0 : 1), 0);
  const allOn = rows.length > 0 && selectedCount === rows.length;
  const someOn = selectedCount > 0 && !allOn;

  const masterRef = useRef(null);
  useEffect(() => { if (masterRef.current) masterRef.current.indeterminate = someOn; }, [someOn]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className={`${GRID} px-3 pb-2 text-[11px] font-medium text-slate-400 dark:text-slate-500 border-b border-surface-border flex-shrink-0`}>
        <input
          ref={masterRef}
          type="checkbox"
          className="w-4 h-4 accent-accent cursor-pointer"
          checked={allOn}
          disabled={rows.length === 0}
          onChange={() => (allOn ? onNone() : onAll())}
          aria-label={allOn ? 'Deselect all' : 'Select all'}
        />
        <span>Date</span>
        <span>Asset</span>
        <span>Side</span>
        <span>Result</span>
        <span className="text-right">R:R</span>
        <span>Setups</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-1.5 space-y-0.5">
        {rows.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500">No trades match the current filters.</p>
        )}
        {rows.map(r => (
          r.kind === 'trade'
            ? <TradeRow key={r.t.id} t={r.t} checked={!excluded.has(r.t.id)} onToggle={onToggle} />
            : <NoTradeRow key={r.t.id} t={r.t} checked={!excluded.has(r.t.id)} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

const rowCls = (checked, extra = '') =>
  `${GRID} px-3 py-2 rounded-xl cursor-pointer select-none text-sm transition-[background-color,opacity] hover:bg-surface-raised ${checked ? '' : 'opacity-45'} ${extra}`;

const TradeRow = memo(function TradeRow({ t, checked, onToggle }) {
  const [label, cls] = RESULT[t.pnl] || ['—', 'bg-surface-raised text-slate-500'];
  const models = (t.entry_models || []).map(m => m.name).join(', ');
  return (
    <label className={rowCls(checked)}>
      <input type="checkbox" className="w-4 h-4 accent-accent cursor-pointer" checked={checked} onChange={() => onToggle(t.id)} />
      <span className="text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">{fmt(t.entry_time, 'MMM d, yyyy HH:mm')}</span>
      <span className="font-medium text-slate-900 dark:text-white">{t.asset}</span>
      <span className="text-slate-600 dark:text-slate-300">{t.direction === 'long' ? 'Long' : t.direction === 'short' ? 'Short' : '—'}</span>
      <span>
        <span className={`inline-flex items-center justify-center min-w-[2rem] px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
          {label}
          {t.pnl === 'breakeven' && t.be_outcome && <span className="ml-0.5 font-medium opacity-80">→{t.be_outcome === 'win' ? 'W' : 'L'}</span>}
        </span>
      </span>
      <span className="text-right tabular-nums text-slate-600 dark:text-slate-300">{t.risk_reward ? `${+t.risk_reward}R` : '—'}</span>
      <span className="min-w-0 flex items-center gap-2">
        <span className="truncate text-slate-500 dark:text-slate-400" title={models || undefined}>{models || '—'}</span>
        {t.session_type === 'backtest' && (
          <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral/15 text-slate-500 dark:bg-neutral/25 dark:text-slate-300">Backtest</span>
        )}
      </span>
    </label>
  );
});

const NoTradeRow = memo(function NoTradeRow({ t, checked, onToggle }) {
  return (
    <label className={rowCls(checked, 'border border-dashed border-neutral/40 my-1')}>
      <input type="checkbox" className="w-4 h-4 accent-accent cursor-pointer" checked={checked} onChange={() => onToggle(t.id)} />
      <span className="text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">{fmt(t.entry_time, 'MMM d, yyyy')}</span>
      <span className="col-span-4 text-[11px] font-semibold tracking-wide uppercase text-slate-400 dark:text-slate-500">No trade</span>
      <span className="min-w-0 truncate text-slate-500 dark:text-slate-400" title={t.no_trade_reason || undefined}>{t.no_trade_reason || '—'}</span>
    </label>
  );
});
