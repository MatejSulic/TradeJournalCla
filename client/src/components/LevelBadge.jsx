import { TIER_STYLES } from '../hooks/useGamification';

// size="sm"  → inline chip (sidebar, dashboard header)
// size="lg"  → hero card (profile page)
export default function LevelBadge({ level, tier, name, size = 'sm' }) {
  const s = TIER_STYLES[tier] ?? TIER_STYLES.bronze;

  if (size === 'lg') {
    return (
      <div className={`inline-flex flex-col items-center gap-1 px-8 py-5 rounded-2xl border ${s.bg} ${s.border}`}>
        <span className={`text-6xl font-black tabular-nums ${s.text}`}>{level}</span>
        <span className={`text-xs font-bold uppercase tracking-widest opacity-60 ${s.text}`}>{s.label}</span>
        <span className={`text-sm font-semibold mt-1 text-center max-w-[180px] leading-snug ${s.text}`}>{name}</span>
      </div>
    );
  }

  // sm — compact inline chip
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      <span>Lv {level}</span>
      <span className="opacity-40">·</span>
      <span>{s.label}</span>
    </span>
  );
}
