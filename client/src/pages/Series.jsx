import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSeries, createSeries, updateSeries, deleteSeries } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

const EMPTY_FORM = { name: '', description: '' };

export default function SeriesPage() {
  const [series, setSeries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
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

  async function doDelete() {
    const s = confirmDelete;
    setConfirmDelete(null);
    await deleteSeries(s.id);
    setSeries(prev => prev.filter(x => x.id !== s.id));
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Series</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Named groups to organise your trades</p>
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
        <div className="card space-y-5 max-w-2xl">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {editingId ? 'Edit Series' : 'New Series'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Give the group a short, recognisable name.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Name <span className="text-loss">*</span></label>
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
            {error && <p className="text-loss text-sm">{error}</p>}
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
          <p className="text-slate-500 dark:text-slate-400 text-sm">No series yet.</p>
          <button onClick={openCreate} className="text-sm font-medium text-accent hover:underline">Create your first series →</button>
        </div>
      )}

      {/* Series list */}
      {series.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised/50">
              <tr className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="pl-6 pr-4 py-3.5 text-left font-medium">Name</th>
                <th className="px-4 py-3.5 text-right font-medium w-32">Trades</th>
                <th className="pl-4 pr-6 py-3.5 w-40"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {series.map(s => (
                <tr key={s.id} className="transition-colors hover:bg-surface-raised/60">
                  <td className="pl-6 pr-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white leading-tight">{s.name}</p>
                        {s.description ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{s.description}</p>
                        ) : (
                          <p className="text-sm text-slate-400 dark:text-slate-600 mt-0.5">No description</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap">
                    <Link
                      to={`/trades?series_id=${s.id}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 font-medium tabular-nums text-slate-700 dark:text-slate-300 hover:text-accent hover:bg-accent-soft transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      {s.trade_count} trade{s.trade_count !== 1 ? 's' : ''}
                      <span aria-hidden>→</span>
                    </Link>
                  </td>
                  <td className="pl-4 pr-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="btn-ghost !px-3 !py-1.5 text-xs">Edit</button>
                      <button onClick={() => setConfirmDelete(s)} className="btn-ghost !px-3 !py-1.5 text-xs hover:!text-loss hover:!bg-loss/10">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete series "${confirmDelete.name}"?`}
          subtext="Trades won't be deleted, just unlinked."
          confirmLabel="Delete"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
