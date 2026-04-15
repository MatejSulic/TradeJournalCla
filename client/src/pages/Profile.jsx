import { format, parseISO } from 'date-fns';
import { useGamification, TIER_STYLES } from '../hooks/useGamification';
import LevelBadge from '../components/LevelBadge';
import XPBar from '../components/XPBar';
import StatCard from '../components/StatCard';

export default function Profile() {
  const { profile, loading } = useGamification();

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        Loading…
      </div>
    );
  }

  const { xp, level, streakDays, achievements } = profile;
  const s = TIER_STYLES[level.tier] ?? TIER_STYLES.bronze;
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-white">Profile</h1>
        <p className="text-sm text-slate-500 mt-0.5">Your progress and achievements</p>
      </div>

      {/* Hero — level badge + XP bar */}
      <div className="card flex flex-col items-center gap-6 py-8">
        <LevelBadge level={level.level} tier={level.tier} name={level.name} size="lg" />
        <div className="w-full max-w-md space-y-3">
          <XPBar xp={xp} level={level} />
        </div>
        {streakDays > 0 && (
          <p className="text-sm text-slate-400">
            🔥 <span className="font-semibold text-white">{streakDays}</span> day streak
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total XP" value={xp.toLocaleString()} valueClass={s.text} />
        <StatCard label="Level"    value={level.level} />
        <StatCard label="Streak"   value={streakDays > 0 ? `${streakDays}d 🔥` : '—'} />
        <StatCard
          label="Achievements"
          value={`${unlockedCount} / ${achievements.length}`}
          valueClass={unlockedCount === achievements.length ? 'text-yellow-400' : ''}
        />
      </div>

      {/* Achievements grid */}
      <div>
        <h2 className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-3">
          Achievements
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {achievements.map(a => (
            <AchievementCard key={a.key} achievement={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AchievementCard({ achievement: a }) {
  return (
    <div
      className={`card flex flex-col gap-2 transition-all duration-150 ${
        a.unlocked ? '' : 'opacity-30'
      }`}
    >
      <span className="text-3xl">{a.icon}</span>
      <div>
        <p className="text-sm font-semibold text-white leading-snug">{a.name}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{a.description}</p>
      </div>
      <div className="mt-auto pt-2 border-t border-surface-border flex items-center justify-between">
        <span className="text-xs text-yellow-400 font-semibold">+{a.xp_reward} XP</span>
        {a.unlocked && a.unlockedAt
          ? <span className="text-[10px] text-slate-500">{fmtDate(a.unlockedAt)}</span>
          : <span className="text-[10px] text-slate-600">Locked</span>
        }
      </div>
    </div>
  );
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMM d, yyyy'); } catch { return ''; }
}
