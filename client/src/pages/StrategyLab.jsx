import { Fragment, useEffect, useState } from 'react';
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
  const [activeKey, setActiveKey] = useState(null); // rule that receives clicks from the entry model palette
  const [dragKey, setDragKey] = useState(null);     // rule being dragged (only via its grip handle)
  const [overKey, setOverKey] = useState(null);

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
    const first = newRule();
    setForm({ ...EMPTY_FORM, rules: [first] });
    setActiveKey(first.key);
    setError('');
    setModelError('');
    setShowForm(true);
  }

  function openEdit(s) {
    setEditingId(s.id);
    const rules = s.rules.map(r => newRule(r.label || '', r.options.map(o => o.id)));
    setForm({ name: s.name, description: s.description || '', rules });
    setActiveKey(rules[0]?.key ?? null);
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

  // Palette click: toggle in the active rule; with no rules left, start a new one with that model
  function pickModel(modelId) {
    if (form.rules.some(r => r.key === activeKey)) return toggleOption(activeKey, modelId);
    addRule([modelId]);
  }

  function addRule(entry_model_ids = []) {
    const r = newRule('', entry_model_ids);
    setForm(f => ({ ...f, rules: [...f.rules, r] }));
    setActiveKey(r.key);
  }

  // Move rule `key` to index `to` (rule order = checklist order in TradeForm)
  function moveRule(key, to) {
    setForm(f => {
      const from = f.rules.findIndex(r => r.key === key);
      if (from < 0 || to < 0 || to >= f.rules.length || from === to) return f;
      const rules = [...f.rules];
      rules.splice(to, 0, rules.splice(from, 1)[0]);
      return { ...f, rules };
    });
  }

  function dropRule(targetKey) {
    if (dragKey && dragKey !== targetKey) moveRule(dragKey, form.rules.findIndex(r => r.key === targetKey));
    setDragKey(null);
    setOverKey(null);
  }

  function removeRule(key) {
    const rest = form.rules.filter(x => x.key !== key);
    setField('rules', rest);
    if (key === activeKey) setActiveKey(rest[rest.length - 1]?.key ?? null);
  }

  async function addModel() {
    const name = newModelName.trim();
    if (!name) return;
    setModelError('');
    try {
      const m = await createEntryModel(name);
      setModels(prev => [...prev, m]);
      setNewModelName('');
      pickModel(m.id);
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

  const activeIndex = form.rules.findIndex(r => r.key === activeKey);
  const activeRule = form.rules[activeIndex];
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

      {/* Create / Edit form — strategy on the left, entry model palette on the right */}
      {showForm && (
        <form onSubmit={handleSubmit} className="grid gap-4 items-start grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
          <div className="card space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Edit Strategy' : 'New Strategy'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">A rule is met when the trade has at least one of its entry models.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
                <input
                  className="input"
                  placeholder="What is this strategy about?"
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="label">Rules</label>
              {form.rules.map((r, i) => {
                const isActive = r.key === activeKey;
                return (
                  <div
                    key={r.key}
                    onClick={() => setActiveKey(r.key)}
                    draggable={dragKey === r.key}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={e => { if (dragKey) { e.preventDefault(); setOverKey(r.key); } }}
                    onDrop={e => { e.preventDefault(); dropRule(r.key); }}
                    onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                    className={`rounded-2xl p-4 space-y-3 cursor-pointer transition-colors ${
                      isActive ? 'bg-accent-soft/60 ring-2 ring-accent' : 'bg-surface-raised/60 hover:bg-surface-raised'
                    } ${dragKey === r.key ? 'opacity-40' : ''} ${overKey === r.key && dragKey !== r.key ? 'outline-dashed outline-2 outline-offset-2 outline-accent' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        onMouseDown={() => setDragKey(r.key)}
                        onMouseUp={() => setDragKey(null)}
                        className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-accent -ml-1 shrink-0"
                        title="Drag to reorder"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                          <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                          <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                        </svg>
                      </span>
                      <span className={`text-xs font-semibold tabular-nums w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-accent text-white' : 'bg-surface-card text-slate-500 dark:text-slate-400'
                      }`}>{i + 1}</span>
                      <input
                        className="input !bg-surface-card"
                        placeholder="Label (optional, e.g. Entry model)"
                        value={r.label}
                        onFocus={() => setActiveKey(r.key)}
                        onChange={e => setRule(r.key, { label: e.target.value })}
                        maxLength={120}
                      />
                      <div className="flex flex-col shrink-0">
                        {[['↑', i - 1, 'Move up'], ['↓', i + 1, 'Move down']].map(([arrow, to, label]) => (
                          <button
                            key={arrow}
                            type="button"
                            disabled={to < 0 || to >= form.rules.length}
                            onClick={e => { e.stopPropagation(); moveRule(r.key, to); }}
                            className="px-1.5 py-0.5 leading-none text-sm font-semibold text-slate-400 dark:text-slate-500 hover:text-accent disabled:opacity-30 disabled:hover:text-slate-400"
                            aria-label={label}
                            title={label}
                          >
                            {arrow}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeRule(r.key); }}
                        className="btn-ghost !px-2.5 !py-2 hover:!text-loss hover:!bg-loss/10"
                        aria-label="Remove rule"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-12">
                      {r.entry_model_ids.map((mid, j) => (
                        <Fragment key={mid}>
                          {j > 0 && <span className="text-xs text-slate-400 dark:text-slate-500">or</span>}
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); toggleOption(r.key, mid); }}
                            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-accent text-white hover:bg-loss transition-colors"
                            title="Remove from rule"
                          >
                            {models.find(m => m.id === mid)?.name ?? '?'}
                            <span className="text-white/70 group-hover:text-white text-xs">✕</span>
                          </button>
                        </Fragment>
                      ))}
                      {r.entry_model_ids.length === 0 && (
                        <p className="text-sm text-slate-400 dark:text-slate-500">
                          {isActive ? 'Click entry models on the right to add them →' : 'Empty — select this rule and pick entry models'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={() => addRule()} className="text-sm font-medium text-accent hover:underline">
                + Add rule
              </button>
            </div>

            {error && <p className="text-loss text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={cancelForm} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Strategy'}
              </button>
            </div>
          </div>

          {/* Palette: every entry model; click toggles it in the active rule */}
          <div className="card space-y-4 lg:sticky lg:top-6">
            <div>
              <h2 className="card-title">Entry models</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {activeIndex >= 0 ? <>Click to add to / remove from <span className="font-semibold text-accent">rule {activeIndex + 1}</span></> : 'Click a model to start a new rule'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {models.map(m => {
                const inActive = activeRule?.entry_model_ids.includes(m.id);
                const usedIn = form.rules.map((r, i) => r.entry_model_ids.includes(m.id) ? i + 1 : null).filter(Boolean);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pickModel(m.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      inActive
                        ? 'bg-accent text-white'
                        : usedIn.length
                          ? 'bg-accent-soft text-accent hover:bg-accent hover:text-white'
                          : 'bg-surface-raised text-slate-600 dark:text-slate-300 hover:bg-accent-soft hover:text-accent dark:hover:text-white'
                    }`}
                  >
                    {m.name}
                    {usedIn.length > 0 && !inActive && <span className="text-[10px] font-semibold tabular-nums opacity-80">#{usedIn.join(',')}</span>}
                  </button>
                );
              })}
              {models.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No entry models yet — add one below.</p>}
            </div>
            <div className="pt-1">
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
          </div>
        </form>
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
      {!showForm && active.length > 0 && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
          {active.map(renderCard)}
        </div>
      )}

      {!showForm && archived.length > 0 && (
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
