import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDay, parseISO } from 'date-fns';
import { getAiStatus, estimateAi, createAiConversation, getTrades, getEntryModels, getSeries } from '../api';
import TradeFilters, { useTradeFilters } from '../components/TradeFilters';
import ConversationList from '../components/ai/ConversationList';
import SelectionList from '../components/ai/SelectionList';
import Composer from '../components/ai/Composer';

export const SUGGESTIONS = [
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

  const onListChanged = useCallback((ev) => {
    if (ev.type === 'deleted' && String(ev.id) === String(id)) navigate('/ai', { replace: true });
  }, [id, navigate]);

  let right;
  if (id) right = <ConversationPlaceholder id={id} />;
  else if (statusError) right = <Notice title="Could not reach the AI service" body={statusError} />;
  else if (!status) right = null;
  else if (!configured) right = <NotConfigured />;
  else right = <NewAnalysis />;

  return (
    <div className="h-full p-6 flex gap-5 min-h-0 overflow-hidden">
      <div className="w-[260px] flex-shrink-0 min-h-0">
        <ConversationList activeId={id ?? null} onChanged={onListChanged} />
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

// Replaced by the conversation view (Task 6)
function ConversationPlaceholder({ id }) {
  return (
    <div className="card flex-1 min-h-0 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
      Conversation #{id}
    </div>
  );
}

/** URL params → plain object: single-valued keys stay strings, repeated keys become arrays (e.g. entry_model_id). */
export function searchParamsToObject(searchParams) {
  const out = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

/** Inverse of searchParamsToObject. */
export function objectToSearchParams(obj) {
  const sp = new URLSearchParams();
  for (const [key, v] of Object.entries(obj || {})) {
    if (Array.isArray(v)) v.forEach(x => sp.append(key, x));
    else if (v != null) sp.append(key, v);
  }
  return sp;
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
    getTrades({ day_type: 'notrade' }).then(setAllNoTrade).catch(e => setLoadError(e.message));
  }, []);

  const apiKey = JSON.stringify(apiFilters);
  useEffect(() => {
    let cancelled = false;
    getTrades(apiFilters)
      .then(list => { if (!cancelled) { setTrades(list); setLoadError(''); } })
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
    if (!q || selectedCount === 0 || submitting) return;
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
            <button type="button" onClick={onAll} className="px-2 py-1 rounded-lg text-accent hover:bg-accent-soft">Select all</button>
            <button type="button" onClick={onNone} className="px-2 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-surface-raised hover:text-slate-900 dark:hover:text-white">None</button>
          </div>
        </div>
        {loadError && <div className="mx-2 mb-2 text-sm px-4 py-2.5 rounded-2xl bg-loss/10 text-loss flex-shrink-0">{loadError}</div>}
        <div className="flex-1 min-h-0">
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
          disabled={selectedCount === 0 || submitting}
          suggestions={SUGGESTIONS}
          placeholder={selectedCount === 0 ? 'Select at least one trade to ask a question…' : 'Ask about the selected trades…'}
        />
        {error && <p className="text-sm text-loss px-1">{error}</p>}
      </div>
    </div>
  );
}
