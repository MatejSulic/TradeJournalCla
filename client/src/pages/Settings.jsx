import { useEffect, useState } from 'react';
import { getEntryModels, createEntryModel, deleteEntryModel } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings() {
  const [models, setModels] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const load = () => getEntryModels().then(setModels);
  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    const name = input.trim();
    if (!name) return;
    try {
      await createEntryModel(name);
      setInput('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(null);

  const doDelete = async () => {
    const id = confirmDelete;
    setConfirmDelete(null);
    await deleteEntryModel(id);
    load();
  };

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-slate-100">Settings</h1>

      <div className="card space-y-4">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Entry Setups</h2>
        <p className="text-xs text-slate-500">
          Define the trade setups you use. These appear in the dropdown when adding a trade.
        </p>

        {/* Add form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. BOS, FVG, OB, CISD…"
            value={input}
            onChange={e => setInput(e.target.value)}
            maxLength={80}
          />
          <button type="submit" className="btn-primary whitespace-nowrap">Add Setup</button>
        </form>
        {error && <p className="text-loss text-xs">{error}</p>}

        {/* List */}
        {models.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No setups yet.</p>
        ) : (
          <ul className="space-y-2">
            {models.map(m => (
              <li key={m.id} className="flex items-center justify-between bg-surface-raised px-4 py-2.5 rounded-lg">
                <span className="text-sm text-slate-200">{m.name}</span>
                <button
                  onClick={() => setConfirmDelete(m.id)}
                  className="text-xs text-slate-500 hover:text-loss transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDialog
          message="Remove this setup? Trades using it will keep a reference."
          confirmLabel="Remove"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
