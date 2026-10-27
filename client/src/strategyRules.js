// A strategy rule is met when the trade has at least one of its options (entry models).
// Keep in sync with server/strategyRules.js.

// Rules (same order) with no option among the trade's entry model ids (numbers or numeric strings)
export function unmetRules(rules, entryModelIds) {
  const have = new Set((entryModelIds || []).map(Number));
  return (rules || []).filter(r => !(r.options || []).some(o => have.has(Number(o.id))));
}

// Display name: the label, or the option names ("IFVG / CISD")
export function ruleLabel(rule) {
  return rule.label?.trim() || (rule.options || []).map(o => o.name).join(' / ');
}
