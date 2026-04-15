import { useEffect, useState } from 'react';
import { TIER_STYLES } from '../hooks/useGamification';

function streakLabel(days) {
  if (days >= 30) return `🔥 ${days} day streak · 3× XP`;
  if (days >= 14) return `🔥 ${days} day streak · 2× XP`;
  if (days >= 7)  return `🔥 ${days} day streak · 1.5× XP`;
  if (days >= 3)  return `🔥 ${days} day streak · 1.25× XP`;
  return null;
}

export default function XPToast({ data, onDismiss }) {
  const [visible, setVisible] = useState(false);

  // Trigger slide-in on next frame
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss after 4 s
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const xpAmount = data.xpAwarded ?? data.xpDelta ?? 0;
  const s = TIER_STYLES[data.level?.tier] ?? TIER_STYLES.bronze;
  const streak = data.streakDays ? streakLabel(data.streakDays) : null;
  const achievements = data.unlockedAchievements ?? [];

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-72 rounded-xl border bg-surface-card shadow-2xl transition-all duration-300 ${s.border} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {/* Tier-colored top accent strip */}
      <div className={`h-1 w-full rounded-t-xl ${s.bar}`} />

      <div className="p-4 space-y-3">
        {/* XP amount */}
        <div className="flex items-baseline justify-between">
          <span className={`text-3xl font-black tabular-nums ${s.text}`}>
            +{xpAmount} XP
          </span>
          <button
            onClick={onDismiss}
            className="text-slate-600 hover:text-slate-400 text-lg leading-none ml-2"
          >
            ×
          </button>
        </div>

        {/* Streak indicator */}
        {streak && (
          <p className="text-xs text-slate-400">{streak}</p>
        )}

        {/* Achievement unlocks */}
        {achievements.length > 0 && (
          <div className="space-y-1.5 border-t border-surface-border pt-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Achievement Unlocked
            </p>
            {achievements.map(a => (
              <div key={a.key} className="flex items-center gap-2">
                <span className="text-lg">{a.icon}</span>
                <span className="text-sm text-slate-200 font-medium flex-1">{a.name}</span>
                <span className="text-xs text-yellow-400 font-semibold">+{a.xpReward}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
