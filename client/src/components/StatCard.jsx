export default function StatCard({ label, value, sub, valueClass = 'text-white' }) {
  return (
    <div className="card flex flex-col gap-1.5 py-4">
      <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums leading-none ${valueClass}`}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}
