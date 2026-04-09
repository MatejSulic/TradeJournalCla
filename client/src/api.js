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
export const getStats = () => req('/trades/stats');
export const getEquity = () => req('/trades/equity');

export const createTrade = (formData) =>
  req('/trades', { method: 'POST', body: formData });

export const updateTrade = (id, formData) =>
  req(`/trades/${id}`, { method: 'PUT', body: formData });

export const deleteTrade = (id) =>
  req(`/trades/${id}`, { method: 'DELETE' });

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
