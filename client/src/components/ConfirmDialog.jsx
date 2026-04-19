import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Delete', danger = true }) {
  const cancelRef = useRef();

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative card max-w-sm w-full space-y-4 shadow-2xl border border-surface-border">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${danger ? 'bg-loss/10' : 'bg-accent/10'}`}>
            <svg className={`w-4 h-4 ${danger ? 'text-loss' : 'text-accent'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button ref={cancelRef} onClick={onCancel} className="btn-ghost text-sm py-1.5 px-4">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`text-sm py-1.5 px-4 rounded-lg font-medium transition-colors ${
              danger
                ? 'bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25'
                : 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
