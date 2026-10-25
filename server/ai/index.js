const { AiError } = require('./errors');

const DEFAULT_MODELS = { gemini: 'gemini-2.5-flash', anthropic: 'claude-sonnet-5-5' };
const KEYS = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const MODEL_VARS = { gemini: 'GEMINI_MODEL', anthropic: 'ANTHROPIC_MODEL' };

function modelFor(id, env) {
  return env[MODEL_VARS[id]] || DEFAULT_MODELS[id];
}

function availableIds(env) {
  if (env.AI_PROVIDER === 'mock') return ['mock'];
  return ['anthropic', 'gemini'].filter((id) => env[KEYS[id]]);
}

function getStatus(env = process.env) {
  const ids = availableIds(env);
  const providers = ids.map((id) => ({ id, model: id === 'mock' ? 'mock' : modelFor(id, env) }));
  let def = ids[0] || null; // anthropic -> gemini order
  if (env.AI_PROVIDER && ids.includes(env.AI_PROVIDER)) def = env.AI_PROVIDER;
  return { providers, default: def };
}

function getProvider(id, env = process.env) {
  if (!availableIds(env).includes(id)) return null;
  if (id === 'mock') return require('./mock').create(env);
  return require('./' + id).create({ apiKey: env[KEYS[id]], model: modelFor(id, env) });
}

function defaultProvider(env = process.env) {
  const { default: d } = getStatus(env);
  return d ? getProvider(d, env) : null;
}

module.exports = { getStatus, getProvider, defaultProvider, AiError };
