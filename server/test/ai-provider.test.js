const test = require('node:test');
const assert = require('node:assert/strict');
const { getStatus, getProvider, defaultProvider, AiError } = require('../ai');

test('no keys -> no providers', () => {
  assert.deepEqual(getStatus({}), { providers: [], default: null });
  assert.equal(defaultProvider({}), null);
});

test('gemini only', () => {
  const s = getStatus({ GEMINI_API_KEY: 'x' });
  assert.deepEqual(s, { providers: [{ id: 'gemini', model: 'gemini-2.5-flash' }], default: 'gemini' });
});

test('both keys -> anthropic default, both listed', () => {
  const s = getStatus({ GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' });
  assert.equal(s.default, 'anthropic');
  assert.deepEqual(s.providers.map((p) => p.id).sort(), ['anthropic', 'gemini']);
  assert.equal(s.providers.find((p) => p.id === 'anthropic').model, 'claude-sonnet-5-5');
});

test('model override', () => {
  const s = getStatus({ GEMINI_API_KEY: 'x', GEMINI_MODEL: 'm' });
  assert.equal(s.providers[0].model, 'm');
});

test('AI_PROVIDER forces default', () => {
  const s = getStatus({ GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y', AI_PROVIDER: 'gemini' });
  assert.equal(s.default, 'gemini');
});

test('AI_PROVIDER=mock', () => {
  const s = getStatus({ AI_PROVIDER: 'mock' });
  assert.equal(s.default, 'mock');
  assert.equal(s.providers.length, 1);
  assert.equal(s.providers[0].id, 'mock');
});

test('getProvider unavailable -> null; mock only when enabled', () => {
  assert.equal(getProvider('anthropic', { GEMINI_API_KEY: 'x' }), null);
  assert.equal(getProvider('mock', {}), null);
  assert.equal(getProvider('gemini', { GEMINI_API_KEY: 'x' }).id, 'gemini');
});

const mock = () => getProvider('mock', { AI_PROVIDER: 'mock' });

test('mock streams chunks matching returned text and context id', async () => {
  const chunks = [];
  const r = await mock().stream({
    system: 's', context: 'SUMMARY\n\nTRADE #5 · x\nNO-TRADE DAY #9', messages: [],
    signal: new AbortController().signal, onText: (t) => chunks.push(t),
  });
  assert.ok(chunks.length >= 3);
  assert.equal(chunks.join(''), r.text);
  assert.ok(r.text.includes('#5'));
});

test('mock honours abort', async () => {
  const ac = new AbortController();
  const p = mock().stream({ system: '', context: 'TRADE #1', messages: [], signal: ac.signal, onText: () => ac.abort() });
  await assert.rejects(p, (e) => e instanceof AiError && e.code === 'aborted');
});

test('mock MOCK_FAIL=1 fails with rate_limit after a chunk', async () => {
  const prev = process.env.MOCK_FAIL;
  process.env.MOCK_FAIL = '1';
  try {
    const chunks = [];
    await assert.rejects(
      mock().stream({ system: '', context: 'TRADE #1', messages: [], onText: (t) => chunks.push(t) }),
      (e) => e.code === 'rate_limit',
    );
    assert.ok(chunks.length >= 1);
  } finally {
    if (prev === undefined) delete process.env.MOCK_FAIL; else process.env.MOCK_FAIL = prev;
  }
});

const { normalizeError, assertNonEmpty } = require('../ai/errors');

test('normalizeError table', () => {
  const abortLike = Object.assign(new Error('x'), { name: 'APIUserAbortError' });
  const rows = [
    [{ status: 401 }, 'auth'],
    [{ status: 403 }, 'auth'],
    [{ status: 429 }, 'rate_limit'],
    [{ status: 400, message: 'bad' }, 'bad_request'],
    [{ status: 400, message: 'API key not valid. Please pass a valid API key.' }, 'auth'],
    [{ status: 400, message: '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}' }, 'auth'],
    [{ status: 500 }, 'unavailable'],
    [Object.assign(new Error('x'), { name: 'AbortError' }), 'aborted'],
    [abortLike, 'aborted'],
    [new Error('fetch failed'), 'unavailable'],
  ];
  for (const [err, code] of rows) assert.equal(normalizeError(err).code, code, JSON.stringify(err.message || err));
});

test('assertNonEmpty throws bad_request with reason, passes non-empty', () => {
  assert.throws(() => assertNonEmpty('  \n', 'SAFETY', 'Gemini'),
    (e) => e instanceof AiError && e.code === 'bad_request' && /SAFETY/.test(e.message));
  assert.throws(() => assertNonEmpty('', 'stop_reason: refusal'), (e) => /refusal/.test(e.message));
  assert.doesNotThrow(() => assertNonEmpty('truncated answer', 'MAX_TOKENS'));
});

test('env hardening: blank, whitespace and inline-comment values count as unset', () => {
  // docker compose keeps `KEY=   # optional` as the literal value '# optional'
  const env = {
    GEMINI_API_KEY: '  g-key  ',
    ANTHROPIC_API_KEY: '# optional',
    GEMINI_MODEL: '   ',
    ANTHROPIC_MODEL: '# optional override',
    AI_PROVIDER: '# optional force: gemini | anthropic | mock',
  };
  assert.deepEqual(getStatus(env), { providers: [{ id: 'gemini', model: 'gemini-2.5-flash' }], default: 'gemini' });
  assert.equal(getProvider('anthropic', env), null);
  assert.equal(getStatus({ ANTHROPIC_API_KEY: '   ' }).default, null);
  assert.equal(getStatus({ GEMINI_API_KEY: 'x', GEMINI_MODEL: ' m2 ' }).providers[0].model, 'm2');
  assert.equal(getStatus({ AI_PROVIDER: ' mock ' }).default, 'mock');
  assert.equal(getStatus({ GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y', AI_PROVIDER: ' gemini ' }).default, 'gemini');
});

test('AI_PROVIDER only forces a provider whose key is set', () => {
  assert.equal(getStatus({ ANTHROPIC_API_KEY: 'y', AI_PROVIDER: 'gemini' }).default, 'anthropic');
});

test('getProvider uses a pinned (stored) model over the env model', () => {
  const env = { GEMINI_API_KEY: 'x', GEMINI_MODEL: 'today-model', ANTHROPIC_API_KEY: 'y' };
  assert.equal(getProvider('gemini', env).model, 'today-model');
  assert.equal(getProvider('gemini', env, { model: 'stored-model' }).model, 'stored-model');
  assert.equal(getProvider('anthropic', env, { model: 'claude-old' }).model, 'claude-old');
  assert.equal(getProvider('gemini', env, { model: null }).model, 'today-model');
});

test('mock echoes a pinned model only when it is not the default', async () => {
  const run = (p) => p.stream({ context: 'TRADE #3', messages: [] });
  const plain = await run(getProvider('mock', { AI_PROVIDER: 'mock' }, { model: 'mock' }));
  assert.ok(!plain.text.includes('[model'));
  const pinned = await run(getProvider('mock', { AI_PROVIDER: 'mock' }, { model: 'mock-pinned' }));
  assert.ok(pinned.text.includes('[model mock-pinned]'));
});
