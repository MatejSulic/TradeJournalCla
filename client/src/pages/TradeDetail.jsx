import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getTrade, deleteTrade } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import { lastListUrl, viewUrl } from '../lastView';

const PILL = 'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full';

const PNL_PILL = {
  win:       ['Win', 'bg-accent-soft text-accent'],
  loss:      ['Loss', 'bg-loss/10 text-loss'],
  breakeven: ['Breakeven', 'bg-neutral/15 text-slate-500 dark:bg-neutral/25 dark:text-slate-300'],
};

const RM_STYLE = {
  low:     'bg-loss/10 text-loss',
  perfect: 'bg-accent-soft text-accent',
  high:    'bg-loss/10 text-loss',
};

export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trade, setTrade] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef(null);
  const lightboxRef = useRef(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const el = lightboxRef.current;
    if (!el) return;
    const handler = e => {
      e.preventDefault();
      setZoom(z => Math.min(6, Math.max(1, z - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [lightbox]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setTrade(null);
    setLoadError('');
    getTrade(id)
      .then(t => { if (!cancelled) setTrade(t); })
      .catch(e => { if (!cancelled) setLoadError(e.message || 'Could not load this trade'); });
    return () => { cancelled = true; };
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    setConfirmDelete(false);
    await deleteTrade(id);
    navigate(trade.day_type === 'notrade' ? viewUrl('/dashboard') : lastListUrl());
  };

  if (loadError) {
    const notFound = /not found/i.test(loadError);
    return (
      <div className="p-6 flex justify-center">
        <div className="card max-w-md w-full text-center space-y-3 mt-16">
          <p className="text-base font-semibold text-slate-900 dark:text-white">{notFound ? 'Trade not found' : 'Could not load this trade'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{notFound ? `Trade #${id} does not exist — it may have been deleted.` : loadError}</p>
          <button type="button" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(lastListUrl()))} className="btn-secondary">Go back</button>
        </div>
      </div>
    );
  }
  if (!trade) return <div className="p-8 text-slate-500">Loading…</div>;

  const dailyBias = trade.screenshots.filter(s => s.type === 'daily_bias');
  const ltf = trade.screenshots.filter(s => s.type === 'ltf');
  const htf = trade.screenshots.filter(s => s.type === 'htf');
  const entryDay = trade.entry_time ? format(parseISO(trade.entry_time), 'EEEE') : '—';
  const isNoTrade = trade.day_type === 'notrade';

  return (
    <div className="p-6 mx-auto space-y-5" style={{ maxWidth: '96vw' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <button
            onClick={() => navigate(lastListUrl())}
            className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:hover:text-white hover:text-slate-900 text-sm transition-colors w-fit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          {isNoTrade ? (
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight dark:text-white text-slate-900">No-trade Day</h1>
            </div>
          ) : (
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight dark:text-white text-slate-900 mr-1">{trade.asset}</h1>
            <span className={`${PILL} ${trade.direction === 'long' ? 'bg-accent-soft text-accent' : 'bg-loss/10 text-loss'}`}>
              {trade.direction === 'long' ? '↑ Long' : '↓ Short'}
            </span>
            {PNL_PILL[trade.pnl] && (
              <span className={`${PILL} ${PNL_PILL[trade.pnl][1]}`}>
                {PNL_PILL[trade.pnl][0]}
                {trade.pnl === 'breakeven' && trade.be_outcome && (
                  <span className={`ml-1 ${trade.be_outcome === 'win' ? 'text-accent' : 'text-loss'}`}>
                    → would be {trade.be_outcome === 'win' ? 'Win' : 'Loss'}
                  </span>
                )}
              </span>
            )}
            {trade.session_type === 'backtest' && (
              <span className={`${PILL} bg-neutral/15 text-slate-500 dark:bg-neutral/25 dark:text-slate-300`}>Backtest</span>
            )}
          </div>
          )}
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{fmtDate(trade.entry_time)} · {entryDay}</span>
            {trade.series_name && (
              <>
                <span>·</span>
                <span className="font-medium text-accent">{trade.series_name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-7">
          <Link to={`/trades/${id}/edit`} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Edit
          </Link>
          <button onClick={() => setConfirmDelete(true)} disabled={deleting} className="btn-danger">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {/* Key metrics */}
      {!isNoTrade && (
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card sm:col-span-2 flex flex-wrap items-center content-center gap-x-12 gap-y-4">
          <Metric label="Risk : Reward" value={trade.risk_reward != null ? `${trade.risk_reward.toFixed(2)}R` : '—'} />
          {trade.pnl_dollars != null && (
            <Metric
              label="P&L"
              value={`${trade.pnl_dollars >= 0 ? '+' : '−'}$${Math.abs(trade.pnl_dollars).toFixed(2)}`}
              valueClass={trade.pnl_dollars >= 0 ? '!text-accent' : '!text-loss'}
            />
          )}
          {trade.risk_amount != null && (
            <Metric label="Risk" value={`$${trade.risk_amount.toFixed(2)}`} />
          )}
          {trade.risk_management && (
            <div className="flex flex-col gap-1.5">
              <span className={`${PILL} capitalize w-fit text-sm ${RM_STYLE[trade.risk_management] ?? ''}`}>
                {trade.risk_management}
              </span>
              <p className="stat-label">Risk management</p>
            </div>
          )}
        </div>
        <div className="card">
          <p className="card-title mb-3">Entry models</p>
          {trade.entry_models?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {trade.entry_models.map(m => (
                <span key={m.id} className="text-xs font-medium bg-surface-raised text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg">
                  {m.name}
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">—</p>}
        </div>
      </div>
      )}

      {/* Notes */}
      <div className="grid sm:grid-cols-2 gap-4">
        <NoteCard label="Premarket Analysis" text={trade.premarket_analysis} />
        <NoteCard label="Why I Entered" text={trade.why_entered} />
        <NoteCard label="Why I Didn't Trade" text={trade.no_trade_reason} />
        <NoteCard label="Faded Setups" text={trade.faded_setups} />
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
          ref={lightboxRef}
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center"
          style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
          onMouseDown={e => {
            if (zoom <= 1) return;
            panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            e.currentTarget.style.cursor = 'grabbing';
          }}
          onMouseMove={e => {
            if (!panStart.current) return;
            setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
          }}
          onMouseUp={e => {
            panStart.current = null;
            e.currentTarget.style.cursor = zoom > 1 ? 'grab' : 'zoom-in';
          }}
          onMouseLeave={() => { panStart.current = null; }}
          onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          onClick={e => {
            if (e.target === e.currentTarget) { setLightbox(null); setZoom(1); setPan({ x: 0, y: 0 }); }
          }}
        >
          {/* Close */}
          <button
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-surface-card text-slate-500 dark:text-slate-400 dark:hover:text-white hover:text-slate-900 flex items-center justify-center transition-colors text-base shadow-lg z-10"
            onClick={() => { setLightbox(null); setZoom(1); setPan({ x: 0, y: 0 }); }}
          >
            ✕
          </button>

          {/* Zoom controls */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface-card rounded-full px-2 py-1.5 shadow-lg z-10">
            <button
              className="w-8 h-8 rounded-full text-slate-500 dark:text-slate-400 hover:bg-surface-raised dark:hover:text-white hover:text-slate-900 transition-colors text-xl leading-none"
              onClick={e => { e.stopPropagation(); setZoom(z => Math.max(1, z - 0.5)); if (zoom - 0.5 <= 1) setPan({ x: 0, y: 0 }); }}
            >−</button>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              className="w-8 h-8 rounded-full text-slate-500 dark:text-slate-400 hover:bg-surface-raised dark:hover:text-white hover:text-slate-900 transition-colors text-xl leading-none"
              onClick={e => { e.stopPropagation(); setZoom(z => Math.min(6, z + 0.5)); }}
            >+</button>
            <div className="w-px h-4 bg-surface-border mx-1" />
            <button
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-surface-raised dark:hover:text-white hover:text-slate-900 rounded-full transition-colors px-3 py-1.5"
              onClick={e => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); }}
            >Reset</button>
          </div>

          <img
            src={lightbox}
            alt="screenshot"
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: panStart.current ? 'none' : 'transform 0.1s ease',
              borderRadius: '0.75rem',
            }}
            draggable={false}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete this ${isNoTrade ? 'no-trade day' : 'trade'} permanently? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function Metric({ label, value, valueClass = '' }) {
  return (
    <div className="flex flex-col gap-1">
      <p className={`stat-value ${valueClass}`}>{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

function NoteCard({ label, text }) {
  if (!text) return null;
  return (
    <div className="card">
      <p className="card-title mb-2.5">{label}</p>
      <p className="text-sm dark:text-slate-300 text-slate-600 whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );
}

function ScreenshotRow({ label, shots, onOpen }) {
  if (!shots.length) return null;
  return (
    <div className="card">
      <div className="flex items-baseline gap-2 mb-3">
        <p className="card-title">{label}</p>
        <span className="stat-label">{shots.length}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {shots.map(s => (
          <button
            key={s.id}
            onClick={() => onOpen(`/uploads/${s.filename}`)}
            className="block rounded-2xl overflow-hidden bg-surface-raised ring-1 ring-surface-border hover:ring-2 hover:ring-accent/50 transition"
          >
            <img
              src={`/uploads/${s.filename}`}
              alt={s.original_name}
              className="h-32 w-auto object-cover"
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
