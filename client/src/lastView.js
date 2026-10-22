// Remembers the last URL (incl. filters in the query string) of the list pages, so Back / Save / sidebar
// return to the same filtered view. sessionStorage = per browser tab, survives reloads.
const LIST_PATHS = ['/dashboard', '/trades'];

const read = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export function rememberView(location) {
  if (!LIST_PATHS.includes(location.pathname)) return;
  const url = location.pathname + location.search;
  write(`view:${location.pathname}`, url);
  write('view:last', url);
}

// Last remembered URL of one list page (e.g. '/dashboard'), or the bare path
export const viewUrl = path => read(`view:${path}`) || path;

// The list page the user came from most recently
export const lastListUrl = (fallback = '/dashboard') => read('view:last') || fallback;
