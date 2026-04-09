export default function StatCard({ label, value, sub, valueClass = 'text-slate-100' }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}
