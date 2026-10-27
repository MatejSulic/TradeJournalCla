import { ruleLabel } from '../strategyRules';

// Rules of a strategy as checklist rows; option pills toggle the trade's entry models.
export default function StrategyChecklist({ strategy, selectedIds, onToggle }) {
  const have = new Set((selectedIds || []).map(Number));
  return (
    <ul className="space-y-2.5">
      {(strategy?.rules || []).map(rule => {
        const met = (rule.options || []).some(o => have.has(Number(o.id)));
        return (
          <li key={rule.id} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {met ? (
                <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-loss shrink-0" />
              )}
              <span className={met ? 'text-slate-700 dark:text-slate-200' : 'text-loss'}>{ruleLabel(rule)}</span>
              {(rule.options || []).length >= 2 && (
                <span className="text-slate-400 dark:text-slate-500 font-normal">pick at least one</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 pl-5">
              {(rule.options || []).map(o => {
                const active = have.has(Number(o.id));
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onToggle(o.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                      active
                        ? 'bg-accent text-white'
                        : 'bg-surface-raised text-slate-600 dark:text-slate-300 hover:bg-accent-soft hover:text-accent dark:hover:text-white'
                    }`}
                  >
                    {o.name}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
