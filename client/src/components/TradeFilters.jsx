import { Fragment, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { reorderEntryModels } from '../api';
import DatePicker from './DatePicker';

const SESSIONS = [['live', 'Live'], ['backtest', 'Backtest'], ['all', 'All']];
const DOWS = [['', 'All'], ['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri']];
const ASSETS = ['NQ', 'MNQ', 'ES', 'MES'];
const PNL_LABELS = { win: 'Win', loss: 'Loss', breakeven: 'Breakeven', be_win: 'BE → Win', be_loss: 'BE → Loss' };

/**
 * Single source of trade-filter parsing from URL search params (Dashboard, AI page).
 * `filters` = server-side filters (session_type 'live' default, 'all' = no filter);
 * `apiFilters` = same, ready for getTrades (session 'all' → ''); `dowFilter` = client-side day of week (1–5 | null).
 */
export function useTradeFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = {
    asset: searchParams.get('asset') || '',
    session_type: searchParams.get('session_type') || 'live',
    series_id: searchParams.get('series_id') || '',
    strategy_id: searchParams.get('strategy_id') || '',
    direction: searchParams.get('direction') || '',
    pnl: searchParams.get('pnl') || '',
    entry_model_id: searchParams.getAll('entry_model_id').map(Number),
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  };
  const apiFilters = { ...filters, session_type: filters.session_type === 'all' ? '' : filters.session_type };
  const dowFilter = searchParams.get('dow') ? Number(searchParams.get('dow')) : null;

  useEffect(() => {
    setSearchParams(prev => { const n = new URLSearchParams(prev); if (!n.has('session_type')) n.set('session_type', 'live'); return n; }, { replace: true });
  }, []);

  const set = (k, v) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (v) next.set(k, v); else next.delete(k);
    return next;
  }, { replace: true });

  // Clearing keeps the session (it has its own control)
  const clearAll = () => setSearchParams({ session_type: filters.session_type }, { replace: true });

  return { filters, dowFilter, apiFilters, set, clearAll, searchParams, setSearchParams };
}

/**
 * Header filter controls: session .seg, Filters button + floating popover, collapsed chip row.
 * - `title`: left side of the header row (page heading).
 * - `actions`: rendered right of the Filters button (e.g. New Trade).
 * - `extraChips`: [{ key, label, clear, hides? }] — prepended to the chips. With `hides: ['from', 'to']` those chips
 *   are dropped and the extra chip takes the slot of the first hidden one instead (Dashboard's calendar month chip).
 */
export default function TradeFilters({ models, setModels, seriesList, strategies = [], extraChips = [], title = null, actions = null, className = '' }) {
  const { filters, dowFilter, set, clearAll, searchParams, setSearchParams } = useTradeFilters();
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panelSettled, setPanelSettled] = useState(false);
  const filtersBtnRef = useRef(null);
  const filtersPanelRef = useRef(null);

  const handleDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver  = (e, index) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDropIndex(e.clientX > rect.left + rect.width / 2 ? index + 1 : index);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    if (dragId == null || dropIndex == null) return;
    const from = models.findIndex(m => m.id === dragId);
    if (from === -1) return;
    const next = [...models];
    const [item] = next.splice(from, 1);
    next.splice(dropIndex > from ? dropIndex - 1 : dropIndex, 0, item);
    setModels(next);
    setDragId(null);
    setDropIndex(null);
    reorderEntryModels(next.map((m, i) => ({ id: m.id, sort_order: i })));
  };
  const handleDragEnd = () => { setDragId(null); setDropIndex(null); };

  const toggleModelFilter = (id) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const current = next.getAll('entry_model_id').map(Number);
      next.delete('entry_model_id');
      (current.includes(id) ? current.filter(x => x !== id) : [...current, id])
        .forEach(x => next.append('entry_model_id', x));
      return next;
    }, { replace: true });
  };

  const clearEntryModels = () => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.delete('entry_model_id');
    return next;
  }, { replace: true });

  // Active filters (session excluded — it has its own control in the header)
  const baseChips = [
    filters.asset && { key: 'asset', label: filters.asset },
    filters.series_id && { key: 'series_id', label: seriesList.find(s => s.id == filters.series_id)?.name || 'Series' },
    filters.strategy_id && {
      key: 'strategy_id',
      label: filters.strategy_id === 'none' ? 'No strategy' : strategies.find(s => String(s.id) === filters.strategy_id)?.name || 'Strategy',
    },
    filters.direction && { key: 'direction', label: filters.direction === 'long' ? 'Long' : 'Short' },
    filters.pnl && { key: 'pnl', label: PNL_LABELS[filters.pnl] },
    filters.from && { key: 'from', label: `From ${filters.from}` },
    filters.to && { key: 'to', label: `To ${filters.to}` },
    dowFilter && { key: 'dow', label: DOWS.find(([v]) => v === String(dowFilter))?.[1] },
    filters.entry_model_id.length > 0 && {
      key: 'entry_model_id',
      label: filters.entry_model_id.length === 1
        ? models.find(m => m.id === filters.entry_model_id[0])?.name || '1 setup'
        : `${filters.entry_model_id.length} setups`,
      clear: clearEntryModels,
    },
  ].filter(Boolean);

  // Extra chips: prepended, or in place of the first chip they hide
  const filterChips = [];
  const placed = new Set();
  for (const chip of baseChips) {
    const replacer = extraChips.find(x => x.hides?.includes(chip.key));
    if (!replacer) { filterChips.push(chip); continue; }
    if (!placed.has(replacer.key)) { filterChips.push(replacer); placed.add(replacer.key); }
  }
  filterChips.unshift(...extraChips.filter(x => !placed.has(x.key)));

  const toggleFilters = () => { setPanelSettled(false); setFiltersOpen(v => !v); };

  useEffect(() => {
    if (!filtersOpen) return;
    const close = () => { setPanelSettled(false); setFiltersOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    // Click anywhere outside the panel closes it (the Filters button toggles on its own; DatePicker popup is portalled to body)
    const onPointerDown = (e) => {
      const t = e.target;
      if (filtersPanelRef.current?.contains(t) || filtersBtnRef.current?.contains(t) || t.closest?.('#dp-portal')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [filtersOpen]);

  return (
    <div className={`relative z-30 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">{title}</div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="seg">
            {SESSIONS.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => set('session_type', val)}
                className={`seg-item px-4 ${filters.session_type === val ? 'seg-item-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button ref={filtersBtnRef} type="button" onClick={toggleFilters} className={`btn-secondary ${filtersOpen ? '!bg-surface-raised' : ''}`} aria-expanded={filtersOpen}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
            {filterChips.length > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold tabular-nums flex items-center justify-center">
                {filterChips.length}
              </span>
            )}
          </button>
          {actions}
        </div>
      </div>

      {/* Collapsed: active filter chips */}
      {!filtersOpen && filterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {filterChips.map(chip => (
            <span key={chip.key} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-accent-soft text-accent text-xs font-medium">
              {chip.label}
              <button
                type="button"
                onClick={() => (chip.clear ? chip.clear() : set(chip.key, ''))}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-accent/15"
                aria-label={`Remove ${chip.label} filter`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white ml-1">
            Clear all
          </button>
        </div>
      )}

      {/* Expandable panel (floats over the content so the layout never gets crushed) */}
      <div
        className="absolute left-0 right-0 top-full grid pointer-events-none transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: filtersOpen ? '1fr' : '0fr' }}
        onTransitionEnd={e => { if (e.target === e.currentTarget) setPanelSettled(filtersOpen); }}
      >
        <div className={filtersOpen && panelSettled ? 'overflow-visible' : 'overflow-hidden'}>
          <div className="pt-3 pb-8 -mx-4 px-4">
            <div ref={filtersPanelRef} className="card pointer-events-auto !p-5 space-y-4 !shadow-2xl dark:!shadow-black/40 dark:ring-1 dark:ring-surface-border">
              <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                <div>
                  <label className="label">Asset</label>
                  <select className="input" value={filters.asset} onChange={e => set('asset', e.target.value)}>
                    <option value="">All assets</option>
                    {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Direction</label>
                  <select className="input" value={filters.direction} onChange={e => set('direction', e.target.value)}>
                    <option value="">All directions</option>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </div>
                <div>
                  <label className="label">Result</label>
                  <select className="input" value={filters.pnl} onChange={e => set('pnl', e.target.value)}>
                    <option value="">All results</option>
                    <option value="win">Win</option>
                    <option value="loss">Loss</option>
                    <option value="breakeven">Breakeven</option>
                    <option value="be_win">BE → Win</option>
                    <option value="be_loss">BE → Loss</option>
                  </select>
                </div>
                <div>
                  <label className="label">Series</label>
                  <select className="input" value={filters.series_id} onChange={e => set('series_id', e.target.value)}>
                    <option value="">All series</option>
                    {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Strategy</label>
                  <select className="input" value={filters.strategy_id} onChange={e => set('strategy_id', e.target.value)}>
                    <option value="">All strategies</option>
                    <option value="none">No strategy</option>
                    {strategies.map(s => <option key={s.id} value={s.id}>{s.name}{s.archived ? ' (archived)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">From</label>
                  <DatePicker className="w-full" value={filters.from} onChange={v => set('from', v)} placeholder="Start date" />
                </div>
                <div>
                  <label className="label">To</label>
                  <DatePicker className="w-full" value={filters.to} onChange={v => set('to', v)} placeholder="End date" />
                </div>
                <div className="col-span-2">
                  <label className="label">Day of week</label>
                  <div className="seg">
                    {DOWS.map(([val, label]) => (
                      <button
                        key={val || 'all'}
                        type="button"
                        onClick={() => set('dow', val)}
                        className={`seg-item ${(searchParams.get('dow') || '') === val ? 'seg-item-active' : ''}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {models.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="label !mb-0">Setups <span className="font-normal text-slate-400 dark:text-slate-500">· all selected must match · drag to reorder</span></span>
                    {filterChips.length > 0 && (
                      <button type="button" onClick={clearAll} className="text-xs font-medium text-accent hover:underline">Clear all</button>
                    )}
                  </div>
                  <div
                    className="flex flex-wrap gap-1.5 items-center"
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIndex(null); }}
                  >
                    {models.map((m, index) => {
                      const active = filters.entry_model_id.includes(m.id);
                      return (
                        <Fragment key={m.id}>
                          {dropIndex === index && dragId && <div className="w-0.5 h-6 bg-accent rounded-full self-center" />}
                          <button
                            type="button"
                            draggable
                            onDragStart={e => handleDragStart(e, m.id)}
                            onDragOver={e => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            onClick={() => toggleModelFilter(m.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-grab active:cursor-grabbing ${
                              m.id === dragId ? 'opacity-30' : ''
                            } ${
                              active
                                ? 'bg-accent text-white'
                                : 'bg-surface-raised text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-accent-soft'
                            }`}
                          >
                            {m.name}
                          </button>
                        </Fragment>
                      );
                    })}
                    {dropIndex === models.length && dragId && <div className="w-0.5 h-6 bg-accent rounded-full self-center" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
