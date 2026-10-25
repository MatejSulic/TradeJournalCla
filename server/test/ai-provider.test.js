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
