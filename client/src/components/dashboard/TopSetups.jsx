import { useMemo } from 'react';

// Entry models ranked by win rate (wins / decided), with a progress bar per setup
export default function TopSetups({ trades }) {
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

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <div className="flex items-baseline justify-between flex-shrink-0">
        <h2 className="card-title">Top Setups</h2>
        {setups.length > 0 && <span className="stat-label">win rate · trades</span>}
      </div>
      {setups.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">—</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1 space-y-3">
          {setups.map(s => (
            <div key={s.id}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                <span className="flex-shrink-0 tabular-nums">
                  <span className={`font-semibold ${s.winRate == null ? 'text-slate-400' : s.winRate >= 50 ? 'text-accent' : 'text-loss'}`}>
                    {s.winRate == null ? '—' : `${s.winRate}%`}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 ml-1.5">{s.total}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-raised overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.winRate != null && s.winRate < 50 ? 'bg-loss' : 'bg-accent'}`}
                  style={{ width: `${s.winRate ?? 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
