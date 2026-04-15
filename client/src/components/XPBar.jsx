import { TIER_STYLES } from '../hooks/useGamification';

// compact=true  → bar only, no labels (sidebar)
// compact=false → bar + XP numbers + "X XP to next level" (profile)
export default function XPBar({ xp, level, compact = false }) {
  if (!level) return null;

  const s = TIER_STYLES[level.tier] ?? TIER_STYLES.bronze;
  const pct = Math.min(100, Math.round((level.progress ?? 0) * 100));
  const xpToNext = level.nextLevelXP != null ? level.nextLevelXP - xp : null;

  if (compact) {
    return (
      <div className="w-full">
        <div className={`h-1 w-full rounded-full bg-surface-raised overflow-hidden`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ${s.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{xp.toLocaleString()} XP</span>
        {level.nextLevelXP != null
          ? <span>{level.nextLevelXP.toLocaleString()} XP</span>
          : <span className={s.text}>MAX LEVEL</span>
        }
      </div>
      <div className="h-2 w-full rounded-full bg-surface-raised overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${s.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {xpToNext != null && (
        <p className="text-xs text-slate-500 text-right">
          {xpToNext.toLocaleString()} XP to Level {level.level + 1}
        </p>
      )}
    </div>
  );
}
