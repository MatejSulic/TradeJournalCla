class AiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AiError';
    this.code = code; // auth | rate_limit | unavailable | bad_request | aborted
  }
}

// Map an SDK error (anything with a numeric `status`) to an AiError.
function normalizeError(err, signal) {
  if (err instanceof AiError) return err;
  if (signal && signal.aborted) return new AiError('aborted', 'Request aborted');
  if (err && (err.name === 'AbortError' || err.name === 'APIUserAbortError')) return new AiError('aborted', 'Request aborted');
  const s = err && err.status;
  const msg = (err && err.message) || 'AI provider error';
  if (s === 401 || s === 403) return new AiError('auth', msg);
  if (s === 429) return new AiError('rate_limit', msg);
  if (s === 400 || s === 404 || s === 422) return new AiError('bad_request', msg);
  return new AiError('unavailable', msg); // 5xx, network, unknown
}

module.exports = { AiError, normalizeError };
