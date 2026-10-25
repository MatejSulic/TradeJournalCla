import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import Markdown from './Markdown';

const STICK_PX = 80;

/**
 * Scrolling message pane of an AI conversation.
 * - `messages`: [{ id, role: 'user'|'assistant', content }] — saved (or optimistic user) messages.
 * - `streaming`: string|null — text of the answer being streamed (null = not streaming). Shown with a caret.
 * - `error`: { message, retryable } | null — shown under the last user message, with Retry when retryable.
 * - `onRetry()`; `retryDisabled`.
 * - `pinKey`: changing it re-pins the view to the bottom (e.g. after the user sends a question).
 * Auto-scrolls to the bottom while new content arrives unless the user has scrolled up more than 80px.
 */
export default function ChatMessages({ messages, streaming, error, onRetry, retryDisabled = false, pinKey }) {
  const ref = useRef(null);
  const stickRef = useRef(true);

  const onScroll = () => {
    const el = ref.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_PX;
  };

  useEffect(() => { stickRef.current = true; }, [pinKey]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, error, pinKey]);

  const lastUserIdx = messages.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1);
  const errorAfter = error && streaming == null ? lastUserIdx : -2;

  return (
    <div ref={ref} onScroll={onScroll} className="h-full overflow-y-auto px-2" data-testid="chat-scroll">
      <div className="max-w-3xl mx-auto py-2 space-y-5">
        {messages.length === 0 && streaming == null && !error && (
          <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">No messages yet — ask a question below.</p>
        )}
        {messages.map((m, i) => (
          <div key={m.id}>
            <Message role={m.role} content={m.content} />
            {i === errorAfter && <ErrorNote error={error} onRetry={onRetry} disabled={retryDisabled} />}
          </div>
        ))}
        {errorAfter === -1 && <ErrorNote error={error} onRetry={onRetry} disabled={retryDisabled} />}
        {streaming != null && <StreamingMessage text={streaming} />}
      </div>
    </div>
  );
}

const Message = memo(function Message({ role, content }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end" data-role="user">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-slate-900 dark:text-white whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3" data-role="assistant">
      <Avatar />
      <div className="flex-1 min-w-0 pt-1"><Markdown text={content} /></div>
    </div>
  );
});

function StreamingMessage({ text }) {
  return (
    <div className="flex gap-3" data-role="assistant" data-streaming="true">
      <Avatar />
      <div className="flex-1 min-w-0 pt-1">
        {text ? (
          <div className="ai-caret"><Markdown text={text} /></div>
        ) : (
          <div className="flex items-center gap-1 h-6" aria-label="Thinking">
            <span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" />
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="w-7 h-7 rounded-xl bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
      </svg>
    </div>
  );
}

function ErrorNote({ error, onRetry, disabled }) {
  return (
    <div className="flex justify-end mt-2" role="alert">
      <div className="max-w-[80%] flex items-center gap-3 rounded-2xl bg-loss/10 px-4 py-2 text-sm text-loss">
        <span className="min-w-0">{error.message}</span>
        {error.retryable && (
          <button type="button" onClick={onRetry} disabled={disabled} className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium bg-surface-card text-slate-700 dark:text-slate-200 hover:text-accent disabled:opacity-40">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.1 15a7 7 0 0011.9 2.6L20 15M4 9l3-2.6A7 7 0 0118.9 9" />
            </svg>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
