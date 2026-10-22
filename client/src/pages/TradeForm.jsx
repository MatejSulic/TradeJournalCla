import { Fragment, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getTrade, getEntryModels, createEntryModel, deleteEntryModel, reorderEntryModels, createTrade, updateTrade, getSeries } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import { lastListUrl } from '../lastView';
import DatePicker from '../components/DatePicker';

const ASSETS = ['NQ', 'MNQ', 'ES', 'MES'];

const EMPTY = {
  day_type: 'trade', asset: '', session_type: 'live', series_id: '', direction: 'long', pnl: '', be_outcome: '',
  risk_reward: '', risk_amount: '', pnl_dollars: '', entry_time: '',
  premarket_analysis: '', why_entered: '', no_trade_reason: '', faded_setups: '',
  psychology: '', improvements: '', risk_management: '',
};

const TRADE_NOTES = [
  ['premarket_analysis', 'Premarket Analysis', 'Bias, key levels, news, plan for the session…'],
  ['why_entered', 'Why I Entered', 'Describe your entry reasoning…'],
  ['psychology', 'Psychology', 'How did you feel? Were you disciplined?'],
  ['improvements', 'Improvements', 'What could you have done better?'],
];

const NOTRADE_NOTES = [
  ['premarket_analysis', 'Premarket Analysis', 'Bias, key levels, news, plan for the session…'],
  ['no_trade_reason', "Why I Didn't Trade", 'No setup, news, not in shape, outside session…'],
  ['faded_setups', 'Faded Setups', 'What happened that you faded — and how it played out…'],
  ['psychology', 'Psychology', 'How did you feel sitting on your hands?'],
];

export default function TradeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [fields, setFields] = useState(EMPTY);
  const [selectedModelIds, setSelectedModelIds] = useState([]);
  const [models, setModels] = useState([]);
  const [newModelName, setNewModelName] = useState('');
  const [modelError, setModelError] = useState('');
  const [existingScreenshots, setExistingScreenshots] = useState([]);
  const [deleteIds, setDeleteIds] = useState([]);
  const [ltfFiles, setLtfFiles] = useState([]);
  const [htfFiles, setHtfFiles] = useState([]);
  const [dailyBiasFiles, setDailyBiasFiles] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [confirmRemoveModel, setConfirmRemoveModel] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [origDayType, setOrigDayType] = useState(null);
  const [confirmToNoTrade, setConfirmToNoTrade] = useState(false);
  const savingRef = useRef(false);

  const formRef = useRef();
  const ltfRef = useRef();
  const htfRef = useRef();
  const dailyBiasRef = useRef();

  useEffect(() => {
    getEntryModels().then(setModels);
    getSeries().then(setSeriesList);
    if (isEdit) {
      getTrade(id).then(t => {
        setOrigDayType(t.day_type ?? 'trade');
        setFields({
          day_type: t.day_type ?? 'trade',
          asset: t.asset ?? '',
          session_type: t.session_type ?? 'live',
          series_id: t.series_id ?? '',
          direction: t.direction ?? 'long',
          pnl: t.pnl ?? '',
          be_outcome: t.be_outcome ?? '',
          risk_reward: t.risk_reward ?? '',
          risk_amount: t.risk_amount ?? '',
          pnl_dollars: t.pnl_dollars ?? '',
          entry_time: t.entry_time ? t.entry_time.slice(0, 16) : '',
          premarket_analysis: t.premarket_analysis ?? '',
          why_entered: t.why_entered ?? '',
          no_trade_reason: t.no_trade_reason ?? '',
          faded_setups: t.faded_setups ?? '',
          psychology: t.psychology ?? '',
          improvements: t.improvements ?? '',
          risk_management: t.risk_management ?? '',
        });
        setSelectedModelIds((t.entry_models ?? []).map(m => m.id));
        setExistingScreenshots(t.screenshots ?? []);
      });
    }
  }, [id, isEdit]);

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));
  const isNoTrade = fields.day_type === 'notrade';

  // Auto-calculate risk_amount from pnl_dollars + risk_reward
  useEffect(() => {
    const dollars = parseFloat(fields.pnl_dollars);
    const rr = parseFloat(fields.risk_reward);
    if (!fields.pnl_dollars || isNaN(dollars)) { setFields(f => ({ ...f, risk_amount: '' })); return; }
    const absDollars = Math.abs(dollars);
    let risk = null;
    if (fields.pnl === 'win' && !isNaN(rr) && rr > 0) risk = absDollars / rr;
    else if (fields.pnl === 'loss') risk = absDollars;
    setFields(f => ({ ...f, risk_amount: risk !== null ? risk.toFixed(2) : '' }));
  }, [fields.pnl_dollars, fields.risk_reward, fields.pnl]);

  const toggleModel = (modelId) => {
    setSelectedModelIds(ids =>
      ids.includes(modelId) ? ids.filter(x => x !== modelId) : [...ids, modelId]
    );
  };

  const handleAddModel = async () => {
    const name = newModelName.trim();
    if (!name) return;
    setModelError('');
    try {
      const created = await createEntryModel(name);
      setModels(ms => [...ms, created]);
      setSelectedModelIds(ids => [...ids, created.id]);
      setNewModelName('');
    } catch (err) {
      setModelError(err.message);
    }
  };

  const handleRemoveModel = (modelId) => setConfirmRemoveModel(modelId);

  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setDropIndex(e.clientX > rect.left + rect.width / 2 ? index + 1 : index);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragId == null || dropIndex == null) return;
    const from = models.findIndex(m => m.id === dragId);
    if (from === -1) return;
    const next = [...models];
    const [item] = next.splice(from, 1);
    next.splice(dropIndex > from ? dropIndex - 1 : dropIndex, 0, item);
    setModels(next);
    setDragId(null);
    setDropIndex(null);
    reorderEntryModels(next.map((m, i) => ({ id: m.id, sort_order: i })));
  };

  const handleDragEnd = () => { setDragId(null); setDropIndex(null); };

  const doRemoveModel = async () => {
    const modelId = confirmRemoveModel;
    setConfirmRemoveModel(null);
    await deleteEntryModel(modelId);
    setModels(ms => ms.filter(m => m.id !== modelId));
    setSelectedModelIds(ids => ids.filter(x => x !== modelId));
  };

  const toggleDelete = (ssId) => {
    setDeleteIds(ids =>
      ids.includes(ssId) ? ids.filter(x => x !== ssId) : [...ids, ssId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fields.entry_time) { setError(isNoTrade ? 'Date is required' : 'Entry time is required'); return; }
    if (!isNoTrade && !fields.pnl) { setError('Result is required'); return; }
    if (!isNoTrade && !fields.asset) { setError('Asset is required'); return; }
    // Turning a logged trade into a no-trade day wipes its trade data — ask first
    if (isEdit && isNoTrade && origDayType === 'trade') { setConfirmToNoTrade(true); return; }
    save();
  };

  const save = async () => {
    if (savingRef.current) return; // Ctrl+Enter double press
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
      if (!isNoTrade) selectedModelIds.forEach(id => fd.append('entry_model_ids', id));
      deleteIds.forEach(id => fd.append('delete_screenshot_ids', id));
      if (!isNoTrade) ltfFiles.forEach(f => fd.append('ltf_screenshots', f));
      htfFiles.forEach(f => fd.append('htf_screenshots', f));
      dailyBiasFiles.forEach(f => fd.append('daily_bias_screenshots', f));

      const result = isEdit ? await updateTrade(id, fd) : await createTrade(fd);
      savingRef.current = false;
      setSaving(false);
      // Edit → back to the filtered list it was opened from; new → its detail (form replaced in history)
      navigate(isEdit ? lastListUrl() : `/trades/${result.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Ctrl/Cmd + Enter saves from anywhere in the form
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const summary = isNoTrade ? [] : [
    fields.asset,
    fields.direction === 'long' ? '↑ Long' : '↓ Short',
    fields.pnl && { win: 'Win', loss: 'Loss', breakeven: 'BE' }[fields.pnl],
    fields.pnl === 'breakeven' && fields.be_outcome && (fields.be_outcome === 'win' ? '→ Win' : '→ Loss'),
    fields.risk_reward && `${fields.risk_reward}R`,
  ].filter(Boolean);

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={isEdit ? `/trades/${id}` : lastListUrl()}
            className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:hover:text-white hover:text-slate-900 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <span className="w-px h-5 bg-surface-border" />
          <h1 className="text-2xl font-semibold tracking-tight dark:text-white text-slate-900 whitespace-nowrap">
            {isEdit ? 'Edit' : 'New'} {isNoTrade ? 'No-trade Day' : 'Trade'}
          </h1>
          <div className="seg !bg-surface-card ml-1">
            {[['trade', 'Trade'], ['notrade', 'No-trade day']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => set('day_type', v)}
                className={`seg-item ${fields.day_type === v ? 'seg-item-primary !text-white' : ''}`}
              >
                {l}
              </button>
            ))}
          </div>
          {/* Live summary of what's been filled */}
          <div className="hidden md:flex items-center gap-1.5 ml-2 min-w-0">
            {summary.map((chip, i) => (
              <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                chip === 'Win' || chip === '↑ Long' ? 'bg-accent-soft text-accent'
                  : chip === 'Loss' || chip === '↓ Short' ? 'bg-loss/10 text-loss'
                  : chip === 'BE' || chip.startsWith('→') ? 'bg-neutral/15 text-slate-500 dark:bg-neutral/25 dark:text-slate-300'
                  : 'bg-surface-card text-slate-600 dark:text-slate-300'
              }`}>{chip}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {error && <p className="text-loss text-sm font-medium bg-loss/10 px-3 py-1.5 rounded-xl mr-1">{error}</p>}
          <Link to={isEdit ? `/trades/${id}` : lastListUrl()} className="btn-ghost">Cancel</Link>
          <button type="button" disabled={saving} className="btn-primary" onClick={() => formRef.current?.requestSubmit()}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : isNoTrade ? 'Add Day' : 'Add Trade'}
            {!saving && <kbd className="text-[10px] font-semibold bg-white/20 rounded-md px-1.5 py-0.5 ml-1">Ctrl ↵</kbd>}
          </button>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex-1 min-h-0 grid gap-4"
        style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(0, 1.7fr) minmax(260px, 1fr)', gridTemplateRows: 'minmax(0, 1fr)' }}
      >
        {/* COLUMN 1 — Trade Info + Entry Models */}
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-0.5">

          {isNoTrade ? (
            <div className="card !p-5 space-y-4 flex-shrink-0">
              <h2 className="card-title">Day info</h2>
              <Field label="Date *">
                <DatePicker withTime value={fields.entry_time} onChange={v => set('entry_time', v)} placeholder="Select date" />
              </Field>
              <p className="text-xs text-slate-500 leading-relaxed">
                Shows up in the Dashboard calendar.
              </p>
            </div>
          ) : (<>
          {/* Trade Info */}
          <div className="card !p-5 space-y-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Trade info</h2>
              <div className="seg">
                {['live', 'backtest'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('session_type', t)}
                    className={`seg-item ${fields.session_type === t ? 'seg-item-primary !text-white' : ''}`}
                  >
                    {t === 'live' ? 'Live' : 'Backtest'}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Asset *">
              <Segmented
                value={fields.asset}
                onChange={v => set('asset', v)}
                options={ASSETS.map(a => [a, a])}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Direction">
                <Segmented
                  value={fields.direction}
                  onChange={v => set('direction', v)}
                  options={[['long', '↑ Long'], ['short', '↓ Short']]}
                  activeCls={v => v === 'long' ? 'bg-accent text-white' : 'bg-loss text-white'}
                />
              </Field>
              <Field label="Result *">
                <Segmented
                  value={fields.pnl}
                  onChange={v => setFields(f => ({ ...f, pnl: v, be_outcome: v === 'breakeven' ? f.be_outcome : '' }))}
                  options={[['win', 'Win'], ['loss', 'Loss'], ['breakeven', 'BE']]}
                  activeCls={v => v === 'win' ? 'bg-accent text-white'
                    : v === 'loss' ? 'bg-loss text-white'
                    : 'bg-neutral text-white'}
                />
              </Field>
            </div>

            {fields.pnl === 'breakeven' && (
              <Field label="BE resulted in">
                <Segmented
                  value={fields.be_outcome}
                  onChange={v => set('be_outcome', fields.be_outcome === v ? '' : v)}
                  options={[['win', '→ Would be Win'], ['loss', '→ Would be Loss']]}
                  activeCls={v => v === 'win' ? 'bg-accent-soft text-accent' : 'bg-loss/10 text-loss'}
                />
              </Field>
            )}

            <Field label="Entry Time *">
              <DatePicker withTime value={fields.entry_time} onChange={v => set('entry_time', v)} placeholder="Select date & time" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="R:R">
                <input type="number" step="0.01" min="0" className="input" placeholder="2.50"
                  value={fields.risk_reward} onChange={e => set('risk_reward', e.target.value)} />
              </Field>
              <Field label="PnL ($)">
                <input type="number" step="0.01" className="input" placeholder="150"
                  value={fields.pnl_dollars} onChange={e => set('pnl_dollars', e.target.value)} />
              </Field>
            </div>
            {fields.risk_amount !== '' && (
              <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                Risk: <span className="dark:text-white text-slate-900 font-semibold tabular-nums">${parseFloat(fields.risk_amount).toFixed(2)}</span>
              </p>
            )}

            <Field label="Risk Management">
              <Segmented
                value={fields.risk_management}
                onChange={v => set('risk_management', fields.risk_management === v ? '' : v)}
                options={[['low', 'Low'], ['perfect', 'Perfect'], ['high', 'High']]}
                activeCls={v => v === 'perfect' ? 'bg-accent text-white' : 'bg-loss text-white'}
              />
            </Field>

            <Field label="Series">
              <select className="input" value={fields.series_id} onChange={e => set('series_id', e.target.value)}>
                <option value="">— None —</option>
                {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          {/* Entry Models */}
          <div className="card !p-5 space-y-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Setup / Entry models</h2>
              {selectedModelIds.length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent">{selectedModelIds.length} selected</span>
              )}
            </div>
            {models.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5 items-center"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIndex(null); }}
              >
                {models.map((m, index) => {
                  const active = selectedModelIds.includes(m.id);
                  const isDragging = m.id === dragId;
                  return (
                    <Fragment key={m.id}>
                      {dropIndex === index && dragId && (
                        <div className="w-0.5 h-7 bg-accent rounded-full self-center" />
                      )}
                      <div
                        draggable
                        onDragStart={e => handleDragStart(e, m.id)}
                        onDragOver={e => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`relative group cursor-grab active:cursor-grabbing transition-opacity duration-100 ${isDragging ? 'opacity-30' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleModel(m.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                            active
                              ? 'bg-accent text-white'
                              : 'bg-surface-raised text-slate-600 dark:text-slate-300 hover:bg-accent-soft hover:text-accent dark:hover:text-white'
                          }`}
                        >
                          {m.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveModel(m.id)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface-card text-slate-500 shadow ring-1 ring-surface-border hover:bg-loss hover:text-white hover:ring-loss text-[9px] items-center justify-center hidden group-hover:flex"
                          title="Delete setup"
                        >
                          ✕
                        </button>
                      </div>
                    </Fragment>
                  );
                })}
                {dropIndex === models.length && dragId && (
                  <div className="w-0.5 h-7 bg-accent rounded-full self-center" />
                )}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                placeholder="New setup (e.g. FVG, OB, BOS)…"
                value={newModelName}
                onChange={e => setNewModelName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddModel(); } }}
                maxLength={80}
              />
              <button type="button" onClick={handleAddModel} className="btn-ghost bg-surface-raised text-sm whitespace-nowrap">+ Add</button>
            </div>
            {modelError && <p className="text-loss text-xs">{modelError}</p>}
          </div>
          </>)}
        </div>

        {/* COLUMN 2 — Notes, 2×2: before & during the trade on top, reflection below */}
        <div className="card !p-5 flex flex-col gap-3 min-h-0">
          <h2 className="card-title flex-shrink-0">Notes</h2>
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-4" style={{ gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
            {(isNoTrade ? NOTRADE_NOTES : TRADE_NOTES).map(([key, label, placeholder]) => (
              <Field key={key} label={label} className="flex flex-col min-h-0">
                <textarea
                  className="input resize-none flex-1 min-h-0 leading-relaxed"
                  value={fields[key]}
                  onChange={e => set(key, e.target.value)}
                  placeholder={placeholder}
                />
              </Field>
            ))}
          </div>
        </div>

        {/* COLUMN 3 — Screenshots */}
        <div className="card !p-5 flex flex-col gap-4 min-h-0 overflow-y-auto">
          <h2 className="card-title flex-shrink-0">Screenshots</h2>

          {existingScreenshots.length > 0 && (
            <div className="space-y-4">
              {(isNoTrade ? ['daily_bias', 'htf'] : ['daily_bias', 'ltf', 'htf']).map(type => {
                const shots = existingScreenshots.filter(s => s.type === type);
                if (!shots.length) return null;
                const label = type === 'daily_bias' ? 'Daily Bias' : type.toUpperCase();
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="label mb-0">{label}</p>
                      <span className="text-xs text-slate-400">{shots.length} saved</span>
                    </div>
                    <div className="overflow-x-auto snap-x snap-mandatory pb-1" style={{ scrollbarWidth: 'thin' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${shots.length}, 100%)`, gap: '8px' }}>
                        {shots.map(s => {
                          const marked = deleteIds.includes(s.id);
                          return (
                            <div key={s.id} className="relative group snap-start">
                              <img
                                src={`/uploads/${s.filename}`}
                                alt={s.original_name}
                                className={`w-full h-auto rounded-xl object-cover transition duration-150 ${
                                  marked ? 'opacity-30 ring-2 ring-loss' : 'ring-1 ring-surface-border'
                                }`}
                              />
                              <div className="absolute inset-0 rounded-xl bg-slate-950/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleDelete(s.id)}
                                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                    marked ? 'bg-surface-card text-slate-700 dark:text-slate-200' : 'bg-loss text-white'
                                  }`}
                                >
                                  {marked ? 'Undo' : 'Remove'}
                                </button>
                                <p className="text-[10px] text-white/80 truncate max-w-full px-2 text-center">{s.original_name}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <UploadZone label="Daily Bias" files={dailyBiasFiles} inputRef={dailyBiasRef} onChange={setDailyBiasFiles} />
          {!isNoTrade && <UploadZone label="LTF" files={ltfFiles} inputRef={ltfRef} onChange={setLtfFiles} />}
          <UploadZone label="HTF" files={htfFiles} inputRef={htfRef} onChange={setHtfFiles} />
        </div>
      </form>

      {confirmToNoTrade && (
        <ConfirmDialog
          message="Turn this trade into a no-trade day?"
          subtext="Asset, direction, result, R:R, $ P&L, entry models, 'Why I entered', 'Improvements' and LTF screenshots will be permanently removed."
          confirmLabel="Convert"
          onConfirm={() => { setConfirmToNoTrade(false); save(); }}
          onCancel={() => setConfirmToNoTrade(false)}
        />
      )}
      {confirmRemoveModel && (
        <ConfirmDialog
          message="Remove this setup? It will be deleted for all trades."
          confirmLabel="Remove"
          onConfirm={doRemoveModel}
          onCancel={() => setConfirmRemoveModel(null)}
        />
      )}
    </div>
  );
}

// Row of toggle buttons — faster than a <select> for a handful of options
function Segmented({ value, onChange, options, activeCls }) {
  return (
    <div className="flex gap-1.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
            value === v
              ? (activeCls ? activeCls(v) : 'bg-accent text-white')
              : 'bg-surface-raised text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-surface-border/70'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function UploadZone({ label, files, inputRef, onChange }) {
  const handleFiles = (e) => {
    const arr = Array.from(e.target.files || []);
    onChange(prev => [...prev, ...arr]);
  };

  const remove = (idx) => onChange(prev => prev.filter((_, i) => i !== idx));

  const zoneRef = useRef();
  const hoveredRef = useRef(false);

  // Paste is active while hovering the zone (or when it has keyboard focus) — no click needed
  useEffect(() => {
    const handlePaste = (e) => {
      const focused = zoneRef.current?.contains(document.activeElement);
      if (!hoveredRef.current && !focused) return;
      const items = Array.from(e.clipboardData?.items || []);
      const images = items
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean);
      if (images.length > 0) {
        e.preventDefault();
        onChange(prev => [...prev, ...images]);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onChange]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="label mb-0">{label}</p>
        {files.length > 0 && (
          <span className="text-xs font-medium text-accent">{files.length} image{files.length > 1 ? 's' : ''}</span>
        )}
      </div>
      <div
        className="group/zone border-2 border-dashed border-surface-border bg-surface-raised/40 rounded-2xl min-h-[88px] flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-accent/50 hover:bg-accent-soft/50 focus:outline-none focus:border-accent/60 focus:bg-accent-soft/50 transition-all duration-150"
        ref={zoneRef}
        tabIndex={0}
        onMouseEnter={() => { hoveredRef.current = true; }}
        onMouseLeave={() => { hoveredRef.current = false; }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={e => e.preventDefault()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
          if (dropped.length) onChange(prev => [...prev, ...dropped]);
        }}
      >
        <svg className="w-6 h-6 text-slate-400 group-hover/zone:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 group-hover/zone:text-accent transition-colors">Click, drag, or Ctrl+V</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>

      {files.length > 0 && (
        <div className="mt-2 overflow-x-auto snap-x snap-mandatory pb-1" style={{ scrollbarWidth: 'thin' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${files.length}, 100%)`, gap: '8px' }}>
            {files.map((f, i) => (
              <div key={i} className="relative group snap-start">
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="w-full h-auto rounded-xl ring-1 ring-surface-border object-cover"
                />
                <div className="absolute inset-0 rounded-xl bg-slate-950/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="px-3 py-1 rounded-lg bg-loss text-white text-xs font-semibold"
                  >
                    Remove
                  </button>
                  <p className="text-[10px] text-white/80 truncate max-w-full px-2 text-center">{f.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
