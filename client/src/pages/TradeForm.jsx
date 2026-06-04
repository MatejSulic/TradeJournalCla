import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getTrade, getEntryModels, createEntryModel, deleteEntryModel, reorderEntryModels, createTrade, updateTrade, getSeries } from '../api';
import XPToast from '../components/XPToast';
import ConfirmDialog from '../components/ConfirmDialog';
import DatePicker from '../components/DatePicker';

const ASSETS = ['NQ', 'MNQ', 'ES', 'MES'];

const EMPTY = {
  asset: '', session_type: 'live', series_id: '', direction: 'long', pnl: '',
  risk_reward: '', risk_amount: '', pnl_dollars: '', entry_time: '',
  why_entered: '', psychology: '', improvements: '', risk_management: '',
};

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
  const [toast, setToast] = useState(null);
  const [pendingNav, setPendingNav] = useState(null);

  const formRef = useRef();
  const ltfRef = useRef();
  const htfRef = useRef();
  const dailyBiasRef = useRef();

  useEffect(() => {
    getEntryModels().then(setModels);
    getSeries().then(setSeriesList);
    if (isEdit) {
      getTrade(id).then(t => {
        setFields({
          asset: t.asset ?? '',
          session_type: t.session_type ?? 'live',
          series_id: t.series_id ?? '',
          direction: t.direction ?? 'long',
          pnl: t.pnl ?? '',
          risk_reward: t.risk_reward ?? '',
          risk_amount: t.risk_amount ?? '',
          pnl_dollars: t.pnl_dollars ?? '',
          entry_time: t.entry_time ? t.entry_time.slice(0, 16) : '',
          why_entered: t.why_entered ?? '',
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
    if (!fields.entry_time) { setError('Entry time is required'); return; }
    if (!fields.pnl) { setError('Result is required'); return; }
    if (!fields.asset) { setError('Asset is required'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
      selectedModelIds.forEach(id => fd.append('entry_model_ids', id));
      deleteIds.forEach(id => fd.append('delete_screenshot_ids', id));
      ltfFiles.forEach(f => fd.append('ltf_screenshots', f));
      htfFiles.forEach(f => fd.append('htf_screenshots', f));
      dailyBiasFiles.forEach(f => fd.append('daily_bias_screenshots', f));

      const result = isEdit ? await updateTrade(id, fd) : await createTrade(fd);
      setSaving(false);
      const gam = result.gamification;
      const xpChange = gam?.xpAwarded ?? gam?.xpDelta ?? 0;
      const hasAchievements = (gam?.unlockedAchievements?.length ?? 0) > 0;
      const afterNav = isEdit ? '/dashboard' : `/trades/${result.id}`;
      if (gam && (xpChange !== 0 || hasAchievements)) {
        setToast(gam);
        setPendingNav(afterNav);
      } else {
        navigate(afterNav);
      }
    } catch (err) {
      setError(err.message);
      setSaving(false); // only reached on error; success path sets it false before toast
    }
  };

  return (
    <div className="p-4 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={isEdit ? `/trades/${id}` : '/trades'}
            className="flex items-center gap-1.5 text-slate-500 hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <span className="text-surface-border">·</span>
          <h1 className="text-2xl font-semibold text-white">{isEdit ? 'Edit Trade' : 'New Trade'}</h1>
        </div>
        <div className="flex gap-2">
          <Link to={isEdit ? `/trades/${id}` : '/trades'} className="btn-ghost">Cancel</Link>
          <button type="button" disabled={saving} className="btn-primary" onClick={() => formRef.current?.requestSubmit()}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Trade'}
          </button>
        </div>
      </div>

      {error && <p className="text-loss text-sm">{error}</p>}

      <form ref={formRef} onSubmit={handleSubmit} className="flex-1 min-h-0 grid gap-4 items-stretch" style={{ gridTemplateColumns: '1fr 1.5fr 1fr' }}>
        {/* COLUMN 1 — Trade Info + Entry Models */}
        <div className="flex flex-col gap-4">

          {/* Trade Info */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Trade Info</h2>
              <div className="flex rounded-lg border border-surface-border overflow-hidden">
                {['live', 'backtest'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('session_type', t)}
                    className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      fields.session_type === t
                        ? t === 'live' ? 'bg-profit text-black' : 'bg-accent text-black'
                        : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {t === 'live' ? 'Live' : 'Backtest'}
                  </button>
                ))}
              </div>
            </div>

            {/* Asset */}
            <Field label="Asset *">
              <select className="input" value={fields.asset} onChange={e => set('asset', e.target.value)}>
                <option value="">— Select —</option>
                {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>

            {/* Direction */}
            <Field label="Direction">
              <div className="flex gap-2">
                {[['long', '↑ Long'], ['short', '↓ Short']].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('direction', v)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
                      fields.direction === v
                        ? v === 'long'
                          ? 'bg-profit/15 border-profit text-profit'
                          : 'bg-loss/15 border-loss text-loss'
                        : 'border-surface-border text-slate-500 hover:text-white hover:border-slate-500'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>

            {/* Result */}
            <Field label="Result *">
              <div className="flex gap-1.5">
                {[['win', 'Win'], ['loss', 'Loss'], ['breakeven', 'BE']].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set('pnl', v)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 ${
                      fields.pnl === v
                        ? v === 'win'
                          ? 'bg-[#c6f135]/15 border-[#c6f135] text-[#c6f135]'
                          : v === 'loss'
                            ? 'bg-loss/15 border-loss text-loss'
                            : 'bg-surface-raised border-slate-500 text-slate-300'
                        : 'border-surface-border text-slate-500 hover:text-white hover:border-slate-500'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>

            {/* Entry Time */}
            <Field label="Entry Time *">
              <DatePicker withTime value={fields.entry_time} onChange={v => set('entry_time', v)} placeholder="Select date & time" />
            </Field>

            {/* R:R · PnL $ */}
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
              <p className="text-xs text-slate-500 -mt-1">
                Risk: <span className="text-slate-300 font-medium">${parseFloat(fields.risk_amount).toFixed(2)}</span>
              </p>
            )}

            {/* Risk Management */}
            <Field label="Risk Management">
              <select className="input" value={fields.risk_management} onChange={e => set('risk_management', e.target.value)}>
                <option value="">— Select —</option>
                <option value="low">Low</option>
                <option value="perfect">Perfect</option>
                <option value="high">High</option>
              </select>
            </Field>

            {/* Series */}
            <Field label="Series">
              <select className="input" value={fields.series_id} onChange={e => set('series_id', e.target.value)}>
                <option value="">— None —</option>
                {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          {/* Entry Models */}
          <div className="card space-y-3 flex-1">
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Setup / Entry Models</h2>
            {models.length > 0 && (
              <div
                className="flex flex-wrap gap-2 items-center"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIndex(null); }}
              >
                {models.map((m, index) => {
                  const active = selectedModelIds.includes(m.id);
                  const isDragging = m.id === dragId;
                  return (
                    <>
                      {dropIndex === index && dragId && (
                        <div key={`drop-${index}`} className="w-0.5 h-7 bg-accent rounded-full self-center" />
                      )}
                      <div
                        key={m.id}
                        draggable
                        onDragStart={e => handleDragStart(e, m.id)}
                        onDragOver={e => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`relative group cursor-grab active:cursor-grabbing transition-opacity duration-100 ${isDragging ? 'opacity-30' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleModel(m.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all duration-150 ${
                            active
                              ? 'bg-accent text-black border-accent'
                              : 'bg-transparent text-slate-500 border-surface-border hover:border-accent/40 hover:text-white'
                          }`}
                        >
                          {m.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveModel(m.id)}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-surface-raised text-slate-500 hover:bg-loss hover:text-white text-[10px] items-center justify-center hidden group-hover:flex"
                          title="Delete setup"
                        >
                          ✕
                        </button>
                      </div>
                    </>
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
                placeholder="New setup name (e.g. FVG, OB, BOS)…"
                value={newModelName}
                onChange={e => setNewModelName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddModel(); } }}
                maxLength={80}
              />
              <button type="button" onClick={handleAddModel} className="btn-ghost text-sm whitespace-nowrap">+ Add</button>
            </div>
            {modelError && <p className="text-loss text-xs">{modelError}</p>}
          </div>
        </div>

        {/* COLUMN 2 — Notes (wider) */}
        <div className="flex flex-col min-h-0">
          <div className="card flex-1 flex flex-col gap-4 min-h-0">
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest flex-shrink-0">Notes</h2>
            <Field label="Why I Entered" className="flex flex-col flex-1 min-h-0">
              <textarea className="input resize-none flex-1 min-h-0" value={fields.why_entered}
                onChange={e => set('why_entered', e.target.value)} placeholder="Describe your entry reasoning…" />
            </Field>
            <Field label="Psychology" className="flex flex-col flex-1 min-h-0">
              <textarea className="input resize-none flex-1 min-h-0" value={fields.psychology}
                onChange={e => set('psychology', e.target.value)} placeholder="How did you feel? Were you disciplined?" />
            </Field>
            <Field label="Improvements" className="flex flex-col flex-1 min-h-0">
              <textarea className="input resize-none flex-1 min-h-0" value={fields.improvements}
                onChange={e => set('improvements', e.target.value)} placeholder="What could you have done better?" />
            </Field>
          </div>
        </div>

        {/* COLUMN 3 — Screenshots */}
        <div className="flex flex-col">
          <div className="card flex-1 flex flex-col gap-4 overflow-y-auto">
            <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest flex-shrink-0">Screenshots</h2>

            {existingScreenshots.length > 0 && (
              <div className="space-y-4">
                {['daily_bias', 'ltf', 'htf'].map(type => {
                  const shots = existingScreenshots.filter(s => s.type === type);
                  if (!shots.length) return null;
                  const label = type === 'daily_bias' ? 'Daily Bias' : type.toUpperCase();
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
                        <span className="text-xs text-slate-600">{shots.length} saved</span>
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
                                  className={`w-full h-auto rounded-lg border object-cover transition duration-150 ${
                                    marked ? 'opacity-30 border-loss' : 'border-surface-border'
                                  }`}
                                />
                                <div className="absolute inset-0 rounded-lg bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleDelete(s.id)}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                      marked ? 'bg-surface-raised text-slate-300' : 'bg-loss text-white'
                                    }`}
                                  >
                                    {marked ? 'Undo' : 'Remove'}
                                  </button>
                                  <p className="text-[10px] text-slate-400 truncate max-w-full px-2 text-center">{s.original_name}</p>
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
            <UploadZone label="LTF" files={ltfFiles} inputRef={ltfRef} onChange={setLtfFiles} />
            <UploadZone label="HTF" files={htfFiles} inputRef={htfRef} onChange={setHtfFiles} />
          </div>
        </div>
      </form>

      {toast && pendingNav && (
        <XPToast data={toast} onDismiss={() => navigate(pendingNav)} />
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

  const handlePaste = (e) => {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="label mb-0">{label}</p>
        {files.length > 0 && (
          <span className="text-xs text-slate-500">{files.length} image{files.length > 1 ? 's' : ''}</span>
        )}
      </div>
      <div
        className="border border-dashed border-surface-border rounded-xl min-h-[110px] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-accent/40 hover:bg-surface-raised/30 focus:outline-none focus:border-accent/60 focus:bg-surface-raised/30 transition-all duration-150"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragEnter={e => e.preventDefault()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
          if (dropped.length) onChange(prev => [...prev, ...dropped]);
        }}
        onPaste={handlePaste}
      >
        <svg className="w-7 h-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm text-slate-500">Click, drag, or Ctrl+V</p>
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
                  className="w-full h-auto rounded-lg border border-surface-border object-cover"
                />
                <div className="absolute inset-0 rounded-lg bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="px-3 py-1 rounded-lg bg-loss text-white text-xs font-semibold"
                  >
                    Remove
                  </button>
                  <p className="text-[10px] text-slate-400 truncate max-w-full px-2 text-center">{f.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
