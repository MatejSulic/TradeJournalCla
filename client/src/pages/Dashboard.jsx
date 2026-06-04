import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell,
  BarChart, Bar, LabelList,
} from 'recharts';
import { format, parseISO, getISOWeek, getISOWeekYear, getDay } from 'date-fns';
import { getTrades, getEntryModels, getSeries, reorderEntryModels } from '../api';
import StatCard from '../components/StatCard';
import DatePicker from '../components/DatePicker';
import TradeCalendar from '../components/TradeCalendar';

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
  const [seriesList, setSeriesList] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = {
    asset: searchParams.get('asset') || '',
    session_type: searchParams.get('session_type') || 'live',
    series_id: searchParams.get('series_id') || '',
    direction: searchParams.get('direction') || '',
    pnl: searchParams.get('pnl') || '',
    entry_model_id: searchParams.getAll('entry_model_id').map(Number),
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
  };

  useEffect(() => {
    setSearchParams(prev => { const n = new URLSearchParams(prev); if (!n.has('session_type')) n.set('session_type', 'live'); return n; }, { replace: true });
  }, []);

  useEffect(() => { getEntryModels().then(setModels); getSeries().then(setSeriesList); }, []);
  useEffect(() => { getTrades(filters).then(setTrades); }, [searchParams]);

  const set = (k, v) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (v) next.set(k, v); else next.delete(k);
    return next;
  }, { replace: true });

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

  const dowFilter = searchParams.get('dow') ? Number(searchParams.get('dow')) : null;
  const displayTrades = dowFilter
    ? trades.filter(t => t.entry_time && getDay(parseISO(t.entry_time)) === dowFilter)
    : trades;

  const weeksWithTrades = new Set(
    displayTrades
      .filter(t => t.entry_time)
      .map(t => {
        const d = parseISO(t.entry_time);
        return `${getISOWeekYear(d)}-${getISOWeek(d)}`;
      })
  ).size;
  const avgTradesPerWeek = weeksWithTrades > 0
    ? (displayTrades.length / weeksWithTrades).toFixed(1)
    : '—';

  const wins       = displayTrades.filter(t => t.pnl === 'win').length;
  const losses     = displayTrades.filter(t => t.pnl === 'loss').length;
  const breakevens = displayTrades.filter(t => t.pnl === 'breakeven').length;
  const decided    = wins + losses;
  const winRate    = decided ? (wins / decided) * 100 : 0;
  const rrTrades   = displayTrades.filter(t => t.risk_reward != null);
  const avgRR      = rrTrades.length ? rrTrades.reduce((s, t) => s + t.risk_reward, 0) / rrTrades.length : 0;
  const riskTrades = displayTrades.filter(t => t.risk_amount != null);
  const avgDollarRisk = riskTrades.length ? riskTrades.reduce((s, t) => s + t.risk_amount, 0) / riskTrades.length : null;

  let score = 0;
  const equityData = [...displayTrades]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(t => {
      if (t.pnl === 'win')  score += 1;
      if (t.pnl === 'loss') score -= 1;
      return { date: t.created_at, score };
    });

  const pieData = [
    { name: 'Win', value: wins, key: 'win' },
    { name: 'Loss', value: losses, key: 'loss' },
    { name: 'BE', value: breakevens, key: 'breakeven' },
  ].filter(d => d.value > 0);

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayStats = DAY_LABELS.map((label, i) => {
    const dayTrades = displayTrades.filter(t => {
      if (!t.entry_time) return false;
      return getDay(parseISO(t.entry_time)) === i + 1;
    });
    const w = dayTrades.filter(t => t.pnl === 'win').length;
    const l = dayTrades.filter(t => t.pnl === 'loss').length;
    const dec = w + l;
    return { day: label, winRate: dec ? Math.round((w / dec) * 100) : null };
  });

  const hasFilters = [...searchParams.entries()].some(([k, v]) => !(k === 'session_type' && v === 'live'));

  const filterChips = [
    filters.session_type && (filters.session_type === 'live' ? 'Live' : 'Backtest'),
    filters.asset,
    filters.series_id && seriesList.find(s => s.id == filters.series_id)?.name,
    filters.direction && (filters.direction === 'long' ? 'Long' : 'Short'),
    filters.pnl && ({ win: 'Win', loss: 'Loss', breakeven: 'BE' }[filters.pnl]),
    filters.from && `From ${filters.from}`,
    filters.to && `To ${filters.to}`,
    searchParams.get('dow') && ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][Number(searchParams.get('dow'))],
    filters.entry_model_id.length && `${filters.entry_model_id.length} setup${filters.entry_model_id.length > 1 ? 's' : ''}`,
  ].filter(Boolean);

  return (
    <div className="p-6 flex flex-col gap-4 mx-auto" style={{ maxWidth: '96vw', height: '96vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
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

      {/* Filters */}
      <div className="card !p-0 overflow-hidden flex-shrink-0">
        {/* Header — vždy viditelný, kliknutím toggleuje panel */}
        <button
          type="button"
          onClick={() => setFiltersOpen(v => !v)}
          className="w-full flex items-center gap-3 text-left p-5"
        >
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex-shrink-0">Filters</span>
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {filterChips.map(chip => (
              <span key={chip} className="text-[11px] px-2 py-0.5 rounded-md bg-surface-raised text-slate-300 border border-surface-border">
                {chip}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasFilters && (
              <span
                role="button"
                className="text-xs text-accent hover:underline"
                onClick={e => { e.stopPropagation(); setSearchParams({ session_type: 'live' }, { replace: true }); }}
              >
                Clear all
              </span>
            )}
            <svg
              className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Rozbalitelný obsah */}
        <div
          className="grid transition-all duration-300 ease-in-out"
          style={{ gridTemplateRows: filtersOpen ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-3 border-t border-surface-border space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-lg border border-surface-border overflow-hidden">
                {[['', 'All'], ['live', 'Live'], ['backtest', 'Backtest']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set('session_type', val)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filters.session_type === val
                        ? val === 'live'
                          ? 'bg-profit text-black'
                          : val === 'backtest'
                            ? 'bg-accent text-black'
                            : 'bg-surface-raised text-white'
                        : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select className="input w-32" value={filters.asset} onChange={e => set('asset', e.target.value)}>
                <option value="">All assets</option>
                {['NQ','MNQ','ES','MES'].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select className="input w-40" value={filters.series_id} onChange={e => set('series_id', e.target.value)}>
                <option value="">All series</option>
                {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                <DatePicker className="w-40" value={filters.from} onChange={v => set('from', v)} placeholder="From" />
                <span className="text-slate-600 text-sm">–</span>
                <DatePicker className="w-40" value={filters.to} onChange={v => set('to', v)} placeholder="To" />
              </div>
              <div className="flex rounded-lg border border-surface-border overflow-hidden">
                {[['', 'All'], ['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri']].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set('dow', val)}
                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                      (searchParams.get('dow') || '') === val
                        ? 'bg-surface-raised text-white'
                        : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {models.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5 items-center pt-2 border-t border-surface-border"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIndex(null); }}
              >
                <span className="text-[11px] text-slate-600 self-center mr-1 uppercase tracking-wide">Setups:</span>
                {models.map((m, index) => {
                  const active = filters.entry_model_id.includes(m.id);
                  return (
                    <>
                      {dropIndex === index && dragId && (
                        <div key={`drop-${index}`} className="w-0.5 h-6 bg-accent rounded-full self-center" />
                      )}
                      <button
                        key={m.id}
                        type="button"
                        draggable
                        onDragStart={e => handleDragStart(e, m.id)}
                        onDragOver={e => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onClick={() => toggleModelFilter(m.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all duration-150 cursor-grab active:cursor-grabbing ${
                          m.id === dragId ? 'opacity-30' : ''
                        } ${
                          active
                            ? 'bg-accent text-black border-accent'
                            : 'bg-transparent text-slate-500 border-surface-border hover:border-accent/40 hover:text-white'
                        }`}
                      >
                        {m.name}
                      </button>
                    </>
                  );
                })}
                {dropIndex === models.length && dragId && (
                  <div className="w-0.5 h-6 bg-accent rounded-full self-center" />
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* ── Stat cards — full width, 5 combined cards ── */}
      <div className="grid grid-cols-5 gap-3 flex-shrink-0">

        {/* Total Trades + Avg/Week */}
        <div className="card flex flex-col gap-1.5 py-4">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Total Trades</span>
          <span className="text-2xl font-semibold tabular-nums leading-none text-white">{trades.length}</span>
          <span className="text-xs text-slate-500">{avgTradesPerWeek} / week</span>
        </div>

        <StatCard
          label="Win Rate"
          value={decided ? `${winRate.toFixed(1)}%` : '—'}
          valueClass={decided ? (winRate >= 50 ? 'text-profit' : 'text-loss') : ''}
        />
        <StatCard label="Avg R:R" value={rrTrades.length ? `${avgRR.toFixed(2)}R` : '—'} />
        <StatCard label="Avg $ Risk" value={avgDollarRisk !== null ? `$${avgDollarRisk.toFixed(0)}` : '—'} />

        {/* Wins / Losses / Breakevens */}
        <div className="card flex flex-col gap-1.5 py-4">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Results</span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold tabular-nums leading-none text-profit">{wins}W</span>
            <span className="text-2xl font-semibold tabular-nums leading-none text-loss">{losses}L</span>
            <span className="text-2xl font-semibold tabular-nums leading-none text-slate-400">{breakevens}BE</span>
          </div>
        </div>

      </div>

      {/* ── Charts | Calendar ── */}
      <div className="grid gap-6 flex-1 min-h-0" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* Left: charts */}
        <div className="grid grid-cols-3 gap-4 min-h-0">

          {/* Performance curve */}
          <div className="card col-span-2 flex flex-col min-h-0">
            <h2 className="text-sm font-semibold text-white mb-4 flex-shrink-0">Performance Curve</h2>
            <div className="flex-1 min-h-0">
              {equityData.length < 2 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-slate-600 text-sm">Not enough trades to display chart.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }}
                      tick={{ fill: '#4b5563', fontSize: 11 }}
                      axisLine={{ stroke: '#1f1f1f' }}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#111111', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12, color: '#fff' }}
                      labelStyle={{ color: '#6b7280' }}
                      formatter={v => [v, 'Score']}
                      labelFormatter={v => { try { return format(parseISO(v), 'MMM d, yyyy HH:mm'); } catch { return v; } }}
                      cursor={{ stroke: '#2a2a2a' }}
                    />
                    <ReferenceLine y={0} stroke="#2a2a2a" />
                    <Line type="monotone" dataKey="score" stroke={COLOR_MAIN} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLOR_MAIN, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Win Rate + Win Rate by Day stacked */}
          <div className="flex flex-col gap-4 min-h-0">

            <div className="card flex flex-col flex-1 min-h-0">
              <h2 className="text-sm font-semibold text-white mb-3 flex-shrink-0">Win Rate</h2>
              <div className="flex-1 min-h-0">
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-slate-600 text-sm">No trades yet.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value">
                        {pieData.map(entry => <Cell key={entry.key} fill={PIE_COLORS[entry.key]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#111111', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: '#6b7280' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(v, name) => [v, name]}
                      />
                      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fill={COLOR_MAIN} fontSize={20} fontWeight={700}>
                        {decided ? `${winRate.toFixed(1)}%` : '—'}
                      </text>
                      <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" fill="#4b5563" fontSize={11}>
                        Win Rate
                      </text>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card flex flex-col flex-1 min-h-0">
              <h2 className="text-sm font-semibold text-white mb-3 flex-shrink-0">Win Rate by Day</h2>
              <div className="flex-1 min-h-0">
                {dayStats.every(d => d.winRate === null) ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-slate-600 text-sm">No trades yet.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayStats} margin={{ top: 18, right: 8, left: 0, bottom: 4 }} barSize={22}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                      <XAxis dataKey="day" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={{ stroke: '#1f1f1f' }} tickLine={false} />
                      <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
                      <Tooltip
                        contentStyle={{ background: '#111111', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12 }}
                        labelStyle={{ color: '#6b7280' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={v => v !== null ? [`${v}%`, 'Win Rate'] : ['—', 'Win Rate']}
                        cursor={{ fill: '#1f1f1f' }}
                      />
                      <ReferenceLine y={50} stroke="#2a2a2a" strokeDasharray="4 4" />
                      <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                        {dayStats.map((entry, index) => (
                          <Cell key={index} fill={entry.winRate === null ? '#2a2a2a' : entry.winRate >= 50 ? COLOR_MAIN : COLOR_NEG} />
                        ))}
                        <LabelList dataKey="winRate" position="top" formatter={v => v !== null ? `${v}%` : ''} style={{ fill: COLOR_MAIN, fontSize: 11, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Right: calendar */}
        <div className="min-h-0">
          <TradeCalendar trades={displayTrades} />
        </div>

      </div>{/* end charts+calendar grid */}
    </div>
  );
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d, yyyy HH:mm'); } catch { return str; }
}
