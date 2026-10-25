import { useRef } from 'react';

/**
 * Question box for the AI Analyst.
 * - `value` / `onChange(text)`: controlled textarea.
 * - `onSubmit()`: Ask button or Ctrl/Cmd+Enter (plain Enter = newline). Never fires while `disabled` or empty.
 * - `disabled`: blocks submitting (button + shortcut); the textarea stays editable so the next question can be typed.
 * - `suggestions?`: string[] — chips above the textarea; clicking one fills the textarea.
 * - `placeholder?`, `submitLabel?`: optional copy overrides.
 */
export default function Composer({ value, onChange, onSubmit, disabled = false, suggestions = null, placeholder = 'Ask about the selected trades…', submitLabel = 'Ask' }) {
  const ref = useRef(null);
  const canSubmit = !disabled && value.trim().length > 0;

  const submit = () => { if (canSubmit) onSubmit(); };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  const pick = (s) => {
    onChange(s);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.focus(); el.setSelectionRange(s.length, s.length); }
    });
  };

  return (
    <div className="space-y-2.5">
      {suggestions?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-raised text-slate-600 dark:text-slate-300 hover:bg-accent-soft hover:text-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 bg-surface-raised rounded-2xl p-2 pl-4 focus-within:ring-2 focus-within:ring-accent/30 transition-shadow">
        <textarea
          ref={ref}
          rows={2}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="flex-1 min-w-0 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none max-h-40"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden xl:inline text-[11px] text-slate-400 dark:text-slate-500 select-none">Ctrl + Enter</span>
          <button type="button" onClick={submit} disabled={!canSubmit} className="btn-primary !py-2">
            {submitLabel}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
