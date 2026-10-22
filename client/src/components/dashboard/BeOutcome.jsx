import { useMemo } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

const TICKS = 36;
const CX = 100, CY = 96, R_IN = 66, R_OUT = 90;

// Semicircle tick gauge: share of breakeven trades that would have been a win
export default function BeOutcome({ trades }) {
  const colors = useThemeColors();

  const s = useMemo(() => {
    const be = trades.filter(t => t.pnl === 'breakeven');
    const wins = be.filter(t => t.be_outcome === 'win').length;
    const losses = be.filter(t => t.be_outcome === 'loss').length;
    return { total: be.length, wins, losses, untagged: be.length - wins - losses };
  }, [trades]);

  const decided = s.wins + s.losses;
  const pct = decided ? s.wins / decided : null;
  const winTicks = pct == null ? 0 : Math.round(pct * TICKS);

  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const a = Math.PI - ((i + 0.5) / TICKS) * Math.PI;
    const cos = Math.cos(a), sin = Math.sin(a);
    const stroke = pct == null ? colors.breakeven : i < winTicks ? colors.colorMain : colors.colorNeg;
    return (
      <line
        key={i}
        x1={CX + R_IN * cos} y1={CY - R_IN * sin}
        x2={CX + R_OUT * cos} y2={CY - R_OUT * sin}
        stroke={stroke}
        strokeOpacity={pct == null ? 0.35 : 1}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
    );
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 mt-2">
      <svg viewBox="0 0 200 104" className="w-full flex-1 min-h-0" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={pct == null ? 'No breakeven outcomes' : `${Math.round(pct * 100)}% of breakevens would be wins`}>
        {ticks}
        <text x={CX} y={CY - 14} textAnchor="middle" fontSize="28" fontWeight="600" className="fill-slate-900 dark:fill-white">
          {pct == null ? '—' : `${Math.round(pct * 100)}%`}
        </text>
        <text x={CX} y={CY + 2} textAnchor="middle" fontSize="9" fill={colors.tick}>would be win</text>
      </svg>
      <div className="flex gap-3 text-xs tabular-nums font-medium flex-shrink-0">
        <span className="text-accent">{s.wins} →W</span>
        <span className="text-loss">{s.losses} →L</span>
        {s.untagged > 0 && <span className="text-slate-400 dark:text-slate-500">{s.untagged} untagged</span>}
      </div>
    </div>
  );
}
