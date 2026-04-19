import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSeries, createSeries, updateSeries, deleteSeries } from '../api';

const EMPTY_FORM = { name: '', description: '' };

export default function SeriesPage() {
  const [series, setSeries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getSeries().then(setSeries); }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowForm(true);
  }

  function openEdit(s) {
    setEditingId(s.id);
    setForm({ name: s.name, description: s.description || '' });
    setError('');
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = { name: form.name.trim(), description: form.description.trim() || null };
      if (editingId) {
        const updated = await updateSeries(editingId, data);
        setSeries(s => s.map(x => x.id === editingId ? updated : x));
      } else {
        const created = await createSeries(data);
        setSeries(s => [created, ...s]);
      }
      cancelForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s) {
    if (!confirm(`Delete series "${s.name}"? Trades won't be deleted, just unlinked.`)) return;
    await deleteSeries(s.id);
    setSeries(prev => prev.filter(x => x.id !== s.id));
  }

  return (
    <div className="p-8 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Series</h1>
          <p className="text-sm text-slate-500 mt-0.5">Named groups to organise your trades</p>
        </div>
        {!showForm && (
          <button onClick={openCreate} className="btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Series
          </button>
        )}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="card space-y-4">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
            {editingId ? 'Edit Series' : 'New Series'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Name *</label>
              <input
                className="input"
                placeholder="e.g. Q2 2025 Backtest"
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
                rows={3}
                placeholder="What is this series about?"
                value={form.description}
                onChange={e => setField('description', e.target.value)}
              />
            </div>
            {error && <p className="text-loss text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={cancelForm} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Series'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state */}
      {series.length === 0 && !showForm && (
        <div className="card flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-slate-500 text-sm">No series yet.</p>
          <button onClick={openCreate} className="text-xs text-accent hover:underline">Create your first series →</button>
        </div>
      )}

      {/* Series list */}
      <div className="space-y-3">
        {series.map(s => (
          <div key={s.id} className="card flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-3">
                <h3 className="text-white font-semibold">{s.name}</h3>
                <Link
                  to={`/trades?series_id=${s.id}`}
                  className="text-xs text-slate-500 hover:text-accent transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  {s.trade_count} trade{s.trade_count !== 1 ? 's' : ''} →
                </Link>
              </div>
              {s.description && (
                <p className="text-sm text-slate-500 leading-relaxed">{s.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => openEdit(s)}
                className="btn-ghost text-xs py-1.5 px-3"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(s)}
                className="btn-ghost text-xs py-1.5 px-3 text-loss hover:bg-loss/10"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
