const BASE = '/api';

async function req(path, options = {}) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Trades
export const getTrades = (params = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) v.forEach(item => qs.append(k, item));
    else qs.append(k, v);
  }
  const str = qs.toString();
  return req(`/trades${str ? `?${str}` : ''}`);
};
export const getTrade = (id) => req(`/trades/${id}`);

export const createTrade = (formData) =>
  req('/trades', { method: 'POST', body: formData });

export const updateTrade = (id, formData) =>
  req(`/trades/${id}`, { method: 'PUT', body: formData });

export const deleteTrade = (id) =>
  req(`/trades/${id}`, { method: 'DELETE' });

export async function downloadBackup() {
  const res = await fetch('/api/backup');
  if (!res.ok) throw new Error('Backup download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ascend_backup_${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(file) {
  const formData = new FormData();
  formData.append('backup', file);
  const res = await fetch('/api/backup', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Series
export const getSeries    = ()         => req('/series');
export const createSeries = (data)     => req('/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const updateSeries = (id, data) => req(`/series/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const deleteSeries = (id)       => req(`/series/${id}`, { method: 'DELETE' });

// Expenses — prop firm accounts & payouts
export const getExpenseAccounts = () => req('/expenses/accounts');
export const createExpenseAccount = (data) =>
  req('/expenses/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const updateExpenseAccount = (id, data) =>
  req(`/expenses/accounts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const deleteExpenseAccount = (id) =>
  req(`/expenses/accounts/${id}`, { method: 'DELETE' });
export const createPayout = (accountId, data) =>
  req(`/expenses/accounts/${accountId}/payouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export const deletePayout = (id) =>
  req(`/expenses/payouts/${id}`, { method: 'DELETE' });

// Entry models
export const getEntryModels = () => req('/entry-models');
export const createEntryModel = (name) =>
  req('/entry-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
export const deleteEntryModel = (id) =>
  req(`/entry-models/${id}`, { method: 'DELETE' });
export const reorderEntryModels = (items) =>
  req('/entry-models/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  });

// AI Analyst
const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export const getAiStatus = () => req('/ai/status');
export const estimateAi = ({ trade_ids, notrade_ids }) => req('/ai/estimate', json('POST', { trade_ids, notrade_ids }));
export const getAiConversations = () => req('/ai/conversations');
export const getAiConversation = (id) => req(`/ai/conversations/${id}`);
export const createAiConversation = ({ trade_ids, notrade_ids, filters, title }) =>
  req('/ai/conversations', json('POST', { trade_ids, notrade_ids, filters, title }));
export const renameAiConversation = (id, title) => req(`/ai/conversations/${id}`, json('PATCH', { title }));
export const deleteAiConversation = (id) => req(`/ai/conversations/${id}`, { method: 'DELETE' });

const aiError = (code, message) => Object.assign(new Error(message || 'AI request failed'), { code, isAiError: true });

/**
 * Sends a message (`{ content }`) or retries the last one (`{ retry: true }`) and reads the SSE answer.
 * Calls `onDelta(text)` per chunk; resolves with the saved assistant message; rejects with an Error that has
 * `.code` ('busy' / 'http' for validation errors before the stream, provider code for stream errors,
 * 'aborted' when `signal` aborts, 'stream' when the stream ends without a result).
 */
export async function streamAiMessage(id, body, { onDelta, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/ai/conversations/${id}/messages`, { ...json('POST', body), signal });
  } catch (err) {
    throw aiError(err.name === 'AbortError' ? 'aborted' : 'network', err.name === 'AbortError' ? 'Aborted' : err.message);
  }
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw aiError(err.error === 'busy' ? 'busy' : 'http', err.error === 'busy' ? 'Another answer is still being generated' : (err.error || res.statusText));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) buffer += decoder.decode();
      // Complete events are separated by a blank line; keep the trailing partial event in the buffer
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
        if (!data) continue;
        let event;
        try { event = JSON.parse(data); } catch { continue; }
        if (event.type === 'delta') onDelta?.(event.text);
        else if (event.type === 'done') { reader.cancel().catch(() => {}); return event.message; }
        else if (event.type === 'error') { reader.cancel().catch(() => {}); throw aiError(event.code || 'unavailable', event.message); }
      }
      if (done) break;
    }
  } catch (err) {
    if (err.isAiError) throw err;
    throw aiError(err.name === 'AbortError' || signal?.aborted ? 'aborted' : 'stream', err.message);
  }
  throw aiError(signal?.aborted ? 'aborted' : 'stream', signal?.aborted ? 'Aborted' : 'The answer stream ended unexpectedly');
}
