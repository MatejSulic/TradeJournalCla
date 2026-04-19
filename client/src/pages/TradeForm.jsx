import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getTrade, getEntryModels, createEntryModel, deleteEntryModel, createTrade, updateTrade, getSeries } from '../api';
import XPToast from '../components/XPToast';

const ASSETS = ['NQ', 'MNQ', 'ES', 'MES'];

const EMPTY = {
  asset: '', session_type: 'live', series_id: '', direction: 'long', pnl: '',
  risk_reward: '', risk_amount: '', entry_time: '',
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

  const handleRemoveModel = async (modelId) => {
    if (!confirm('Remove this setup?')) return;
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
      if (gam && (xpChange !== 0 || hasAchievements)) {
        setToast(gam);
        setPendingNav(`/trades/${result.id}`);
      } else {
        navigate(`/trades/${result.id}`);
      }
    } catch (err) {
      setError(err.message);
      setSaving(false); // only reached on error; success path sets it false before toast
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-7">
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

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* Core fields */}
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
                      ? t === 'live'
                        ? 'bg-profit text-black'
                        : 'bg-accent text-black'
                      : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {t === 'live' ? 'Live' : 'Backtest'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Asset *">
              <select className="input" value={fields.asset} onChange={e => set('asset', e.target.value)} required>
                <option value="">— Select —</option>
                {ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Direction *">
              <select className="input" value={fields.direction} onChange={e => set('direction', e.target.value)}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>
            <Field label="Entry Time *">
              <input type="datetime-local" className="input" value={fields.entry_time}
                onChange={e => set('entry_time', e.target.value)} required />
            </Field>
            <Field label="Result *">
              <select className="input" value={fields.pnl} onChange={e => set('pnl', e.target.value)} required>
                <option value="">— Select —</option>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="breakeven">Breakeven</option>
              </select>
            </Field>
            <Field label="R:R">
              <input type="number" step="0.01" min="0" className="input" placeholder="2.50"
                value={fields.risk_reward} onChange={e => set('risk_reward', e.target.value)} />
            </Field>
            <Field label="Risk Amount ($)">
              <input type="number" step="0.01" min="0" className="input" placeholder="100.00"
                value={fields.risk_amount} onChange={e => set('risk_amount', e.target.value)} />
            </Field>
            <Field label="Risk Management">
              <select className="input" value={fields.risk_management} onChange={e => set('risk_management', e.target.value)}>
                <option value="">— Select —</option>
                <option value="low">Low</option>
                <option value="perfect">Perfect</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Series">
              <select className="input" value={fields.series_id} onChange={e => set('series_id', e.target.value)}>
                <option value="">— None —</option>
                {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Entry Models */}
        <div className="card space-y-3">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Setup / Entry Models</h2>
          {models.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {models.map(m => {
                const active = selectedModelIds.includes(m.id);
                return (
                  <div key={m.id} className="relative group">
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
                );
              })}
            </div>
          )}
          {/* Inline add */}
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

        {/* Notes */}
        <div className="card space-y-4">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Notes</h2>
          <Field label="Why I Entered">
            <textarea className="input resize-none" rows={3} value={fields.why_entered}
              onChange={e => set('why_entered', e.target.value)} placeholder="Describe your entry reasoning…" />
          </Field>
          <Field label="Psychology">
            <textarea className="input resize-none" rows={3} value={fields.psychology}
              onChange={e => set('psychology', e.target.value)} placeholder="How did you feel? Were you disciplined?" />
          </Field>
          <Field label="Improvements">
            <textarea className="input resize-none" rows={3} value={fields.improvements}
              onChange={e => set('improvements', e.target.value)} placeholder="What could you have done better?" />
          </Field>
        </div>

        {/* Screenshots */}
        <div className="card space-y-4">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Screenshots</h2>

          {existingScreenshots.length > 0 && (
            <div className="space-y-3">
              {['daily_bias', 'ltf', 'htf'].map(type => {
                const shots = existingScreenshots.filter(s => s.type === type);
                if (!shots.length) return null;
                const label = type === 'daily_bias' ? 'Daily Bias' : type.toUpperCase();
                return (
                  <div key={type}>
                    <p className="text-xs text-slate-500 mb-2 uppercase">{label}</p>
                    <div className="flex flex-wrap gap-2">
                      {shots.map(s => (
                        <div key={s.id} className="relative">
                          <img
                            src={`/uploads/${s.filename}`}
                            alt={s.original_name}
                            className={`h-20 w-auto rounded border object-cover transition ${
                              deleteIds.includes(s.id) ? 'opacity-30 border-loss' : 'border-surface-border'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleDelete(s.id)}
                            className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center transition ${
                              deleteIds.includes(s.id)
                                ? 'bg-loss text-white'
                                : 'bg-surface-raised text-slate-400 hover:bg-loss hover:text-white'
                            }`}
                            title={deleteIds.includes(s.id) ? 'Undo remove' : 'Remove'}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <UploadZone label="Daily Bias" files={dailyBiasFiles} inputRef={dailyBiasRef} onChange={setDailyBiasFiles} />
          <UploadZone label="LTF Screenshots" files={ltfFiles} inputRef={ltfRef} onChange={setLtfFiles} />
          <UploadZone label="HTF Screenshots" files={htfFiles} inputRef={htfRef} onChange={setHtfFiles} />
        </div>

        {error && <p className="text-loss text-sm pb-4">{error}</p>}
      </form>

      {toast && pendingNav && (
        <XPToast data={toast} onDismiss={() => navigate(pendingNav)} />
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
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

  return (
    <div>
      <p className="label">{label}</p>
      <div
        className="border border-dashed border-surface-border rounded-xl p-5 text-center cursor-pointer hover:border-accent/40 hover:bg-surface-raised/30 transition-all duration-150"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          onChange(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
        }}
      >
        <svg className="w-5 h-5 text-slate-600 mx-auto mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm text-slate-500">Click or drag images here</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              <img
                src={URL.createObjectURL(f)}
                alt={f.name}
                className="h-20 w-auto rounded border border-surface-border object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-loss text-white rounded-full text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
