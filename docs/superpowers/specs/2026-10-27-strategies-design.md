# Strategies (Strategy Lab) — design

Date: 2026-10-27
Status: draft, waiting for user review

## Goal

Every trade should meet at least the minimum the trader defined. A **strategy** is a named
checklist built from entry models. When a trade is assigned a strategy, all of its rules must be
satisfied, otherwise the trade cannot be saved.

## Decisions (agreed with the user)

- A strategy is a list of **rules**. Each rule is a set of entry models (**options**). A rule is
  satisfied when the trade has **at least one** of its options (selecting more is allowed).
  - A rule with one option means "this entry model must be present".
  - A rule with several options means "pick at least one of", e.g. `Entry model: IFVG / CISD`.
- A strategy on a trade is **optional**. Without one, the trade behaves as it does today.
- A trade has **at most one** strategy. No-trade days never have one.
- A trade with a strategy may also have **extra** entry models outside the strategy.
- The check runs **on save**, against the strategy's current rules. Changing a strategy later
  does not invalidate existing trades, but editing such a trade re-checks it. The user either
  completes the rules or removes the strategy.
- **Archiving:** an archived strategy is hidden from the TradeForm select, but it stays in
  filters, stats and on existing trades.
- **Last used strategy:** a new trade is prefilled with the strategy used most recently.
- Rules keep the order in which they were added (`sort_order` = index in the editor), with no drag-reorder for now. Strategies are sorted by name.
- Out of scope: free-text rules not tied to entry models, strategy versioning or history, and a
  per-rule breakdown in TradeDetail.

## Data model

New tables in `runSchema()` (`CREATE TABLE IF NOT EXISTS`):

```sql
strategies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
strategy_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  label       TEXT,                       -- optional, e.g. "Entry model"
  sort_order  INTEGER NOT NULL DEFAULT 0  -- index in the submitted rules array
)
strategy_rule_options (
  rule_id        INTEGER NOT NULL REFERENCES strategy_rules(id) ON DELETE CASCADE,
  entry_model_id INTEGER NOT NULL REFERENCES entry_models(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, entry_model_id)
)
```

New column, added in the usual `try { ALTER TABLE … } catch {}` pattern:
`trades.strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL`.

Before the first run against the live DB, back it up via the SQLite backup API
(`server/data/backups/journal_before_strategies_<date>.db`).

**Deleting an entry model** cascades to its rule options. If a rule ends up with no options, it
is deleted too, otherwise the strategy could never be satisfied. `DELETE /api/entry-models/:id`
removes the empty rules in the same transaction.

**Deleting a strategy** sets `strategy_id` to NULL on its trades. The trades and their entry
models stay.

## Server

### `server/strategyRules.js` (pure, unit-tested)

`unmetRules(rules, entryModelIds) → rules[]`, where `rules = [{ id, label, options: [{id, name}] }]`.
It returns the rules that have no option in `entryModelIds`. An empty array means the trade is valid.

### `/api/strategies` (`server/routes/strategies.js`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | All strategies (archived too) with `rules: [{id, label, options: [{id, name}]}]` and `trade_count` |
| POST | `/` | `{name, description, rules: [{label, entry_model_ids: []}]}` → 201 + strategy. 409 on a duplicate name |
| PUT | `/:id` | Same body plus `archived`. Rules are replaced as a whole inside one transaction |
| DELETE | `/:id` | Trades lose the strategy (`SET NULL`) |

Validation: name is required, at least 1 rule, every rule has ≥1 existing entry model.
Otherwise 400.

### `/api/trades`

- POST/PUT accept `strategy_id` (empty value = none). For `day_type = 'notrade'`,
  `tradeValues()` forces it to NULL.
- When a strategy is set: load its rules, run `unmetRules` against the submitted
  `entry_model_ids`, and if anything is unmet return **400** `{ error: 'Strategy rules not met: …',
  unmet: [labels or option names] }`. An unknown `strategy_id` also returns 400.
- An archived strategy is still accepted, so editing old trades keeps working.
- GET `/` gets the filter `strategy_id` (a number, or `none` for trades without a strategy).
- Every returned trade includes `strategy: { id, name } | null`, in the same `withModels`-style
  helper.

### Other

- `server/ai/context.js`: adds the line `Strategy: <name>` to each trade that has one.
- Backup/restore needs no change (the tables live in the DB, and migrations run after `reinitDb()`).

## Client

### `api.js`
`getStrategies`, `createStrategy`, `updateStrategy`, `deleteStrategy`.

### Strategy Lab — `/strategies` (`pages/StrategyLab.jsx`)
- Sidebar link **Strategy Lab**, placed under Series.
- Strategy cards: name, description, rules (`Liquidity sweep`, `Entry model: IFVG / CISD`),
  trade count, Archived badge. Archived strategies sit at the bottom, dimmed (or behind a
  "Show archived" toggle).
- Editor (inline in the card, or a panel like Series): name, description, rules. Each rule has
  an optional label plus entry models as clickable pills. Buttons: **+ Add rule**, rule delete,
  inline entry model creation (`createEntryModel`).
- Actions: Archive / Unarchive, Delete (via `ConfirmDialog`: "N trades will lose this strategy").
- Light and dark theme, built from the existing tokens and classes (`.card`, `.seg`, `.btn-*`).

### TradeForm (col 1, Entry Models card)
- **Strategy** select at the top: `None` + active (non-archived) strategies. When editing a
  trade whose strategy is archived, that strategy is still shown.
- New trade: prefilled from `localStorage('lastStrategyId')` when that strategy exists and is
  not archived. A successful save of a trade updates the value (`None` clears it).
- With a strategy picked, the card shows a **checklist** of its rules. A rule's pills toggle the
  same `selectedModelIds` as before (one source of truth). Below it come the **Other entry
  models** (those not in any of the strategy's rules), optional. Inline add/delete of
  entry models stays in the "other" section; drag-reorder works only with Strategy = None
  (the filtered list would break the index-based drop).
- An unmet rule is marked in the loss colour. The header shows the error
  `N strategy rule(s) unmet`, and Save plus Ctrl/Cmd+Enter are blocked. A server 400 shows up
  as a regular error.
- Header summary chips gain a chip with the strategy name.
- No-trade mode hides the strategy, and the submit sends nothing.

### Filters
- `TradeFilters.jsx` (Dashboard + AI Analyst): a **Strategy** select (All / No strategy /
  each strategy), URL param `strategy_id`, a chip when active, passed through to the API.
- `TradeList.jsx`: the same filter, plus a **Strategy** column.
- `aiFilters.js` needs no change (it carries all params generically). Verify that the conversation
  snapshot stores `strategy_id`.

### Dashboard — TopSetups card
- Third tab **Strategies** (`localStorage setupsTab` gains the value `strategies`). For each
  strategy present in `displayTrades`: win rate (wins / (wins+losses)) as a progress bar, Net R
  (same formula as `computeStats`), trade count. Sorted by trade count. Trades without a
  strategy go in a muted **No strategy** row at the end. Win rate <50% uses the loss colour,
  like Top Setups.

### TradeDetail
- Shows the strategy name (when present) next to the entry models.

## Errors and edge cases

| Situation | Behaviour |
|---|---|
| Strategy deleted while TradeForm is open | Save → 400 unknown strategy → error, user picks another one |
| `lastStrategyId` points to a deleted or archived strategy | Ignored, `None` is preselected |
| Entry model deleted from TradeForm while it is an option in the selected strategy | Strategies are reloaded after the delete, so the checklist reflects reality |
| Strategy has rules with deleted options | Empty rules are deleted together with the entry model, so this cannot happen |
| Switching trade → no-trade | `strategy_id` is dropped (along with entry models, as today) |

## Testing

- `server/test/strategyRules.test.js`: single-option rule, multi-option rule (none / one / both
  selected), extra models do not matter, empty rule list.
- `scripts/dev/api-smoke.sh`: strategy CRUD, a trade with unmet rules → 400, with met rules →
  201 + `strategy` in GET, the `strategy_id` filter (including `none`), deleting a strategy →
  trade has `strategy: null`, deleting an entry model removes an empty rule.
- `screenshots.mjs`: new page `strategies`, plus TradeForm with a strategy checklist; light/dark ×
  1600/1366, no page scroll on TradeForm.
- Everything runs only against a scratch DB, never the live one.

## Docs
Update `CLAUDE.md` (schema, API, routes, TradeForm, Dashboard) and `README.md`.
