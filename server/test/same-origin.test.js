const test = require('node:test');
const assert = require('node:assert/strict');
const { isCrossOrigin } = require('../sameOrigin');

const req = (method, headers = {}) => ({ method, headers: { host: '127.0.0.1:7420', ...headers } });

test('safe methods are never blocked', () => {
  assert.equal(isCrossOrigin(req('GET', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })), false);
});

test('Sec-Fetch-Site: only same-origin / none allowed for writes', () => {
  assert.equal(isCrossOrigin(req('POST', { 'sec-fetch-site': 'same-origin' })), false);
  assert.equal(isCrossOrigin(req('POST', { 'sec-fetch-site': 'none' })), false);
  assert.equal(isCrossOrigin(req('POST', { 'sec-fetch-site': 'cross-site' })), true);
  assert.equal(isCrossOrigin(req('DELETE', { 'sec-fetch-site': 'same-site' })), true);
});

test('Origin fallback compares against Host; no headers (curl) allowed', () => {
  assert.equal(isCrossOrigin(req('POST')), false);
  assert.equal(isCrossOrigin(req('POST', { origin: 'http://127.0.0.1:7420' })), false);
  assert.equal(isCrossOrigin(req('POST', { origin: 'https://evil.example' })), true);
  assert.equal(isCrossOrigin(req('PATCH', { origin: 'null' })), true);
});
