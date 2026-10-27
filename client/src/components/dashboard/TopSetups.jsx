import { useMemo, useState } from 'react';
import BeOutcome from './BeOutcome';
import { computeStats } from './StatCards';

const TABS = { be: 'BE Outcome', setups: 'Top Setups', strategies: 'Strategies' };
const readTab = () => { try { const t = localStorage.getItem('setupsTab'); return t in TABS ? t : 'be'; } catch { return 'be'; } };
const fmtR = v => (v == null ? '—' : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}R`);

// Entry models ranked by win rate (wins / decided), with a progress bar per setup; second tab = BE outcome gauge
export default function TopSetups({ trades }) {
  const [tab, setTab] = useState(readTab);
  const changeTab = t => {
    setTab(t);
    try { localStorage.setItem('setupsTab', t); } catch { /* storage unavailable */ }
  };
  const setups = useMemo(() => {
    const by = {};
    trades.forEach(t => {
      (t.entry_models ?? []).forEach(m => {
        const s = (by[m.id] ??= { id: m.id, name: m.name, wins: 0, losses: 0, total: 0 });
        s.total += 1;
        if (t.pnl === 'win') s.wins += 1;
        if (t.pnl === 'loss') s.losses += 1;
      });
    });
    return Object.values(by)
      .map(s => ({ ...s, winRate: s.wins + s.losses ? Math.round((s.wins / (s.wins + s.losses)) * 100) : null }))
      .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.total - a.total);
  }, [trades]);

  // Trades grouped by strategy (most trades first), trades without one last
  const strategies = useMemo(() => {
    const by = {};
    trades.forEach(t => {
      const key = t.strategy?.id ?? 'none';
      (by[key] ??= { id: key, name: t.strategy?.name ?? 'No strategy', trades: [] }).trades.push(t);
    });
    return Object.values(by)
      .map(g => {
        const st = computeStats(g.trades);
        return { id: g.id, name: g.name, total: g.trades.length, netR: st.netR, winRate: st.winRate == null ? null : Math.round(st.winRate) };
      })
      .sort((a, b) => (a.id === 'none') - (b.id === 'none') || b.total - a.total);
  }, [trades]);

  const rows = tab === 'strategies' ? strategies : setups;

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-2 flex-shrink-0">
        <div className="seg !p-0.5">
          {Object.entries(TABS).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => changeTab(k)}
              className={`seg-item !px-2.5 !py-1 whitespace-nowrap ${tab === k ? 'seg-item-active' : ''}`}
            >
              {l}
            </button>
          ))}
        </div>
        {tab !== 'be' && rows.length > 0 && (
          <span className="stat-label truncate">{tab === 'strategies' ? 'win rate · net R · trades' : 'win rate · trades'}</span>
        )}
      </div>
      {tab === 'be' ? (
        <BeOutcome trades={trades} />
      ) : rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">—</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1 space-y-3">
          {rows.map(s => {
            const muted = s.id === 'none';
            return (
            <div key={s.id}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className={`font-medium truncate ${muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>{s.name}</span>
                <span className="flex-shrink-0 tabular-nums">
                  <span className={`font-semibold ${s.winRate == null ? 'text-slate-400' : s.winRate >= 50 ? 'text-accent' : 'text-loss'}`}>
                    {s.winRate == null ? '—' : `${s.winRate}%`}
                  </span>
                  {tab === 'strategies' && <span className="text-slate-500 dark:text-slate-400 ml-1.5">{fmtR(s.netR)}</span>}
                  <span className="text-slate-400 dark:text-slate-500 ml-1.5">{s.total}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-raised overflow-hidden">
                <div
                  className={`h-full rounded-full ${muted ? 'bg-neutral' : s.winRate != null && s.winRate < 50 ? 'bg-loss' : 'bg-accent'}`}
                  style={{ width: `${s.winRate ?? 0}%` }}
                />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
