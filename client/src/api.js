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
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return req(`/trades${qs ? `?${qs}` : ''}`);
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
