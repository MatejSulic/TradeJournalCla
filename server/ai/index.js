const { AiError } = require('./errors');

const DEFAULT_MODELS = { gemini: 'gemini-2.5-flash', anthropic: 'claude-sonnet-5-5' };
const KEYS = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const MODEL_VARS = { gemini: 'GEMINI_MODEL', anthropic: 'ANTHROPIC_MODEL' };

// Trimmed env value; empty or `#…` (an inline comment some .env parsers keep as the value) = unset
function envValue(env, name) {
  const v = typeof env[name] === 'string' ? env[name].trim() : '';
  return v && !v.startsWith('#') ? v : '';
}

function modelFor(id, env) {
  return envValue(env, MODEL_VARS[id]) || DEFAULT_MODELS[id];
}

function availableIds(env) {
  if (envValue(env, 'AI_PROVIDER') === 'mock') return ['mock'];
  return ['anthropic', 'gemini'].filter((id) => envValue(env, KEYS[id]));
}

function getStatus(env = process.env) {
  const ids = availableIds(env);
  const providers = ids.map((id) => ({ id, model: id === 'mock' ? 'mock' : modelFor(id, env) }));
  let def = ids[0] || null; // anthropic -> gemini order
  const forced = envValue(env, 'AI_PROVIDER');
  if (forced && ids.includes(forced)) def = forced;
  return { providers, default: def };
}

/**
 * Adapter for provider `id`, or null if it is not configured.
 * `opts.model` pins the model (e.g. the one stored on a conversation); otherwise env / default.
 */
function getProvider(id, env = process.env, opts = {}) {
  if (!availableIds(env).includes(id)) return null;
  if (id === 'mock') return require('./mock').create(env, { model: opts.model });
  return require('./' + id).create({ apiKey: envValue(env, KEYS[id]), model: opts.model || modelFor(id, env) });
}

function defaultProvider(env = process.env) {
  const { default: d } = getStatus(env);
  return d ? getProvider(d, env) : null;
}

module.exports = { getStatus, getProvider, defaultProvider, AiError };
