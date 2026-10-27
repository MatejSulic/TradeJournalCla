# Strategies (Strategy Lab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the trader build strategies from entry models (rules with "at least one of" options) in a new Strategy Lab page. A trade assigned a strategy can only be saved when every rule is met.

**Architecture:** Three new tables (`strategies`, `strategy_rules`, `strategy_rule_options`) plus `trades.strategy_id`. One pure function `unmetRules` (server, mirrored on the client) decides validity. The server enforces it on trade POST/PUT, and TradeForm shows it live as a checklist. Ticked rule options are ordinary `trade_entry_models` rows, so existing entry-model filters, Top Setups and AI keep working.

**Tech Stack:** Express + better-sqlite3 (CommonJS), React 18 + Vite + Tailwind (ESM), node:test, bash smoke test.

**Spec:** `docs/superpowers/specs/2026-10-27-strategies-design.md`

## Global Constraints

- Work on branch `feat/strategies`. Commit after each task. Never push unless the user asks. Never `git add` `README.md`/`LICENSE` changes that were already uncommitted on main before this work (`git add` explicit paths only).
- **Never touch the live DB** (`server/data/journal.db`) before Task 8. Do not run `npm run dev`, do not `require('./server/db')`, do not `node -e` a route. Verify with `scripts/dev/api-smoke.sh` or a scratch server: `DB_PATH=<scratchpad>/x/journal.db AI_PROVIDER=mock PORT=3998 node server/index.js`.
- Migrations follow the existing pattern: `CREATE TABLE IF NOT EXISTS` in `runSchema()`, new columns via `try { db.exec('ALTER TABLE … ADD COLUMN …') } catch (_) {}`.
- UI: English texts, theme tokens only (no hex), works in light and dark, `ConfirmDialog` for destructive actions, no nested `<form>`, buttons inside forms are `type="button"`.
- Timestamps use the existing default `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`.
- API strategy shape (everywhere): `{ id, name, description, archived: boolean, created_at, updated_at, trade_count, rules: [{ id, label, options: [{ id, name }] }] }`. Rules are ordered by `sort_order, id`, options by the entry models' `sort_order, name`.
- Trade rows from `/api/trades` carry `strategy: { id, name } | null` (and keep `strategy_id`).

## Review Focus

1. **A single entry model in multipart arrives as a string, not an array, and ids are strings.** Validation must still see it. → Task 3 smoke: a strategy with one rule, the trade sends exactly one `entry_model_ids` → 201.
2. **A PUT without `strategy_id` clears the strategy** (TradeForm omits empty fields when you pick "None"). → Task 3 smoke.
3. **Switching a trade with a strategy to a no-trade day** must drop the strategy along with the entry models. → Task 3 smoke.
4. **Deleting an entry model that is the only option of a rule** must delete that rule, so trades can still satisfy the strategy. → Task 2 smoke.
5. **Editing an old trade whose strategy was archived** must keep the strategy selectable and savable. → Task 3 smoke (PUT with an archived strategy → 200). Task 5: the select includes the trade's archived strategy.

---

### Task 1: Rule check (pure function, server + client)

**Files:**
- Create: `server/strategyRules.js`
- Create: `client/src/strategyRules.js` (ESM mirror, header comment `// Keep in sync with server/strategyRules.js`)
- Test: `server/test/strategy-rules.test.js`

**Interfaces:**
- Produces: `unmetRules(rules, entryModelIds) → rule[]` (subset of `rules`, same order). `entryModelIds` may contain numbers or numeric strings. `ruleLabel(rule) → string` = `rule.label` if non-blank, else option names joined with `' / '`.

- [ ] **Step 1: Create the branch** — `git switch -c feat/strategies`

- [ ] **Step 2: Write the failing test** `server/test/strategy-rules.test.js`

```js
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
```

- [ ] **Step 3: Run** `cd server && npm test` → FAIL (`Cannot find module '../strategyRules'`).

- [ ] **Step 4: Implement** both files (`module.exports = { unmetRules, ruleLabel }` / `export function …`). Compare ids with `Number()`.

- [ ] **Step 5: Run** `cd server && npm test` → all pass.

- [ ] **Step 6: Commit** `feat(strategies): rule check helper` (both files + test). Before that, commit the spec and this plan separately as `docs: strategies spec and plan`.

---

### Task 2: Schema, strategies API, entry-model delete cleanup

**Files:**
- Modify: `server/db.js` (`runSchema()`: 3 tables from the spec + `ALTER TABLE trades ADD COLUMN strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL`)
- Create: `server/strategyStore.js`
- Create: `server/routes/strategies.js`
- Modify: `server/index.js` (mount `/api/strategies` next to `/api/series`)
- Modify: `server/routes/entryModels.js` (DELETE)
- Modify: `scripts/dev/api-smoke.sh` (it copies `server/*.js`, so the new store file is included automatically)

**Interfaces:**
- Consumes: none from Task 1.
- Produces (`server/strategyStore.js`, requires `./db`):
  - `listStrategies() → strategy[]` (shape from Global Constraints, sorted by `name COLLATE NOCASE`; `trade_count` = trades with that `strategy_id`)
  - `getStrategy(id) → strategy | null`
  - `saveStrategy(id|null, { name, description, archived, rules: [{ label, entry_model_ids }] }) → strategy`. Throws `{ status: 400|404|409, message }`-style errors (route maps them). Replaces rules inside one `db.transaction`. `sort_order` = array index.

- [ ] **Step 1: Write the failing smoke section** in `scripts/dev/api-smoke.sh` (before the AI section; use the existing `req`/`json`/`ok`/`fail` helpers; send JSON with `-H 'Content-Type: application/json' -d …`). Create two entry models via `POST /api/entry-models` (unique names with `$$` suffix), then assert:
  - `POST /api/strategies` with no rules → 400; with a rule whose `entry_model_ids` is `[]` → 400; empty name → 400.
  - `POST` `{name:"S$$", rules:[{label:null, entry_model_ids:[A]}, {label:"Entry", entry_model_ids:[A,B]}]}` → 201, `rules.length==2`, `rules[1].options.length==2`, `archived===false`, `trade_count===0`.
  - Same name again → 409.
  - `PUT /api/strategies/:id` `{…, archived:true, rules:[{label:"Entry", entry_model_ids:[A,B]}]}` → 200, `archived===true`, `rules.length==1`.
  - `GET /api/strategies` contains it.
  - Create a strategy with a single-option rule `[B]` + a rule `[A]`, then `DELETE /api/entry-models/B` → `GET /api/strategies/:id` has exactly 1 rule (the `[A]` one).
  - `DELETE /api/strategies/:id` → 200, then `GET /api/strategies/:id` → 404.

- [ ] **Step 2: Run** `scripts/dev/api-smoke.sh` → FAIL at the first strategies assertion (404).

- [ ] **Step 3: Implement** the schema, `strategyStore.js` and the routes:
  - `GET /` → `listStrategies()`, `GET /:id` → 404 when missing, `POST /` → 201, `PUT /:id`, `DELETE /:id` → `{ ok: true }`.
  - Validation in `saveStrategy`: trimmed `name` required. `rules` must be a non-empty array. Each rule keeps only `entry_model_ids` that exist in `entry_models` and must keep ≥1, else 400 `every rule needs at least one entry model`. UNIQUE → 409 `already exists`. `label` is trimmed, blank → NULL. `PUT` also bumps `updated_at`.

- [ ] **Step 4: Entry-model DELETE**: in one transaction delete the model, then `DELETE FROM strategy_rules WHERE id NOT IN (SELECT rule_id FROM strategy_rule_options)`.

- [ ] **Step 5: Run** `scripts/dev/api-smoke.sh` → all ok. `cd server && npm test` → pass.

- [ ] **Step 6: Commit** `feat(strategies): schema and /api/strategies`.

---

### Task 3: Trades: save, validate, filter, return strategy + AI context

**Files:**
- Modify: `server/routes/trades.js`
- Modify: `server/routes/ai.js` (`loadRows`: `LEFT JOIN strategies st ON st.id = t.strategy_id`, select `st.name AS strategy_name`)
- Modify: `server/ai/context.js` (`serializeTrade`: after `Series:` push `Strategy: <name>` into the head when `t.strategy_name`)
- Test: `server/test/ai-context.test.js`, `scripts/dev/api-smoke.sh`

**Interfaces:**
- Consumes: `unmetRules`, `ruleLabel` (Task 1); `getStrategy(id)` (Task 2).
- Produces: trade JSON field `strategy: { id, name } | null`; `GET /api/trades?strategy_id=<id>|none`.

- [ ] **Step 1: Failing unit test** in `ai-context.test.js`: a trade with `strategy_name: 'London'` → serialized head line contains `· Strategy: London`.

- [ ] **Step 2: Failing smoke section** (after the Task 2 section). Create models A, B and a strategy `{rules:[{entry_model_ids:[A]}, {label:"Entry", entry_model_ids:[B]}]}`, then assert:
  - POST trade (`TRADE_F` + `-F strategy_id=$SID -F entry_model_ids=$A`) → 400, body `error` contains `Entry`.
  - POST with `entry_model_ids=$A` and `entry_model_ids=$B` → 201, `j.strategy.id==SID`, `j.strategy.name` set.
  - A strategy with **one** rule `[A]` + a trade sending a single `entry_model_ids=$A` → 201 (Review Focus 1).
  - `strategy_id=999999` → 400.
  - `GET /api/trades?strategy_id=$SID` → every row has `strategy.id==SID` and length ≥1. `?strategy_id=none` → every row has `strategy===null`.
  - Archive the strategy (PUT), then PUT the trade with the same strategy + both models → 200 (Review Focus 5).
  - PUT the trade without `strategy_id` → 200, `strategy===null` (Review Focus 2).
  - Give it the strategy again, then PUT as `day_type=notrade` (new date, unique per run) → `strategy===null`, `entry_models.length==0` (Review Focus 3).
  - `DELETE /api/strategies/$SID` → the remaining trade with that strategy now has `strategy===null`.

- [ ] **Step 3: Run** `cd server && npm test` and `scripts/dev/api-smoke.sh` → both FAIL on the new assertions.

- [ ] **Step 4: Implement** in `trades.js`:
  - Add `'strategy_id'` to `TRADE_COLUMNS`. In `tradeValues`: no-trade → `null`, trade → `body.strategy_id ? Number(body.strategy_id) : null`.
  - New `strategyError(v, entry_model_ids) → string|null`: when `v.strategy_id` is set, `getStrategy` it (missing → `'unknown strategy'`), normalise ids like `saveEntryModels`, and if `unmetRules` returns any → `` `Strategy rules not met: ${unmet.map(ruleLabel).join(', ')}` ``. Call it in POST and PUT right after `duplicateNoTradeError`, rejecting through `rejectWithCleanup`.
  - `hydrateTrade`: add `strategy: trade.strategy_id ? db.prepare('SELECT id, name FROM strategies WHERE id = ?').get(trade.strategy_id) ?? null : null`.
  - GET filter: `strategy_id === 'none'` → `AND t.strategy_id IS NULL`, else `AND t.strategy_id = ?` (Number).

- [ ] **Step 5: Run** both → pass.

- [ ] **Step 6: Commit** `feat(strategies): enforce strategy rules on trades, filter, AI context`.

---

### Task 4: Client API + Strategy Lab page

**Files:**
- Modify: `client/src/api.js` (`getStrategies`, `getStrategy(id)`, `createStrategy(data)`, `updateStrategy(id, data)`, `deleteStrategy(id)`, same style as the Series helpers)
- Create: `client/src/pages/StrategyLab.jsx`
- Modify: `client/src/App.jsx` (route `/strategies`)
- Modify: `client/src/components/Layout.jsx` (link `{ to: '/strategies', label: 'Strategy Lab', icon: … }` right after Series; a new inline SVG icon in the same style as the others, e.g. a flask or checklist)
- Modify: `scripts/dev/screenshots.mjs` (page `['strategies', '/strategies']`)

**Interfaces:**
- Consumes: `/api/strategies` (Task 2), `getEntryModels`, `createEntryModel` (existing), `ruleLabel` from `client/src/strategyRules.js`.
- Produces: api helpers used by Tasks 5–7.

- [ ] **Step 1: Build `StrategyLab.jsx`** following the layout and patterns of `pages/Series.jsx`:
  - Header: title **Strategy Lab**, subtitle `Build checklists from your entry models — a trade with a strategy can only be saved when every rule is met.`, primary button **New Strategy**.
  - Editor card (create or edit, one at a time). Fields:
    - Name input, Description textarea.
    - Rules list. Each rule: label input (placeholder `Label (optional, e.g. Entry model)`), all entry models as toggle pills (active = `bg-accent text-white`, like TradeForm), ✕ remove button, and a hint `Any one of these` when ≥2 options are selected.
    - **+ Add rule**, inline `New entry model…` input + **Add** (`createEntryModel`, then append to the list).
    - Save / Cancel. Server errors shown inline in loss colour.
  - Strategy cards: name, description, rules as `ruleLabel(rule)`, plus the option names when a label is set (e.g. `Entry model: IFVG / CISD`), `N trades`, **Archived** badge. Actions: Edit, Archive/Unarchive (`updateStrategy` with `archived` toggled and the rules passed back as `{label, entry_model_ids}`), Delete → `ConfirmDialog` (`"<name>" will be removed from N trades. The trades and their entry models stay.`).
  - Archived strategies are hidden behind a `Show archived (N)` toggle at the bottom.
  - Empty state: short explainer + New Strategy.

- [ ] **Step 2: Verify** with a scratch server (Global Constraints) and the dev client `cd client && API_TARGET=http://127.0.0.1:3998 npx vite --port 5190`. Then:
  - create a strategy with a 2-option rule, edit it, archive it, unarchive it, delete it;
  - `node scripts/dev/screenshots.mjs <scratchpad>/shots http://127.0.0.1:5190 --only=strategies` → no console errors, check light + dark.

- [ ] **Step 3: Commit** `feat(strategies): Strategy Lab page`.

---

### Task 5: TradeForm strategy select + checklist

**Files:**
- Create: `client/src/components/StrategyChecklist.jsx`
- Modify: `client/src/pages/TradeForm.jsx`

**Interfaces:**
- Consumes: `getStrategies` (Task 4), `unmetRules`, `ruleLabel` (Task 1 client mirror), trade `strategy_id` from `GET /api/trades/:id` (Task 3).
- Produces: `<StrategyChecklist strategy selectedIds onToggle />`: renders each rule as a row with its label (`ruleLabel`) and the option pills. A rule with ≥2 options shows the hint `pick at least one`. A met rule shows a ✓ in accent, an unmet one its label in `text-loss`. Pills call `onToggle(entryModelId)`.

- [ ] **Step 1: Implement** in TradeForm:
  - Load state `strategies` via `getStrategies()` on mount. Reload it after an entry model is deleted.
  - `fields.strategy_id` (string, `''` = None). Edit: from the loaded trade. New: from `localStorage('lastStrategyId')` when it matches a non-archived strategy (wrap in try/catch).
  - Select at the top of the Entry Models card: `None` + non-archived strategies + the current trade's strategy even when archived (suffix ` (archived)`).
  - With a strategy selected: render `StrategyChecklist`, then a sub-heading **Other entry models** and the existing pill list filtered to models not in any rule's options. Drag-reorder is **disabled while a strategy is selected** (filtered indices would break `handleDrop`); with None the card is unchanged.
  - `unmet = strategy ? unmetRules(strategy.rules, selectedModelIds) : []`. In `handleSubmit` (trade mode) when `unmet.length`: `setError(\`${n} strategy rule${n === 1 ? '' : 's'} unmet\`)` and return. That also covers Ctrl+Enter.
  - The no-trade mode hides the strategy select. `save()` must not append `strategy_id` when `isNoTrade`. `fields` iteration already skips `''`.
  - Summary chips: append the strategy name when selected (neutral chip style).
  - After a successful save in trade mode: `localStorage.setItem('lastStrategyId', id)` or `removeItem` for None.

- [ ] **Step 2: Verify** on the scratch server + dev client: a new trade preselects the last used strategy; Save with an unmet rule shows the error and stays; ticking IFVG or CISD (or both) satisfies the group; edit an existing trade; switch to no-trade and save → strategy gone. `screenshots.mjs --only=new` → no page scroll, light + dark, 1366 + 1600.

- [ ] **Step 3: Commit** `feat(strategies): strategy checklist in TradeForm`.

---

### Task 6: Filters, TradeList column, TradeDetail, AI snapshot chips

**Files:**
- Modify: `client/src/components/TradeFilters.jsx` (`filters.strategy_id`, a select after Series: `All strategies` / `No strategy` (value `none`) / every strategy (archived ones suffixed ` (archived)`), a chip label, new prop `strategies`)
- Modify: `client/src/pages/Dashboard.jsx`, `client/src/pages/AiAnalyst.jsx` (fetch `getStrategies`, pass `strategies` to `TradeFilters`; AiAnalyst `lookups.strategies`)
- Modify: `client/src/aiFilters.js` (`snapshotChips(filters, { seriesList, models, strategies = [] })`: `none` → `No strategy`, otherwise the name or `Strategy`)
- Modify: `client/src/pages/TradeList.jsx` (`FILTER_KEYS` += `strategy_id`, a select like Series, a **Strategy** column after Setup showing `t.strategy?.name` or `—`, empty-row `colSpan` 9 → 10)
- Modify: `client/src/pages/TradeDetail.jsx` (show the strategy name as a pill next to the entry models when `trade.strategy`)

**Interfaces:**
- Consumes: `getStrategies` (Task 4), `strategy_id` filter + `trade.strategy` (Task 3).

- [ ] **Step 1: Implement** the above. `apiFilters` passes `strategy_id` through unchanged.
- [ ] **Step 2: Verify** on the scratch server: filter `?strategy_id=<id>` and `none` on Dashboard and Trades; the chip appears and clears; start an AI conversation with the filter → its snapshot chip shows the strategy name; TradeDetail shows the pill. `screenshots.mjs --only=dashboard,trades,ai` → no console errors.
- [ ] **Step 3: Commit** `feat(strategies): strategy filter, list column and detail`.

---

### Task 7: Dashboard "Strategies" tab

**Files:**
- Modify: `client/src/components/dashboard/TopSetups.jsx`

**Interfaces:**
- Consumes: `trade.strategy` (Task 3), `computeStats` from `./StatCards`.

- [ ] **Step 1: Implement**:
  - `TABS = { be: 'BE Outcome', setups: 'Top Setups', strategies: 'Strategies' }`; `readTab` accepts all three keys (default `be`).
  - Group `trades` by `t.strategy?.id ?? 'none'`. Per group: `computeStats(group)` → `winRate`, `netR`, plus `total`. Sort by `total` desc, with `none` (label **No strategy**, muted text, bar in `bg-neutral`) always last.
  - Row = same markup as setups (name, `NN%`, trade count, progress bar, `<50%` in loss colour), with Net R formatted `+2.5R` / `−1.0R` (or `—` when null) between the win rate and the count. Header hint for this tab: `win rate · net R · trades`. Empty → `—`.
- [ ] **Step 2: Verify** `screenshots.mjs --only=dashboard` on the scratch data with ≥1 strategy trade, light + dark, 1366 + 1600, no page scroll, no `NaN`.
- [ ] **Step 3: Commit** `feat(strategies): Strategies tab on Dashboard`.

---

### Task 8: Docs, live DB backup, deploy

**Files:**
- Modify: `CLAUDE.md` (schema block, API table row `/api/strategies`, routes `/strategies`, structure tree, a TradeForm note on the strategy checklist and last-used strategy, the Dashboard TopSetups tabs, a new short **Strategies** section with the rule semantics)
- Modify: `README.md` (feature list: Strategy Lab). Only stage these hunks if the pre-existing License change is still uncommitted: use `git add -p README.md`.

- [ ] **Step 1: Full verification** — `cd server && npm test` and `scripts/dev/api-smoke.sh` → all pass. `cd client && npx vite build` → succeeds.
- [ ] **Step 2: Back up the live DB** (Docker may have it open, so read-only through the backup API):
  `node -e "const D=require('./server/node_modules/better-sqlite3'); new D('server/data/journal.db',{readonly:true}).backup('server/data/backups/journal_before_strategies_20261027.db').then(()=>console.log('ok'))"` → prints `ok`, and the file exists with size > 0.
- [ ] **Step 3: Deploy** — `docker compose up -d --build`, then `curl -s http://localhost:7420/api/strategies` → `[]`, and `curl -s http://localhost:7420/api/trades | node -pe "JSON.parse(require('fs').readFileSync(0)).length"` matches the count before the deploy (take that count before Step 3).
- [ ] **Step 4: Commit** `docs: strategies`, then report to the user for a browser test. Merging into main and pushing only when asked.
