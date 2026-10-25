import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { getAiConversations, renameAiConversation, deleteAiConversation } from '../../api';
import ConfirmDialog from '../ConfirmDialog';

/**
 * Left column of the AI page: "New analysis" + saved conversations (rename inline, delete with confirm).
 * - `activeId`: id of the open conversation (number|string|null) — highlighted; the list refetches when it changes.
 * - `onChanged?({ type: 'renamed' | 'deleted', id, title? })`: after a successful rename / delete.
 * Imperative refresh: the list also refetches whenever `refreshKey` changes (optional).
 */
export default function ConversationList({ activeId, onChanged, refreshKey }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState(null);
  const navigate = useNavigate();

  const load = () => getAiConversations()
    .then(list => { setItems(list); setError(''); })
    .catch(e => setError(e.message));

  useEffect(() => { load(); }, [activeId, refreshKey]);

  // Ref guards against a blur firing after Enter / Escape already finished the edit
  const editingRef = useRef(null);
  const startEdit = (c) => { editingRef.current = c.id; setEditingId(c.id); setDraft(c.title); };
  const cancelEdit = () => { editingRef.current = null; setEditingId(null); };
  const saveEdit = async () => {
    const id = editingRef.current;
    if (id == null) return;
    editingRef.current = null;
    const title = draft.trim();
    setEditingId(null);
    const current = items?.find(c => c.id === id);
    if (!title || !current || title === current.title) return;
    setItems(list => list.map(c => (c.id === id ? { ...c, title } : c)));
    try {
      await renameAiConversation(id, title);
      onChanged?.({ type: 'renamed', id, title });
    } catch (e) {
      setError(e.message);
      load();
    }
  };

  const doDelete = async () => {
    const c = confirm;
    setConfirm(null);
    try {
      await deleteAiConversation(c.id);
      setItems(list => list.filter(x => x.id !== c.id));
      onChanged?.({ type: 'deleted', id: c.id });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="card !p-3 h-full min-h-0 flex flex-col">
      <button type="button" onClick={() => navigate('/ai')} className="btn-primary w-full flex-shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        New analysis
      </button>

      <div className="px-2 pt-4 pb-2 text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">History</div>

      {error && <div className="mx-1 mb-2 text-xs px-3 py-2 rounded-xl bg-loss/10 text-loss flex-shrink-0">{error}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {items === null && !error && <p className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">Loading…</p>}
        {items?.length === 0 && (
          <p className="px-2 py-2 text-xs leading-relaxed text-slate-400 dark:text-slate-500">No analyses yet.</p>
        )}
        {items?.map(c => {
          const active = String(c.id) === String(activeId);
          if (editingId === c.id) {
            return (
              <RenameInput key={c.id} value={draft} onChange={setDraft} onSave={saveEdit} onCancel={cancelEdit} />
            );
          }
          return (
            <div
              key={c.id}
              className={`group relative rounded-xl transition-colors ${active ? 'bg-accent-soft' : 'hover:bg-surface-raised'}`}
            >
              <Link to={`/ai/${c.id}`} className="block px-3 py-2.5 pr-14" onDoubleClick={e => { e.preventDefault(); startEdit(c); }}>
                <div className={`text-sm truncate ${active ? 'text-accent font-medium' : 'text-slate-800 dark:text-slate-200'}`}>{c.title}</div>
                <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  <span className="truncate">{fmtDate(c.updated_at)}</span>
                  <span className="flex-shrink-0">·</span>
                  <span className="flex-shrink-0" title={`${c.trade_count} trades · ${c.notrade_count} no-trade days`}>{c.trade_count}T · {c.notrade_count}N</span>
                </div>
              </Link>
              <div className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                <IconButton label="Rename" onClick={() => startEdit(c)}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49l2.65 2.65M4 20l4.2-.9L19.5 7.8a1.87 1.87 0 00-2.65-2.65L5.55 16.45 4 20z" />
                </IconButton>
                <IconButton label="Delete" danger onClick={() => setConfirm(c)}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M10 7V5h4v2m-7 0l1 12h8l1-12" />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>

      {confirm && (
        <ConfirmDialog
          message="Delete this analysis?"
          subtext={`"${confirm.title}" and all its messages will be removed. Your trades are not affected.`}
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function fmtDate(s) {
  try { return format(parseISO(s), 'MMM d, yyyy HH:mm'); } catch { return ''; }
}

function RenameInput({ value, onChange, onSave, onCancel }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <div className="px-1 py-1">
      <input
        ref={ref}
        className="input !py-2"
        value={value}
        maxLength={200}
        onChange={e => onChange(e.target.value)}
        onBlur={onSave}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onSave(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        aria-label="Conversation title"
      />
    </div>
  );
}

function IconButton({ label, onClick, danger = false, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-surface-card ${danger ? 'hover:text-loss' : 'hover:text-slate-900 dark:hover:text-white'}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>{children}</svg>
    </button>
  );
}
