const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const { resolvePaths } = require('../paths');

const SERVER_DIR = path.join(__dirname, '..');

test('no DB_PATH -> server/data/journal.db + server/uploads (unchanged)', () => {
  const p = resolvePaths({}, SERVER_DIR);
  assert.strictEqual(p.DB_PATH, path.join(SERVER_DIR, 'data', 'journal.db'));
  assert.strictEqual(p.UPLOADS_DIR, path.join(SERVER_DIR, 'uploads'));
});

test('DB_PATH set -> uploads next to the scratch DB, never server/uploads', () => {
  const tmp = path.join(os.tmpdir(), 'ascend-scratch');
  const p = resolvePaths({ DB_PATH: path.join(tmp, 'journal.db') }, SERVER_DIR);
  assert.strictEqual(p.DB_PATH, path.join(tmp, 'journal.db'));
  assert.strictEqual(p.UPLOADS_DIR, path.join(tmp, 'uploads'));
  assert.notStrictEqual(p.UPLOADS_DIR, path.join(SERVER_DIR, 'uploads'));
});

test('DB_PATH relative is resolved; UPLOADS_DIR override wins', () => {
  const p = resolvePaths({ DB_PATH: 'x/j.db', UPLOADS_DIR: 'y/up' }, SERVER_DIR);
  assert.strictEqual(p.DB_PATH, path.resolve('x/j.db'));
  assert.strictEqual(p.UPLOADS_DIR, path.resolve('y/up'));
});

test('UPLOADS_DIR alone (no DB_PATH) is ignored', () => {
  const p = resolvePaths({ UPLOADS_DIR: '/elsewhere' }, SERVER_DIR);
  assert.strictEqual(p.UPLOADS_DIR, path.join(SERVER_DIR, 'uploads'));
});
