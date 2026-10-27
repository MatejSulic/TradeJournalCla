import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStrategies, createStrategy, updateStrategy, deleteStrategy, getEntryModels, createEntryModel } from '../api';
import { ruleLabel } from '../strategyRules';
import ConfirmDialog from '../components/ConfirmDialog';

const EMPTY_FORM = { name: '', description: '', rules: [] };
// Local-only key so React lists stay stable while rules are added / removed
let ruleKey = 0;
const newRule = (label = '', entry_model_ids = []) => ({ key: ++ruleKey, label, entry_model_ids });

export default function StrategyLab() {
  const [strategies, setStrategies] = useState([]);
  const [models, setModels] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [modelError, setModelError] = useState('');

  useEffect(() => {
    Promise.all([getStrategies(), getEntryModels()])
      .then(([s, m]) => { setStrategies(s); setModels(m); })
      .catch(err => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setRule = (key, patch) => setForm(f => ({ ...f, rules: f.rules.map(r => r.key === key ? { ...r, ...patch } : r) }));

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, rules: [newRule()] });
    setError('');
    setModelError('');
    setShowForm(true);
  }

  function openEdit(s) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      description: s.description || '',
      rules: s.rules.map(r => newRule(r.label || '', r.options.map(o => o.id))),
    });
    setError('');
    setModelError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  function toggleOption(key, modelId) {
    const rule = form.rules.find(r => r.key === key);
    const ids = rule.entry_model_ids.includes(modelId)
      ? rule.entry_model_ids.filter(i => i !== modelId)
      : [...rule.entry_model_ids, modelId];
    setRule(key, { entry_model_ids: ids });
  }

  async function addModel() {
    const name = newModelName.trim();
    if (!name) return;
    setModelError('');
    try {
      const m = await createEntryModel(name);
      setModels(prev => [...prev, m]);
      setNewModelName('');
    } catch (err) {
      setModelError(err.message);
    }
  }

  const payloadRules = (rules) => rules.map(r => ({ label: r.label.trim() || null, entry_model_ids: r.entry_model_ids }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.rules.length || form.rules.some(r => r.entry_model_ids.length === 0)) {
      setError('Every rule needs at least one entry model');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        rules: payloadRules(form.rules),
      };
      if (editingId) {
        const current = strategies.find(s => s.id === editingId);
        const updated = await updateStrategy(editingId, { ...data, archived: !!current?.archived });
        setStrategies(prev => prev.map(x => x.id === editingId ? updated : x));
      } else {
        const created = await createStrategy({ ...data, archived: false });
        setStrategies(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      cancelForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(s) {
    try {
      const updated = await updateStrategy(s.id, {
        name: s.name,
        description: s.description,
        archived: !s.archived,
        rules: s.rules.map(r => ({ label: r.label, entry_model_ids: r.options.map(o => o.id) })),
      });
      setStrategies(prev => prev.map(x => x.id === s.id ? updated : x));
    } catch (err) {
      setError(err.message);
    }
  }

  async function doDelete() {
    const s = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteStrategy(s.id);
      setStrategies(prev => prev.filter(x => x.id !== s.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const active = strategies.filter(s => !s.archived);
  const archived = strategies.filter(s => s.archived);

  function renderCard(s) {
    return (
      <div key={s.id} className={`card space-y-4 ${s.archived ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">{s.name}</h2>
              {s.archived && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-raised text-slate-500 dark:text-slate-400">Archived</span>
              )}
            </div>
            {s.description ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{s.description}</p>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-600 mt-0.5">No description</p>
            )}
          </div>
          <Link
            to={`/trades?strategy_id=${s.id}`}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300 hover:text-accent hover:bg-accent-soft transition-colors"
          >
            {s.trade_count} trade{s.trade_count !== 1 ? 's' : ''}
            <span aria-hidden>→</span>
          </Link>
        </div>

        <ul className="space-y-1.5">
          {s.rules.map(r => (
            <li key={r.id} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <svg className="w-4 h-4 mt-0.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>
                {r.label?.trim()
                  ? <>{ruleLabel(r)}: <span className="text-slate-500 dark:text-slate-400">{r.options.map(o => o.name).join(' / ')}</span></>
                  : ruleLabel(r)}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={() => openEdit(s)} className="btn-ghost !px-3 !py-1.5 text-xs">Edit</button>
          <button type="button" onClick={() => toggleArchive(s)} className="btn-ghost !px-3 !py-1.5 text-xs">
            {s.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button type="button" onClick={() => setConfirmDelete(s)} className="btn-ghost !px-3 !py-1.5 text-xs hover:!text-loss hover:!bg-loss/10">Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Strategy Lab</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Build checklists from your entry models — a trade with a strategy can only be saved when every rule is met.</p>
        </div>
        {!showForm && (
          <button onClick={openCreate} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Strategy
          </button>
        )}
      </div>

      {!showForm && error && <p className="text-loss text-sm">{error}</p>}

      {/* Create / Edit form */}
      {showForm && (
        <div className="card space-y-5 max-w-2xl">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {editingId ? 'Edit Strategy' : 'New Strategy'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">A rule is met when the trade has at least one of its entry models.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Name <span className="text-loss">*</span></label>
              <input
                className="input"
                placeholder="e.g. NQ Silver Bullet"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="What is this strategy about?"
                value={form.description}
                onChange={e => setField('description', e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <label className="label">Rules</label>
              {form.rules.map((r, i) => (
                <div key={r.key} className="rounded-2xl bg-surface-raised/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500 tabular-nums w-4">{i + 1}</span>
                    <input
                      className="input"
                      placeholder="Label (optional, e.g. Entry model)"
                      value={r.label}
                      onChange={e => setRule(r.key, { label: e.target.value })}
                      maxLength={120}
                    />
                    <button
                      type="button"
                      onClick={() => setField('rules', form.rules.filter(x => x.key !== r.key))}
                      className="btn-ghost !px-2.5 !py-2 hover:!text-loss hover:!bg-loss/10"
                      aria-label="Remove rule"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {models.map(m => {
                      const on = r.entry_model_ids.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleOption(r.key, m.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            on ? 'bg-accent text-white' : 'bg-surface-card text-slate-600 dark:text-slate-300 hover:bg-accent-soft'
                          }`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                    {models.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No entry models yet — add one below.</p>}
                  </div>
                  {r.entry_model_ids.length >= 2 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Any one of these</p>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setField('rules', [...form.rules, newRule()])}
                className="text-sm font-medium text-accent hover:underline"
              >
                + Add rule
              </button>
            </div>

            <div>
              <label className="label">New entry model</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="New entry model…"
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModel(); } }}
                  maxLength={60}
                />
                <button type="button" onClick={addModel} className="btn-secondary">Add</button>
              </div>
              {modelError && <p className="text-loss text-sm mt-1">{modelError}</p>}
            </div>

            {error && <p className="text-loss text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={cancelForm} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Strategy'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state */}
      {loaded && strategies.length === 0 && !showForm && (
        <div className="card flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
            A strategy is a checklist of rules built from your entry models. Assign one to a trade and it can only be saved once every rule is met.
          </p>
          <button onClick={openCreate} className="text-sm font-medium text-accent hover:underline">Create your first strategy →</button>
        </div>
      )}

      {/* Strategy list */}
      {active.length > 0 && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          {active.map(renderCard)}
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-accent"
          >
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && (
            <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
              {archived.map(renderCard)}
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete strategy "${confirmDelete.name}"?`}
          subtext={`"${confirmDelete.name}" will be removed from ${confirmDelete.trade_count} trade${confirmDelete.trade_count !== 1 ? 's' : ''}. The trades and their entry models stay.`}
          confirmLabel="Delete"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
