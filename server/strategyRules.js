// A strategy rule is met when the trade has at least one of its options (entry models).
// Mirrored in client/src/strategyRules.js — keep both in sync.

// Rules (same order) with no option among the trade's entry model ids (numbers or numeric strings)
function unmetRules(rules, entryModelIds) {
  const have = new Set((entryModelIds || []).map(Number));
  return (rules || []).filter(r => !(r.options || []).some(o => have.has(Number(o.id))));
}

// Display name: the label, or the option names ("IFVG / CISD")
function ruleLabel(rule) {
  return rule.label?.trim() || (rule.options || []).map(o => o.name).join(' / ');
}

module.exports = { unmetRules, ruleLabel };
