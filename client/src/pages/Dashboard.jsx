import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseISO, getDay, format, startOfMonth, endOfMonth } from 'date-fns';
import { getTrades, getEntryModels, getSeries, getStrategies, getExpenseAccounts } from '../api';
import TradeFilters, { useTradeFilters } from '../components/TradeFilters';
import TradeCalendar from '../components/TradeCalendar';
import StatCards, { computeStats } from '../components/dashboard/StatCards';
import PerformanceCurve from '../components/dashboard/PerformanceCurve';
import TopSetups from '../components/dashboard/TopSetups';
import WinRateByDay from '../components/dashboard/WinRateByDay';

export default function Dashboard() {
  const [trades, setTrades] = useState([]);
  const [models, setModels] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [passedDates, setPassedDates] = useState(new Set());
  const [noTradeDays, setNoTradeDays] = useState([]);
  const { filters, dowFilter, apiFilters, searchParams, setSearchParams } = useTradeFilters();

  useEffect(() => {
    getEntryModels().then(setModels);
    getSeries().then(setSeriesList);
    getStrategies().then(setStrategies).catch(() => {});
    getTrades({ day_type: 'notrade' }).then(setNoTradeDays);
  }, []);
  useEffect(() => {
    getExpenseAccounts().then(accounts => {
      setPassedDates(new Set(
        accounts.filter(a => a.passed_at).map(a => a.passed_at.slice(0, 10))
      ));
    });
  }, []);
  useEffect(() => {
    getTrades(apiFilters).then(setTrades);
  }, [searchParams]);

  const displayTrades = dowFilter
    ? trades.filter(t => t.entry_time && getDay(parseISO(t.entry_time)) === dowFilter)
    : trades;

  const stats = computeStats(displayTrades);

  // Calendar "Show stats": from/to spanning exactly one calendar month
  const monthRange = d => [format(startOfMonth(d), 'yyyy-MM-dd'), format(endOfMonth(d), 'yyyy-MM-dd')];
  const statsMonth = (() => {
    if (!filters.from || !filters.to) return null;
    const d = parseISO(filters.from);
    const [f, t] = monthRange(d);
    return f === filters.from && t === filters.to ? startOfMonth(d) : null;
  })();
  const setStatsMonth = d => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (d) { const [f, t] = monthRange(d); next.set('from', f); next.set('to', t); }
    else { next.delete('from'); next.delete('to'); }
    return next;
  }, { replace: true });

  // Whole-month range shows as one chip (e.g. "October 2026") in place of the From / To chips
  const extraChips = statsMonth
    ? [{ key: 'month', label: format(statsMonth, 'MMMM yyyy'), clear: () => setStatsMonth(null), hides: ['from', 'to'] }]
    : [];

  return (
    <div className="h-full p-6 flex flex-col gap-5 min-h-0 overflow-hidden">
      <TradeFilters
        className="flex-shrink-0"
        models={models}
        setModels={setModels}
        seriesList={seriesList}
        strategies={strategies}
        extraChips={extraChips}
        title={<>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your trading performance at a glance</p>
        </>}
        actions={
          <Link to="/trades/new" className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Trade
          </Link>
        }
      />

      <StatCards stats={stats} />

      {/* Charts | Calendar */}
      <div className="grid grid-cols-2 gap-5 flex-1 min-h-0">
        <div className="grid gap-5 min-h-0" style={{ gridTemplateRows: 'minmax(0, 1.15fr) minmax(0, 1fr)' }}>
          <PerformanceCurve trades={displayTrades} />
          <div className="grid grid-cols-2 gap-5 min-h-0">
            <TopSetups trades={displayTrades} />
            <WinRateByDay trades={displayTrades} />
          </div>
        </div>
        <div className="min-h-0 h-full">
          <TradeCalendar
            trades={displayTrades}
            noTradeDays={noTradeDays}
            passedDates={passedDates}
            statsMonth={statsMonth}
            onStatsMonth={setStatsMonth}
          />
        </div>
      </div>
    </div>
  );
}
