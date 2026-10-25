import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { format, getDay, parseISO } from 'date-fns';
import {
  getAiStatus, estimateAi, createAiConversation, getAiConversation, renameAiConversation, deleteAiConversation,
  streamAiMessage, getTrades, getEntryModels, getSeries,
} from '../api';
import { searchParamsToObject, snapshotChips } from '../aiFilters';
import TradeFilters, { useTradeFilters } from '../components/TradeFilters';
import ConversationList from '../components/ai/ConversationList';
import SelectionList from '../components/ai/SelectionList';
import Composer from '../components/ai/Composer';
import ChatMessages from '../components/ai/ChatMessages';
import ConfirmDialog from '../components/ConfirmDialog';

const SUGGESTIONS = [
  'What do my losing trades have in common?',
  'Which setups work best and why?',
  'Patterns in my psychology notes?',
  'Why did I skip trades on no-trade days?',
];

export default function AiAnalyst() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // null = loading
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    getAiStatus().then(setStatus).catch(e => setStatusError(e.message));
  }, []);

  const configured = !!status?.default;

  // Bumping refreshKey refetches the history list (after an answer / a rename in the header)
  const [listRefresh, setListRefresh] = useState(0);
  const refreshList = useCallback(() => setListRefresh(n => n + 1), []);
  // Rename done in the list → forwarded to the open conversation's header
  const [renamed, setRenamed] = useState(null);

  const onListChanged = useCallback((ev) => {
    if (ev.type === 'deleted' && String(ev.id) === String(id)) navigate('/ai', { replace: true });
    if (ev.type === 'renamed') setRenamed({ id: ev.id, title: ev.title });
  }, [id, navigate]);

  let right;
  if (id) right = <Conversation key={id} id={id} status={status} renamed={renamed} onListChange={refreshList} />;
  else if (statusError) right = <Notice title="Could not reach the AI service" body={statusError} />;
  else if (!status) right = null;
  else if (!configured) right = <NotConfigured />;
  else right = <NewAnalysis />;

  return (
    <div className="h-full p-6 flex gap-5 min-h-0 overflow-hidden">
      <div className="w-[260px] flex-shrink-0 min-h-0">
        <ConversationList activeId={id ?? null} onChanged={onListChanged} refreshKey={listRefresh} />
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">{right}</div>
    </div>
  );
}

function PageTitle() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">AI Analyst</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Ask questions about a selection of your journal</p>
    </>
  );
}

function NotConfigured() {
  return (
    <div className="flex flex-col gap-5 min-h-0">
      <div><PageTitle /></div>
      <Notice
        title="AI is not configured"
        body={<>Add <Code>GEMINI_API_KEY</Code> to <Code>.env</Code> and restart (<Code>docker compose up -d --build</Code>). Past analyses stay viewable on the left.</>}
      />
    </div>
  );
}

function Notice({ title, body }) {
  return (
    <div className="card max-w-xl flex items-start gap-4">
      <div className="w-10 h-10 rounded-2xl bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="space-y-1 pt-0.5 min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>
      </div>
    </div>
  );
}

function Code({ children }) {
  return <code className="whitespace-nowrap px-1.5 py-0.5 rounded-md bg-surface-raised text-[0.8rem] text-slate-700 dark:text-slate-200">{children}</code>;
}

const fmtTokens = (n) => (n < 1000 ? `~${n}` : `~${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '')}k`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function NewAnalysis() {
  const navigate = useNavigate();
  const { filters, dowFilter, apiFilters, searchParams, setSearchParams } = useTradeFilters();
  const [models, setModels] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [trades, setTrades] = useState([]);
  const [allNoTrade, setAllNoTrade] = useState([]);
  const [noTradeLoaded, setNoTradeLoaded] = useState(false);
  const [tradesFor, setTradesFor] = useState(null); // apiFilters key the `trades` list was loaded for
  const [loadError, setLoadError] = useState('');
  const [excluded, setExcluded] = useState(() => new Set()); // unchecked ids, kept across filter changes
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [estimate, setEstimate] = useState({ tokens: null, loading: false, failed: false });

  const includeNt = searchParams.get('nt') !== '0';
  const setIncludeNt = (on) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    if (on) next.delete('nt'); else next.set('nt', '0');
    return next;
  }, { replace: true });

  useEffect(() => {
    getEntryModels().then(setModels).catch(() => {});
    getSeries().then(setSeriesList).catch(() => {});
    getTrades({ day_type: 'notrade' })
      .then(list => { setAllNoTrade(list); setNoTradeLoaded(true); })
      .catch(e => setLoadError(e.message));
  }, []);

  const apiKey = JSON.stringify(apiFilters);
  useEffect(() => {
    let cancelled = false;
    const key = apiKey;
    getTrades(apiFilters)
      .then(list => { if (!cancelled) { setTrades(list); setTradesFor(key); setLoadError(''); } })
      .catch(e => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [apiKey]);

  const matchesDow = (t) => !dowFilter || (t.entry_time && getDay(parseISO(t.entry_time)) === dowFilter);

  const visibleTrades = useMemo(() => trades.filter(matchesDow), [trades, dowFilter]);

  // No-trade days: date range (inclusive, whole day) + day of week only
  const visibleNoTrade = useMemo(() => {
    if (!includeNt) return [];
    return allNoTrade.filter(t => {
      const day = (t.entry_time || '').slice(0, 10);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      return matchesDow(t);
    });
  }, [allNoTrade, includeNt, filters.from, filters.to, dowFilter]);

  const tradeIds = useMemo(() => visibleTrades.filter(t => !excluded.has(t.id)).map(t => t.id), [visibleTrades, excluded]);
  const notradeIds = useMemo(() => visibleNoTrade.filter(t => !excluded.has(t.id)).map(t => t.id), [visibleNoTrade, excluded]);
  const selectedCount = tradeIds.length + notradeIds.length;
  // Until the list for the CURRENT filters has loaded, the visible rows are stale: asking would send
  // old ids with the new filter snapshot, so Ask is disabled and the list dimmed.
  const listReady = tradesFor === apiKey && noTradeLoaded;

  // Debounced token estimate of the current selection
  const selKey = `${tradeIds.join(',')}|${notradeIds.join(',')}`;
  useEffect(() => {
    if (selectedCount === 0) { setEstimate({ tokens: null, loading: false, failed: false }); return; }
    setEstimate(e => ({ ...e, loading: true }));
    let cancelled = false;
    const timer = setTimeout(() => {
      estimateAi({ trade_ids: tradeIds, notrade_ids: notradeIds })
        .then(r => { if (!cancelled) setEstimate({ tokens: r.tokens, loading: false, failed: false }); })
        .catch(() => { if (!cancelled) setEstimate({ tokens: null, loading: false, failed: true }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selKey]);

  const onToggle = useCallback((id) => setExcluded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const visibleIds = () => [...visibleTrades, ...visibleNoTrade].map(t => t.id);
  const onAll = () => setExcluded(prev => { const next = new Set(prev); visibleIds().forEach(i => next.delete(i)); return next; });
  const onNone = () => setExcluded(prev => { const next = new Set(prev); visibleIds().forEach(i => next.add(i)); return next; });

  const ask = async () => {
    const q = question.trim();
    if (!q || selectedCount === 0 || submitting || !listReady) return;
    setSubmitting(true);
    setError('');
    try {
      const conv = await createAiConversation({
        trade_ids: tradeIds,
        notrade_ids: notradeIds,
        filters: searchParamsToObject(searchParams),
        title: q.slice(0, 60),
      });
      navigate(`/ai/${conv.id}`, { state: { firstQuestion: q } });
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const ntToggle = (
    <label className="btn-secondary cursor-pointer select-none">
      <input type="checkbox" className="w-4 h-4 accent-accent cursor-pointer" checked={includeNt} onChange={e => setIncludeNt(e.target.checked)} />
      Include no-trade days
    </label>
  );

  return (
    <div className="flex flex-col gap-5 min-h-0 h-full">
      <TradeFilters
        className="flex-shrink-0"
        models={models}
        setModels={setModels}
        seriesList={seriesList}
        title={<PageTitle />}
        actions={ntToggle}
      />

      <div className="card !p-4 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-4 px-2 pb-3 flex-shrink-0">
          <div className="text-sm text-slate-600 dark:text-slate-300 tabular-nums flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-slate-900 dark:text-white">{plural(tradeIds.length, 'trade', 'trades')}</span>
            {includeNt && <><span className="text-slate-400 dark:text-slate-500">·</span><span>{plural(notradeIds.length, 'no-trade day', 'no-trade days')}</span></>}
            {selectedCount > 0 && (
              <>
                <span className="text-slate-400 dark:text-slate-500">·</span>
                <span className={`transition-opacity ${estimate.loading ? 'opacity-50' : ''}`} title="Approximate size of the data sent to the AI">
                  {estimate.tokens != null ? `${fmtTokens(estimate.tokens)} tokens` : estimate.failed ? 'estimate unavailable' : 'estimating…'}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 text-xs font-medium">
            <button type="button" onClick={onAll} disabled={!listReady} className="disabled:opacity-40 disabled:pointer-events-none px-2 py-1 rounded-lg text-accent hover:bg-accent-soft">Select all</button>
            <button type="button" onClick={onNone} disabled={!listReady} className="disabled:opacity-40 disabled:pointer-events-none px-2 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-surface-raised hover:text-slate-900 dark:hover:text-white">None</button>
          </div>
        </div>
        {loadError && <div className="mx-2 mb-2 text-sm px-4 py-2.5 rounded-2xl bg-loss/10 text-loss flex-shrink-0">{loadError}</div>}
        <div
          className={`flex-1 min-h-0 transition-opacity ${listReady ? '' : 'opacity-50 pointer-events-none'}`}
          aria-busy={!listReady}
          data-testid="ai-selection"
        >
          <SelectionList
            trades={visibleTrades}
            noTradeDays={visibleNoTrade}
            excluded={excluded}
            onToggle={onToggle}
            onAll={onAll}
            onNone={onNone}
          />
        </div>
      </div>

      <div className="card !p-4 flex-shrink-0 space-y-2">
        <Composer
          value={question}
          onChange={setQuestion}
          onSubmit={ask}
          disabled={selectedCount === 0 || submitting || !listReady}
          suggestions={SUGGESTIONS}
          placeholder={!listReady ? 'Loading trades…' : selectedCount === 0 ? 'Select at least one trade to ask a question…' : 'Ask about the selected trades…'}
        />
        {error && <p className="text-sm text-loss px-1">{error}</p>}
      </div>
    </div>
  );
}

const PROVIDER_LABELS = { gemini: 'Gemini', anthropic: 'Claude', mock: 'Mock' };
const PROVIDER_KEYS = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

const ERROR_TEXT = {
  rate_limit: 'Rate limit reached — wait a moment and retry.',
  auth: 'The AI provider rejected the API key — check .env.',
  unavailable: 'The AI provider is unavailable right now.',
  busy: 'Another answer is still being generated for this analysis.',
  network: 'Could not reach the server.',
  stream: 'The answer was interrupted.',
};
const errorText = (e) => ERROR_TEXT[e.code] || e.message || 'Something went wrong.';

const fmtDay = (s) => { try { return format(parseISO(s), 'MMM d, yyyy'); } catch { return ''; } };

/**
 * `/ai/:id` — header, message history, streaming answer, composer. Keyed by id in the parent, so switching
 * conversations unmounts it: the in-flight stream is aborted and its partial text is discarded with the state.
 */
function Conversation({ id, status, renamed, onListChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [conv, setConv] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(null); // null = idle, string = answer so far
  const [error, setError] = useState(null); // { message, retryable }
  const [draft, setDraft] = useState('');
  const [pinKey, setPinKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lookups, setLookups] = useState({ seriesList: [], models: [] });

  const busyRef = useRef(false); // synchronous double-submit guard (Ctrl+Enter twice before re-render)
  const abortRef = useRef(null);
  const aliveRef = useRef(true);
  const firstSentRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; abortRef.current?.abort(); };
  }, []);

  const applyServerMessages = (msgs) => {
    setMessages(msgs);
    const last = msgs[msgs.length - 1];
    return last?.role === 'user';
  };

  useEffect(() => {
    let cancelled = false;
    getAiConversation(id)
      .then(c => {
        if (cancelled) return;
        setConv(c);
        const pending = applyServerMessages(c.messages);
        // A question without an answer (earlier error, or the page was left mid-stream) → offer Retry
        if (pending && !location.state?.firstQuestion) setError({ message: 'No answer was saved for this question.', retryable: true });
      })
      .catch(e => { if (!cancelled) setLoadError(e.message); });
    getSeries().then(seriesList => !cancelled && setLookups(l => ({ ...l, seriesList }))).catch(() => {});
    getEntryModels().then(models => !cancelled && setLookups(l => ({ ...l, models }))).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (renamed && String(renamed.id) === String(id)) setConv(c => (c ? { ...c, title: renamed.title } : c));
  }, [renamed, id]);

  const run = async (body, sentText = null) => {
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setStreaming('');
    setPinKey(k => k + 1);
    try {
      const message = await streamAiMessage(id, body, {
        signal: ac.signal,
        onDelta: (t) => { if (!ac.signal.aborted) setStreaming(s => (s ?? '') + t); },
      });
      if (ac.signal.aborted || !aliveRef.current) return;
      setMessages(m => [...m, message]);
      setStreaming(null);
      onListChange?.();
    } catch (e) {
      if (e.code === 'aborted' || ac.signal.aborted || !aliveRef.current) return;
      setStreaming(null);
      // Reconcile with the server: was the question saved? (validation errors happen before it is stored)
      try {
        const fresh = await getAiConversation(id);
        if (!aliveRef.current) return;
        const pending = applyServerMessages(fresh.messages);
        // `busy` stays retryable: the server answers 409 without side effects, so Retry is safe
        setError({ message: errorText(e), retryable: pending });
        const last = fresh.messages[fresh.messages.length - 1];
        if (sentText && !(pending && last.content === sentText.trim())) setDraft(d => d || sentText);
      } catch {
        if (aliveRef.current) setError({ message: errorText(e), retryable: false });
      }
      onListChange?.();
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      if (aliveRef.current) busyRef.current = false;
    }
  };

  const send = (text) => {
    const content = text.trim();
    if (!content || busyRef.current) return;
    busyRef.current = true;
    setDraft('');
    setMessages(m => [...m, { id: `local-${Date.now()}`, role: 'user', content }]);
    run({ content }, text);
  };

  const retry = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    run({ retry: true });
  };

  // First question handed over by the new-analysis form: send once (ref survives StrictMode's double effect)
  useEffect(() => {
    if (!conv || firstSentRef.current) return;
    const q = location.state?.firstQuestion;
    if (!q) return;
    firstSentRef.current = true;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    if (conv.messages.length === 0) send(q);
  }, [conv]);

  const rename = async (title) => {
    const prev = conv.title;
    setConv(c => ({ ...c, title }));
    try {
      await renameAiConversation(id, title);
      onListChange?.();
    } catch (e) {
      setConv(c => ({ ...c, title: prev }));
      setError({ message: e.message, retryable: false });
    }
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    abortRef.current?.abort();
    try {
      await deleteAiConversation(id);
      onListChange?.();
      navigate('/ai', { replace: true });
    } catch (e) {
      setError({ message: e.message, retryable: false });
    }
  };

  if (loadError) {
    return (
      <Notice
        title={loadError === 'not found' ? 'Analysis not found' : 'Could not load this analysis'}
        body={<>{loadError === 'not found' ? 'It may have been deleted.' : loadError} <Link to="/ai" className="text-accent font-medium">Start a new analysis</Link></>}
      />
    );
  }
  if (!conv) return null;

  const providerAvailable = !status || status.providers.some(p => p.id === conv.provider);
  const isStreaming = streaming != null;
  const chips = snapshotChips(conv.filters, lookups);
  const providerLabel = PROVIDER_LABELS[conv.provider] || conv.provider;

  return (
    <div className="flex flex-col gap-4 min-h-0 h-full">
      <div className="flex-shrink-0 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <EditableTitle value={conv.title} onSave={rename} />
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
            <span>{plural(conv.trade_count, 'trade', 'trades')}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>{plural(conv.notrade_count, 'no-trade day', 'no-trade days')}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>{providerLabel} · {conv.model}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>created {fmtDay(conv.created_at)}</span>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Filters used for this analysis">
              {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-card text-xs font-medium text-slate-600 dark:text-slate-300" style={{ boxShadow: 'var(--shadow-card)' }}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setConfirmDelete(true)} className="btn-ghost !px-3 flex-shrink-0 hover:!text-loss" title="Delete analysis" aria-label="Delete analysis">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M10 7V5h4v2m-7 0l1 12h8l1-12" />
          </svg>
          Delete
        </button>
      </div>

      <div className="card !p-4 flex-1 min-h-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0">
          <ChatMessages
            messages={messages}
            streaming={streaming}
            error={error}
            onRetry={retry}
            retryDisabled={isStreaming || !providerAvailable}
            pinKey={pinKey}
          />
        </div>
        <div className="flex-shrink-0 max-w-3xl w-full mx-auto space-y-2">
          {!providerAvailable && (
            <p className="text-sm text-slate-500 dark:text-slate-400 px-1">
              {providerLabel} is not configured — add <Code>{PROVIDER_KEYS[conv.provider] || 'an API key'}</Code> to <Code>.env</Code> and restart to continue this analysis.
            </p>
          )}
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => send(draft)}
            disabled={isStreaming || !providerAvailable}
            suggestions={messages.length === 0 && !isStreaming ? SUGGESTIONS : null}
            placeholder={isStreaming ? 'Answering… you can type your next question' : 'Ask a follow-up question…'}
          />
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message="Delete this analysis?"
          subtext={`"${conv.title}" and all its messages will be removed. Your trades are not affected.`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function EditableTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const doneRef = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  const start = () => { doneRef.current = false; setDraft(value); setEditing(true); };
  const finish = (save) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    const t = draft.trim();
    if (save && t && t !== value) onSave(t);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="input !text-xl !font-semibold !py-1.5 max-w-2xl"
        value={draft}
        maxLength={200}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        }}
        aria-label="Analysis title"
      />
    );
  }
  return (
    <div className="group flex items-center gap-2 min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white truncate" title={value} onDoubleClick={start}>{value}</h1>
      <button type="button" onClick={start} title="Rename" aria-label="Rename analysis" className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-surface-raised hover:text-slate-900 dark:hover:text-white opacity-60 group-hover:opacity-100">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49l2.65 2.65M4 20l4.2-.9L19.5 7.8a1.87 1.87 0 00-2.65-2.65L5.55 16.45 4 20z" />
        </svg>
      </button>
    </div>
  );
}
