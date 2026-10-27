const test = require('node:test');
const assert = require('node:assert/strict');
const { unmetRules, ruleLabel } = require('../strategyRules');

const sweep = { id: 1, label: null, options: [{ id: 10, name: 'Sweep' }] };
const entry = { id: 2, label: 'Entry model', options: [{ id: 20, name: 'IFVG' }, { id: 21, name: 'CISD' }] };
const rules = [sweep, entry];

test('all met (one of group)', () => assert.deepEqual(unmetRules(rules, [10, 21]), []));
test('both group options is fine', () => assert.deepEqual(unmetRules(rules, [10, 20, 21]), []));
test('extra models do not matter', () => assert.deepEqual(unmetRules(rules, [10, 20, 99]), []));
test('missing group', () => assert.deepEqual(unmetRules(rules, [10]), [entry]));
test('nothing selected', () => assert.deepEqual(unmetRules(rules, []), [sweep, entry]));
test('string ids', () => assert.deepEqual(unmetRules(rules, ['10', '20']), []));
test('no rules', () => assert.deepEqual(unmetRules([], []), []));
test('labels', () => {
  assert.equal(ruleLabel(entry), 'Entry model');
  assert.equal(ruleLabel({ label: '  ', options: [{ id: 20, name: 'IFVG' }, { id: 21, name: 'CISD' }] }), 'IFVG / CISD');
});
