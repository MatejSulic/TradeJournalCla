# Ascend — CLAUDE.md

## What this project is

A personal trading journal web app called **Ascend**. The user logs trades with structured metadata (asset, session type, direction, result, entry models, psychology, screenshots), reviews performance through a dashboard (filterable stats, performance curve, win rate donut, win rate by day, trade calendar), tracks prop firm account expenses & payouts, and earns XP/levels/achievements for consistent journaling.

Runs fully locally — no auth, single user (`user_id = 'local'`).

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Styling | Tailwind CSS v3 (`darkMode: 'class'`, CSS-variable based colors, light + dark theme) |
| Charts | Recharts (LineChart, PieChart, BarChart) |
| Date utils | date-fns |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 (WAL mode, foreign keys ON) |
| File uploads | Multer (screenshots stored in `server/uploads/`, 20 MB limit) |
| Backup | adm-zip (DB + uploads as ZIP) |
| Dev runner | concurrently (runs server + client together) |
| Animation | framer-motion installed but not used |

**Run dev:** `npm run dev` from root (server on :3001, client on :5173).
**Docker (daily use):** `docker compose up -d --build` → http://localhost:7420 (container `ascend`, `restart: unless-stopped` → starts on boot). Single container: Express serves the built client from `client/dist` + API. `server/data` and `server/uploads` are bind-mounted, so Docker and dev share the same DB. After code changes, re-run `docker compose up -d --build`. Avoid running `npm run dev` at the same time (two processes on one SQLite; backup restore in one won't reload the other) — `docker compose stop` first.
**First install:** `npm run install:all`. `Spustit.sh` / `Spustit.bat` = one-click launcher (checks Node, installs deps, opens browser).

---

## Project structure

```
TradeJournalCla/
├── package.json              # Root: runs server + client via concurrently
├── Spustit.sh / Spustit.bat  # One-click launchers (Linux/macOS / Windows)
├── client/
│   ├── public/               # ascend-logo.png, favicon.png, background assets
│   ├── src/
│   │   ├── api.js            # All fetch calls to /api/* (+ backup download/restore helpers)
│   │   ├── App.jsx           # Routes (see below), wrapped in ThemeProvider
│   │   ├── contexts/
│   │   │   └── ThemeContext.jsx   # isDark + toggle, persisted in localStorage('theme'), toggles html.dark
│   │   ├── hooks/
│   │   │   ├── useGamification.js # Fetches profile; TIER_STYLES per level tier
│   │   │   └── useThemeColors.js  # Chart colors for current theme (tooltip, grid, colorMain, colorNeg…)
│   │   ├── components/
│   │   │   ├── Layout.jsx        # Collapsible sidebar (icon rail → hover slide-out overlay, pin persisted in localStorage 'sidebarPinned'), nav, theme toggle, XP summary
│   │   │   ├── TradeCalendar.jsx # Month calendar of trades + weekly summary column
│   │   │   ├── StatCard.jsx      # Reusable stat display card
│   │   │   ├── ConfirmDialog.jsx # Modal confirm (use instead of window.confirm)
│   │   │   ├── DatePicker.jsx    # Custom date input
│   │   │   ├── XPBar.jsx / LevelBadge.jsx / XPToast.jsx  # Gamification UI
│   │   └── pages/
│   │       ├── Dashboard.jsx   # Collapsible filters + 5 stat cards + charts + calendar
│   │       ├── TradeForm.jsx   # Create/edit trade (inline entry model creation)
│   │       ├── TradeDetail.jsx # Read-only trade view with screenshots + lightbox
│   │       ├── TradeList.jsx   # Filterable + paginated table (25/page), backup download/restore
│   │       ├── Series.jsx      # Trade series CRUD
│   │       ├── Expenses.jsx    # Prop firm accounts + payouts, CSV export
│   │       ├── Profile.jsx     # Level, XP, achievements grid
│   │       └── Settings.jsx    # UNUSED — not routed (legacy entry-model manager)
│   ├── tailwind.config.js
│   └── index.css             # Theme CSS variables + .btn-*, .card, .input, .label
├── server/
│   ├── index.js              # Express entry, mounts routes, serves /uploads static
│   ├── db.js                 # SQLite init, schema, idempotent migrations, achievement seeds, reinitDb()
│   ├── gamification.js       # XP, levels, streaks, achievements logic
│   ├── data/journal.db       # SQLite DB (committed to git as backup; -wal/-shm ignored)
│   ├── uploads/              # Screenshot files (gitignored)
│   └── routes/
│       ├── trades.js         # CRUD + /stats + /equity
│       ├── entryModels.js    # GET / POST / PATCH /reorder / DELETE
│       ├── series.js         # CRUD
│       ├── expenses.js       # Prop accounts + payouts
│       ├── gamification.js   # GET /profile, GET /levels
│       └── backup.js         # GET = download ZIP, POST = restore ZIP
```

### Routes (client)
`/dashboard`, `/trades`, `/trades/new`, `/trades/:id`, `/trades/:id/edit`, `/series`, `/expenses`, `/profile` (`/` → `/dashboard`).

### API (server)
| Prefix | Endpoints |
|---|---|
| `/api/trades` | `GET /` (filters: asset, session_type, series_id, direction, pnl, entry_model_id[], from, to), `GET /stats`, `GET /equity`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` — POST/PUT are multipart (screenshots) |
| `/api/entry-models` | `GET /`, `POST /`, `PATCH /reorder`, `DELETE /:id` |
| `/api/series` | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/api/expenses` | `GET /accounts` (incl. `total_payouts`), `POST /accounts`, `PUT /accounts/:id`, `DELETE /accounts/:id`, `POST /accounts/:id/payouts`, `DELETE /payouts/:id` |
| `/api/gamification` | `GET /profile`, `GET /levels` |
| `/api/backup` | `GET /` (ZIP download), `POST /` (field `backup`, restores DB + uploads, calls `reinitDb()`) |

---

## Database schema

```sql
series              (id, name UNIQUE, description, created_at, updated_at)
entry_models        (id, name UNIQUE, sort_order)
trades              (id, asset, session_type, series_id, direction, pnl,
                     risk_reward, risk_amount, pnl_dollars, entry_time,
                     premarket_analysis, why_entered, psychology, improvements,
                     risk_management, created_at, updated_at)
trade_entry_models  (trade_id, entry_model_id)   -- junction table, multiselect
screenshots         (id, trade_id, type, filename, original_name, created_at)
prop_accounts       (id, firm_name, account_size, purchase_price, status,
                     purchased_at, passed_at, blown_at, notes, created_at, updated_at)
prop_payouts        (id, account_id, amount, payout_date, notes, created_at)
player_profile      (user_id, xp, level, streak_days, last_trade_date, ...)
achievements        (key, name, description, icon, xp_reward)   -- seeded in db.js
player_achievements (id, user_id, achievement_key, trade_id, unlocked_at)
xp_log              (id, user_id, trade_id, source, amount, created_at)
```

**Enums enforced by CHECK constraints:**
- `trades.direction` → `'long' | 'short'`
- `trades.pnl` → `'win' | 'loss' | 'breakeven'`
- `trades.risk_management` → `'low' | 'perfect' | 'high'` or NULL
- `screenshots.type` → `'ltf' | 'htf' | 'daily_bias'`
- `prop_accounts.status` → `'eval' | 'funded' | 'blown'`

`trades.session_type` is `'live' | 'backtest'` (default `'live'`, no CHECK).

**Migrations:** new columns are added in `runSchema()` via `try { ALTER TABLE … ADD COLUMN … } catch {}` — follow the same pattern so existing DBs (and restored backups) upgrade automatically. Legacy `"NQ Backtest"`-style assets are migrated to `asset = 'NQ', session_type = 'backtest'`.

**Changing a CHECK constraint** can't be done via ALTER. Either write a table-rebuild migration, or (losing data) delete the DB: `rm server/data/journal.db*`. The DB is real user data — **make a backup first**.

---

## Trade journal field types

| Field | Type | Notes |
|---|---|---|
| Session type | single value | Live / Backtest (`session_type`) |
| Series | optional FK | `series_id` → `series`, `ON DELETE SET NULL` |
| Asset | single value | Fixed list: NQ, MNQ, ES, MES |
| Direction | single value | Long / Short |
| P&L | single value | Win / Loss / Breakeven — `pnl` text |
| P&L $ | decimal | Optional dollar result (`pnl_dollars`), shown in calendar |
| Risk Reward Ratio | decimal | Optional, `risk_reward` REAL |
| Risk Amount | decimal | `risk_amount` — auto-calculated in TradeForm from `pnl_dollars` and `risk_reward` |
| Entry Model | MULTISELECT | `trade_entry_models` junction table |
| Premarket Analysis / Why did I enter? / Psyche / How to improve? | free text | `premarket_analysis`, `why_entered`, `psychology`, `improvements` — each filled note = +20 XP |
| Risk Management | single tag | Low / Perfect / High |
| Time of Entry | datetime | `entry_time` TEXT (ISO) |
| Screenshots | files | LTF (≤10), HTF (≤10), Daily Bias (≤5) — `screenshots.type` |
| Day of the week | derived | From `entry_time` via date-fns, not stored |

---

## Dashboard — current state

### Filters (collapsible card)
- Session (All / Live / Backtest, default **Live**), Asset, Series, Direction, Result, Entry models (multiselect, AND logic, drag-to-reorder → `PATCH /entry-models/reorder`), date range, Day of week.
- All filters live in **URL search params**.
- Card uses `!p-0 overflow-hidden`, toggle button has `p-5`; collapsed state shows active filter chips.
- Expand/collapse via CSS `grid-template-rows: 0fr ↔ 1fr`, `transition duration-300`.
- **DOW filter** is client-side → `displayTrades`. All stats, charts and the calendar use `displayTrades`.

### Stat cards (5, `grid-cols-5`)
1. **Total Trades** + avg trades/week (only ISO weeks with ≥1 trade)
2. **Win Rate** (wins / (wins+losses)) + **net R** (sum of win R:R − number of losses)
3. **Avg R:R** (ignores null/0)
4. **Avg $ Risk** (`risk_amount`)
5. **Results** — `xW xL xBE`

### Layout below stats
Two equal columns (`gridTemplateColumns: '1fr 1fr'`), filling remaining viewport height (`flex-1 min-h-0`):
- **Left** — `grid-cols-3`:
  - **Performance Curve** (`col-span-2`) — +1 win / −1 loss score, sorted by `created_at`.
  - Right stack (`flex-col gap-4`): **Win Rate donut** (`height={220}`, `innerRadius={62}`, `outerRadius={88}`, % centered via SVG `<text>`, no legend) and **Win Rate by Day** (Mon–Fri, bars `colorMain` ≥50% / `colorNeg` <50%, `LabelList` in `colorMain`, dashed 50% reference line).
- **Right** — **TradeCalendar**: month grid (Sun→Sat) + weekly summary column (`W{isoWeek}`), day cell colored by result, optional $ P&L (toggle), hatched pattern for empty days, special highlight for winning days where a prop account was **passed** (`passed_at` from Expenses). Click day → trade detail (1 trade) or popup list (more).

### Chart heights
Performance Curve and Win Rate by Day use `height="100%"` — this works **only** because every ancestor has a resolved height (`flex-1 min-h-0` chain down from the page). If you break that chain, the chart becomes invisible; fall back to fixed pixel heights. The donut uses fixed `height={220}`.

### Chart colors & tooltips
Always take colors from `useThemeColors()` (theme-aware), never hardcode:
```jsx
const colors = useThemeColors();
contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 12, fontSize: 12 }}
labelStyle={{ color: colors.labelColor }}
itemStyle={{ color: isDark ? '#fff' : '#1e293b' }}   // required, otherwise Recharts renders black text
```
(Existing code detects dark via `colors.tick === '#4b5563'`.)

---

## TradeForm layout

- Page fits viewport (no page scroll): header + 3-column grid `minmax(300px,1fr) | minmax(0,1.7fr) | minmax(260px,1fr)` with `gridTemplateRows: minmax(0,1fr)`; columns 1 and 3 scroll internally.
- **Col 1:** Trade Info (Live/Backtest toggle, Asset / Direction / Result / Risk Management as `Segmented` button rows, Entry Time, R:R + PnL $ → computed risk, Series select) + Entry Models (drag-reorder, inline add/delete).
- **Col 2:** Notes in a 2×2 grid — Premarket Analysis | Why I Entered / Psychology | Improvements.
- **Col 3:** Screenshots — existing shots (mark for delete) + 3 `UploadZone`s; paste works on **hover** (document-level paste listener), click, drag & drop.
- Header shows live summary chips (asset, direction, result, R) and validation error; **Ctrl/Cmd+Enter** submits.

## Expenses (prop firm accounts)

- Account: firm, size, purchase price, status `eval → funded → blown`, `purchased_at`, `passed_at` (set when funded/blown), `blown_at` (when blown), notes.
- Payouts per account (expandable list, add/delete).
- Summary: total spent, total payouts, net P&L, active accounts. CSV export of accounts (client-side).
- `passed_at` dates feed the Dashboard calendar highlight.

## Gamification

Server-side (`server/gamification.js`): XP awarded on trade create (`awardXP`), recalculated on edit (`recalcNoteXP`), revoked on delete (`revokeXP`). Levels with tiers (`TIER_STYLES` in `useGamification.js`), daily logging streak with multiplier, 10 seeded achievements (`db.js`). Sidebar refetches profile on every navigation.

## Backup & restore

On the **Trades** page: download ZIP (DB + uploads) / restore ZIP with confirmation banner. Restore swaps the DB via `reinitDb()` — `db` is exported as a Proxy so all route modules keep working after the swap. **There is no CSV export/import of trades anymore** (removed in favour of ZIP backup).

---

## Key rules

- **No Settings page in navigation.** Entry models are created inline in TradeForm and reordered by drag in Dashboard filters. `Settings.jsx` is dead code.
- **`pnl` is a result, not money.** Dollar result lives in the separate optional `pnl_dollars`.
- **Entry model multiselect uses AND logic** (`HAVING COUNT(DISTINCT entry_model_id) = N`).
- **Never nest `<form>` elements.** TradeForm has one outer form; inner buttons use `type="button"`.
- **Dashboard stats are computed client-side from `displayTrades`.** `/trades/stats` and `/trades/equity` exist on the server but the Dashboard does not use them.
- **Screenshots served statically** at `/uploads/<filename>`; Vite proxies `/api` and `/uploads` → `:3001`.
- **Asset list is hardcoded in 3 places:** `TradeForm.jsx` (`ASSETS`), `TradeList.jsx`, `Dashboard.jsx` filter. Update all when adding assets.
- **Use `ConfirmDialog`** for destructive actions, not `window.confirm`.
- **Every new UI must work in both light and dark theme** (`dark:` variants, theme CSS variables, `useThemeColors`).

### Colors
Defined as CSS variables in `index.css` (`:root` = light, `html.dark` = dark) and mapped in `tailwind.config.js`:

| Token | Dark | Light |
|---|---|---|
| `profit` / `accent` | `#c6f135` (198 241 53) | `#65a30d` |
| `loss` | `#7c3aed` purple | `#7c3aed` |
| `surface` / `card` / `raised` / `border` | 10 / 17 / 26 / 42 gray | slate-100 / white / slate-200 / slate-300 |

- **`colorMain`** — `#c6f135` dark / `#65a30d` light — "limetková", wins & highlights in charts.
- **`colorNeg`** — `#7c3aed` purple — losses in charts.
- Negative net R text uses orange `#fb923c`.

### `.card` class
`bg-surface-card border border-surface-border rounded-2xl p-5` — for a full-width clickable header use `!p-0` on the card and `p-5` on the inner button.

---

## User preferences

- **Přímá implementace** — small changes go straight to code, no planning needed. Plan mode only for multi-file or architecturally complex tasks.
- **Barvy:** Use the app palette (`colorMain` "limetková", `colorNeg` purple). No generic greens (#4ade80 etc.).
- **Výšky grafů:** Prefer fixed pixel heights; if using `height="100%"`, make sure the parent chain has a real height. Re-check visual alignment when adding/removing charts.
- **Animace:** framer-motion page transitions were tried and reverted — user didn't like them. CSS grid-rows collapsible animations are fine.
- **Tooltip:** All Recharts tooltips must set `itemStyle` color (white in dark, slate in light).
- **Datumy v tabulkách:** Full date incl. year — `format(parseISO(str), 'MMM d, yyyy HH:mm')`.
- UI texts are in English (a few Czech tooltips/comments exist).

---

## Current goals / known gaps

- **Daily Bias** is screenshot-only — could add a Bullish / Bearish / Neutral text tag.
- **TradeList entry model filter** is single-select — could become multiselect like Dashboard.
- **CSV export/import of trades** no longer exists — could be re-added if needed.
- **No PDF export.**
- `Settings.jsx` and unused `/trades/stats`, `/trades/equity` endpoints could be removed.
- `trades.session_type` has no CHECK constraint.
