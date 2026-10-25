class AiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AiError';
    this.code = code; // auth | rate_limit | unavailable | bad_request | aborted
  }
}

// SDK messages are often a JSON body (sometimes JSON inside JSON) — dig out the human sentence.
function readableMessage(msg) {
  let m = msg;
  for (let i = 0; i < 3 && typeof m === 'string'; i++) {
    const start = m.indexOf('{');
    if (start === -1) break;
    try {
      const j = JSON.parse(m.slice(start));
      const inner = (j.error && (j.error.message ?? j.error)) ?? j.message;
      if (typeof inner !== 'string') break;
      m = inner;
    } catch { break; }
  }
  return m;
}

// Map an SDK error (anything with a numeric `status`) to an AiError.
function normalizeError(err, signal) {
  if (err instanceof AiError) return err;
  if (signal && signal.aborted) return new AiError('aborted', 'Request aborted');
  if (err && (err.name === 'AbortError' || err.name === 'APIUserAbortError')) return new AiError('aborted', 'Request aborted');
  const s = err && err.status;
  const msg = readableMessage((err && err.message) || 'AI provider error');
  if (s === 401 || s === 403) return new AiError('auth', msg);
  if (s === 429) return new AiError('rate_limit', msg);
  if (s === 400 && /API_KEY_INVALID|API key not valid|invalid api key/i.test(msg + ' ' + (err.statusText || ''))) return new AiError('auth', msg);
  if (s === 400 || s === 404 || s === 422) return new AiError('bad_request', msg);
  return new AiError('unavailable', msg); // 5xx, network, unknown
}

// Throw bad_request when the final text is empty (blocked / refused / filtered).
function assertNonEmpty(text, reason, who = 'the model') {
  if (text && text.trim()) return;
  throw new AiError('bad_request', `Empty response from ${who}` + (reason ? ` (${reason})` : ''));
}

module.exports = { AiError, normalizeError, assertNonEmpty, readableMessage };
