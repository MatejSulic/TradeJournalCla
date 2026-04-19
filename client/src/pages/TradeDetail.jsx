import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getTrade, deleteTrade } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const PNL_STYLE = {
  win:       'bg-profit/10 text-profit border border-profit/20',
  loss:      'bg-loss/10 text-loss border border-loss/20',
  breakeven: 'bg-white/5 text-slate-400 border border-white/10',
};

const RM_STYLE = {
  low:     'bg-loss/10 text-loss border border-loss/20',
  perfect: 'bg-profit/10 text-profit border border-profit/20',
  high:    'bg-accent/10 text-black border border-accent/30',
};

export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trade, setTrade] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    getTrade(id).then(setTrade);
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    setConfirmDelete(false);
    await deleteTrade(id);
    navigate('/trades');
  };

  if (!trade) return <div className="p-8 text-slate-600">Loading…</div>;

  const dailyBias = trade.screenshots.filter(s => s.type === 'daily_bias');
  const ltf = trade.screenshots.filter(s => s.type === 'ltf');
  const htf = trade.screenshots.filter(s => s.type === 'htf');
  const entryDay = trade.entry_time ? format(parseISO(trade.entry_time), 'EEEE') : '—';

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Link
            to="/trades"
            className="flex items-center gap-1.5 text-slate-500 hover:text-white text-sm transition-colors w-fit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Trades
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{trade.asset}</h1>
            {trade.session_type === 'backtest' && (
              <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-lg border bg-accent/10 text-accent border-accent/20">
                Backtest
              </span>
            )}
            <span className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-lg border ${trade.direction === 'long' ? 'bg-profit/10 text-profit border-profit/20' : 'bg-loss/10 text-loss border-loss/20'}`}>
              {trade.direction}
            </span>
            <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-lg ${PNL_STYLE[trade.pnl] ?? ''}`}>
              {trade.pnl}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{fmtDate(trade.entry_time)} · {entryDay}</span>
            {trade.series_name && (
              <span className="text-accent">· {trade.series_name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/trades/${id}/edit`} className="btn-ghost text-sm">Edit</Link>
          <button onClick={() => setConfirmDelete(true)} disabled={deleting} className="btn-danger text-sm">
            Delete
          </button>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card flex items-start gap-6">
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-widest">R:R</p>
            <p className="text-xl font-semibold text-white tabular-nums">
              {trade.risk_reward != null ? `${trade.risk_reward.toFixed(2)}R` : '—'}
            </p>
          </div>
          {trade.risk_amount != null && (
            <div>
              <p className="text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-widest">Risk $</p>
              <p className="text-xl font-semibold text-white tabular-nums">${trade.risk_amount.toFixed(2)}</p>
            </div>
          )}
          {trade.risk_management && (
            <div>
              <p className="text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-widest">Risk Mgmt</p>
              <span className={`text-xs font-semibold capitalize px-2.5 py-1 rounded-lg ${RM_STYLE[trade.risk_management] ?? ''}`}>
                {trade.risk_management}
              </span>
            </div>
          )}
        </div>
        <div className="card sm:col-span-2">
          <p className="text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-widest">Entry Models</p>
          {trade.entry_models?.length ? (
            <div className="flex flex-wrap gap-1">
              {trade.entry_models.map(m => (
                <span key={m.id} className="text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-lg">
                  {m.name}
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">—</p>}
        </div>
      </div>

      {/* Notes */}
      <div className="grid sm:grid-cols-2 gap-3">
        <NoteCard label="Why I Entered" text={trade.why_entered} />
        <NoteCard label="Psychology" text={trade.psychology} />
        <NoteCard label="Improvements" text={trade.improvements} />
      </div>

      {/* Screenshots */}
      <div className="space-y-3">
        <ScreenshotRow label="Daily Bias" shots={dailyBias} onOpen={setLightbox} />
        <ScreenshotRow label="LTF Screenshots" shots={ltf} onOpen={setLightbox} />
        <ScreenshotRow label="HTF Screenshots" shots={htf} onOpen={setLightbox} />
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-5 right-5 w-9 h-9 rounded-xl bg-surface-raised border border-surface-border text-slate-400 hover:text-white flex items-center justify-center transition-colors text-lg">
            ✕
          </button>
          <img
            src={lightbox}
            alt="screenshot"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this trade permanently? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function Metric({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="card">
      <p className="text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-widest">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function NoteCard({ label, text }) {
  if (!text) return null;
  return (
    <div className="card">
      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-2.5">{label}</p>
      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );
}

function ScreenshotRow({ label, shots, onOpen }) {
  if (!shots.length) return null;
  return (
    <div className="card">
      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-3">{label}</p>
      <div className="flex flex-wrap gap-3">
        {shots.map(s => (
          <button
            key={s.id}
            onClick={() => onOpen(`/uploads/${s.filename}`)}
            className="block rounded-xl overflow-hidden border border-surface-border hover:border-accent/40 transition-colors"
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
