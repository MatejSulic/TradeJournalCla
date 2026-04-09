import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getTrade, deleteTrade } from '../api';

const PNL_STYLE = {
  win:       'bg-profit/10 text-profit border border-profit/30',
  loss:      'bg-loss/10 text-loss border border-loss/30',
  breakeven: 'bg-slate-700/40 text-slate-300 border border-slate-600',
};

const RM_STYLE = {
  perfect: 'bg-profit/10 text-profit border border-profit/30',
  good:    'bg-accent/10 text-accent border border-accent/30',
  poor:    'bg-loss/10 text-loss border border-loss/30',
};

export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trade, setTrade] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getTrade(id).then(setTrade);
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Delete this trade? This cannot be undone.')) return;
    setDeleting(true);
    await deleteTrade(id);
    navigate('/trades');
  };

  if (!trade) return <div className="p-6 text-slate-500">Loading…</div>;

  const dailyBias = trade.screenshots.filter(s => s.type === 'daily_bias');
  const ltf = trade.screenshots.filter(s => s.type === 'ltf');
  const htf = trade.screenshots.filter(s => s.type === 'htf');
  const entryDay = trade.entry_time ? format(parseISO(trade.entry_time), 'EEEE') : '—';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-slate-100">{trade.asset}</h1>
            <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${trade.direction === 'long' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
              {trade.direction}
            </span>
            <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded ${PNL_STYLE[trade.pnl] ?? ''}`}>
              {trade.pnl}
            </span>
          </div>
          <p className="text-sm text-slate-500">{fmtDate(trade.entry_time)} · {entryDay}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/trades/${id}/edit`} className="btn-ghost text-sm">Edit</Link>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger text-sm">
            Delete
          </button>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Metric label="R:R" value={trade.risk_reward != null ? `${trade.risk_reward.toFixed(2)}R` : '—'} />
        <Metric label="Risk Amount" value={trade.risk_amount != null ? `$${trade.risk_amount.toFixed(2)}` : '—'} />
        <div className="card">
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Risk Mgmt</p>
          {trade.risk_management ? (
            <span className={`text-sm font-semibold capitalize px-2 py-0.5 rounded ${RM_STYLE[trade.risk_management] ?? ''}`}>
              {trade.risk_management}
            </span>
          ) : <p className="text-lg font-semibold text-slate-100">—</p>}
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Entry Models</p>
          {trade.entry_models?.length ? (
            <div className="flex flex-wrap gap-1">
              {trade.entry_models.map(m => (
                <span key={m.id} className="text-xs bg-accent/10 text-accent border border-accent/30 px-2 py-0.5 rounded-full">
                  {m.name}
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">—</p>}
        </div>
      </div>

      {/* Notes */}
      <div className="grid sm:grid-cols-2 gap-4">
        <NoteCard label="Why I Entered" text={trade.why_entered} />
        <NoteCard label="Psychology" text={trade.psychology} />
        <NoteCard label="Improvements" text={trade.improvements} />
      </div>

      {/* Screenshots */}
      <div className="space-y-4">
        <ScreenshotRow label="Daily Bias" shots={dailyBias} onOpen={setLightbox} />
        <ScreenshotRow label="LTF Screenshots" shots={ltf} onOpen={setLightbox} />
        <ScreenshotRow label="HTF Screenshots" shots={htf} onOpen={setLightbox} />
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-slate-400 hover:text-white text-2xl">✕</button>
          <img
            src={lightbox}
            alt="screenshot"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, valueClass = 'text-slate-100' }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function NoteCard({ label, text }) {
  if (!text) return null;
  return (
    <div className="card">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );
}

function ScreenshotRow({ label, shots, onOpen }) {
  if (!shots.length) return null;
  return (
    <div className="card">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">{label}</p>
      <div className="flex flex-wrap gap-3">
        {shots.map(s => (
          <button
            key={s.id}
            onClick={() => onOpen(`/uploads/${s.filename}`)}
            className="block rounded-lg overflow-hidden border border-surface-border hover:border-accent/50 transition-colors"
          >
            <img
              src={`/uploads/${s.filename}`}
              alt={s.original_name}
              className="h-28 w-auto object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function fmtDate(str) {
  try { return format(parseISO(str), 'MMMM d, yyyy — HH:mm'); } catch { return str; }
}
