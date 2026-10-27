# Ascend — CLAUDE.md

## What this project is

A personal trading journal web app called **Ascend**. The user logs trades with structured metadata (asset, session type, direction, result, entry models, psychology, screenshots), logs no-trade days, reviews performance through a dashboard (filterable stats, performance curve, top setups, win rate by day, heatmap trade calendar) and tracks prop firm account expenses & payouts.

Runs fully locally — no auth, single user (`user_id = 'local'`).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Styling | Tailwind CSS v3 (`darkMode: 'class'`, CSS-variable based colors, light + dark theme) |
| Charts | Recharts (AreaChart, BarChart) + plain divs for setup bars |
| Date utils | date-fns |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 (WAL mode, foreign keys ON) |
| File uploads | Multer (screenshots stored in `server/uploads/`, 20 MB limit) |
| Backup | adm-zip (DB + uploads as ZIP) |
| Dev runner | concurrently (runs server + client together) |
| Animation | none (CSS transitions only) |

**Run dev:** `npm run dev` from root (server on :3001, client on :5173).
**Docker (daily use):** `docker compose up -d --build` → http://localhost:7420 (container `ascend`, `restart: unless-stopped` → starts on boot). Single container: Express serves the built client from `client/dist` + API. `server/data` and `server/uploads` are bind-mounted, so Docker and dev share the same DB. After code changes, re-run `docker compose up -d --build`. Avoid running `npm run dev` at the same time (two processes on one SQLite; backup restore in one won't reload the other) — `docker compose stop` first.
**Verification (never on the real DB):** `scripts/dev/api-smoke.sh [db]` boots a scratch copy of the server + a backup DB on :3999 and checks trade / no-trade CRUD. `node scripts/dev/screenshots.mjs <outDir> [baseUrl] [--only=dashboard,new,…]` takes light/dark × 1600/1366 screenshots (blocks non-GET API calls, fails on console errors, `NaN`, or page scroll on Dashboard/TradeForm). Dev client against Docker API: `cd client && API_TARGET=http://127.0.0.1:7420 npx vite --port 5190`.
**Tests:** `cd server && npm test` (node:test, `server/test/*.test.js`, pure units — never import `db.js`). `scripts/dev/api-smoke.sh` also covers the AI endpoints (runs with `AI_PROVIDER=mock`). Scratch server for UI work: `DB_PATH=/tmp/x/journal.db AI_PROVIDER=mock PORT=3998 node server/index.js` (with `DB_PATH` set, uploads go to a sibling dir unless `UPLOADS_DIR` is set — `server/paths.js`). `screenshots.mjs` also has an `ai` page.
**First install:** `npm run install:all`. `Spustit.sh` / `Spustit.bat` = one-click launcher (checks Node, installs deps, opens browser).

---

## Project structure

```
TradeJournalCla/
├── package.json              # Root: runs server + client via concurrently
├── Spustit.sh / Spustit.bat  # One-click launchers (Linux/macOS / Windows)
├── client/
│   ├── public/               # favicon.svg (logo itself is the inline SVG in Logo.jsx)
│   ├── src/
│   │   ├── api.js            # All fetch calls to /api/* (+ backup download/restore helpers)
│   │   ├── aiFilters.js      # searchParamsToObject / objectToSearchParams (filters ↔ conversation snapshot)
│   │   ├── lastView.js       # Remembers last Dashboard / Trades URL (filters) for Back / Save / sidebar
│   │   ├── App.jsx           # Routes (see below), wrapped in ThemeProvider
│   │   ├── contexts/
│   │   │   └── ThemeContext.jsx   # isDark + toggle, persisted in localStorage('theme'), toggles html.dark
│   │   ├── hooks/
│   │   │   └── useThemeColors.js  # Chart colors for current theme + tooltipProps(colors) for Recharts
│   │   ├── components/
│   │   │   ├── Layout.jsx        # Collapsible sidebar (icon rail → hover slide-out overlay, pin persisted in localStorage 'sidebarPinned'), SVG logo, nav, theme toggle
│   │   │   ├── TradeCalendar.jsx # Heatmap month calendar of trades + no-trade days + weekly summary column
│   │   │   ├── dashboard/        # StatCards (+ computeStats), PerformanceCurve, TopSetups (+ BeOutcome tab, Strategies tab), WinRateByDay
│   │   │   ├── StrategyChecklist.jsx # Strategy rules as checklist rows in TradeForm
│   │   │   ├── TradeFilters.jsx  # useTradeFilters hook + filters UI (popover, chips, asset list), shared by Dashboard and AI Analyst
│   │   │   ├── ai/               # ConversationList, SelectionList, Composer, ChatMessages, Markdown (react-markdown + remark-gfm)
│   │   │   ├── Logo.jsx          # Ascend mark as inline SVG (currentColor)
│   │   │   ├── ConfirmDialog.jsx # Modal confirm (use instead of window.confirm)
│   │   │   ├── DatePicker.jsx    # Custom date input
│   │   └── pages/
│   │       ├── Dashboard.jsx   # Collapsible filters + 5 stat cards + charts + calendar
│   │       ├── TradeForm.jsx   # Create/edit trade (inline entry model creation)
│   │       ├── TradeDetail.jsx # Read-only trade view with screenshots + lightbox
│   │       ├── TradeList.jsx   # Filterable + paginated table (25/page), backup download/restore
│   │       ├── Series.jsx      # Trade series CRUD
│   │       ├── StrategyLab.jsx # Strategies CRUD (rules from entry models), archive
│   │       ├── Expenses.jsx    # Prop firm accounts + payouts, CSV export
│   │       └── AiAnalyst.jsx   # AI Analyst: conversation list, trade selection, streaming chat
│   ├── tailwind.config.js
│   └── index.css             # Theme CSS variables + .card, .card-hero, .btn-*, .input, .label, .seg, .stat-*
├── server/
│   ├── index.js              # Express entry, loads .env, same-origin guard, mounts routes, serves /uploads static
│   ├── sameOrigin.js         # 403 for cross-origin non-GET /api requests (no CORS)
│   ├── paths.js              # resolvePaths(): DB_PATH env → own uploads dir unless UPLOADS_DIR
│   ├── ai/                   # index.js (provider selection), errors.js, gemini.js, anthropic.js, mock.js, context.js, prompt.js
│   ├── test/                 # node:test unit tests (`npm test` in server/)
│   ├── db.js                 # SQLite init, schema, idempotent migrations, achievement seeds, reinitDb()
│   ├── data/journal.db       # SQLite DB (gitignored — back up via ZIP backup)
│   ├── uploads/              # Screenshot files (gitignored)
│   └── routes/
│       ├── trades.js         # CRUD (trades + no-trade days)
│       ├── entryModels.js    # GET / POST / PATCH /reorder / DELETE
│       ├── series.js         # CRUD
│       ├── strategies.js     # CRUD (logic in server/strategyStore.js; rule check in server/strategyRules.js, mirrored in client/src/strategyRules.js)
│       ├── expenses.js       # Prop accounts + payouts
│       ├── ai.js             # AI Analyst: status, estimate, conversations, SSE messages
│       └── backup.js         # GET = download ZIP, POST = restore ZIP
```

### Routes (client)
`/dashboard`, `/trades`, `/trades/new`, `/trades/:id`, `/trades/:id/edit`, `/series`, `/strategies`, `/expenses`, `/ai`, `/ai/:id` (`/` and unknown paths → `/dashboard`).

### API (server)
| Prefix | Endpoints |
|---|---|
| `/api/trades` | `GET /` (filters: asset, session_type, series_id, strategy_id, direction, pnl — also `be_win` / `be_loss`, entry_model_id[], from, to), `day_type` (trade default / notrade / all), `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` — POST/PUT are multipart (screenshots) |
| `/api/entry-models` | `GET /`, `POST /`, `PATCH /reorder`, `DELETE /:id` |
| `/api/series` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/api/strategies` | `GET /` (incl. `rules[].options[]`, `trade_count`, `archived`), `GET /:id`, `POST /`, `PUT /:id` (body `{name, description, archived, rules: [{label, entry_model_ids}]}`, rules replaced as a whole), `DELETE /:id` |
| `/api/expenses` | `GET /accounts` (incl. `total_payouts`), `POST /accounts`, `PUT /accounts/:id`, `DELETE /accounts/:id`, `POST /accounts/:id/payouts`, `DELETE /payouts/:id` |
| `/api/ai` | `GET /status` (providers + default, never keys), `POST /estimate` (token estimate for a selection), `GET/POST /conversations` (POST → 201 + conversation), `GET/PATCH/DELETE /conversations/:id`, `POST /conversations/:id/messages` (SSE `delta`/`done`/`error`; `{retry:true}` re-asks the last user message; 409 when busy or provider unavailable) |
| `/api/backup` | `GET /` (ZIP download), `POST /` (field `backup`, restores DB + uploads, calls `reinitDb()`) |

---

## Database schema

```sql
series              (id, name UNIQUE, description, created_at, updated_at)
entry_models        (id, name UNIQUE, sort_order)
strategies          (id, name UNIQUE, description, archived, created_at, updated_at)
strategy_rules      (id, strategy_id → strategies CASCADE, label, sort_order)
strategy_rule_options (rule_id → strategy_rules CASCADE, entry_model_id → entry_models CASCADE)
trades              (id, day_type, asset, session_type, series_id, strategy_id, direction, pnl, be_outcome,
                     risk_reward, risk_amount, pnl_dollars, entry_time,
                     premarket_analysis, why_entered, no_trade_reason, faded_setups,
                     psychology, improvements, risk_management, created_at, updated_at)
trade_entry_models  (trade_id, entry_model_id)   -- junction table, multiselect
screenshots         (id, trade_id, type, filename, original_name, created_at)
prop_accounts       (id, firm_name, account_size, purchase_price, status,
                     purchased_at, passed_at, blown_at, notes, created_at, updated_at)
prop_payouts        (id, account_id, amount, payout_date, notes, created_at)
ai_conversations    (id, title, provider, model, filters JSON, context, trade_count, notrade_count,
                     created_at, updated_at)   -- context = frozen serialized journal data
ai_messages         (id, conversation_id → ai_conversations ON DELETE CASCADE, role 'user'|'assistant',
                     content, created_at)
-- legacy, unused (may exist in old DBs): player_profile, achievements, player_achievements, xp_log
```

**Enums enforced by CHECK constraints:**
- `trades.day_type` → `'trade' | 'notrade'` (default `'trade'`)
- `trades.direction` → `'long' | 'short'` (NULL only for no-trade days)
- `trades.pnl` → `'win' | 'loss' | 'breakeven'` (NULL only for no-trade days)
- table CHECK: `day_type = 'notrade'` OR asset/direction/pnl all NOT NULL
- `trades.be_outcome` → `'win' | 'loss'` or NULL (server keeps it only when `pnl = 'breakeven'`)
- `trades.risk_management` → `'low' | 'perfect' | 'high'` or NULL
- `screenshots.type` → `'ltf' | 'htf' | 'daily_bias'`
- `prop_accounts.status` → `'eval' | 'funded' | 'blown'`

`trades.session_type` is `'live' | 'backtest'` (default `'live'`, no CHECK).

**Migrations:** new columns are added in `runSchema()` via `try { ALTER TABLE … ADD COLUMN … } catch {}` — follow the same pattern so existing DBs (and restored backups) upgrade automatically. Legacy `"NQ Backtest"`-style assets are migrated to `asset = 'NQ', session_type = 'backtest'`.

`migrateNoTradeDays()` in `db.js` is the table-rebuild migration that added `day_type` (runs once, when the column is missing) — copy its pattern for future constraint changes.

**Changing a CHECK constraint** can't be done via ALTER. Either write a table-rebuild migration, or (losing data) delete the DB: `rm server/data/journal.db*`. The DB is real user data — **make a backup first** with the SQLite backup API (`new Database(p).backup(dest)`), not `cp journal.db` — a plain copy misses changes still in `journal.db-wal`. Note that `require('./server/db')` (even just to syntax-check a route) runs migrations on the real DB.

---

## Trade journal field types

| Field | Type | Notes |
|---|---|---|
| Session type | single value | Live / Backtest (`session_type`) |
| Series | optional FK | `series_id` → `series`, `ON DELETE SET NULL` |
| Asset | single value | Fixed list: NQ, MNQ, ES, MES |
| Direction | single value | Long / Short |
| P&L | single value | Win / Loss / Breakeven — `pnl` text |
| BE outcome | single value, optional | Only for Breakeven: what the trade would have become — `be_outcome` win / loss ("BE → Win / BE → Loss"). Purely informative: win rate, Net R and curves still treat it as BE |
| P&L $ | decimal | Optional dollar result (`pnl_dollars`), shown in calendar |
| Risk Reward Ratio | decimal | Optional, `risk_reward` REAL |
| Risk Amount | decimal | `risk_amount` — auto-calculated in TradeForm from `pnl_dollars` and `risk_reward` |
| Entry Model | MULTISELECT | `trade_entry_models` junction table |
| Day type | single value | Trade / No-trade day (`day_type`) — see *No-trade days* |
| Premarket Analysis / Why did I enter? / Psyche / How to improve? | free text | `premarket_analysis`, `why_entered`, `psychology`, `improvements` |
| Why I didn't trade / Faded setups | free text | `no_trade_reason`, `faded_setups` — no-trade days only |
| Risk Management | single tag | Low / Perfect / High |
| Time of Entry | datetime | `entry_time` TEXT (ISO) |
| Screenshots | files | LTF (≤10), HTF (≤10), Daily Bias (≤5) — `screenshots.type` |
| Day of the week | derived | From `entry_time` via date-fns, not stored |

---

## Dashboard — current state

### Header + filters
- Title + subtitle left; right: `.seg` **Live / Backtest / All** (`session_type` URL param, default **live**, `all` = no filter), **Filters** button with active-count badge, primary **New Trade**.
- Filters panel (Asset, Series, Direction, Result, date range, Day of week, Entry models — multiselect, AND logic, drag-to-reorder → `PATCH /entry-models/reorder`) opens as a **floating popover** over the stats (grid-rows 0fr↔1fr animation, closes on Escape / button) so the charts keep their height. Collapsed → active filters as removable chips.
- All filters live in **URL search params**. **DOW filter** is client-side → `displayTrades`; all stats, charts and the calendar use `displayTrades`.

### Stat cards (`components/dashboard/StatCards.jsx`, `computeStats(trades)`)
1. **Net R** (`.card-hero`) — sum of win R:R − number of losses; sub: trades · avg/week (ISO weeks with ≥1 trade)
2. **Win Rate** — wins / (wins+losses) + thin W/L/BE bar with counts
3. **Avg R:R** (ignores null/0)
4. **Avg $ Risk** (`risk_amount`)
5. **Total P&L $** — Σ `pnl_dollars`, `—` when no trade has it
Empty filter results render `—` (never NaN).

### Layout below stats
Two equal columns filling the remaining viewport height (`flex-1 min-h-0`):
- **Left:** **Performance** (`PerformanceCurve.jsx`, monotone area, **R (default) / Score** toggle persisted in localStorage `perfMode`: score = +1 win / −1 loss, R = win +R:R / loss −1R (ends at Net R); sorted by `created_at`, current value top-right) above **Top Setups** (`TopSetups.jsx`, tabs **BE Outcome (default) / Top Setups / Strategies** persisted in localStorage `setupsTab`; setups = entry models ranked by win rate with progress bars + trade count, <50% in loss colour; BE Outcome = `BeOutcome.jsx` semicircle tick gauge, % of breakevens with `be_outcome` that would be a win, + →W / →L / untagged counts) and **Win Rate by Day** (`WinRateByDay.jsx`, Mon–Fri, neutral bars, best day solid accent).
- **Right:** **TradeCalendar** heatmap — rounded day tiles (win `accent-soft`, strong win = net R ≥ 2 or ≥2 wins & 0 losses → solid accent, loss tint, BE neutral, out-of-month hatched), weekly summary column (`W{isoWeek}`), optional $ P&L toggle, dashed NO TRADE tiles, PASS ring for winning days where a prop account was **passed** (`passed_at`). Click day → trade detail (1 trade) or popup list (more). Header: ‹ › month arrows, clickable month label → **MonthPicker** popover (year arrows + 12-month grid, dot = month with logged days), **Today**, **Stats** (sets `from`/`to` to the shown month; while on, month navigation moves the range; whole-month range shows as one chip `October 2026`), **P&L** toggle.

### Chart heights
Charts using `height="100%"` work **only** because every ancestor has a resolved height (`flex-1 min-h-0` chain down from the page). If you break that chain, the chart becomes invisible; fall back to fixed pixel heights. Re-check 1366×768 with `scripts/dev/screenshots.mjs` after layout changes.

### Chart colors & tooltips
Always take colors from `useThemeColors()` (theme-aware), never hardcode; tooltips via `<Tooltip {...tooltipProps(colors)} />` (see Colors below).

---

## AI Analyst

Page `/ai` (`/ai/:id`): pick trades (shared `TradeFilters` + checkbox list, **include no-trade days** toggle → `nt=0` in URL), see a token estimate, start a conversation and chat with streaming answers. Conversation list ordered by last activity (`updated_at DESC`; renaming does not bump `updated_at`). Ask is disabled (list dimmed) until the trades for the current filters have loaded.
- **Providers** (`server/ai/index.js`): `AI_PROVIDER` forces one (`gemini` | `anthropic` | `mock`; only if its key is set — `mock` needs none); otherwise anthropic if `ANTHROPIC_API_KEY`, else gemini if `GEMINI_API_KEY`, else none (page shows a not-configured card). Default models `gemini-3.8-flash` / `claude-sonnet-5-5`, overridable via `GEMINI_MODEL` / `ANTHROPIC_MODEL`. Keys live only server-side in `.env` (gitignored, loaded by `process.loadEnvFile` in `server/index.js`; template `.env.example`; docker-compose `env_file` is optional). **`.env` format:** bare `KEY=value`, comments only on their own lines — docker compose keeps an inline `# …` after an empty value as the value. `server/ai/index.js` trims values and treats empty / `#`-prefixed ones as unset anyway. The provider + model are stored per conversation; follow-ups use the stored model, not today's `*_MODEL`. `/api/ai/status` never returns keys. `mock` provider streams canned text (`MOCK_DELAY_MS`, `MOCK_FAIL=1` for tests).
- **Frozen snapshot:** creating a conversation serializes the selected trades (+ no-trade days) into `ai_conversations.context` and stores the filters; later edits/deletions of trades don't change it. **No images/screenshots** are ever sent.
- **Chat:** one answer at a time per conversation (409 busy); leaving the page or switching conversation aborts the stream and the partial answer is not saved. Failed answer → Retry (`{retry:true}`) without duplicating the user message. If the provider key is removed later, follow-ups return 409 and history stays readable. `#123` in answers links to `/trades/123` (deleted trade → TradeDetail not-found card). Markdown images in answers render as plain links (never fetched).
- **No CORS:** the server sends no CORS headers (client is same-origin in Docker, proxied by Vite in dev) and `server/sameOrigin.js` rejects cross-origin non-GET `/api` requests with 403 (`Sec-Fetch-Site` / `Origin` vs `Host`), so other websites can't spend the AI quota or restore a backup. curl/scripts (no such headers) are allowed.
- **Testing:** never against the real DB — scratch server (`DB_PATH` + `AI_PROVIDER=mock`) or `api-smoke.sh`.

## Strategies

A strategy (Strategy Lab, `/strategies`) is a list of **rules**; a rule is a set of entry models (**options**) and is met when the trade has **at least one** of them (more is fine). One option = "must have", several = "any of" (e.g. `Entry model: IFVG / CISD`).
- `trades.strategy_id` is optional (`ON DELETE SET NULL`); no-trade days never have one. Ticked options are ordinary `trade_entry_models` rows; extra entry models outside the strategy are allowed.
- Server rejects POST/PUT with unmet rules (400 `Strategy rules not met: …`), checked against the strategy's **current** rules (editing an old trade re-checks it). Archived strategies are still accepted on trades but hidden from the TradeForm select (except the trade's own).
- Deleting an entry model also deletes rules left with no option. Deleting a strategy keeps its trades.
- TradeForm: Strategy select (new trade prefilled from localStorage `lastStrategyId`, set on save) → `StrategyChecklist` + "Other entry models" (drag-reorder only with Strategy = None).
- `GET /api/trades?strategy_id=<id>|none`; filter in TradeFilters (Dashboard + AI) and TradeList; Strategy column in TradeList; pill in TradeDetail; `Strategy: <name>` in AI context; Dashboard Top Setups card has a **Strategies** tab (win rate, Net R, trades, "No strategy" row).

## No-trade days

A logged day without a trade = row in `trades` with `day_type = 'notrade'`: only `entry_time` (date), `premarket_analysis`, `no_trade_reason`, `faded_setups`, `psychology` + Daily Bias / HTF screenshots; asset/direction/pnl/R/$ are NULL, no entry models. Server normalises this in `tradeValues()` (`routes/trades.js`).
- One no-trade day per date (server returns 400 otherwise). Switching an existing trade to no-trade asks for confirmation (ConfirmDialog) and the server drops its trade fields, entry models and LTF screenshots. A no-trade day on a date that also has trades is listed in the calendar day popup.
- `GET /api/trades` returns **only trades by default**; `?day_type=notrade` or `?day_type=all` to get the others. So TradeList and all Dashboard stats ignore no-trade days.
- Dashboard fetches no-trade days separately (unfiltered) and passes them to `TradeCalendar` as `noTradeDays` → dashed "NO TRADE" cell (only on days without trades), click → detail.
- TradeForm: **Trade / No-trade day** toggle in the header swaps col 1 to a Day Info card, notes to Premarket | Why I Didn't Trade / Faded Setups | Psychology, hides LTF upload. TradeDetail hides metrics/entry models.

## TradeForm layout

- Page fits viewport (no page scroll): header + 3-column grid `minmax(300px,1fr) | minmax(0,1.7fr) | minmax(260px,1fr)` with `gridTemplateRows: minmax(0,1fr)`; columns 1 and 3 scroll internally.
- **Col 1:** Trade Info (Live/Backtest toggle, Asset / Direction / Result / Risk Management as `Segmented` button rows, Entry Time, R:R + PnL $ → computed risk, Series select) + Entry Models (Strategy select + checklist, drag-reorder, inline add/delete).
- **Col 2:** Notes in a 2×2 grid — Premarket Analysis | Why I Entered / Psychology | Improvements.
- **Col 3:** Screenshots — existing shots (mark for delete) + 3 `UploadZone`s; paste works on **hover** (document-level paste listener), click, drag & drop.
- Header shows live summary chips (asset, direction, result, R) and validation error; **Ctrl/Cmd+Enter** submits.

## Expenses (prop firm accounts)

- Account: firm, size, purchase price, status `eval → funded → blown`, `purchased_at`, `passed_at` (set when funded/blown), `blown_at` (when blown), notes.
- Payouts per account (expandable list, add/delete).
- Summary: total spent, total payouts, net P&L, active accounts. CSV export of accounts (client-side).
- `passed_at` dates feed the Dashboard calendar highlight.

## Backup & restore

On the **Trades** page: download ZIP (DB + uploads) / restore ZIP with confirmation banner. Restore swaps the DB via `reinitDb()` — `db` is exported as a Proxy so all route modules keep working after the swap. **There is no CSV export/import of trades anymore** (removed in favour of ZIP backup).

---

## Key rules

- **No Settings page.** Entry models are created inline in TradeForm and reordered by drag in Dashboard filters.
- **No gamification.** XP/levels/achievements were removed (2026-10-22). The old tables `player_profile`, `achievements`, `player_achievements`, `xp_log` may still exist in the DB but nothing creates, reads or writes them.
- **`pnl` is a result, not money.** Dollar result lives in the separate optional `pnl_dollars`.
- **Entry model multiselect uses AND logic** (`HAVING COUNT(DISTINCT entry_model_id) = N`).
- **Never nest `<form>` elements.** TradeForm has one outer form; inner buttons use `type="button"`.
- **Return to the filtered view.** Dashboard and TradeList keep all filters (+ TradeList `page`) in URL params; `lastView.js` remembers the last `/dashboard` / `/trades` URL in sessionStorage (`rememberView` runs in `Layout`). Sidebar links, detail Back/Delete and TradeForm Save (edit) / Cancel (new) go to `viewUrl(path)` / `lastListUrl()` — don't hardcode `navigate('/dashboard')`. Calendar month is kept in sessionStorage `calMonth`.
- **Dashboard stats are computed client-side from `displayTrades`** (`computeStats` in `components/dashboard/StatCards.jsx`).
- **Screenshots served statically** at `/uploads/<filename>`; Vite proxies `/api` and `/uploads` → `:3001`.
- **Asset list is hardcoded in 3 places:** `TradeForm.jsx` (`ASSETS`), `TradeList.jsx`, `TradeFilters.jsx` (used by Dashboard + AI Analyst). Update all when adding assets.
- **Use `ConfirmDialog`** for destructive actions, not `window.confirm`.
- **Every new UI must work in both light and dark theme** (`dark:` variants, theme CSS variables, `useThemeColors`).

### Colors (redesign 2026-10-22 — blue + coral, light-first)
Defined as CSS variables in `index.css` (`:root` = light, `html.dark` = dark) and mapped in `tailwind.config.js`. References: `inspiration/*.png`; design spec `docs/superpowers/specs/2026-10-22-visual-redesign-design.md`.

| Token | Light | Dark |
|---|---|---|
| `surface` (page) | `#F2F4F8` | `#0F1420` |
| `surface-card` | `#FFFFFF` | `#171D2B` |
| `surface-raised` (hover, inputs) | `#EEF1F6` | `#1F2636` |
| `surface-border` (subtle dividers) | `#E4E8EF` | `#2A3245` |
| `accent` = `profit` (wins, active) | `#2563EB` | `#4F7BFF` |
| `accent-soft` | `#DBE6FE` | `#1E2B4D` |
| `loss` | `#F04461` | `#FF5C78` |
| `neutral` (breakeven) | `#94A3B8` | `#64748B` |
| hero gradient (`.card-hero`) | `#3B5BFD → #38BDF8` | same |

- Text on accent is **white**. Never hardcode hex in components — use tokens; charts use `useThemeColors()` (`colorMain` = accent, `colorNeg` = loss, `breakeven`, `accentSoft`, `isDark`…).
- Recharts tooltips: `<Tooltip {...tooltipProps(colors)} />` (sets contentStyle/labelStyle/**itemStyle** — itemStyle is required, otherwise Recharts renders black text).

### Component classes (`index.css`)
- `.card` — borderless `rounded-3xl p-6` with soft shadow (`--shadow-card`, none in dark). For a full-width clickable header use `!p-0` on the card and padding on the inner button. `.card-hero` — gradient card with white text (max 1–2 per page).
- `.card-title` (section heading, normal case — no uppercase tracking), `.stat-value` + `.stat-label` (big number + muted label).
- `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger`, `.input`, `.label`.
- Pill segmented control: `.seg` track + `.seg-item` buttons, active `.seg-item-active` (white island) or `.seg-item-primary` (solid accent).

## User preferences

- **Přímá implementace** — small changes go straight to code, no planning needed. Plan mode only for multi-file or architecturally complex tasks.
- **Barvy:** Use the blue/coral palette tokens (see Colors). The old lime/purple "gamer" look was rejected — calm, professional, light-first, few borders.
- **Výšky grafů:** Prefer fixed pixel heights; if using `height="100%"`, make sure the parent chain has a real height. Re-check visual alignment when adding/removing charts.
- **Animace:** page transitions (framer-motion) were tried and reverted — user didn't like them; framer-motion is uninstalled. CSS grid-rows collapsible animations are fine.
- **Tooltip:** All Recharts tooltips use `tooltipProps(colors)`.
- **Datumy v tabulkách:** Full date incl. year — `format(parseISO(str), 'MMM d, yyyy HH:mm')`.
- UI texts are in English (a few Czech tooltips/comments exist).

---

## Current goals / known gaps

- **Daily Bias** is screenshot-only — could add a Bullish / Bearish / Neutral text tag.
- **TradeList entry model filter** is single-select — could become multiselect like Dashboard.
- **CSV export/import of trades** no longer exists — could be re-added if needed.
- **No PDF export.**
- `trades.session_type` has no CHECK constraint.
