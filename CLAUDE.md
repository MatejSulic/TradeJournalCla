# Ascend — CLAUDE.md

## What this project is

A personal trading journal web app called **Ascend**. The user logs trades with structured metadata (asset, direction, result, entry models, psychology, screenshots) and reviews performance through a dashboard with filterable stats, a performance curve, a win rate donut chart, and a win rate by day-of-week bar chart.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Styling | Tailwind CSS v3 (dark theme, custom colors) |
| Charts | Recharts (LineChart, PieChart, BarChart) |
| Date utils | date-fns |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 |
| File uploads | Multer (screenshots stored in `server/uploads/`) |
| Dev runner | concurrently (runs server + client together) |
| Animation | framer-motion installed but not actively used |

**Run dev:** `npm run dev` from root (starts both server on :3001 and client on :5173)

---

## Project structure

```
ClaJournalApp/
├── package.json              # Root: runs both server and client via concurrently
├── client/
│   ├── src/
│   │   ├── api.js            # All fetch calls to /api/*
│   │   ├── App.jsx           # Routes: /dashboard, /trades, /trades/new, /trades/:id, /trades/:id/edit, /series, /profile
│   │   ├── components/
│   │   │   ├── Layout.jsx    # Sidebar nav (Dashboard + Trades + Series + Profile) + background video
│   │   │   ├── StatCard.jsx  # Reusable stat display card
│   │   │   ├── XPBar.jsx     # Gamification XP progress bar
│   │   │   └── DatePicker.jsx # Custom date input component
│   │   ├── hooks/
│   │   │   └── useGamification.js # XP / level / streak logic
│   │   └── pages/
│   │       ├── Dashboard.jsx   # Collapsible filters + stat cards + 3-chart layout + recent trades
│   │       ├── TradeForm.jsx   # Create/edit trade form (inline entry model creation)
│   │       ├── TradeDetail.jsx # Read-only trade view with screenshots + lightbox
│   │       ├── TradeList.jsx   # Filterable + paginated trade table (25/page), CSV export & import
│   │       ├── Series.jsx      # Trade series management
│   │       └── Profile.jsx     # User profile + gamification stats
│   ├── tailwind.config.js    # Custom colors: surface, profit, loss, accent
│   └── index.css             # Global component classes: .btn-*, .card, .input, .label
├── server/
│   ├── index.js              # Express app entry, mounts routes, serves /uploads static
│   ├── db.js                 # SQLite init + schema (DROP-safe on reset)
│   ├── data/journal.db       # SQLite database file (auto-created)
│   ├── uploads/              # Screenshot files (served at /uploads/<filename>)
│   └── routes/
│       ├── trades.js         # CRUD + /stats + /equity + /import endpoints
│       └── entryModels.js    # GET / POST / DELETE for entry model tags
```

---

## Database schema

```sql
entry_models        (id, name UNIQUE, sort_order)
trades              (id, asset, direction, pnl, risk_reward, risk_amount,
                     entry_time, why_entered, psychology, improvements,
                     risk_management, created_at, updated_at)
trade_entry_models  (trade_id, entry_model_id)   -- junction table, enables multiselect
screenshots         (id, trade_id, type, filename, original_name, created_at)
```

**Enums enforced by CHECK constraints:**
- `trades.direction` → `'long' | 'short'`
- `trades.pnl` → `'win' | 'loss' | 'breakeven'`
- `trades.risk_management` → `'low' | 'perfect' | 'high'`
- `screenshots.type` → `'ltf' | 'htf' | 'daily_bias'`

**If you change any CHECK constraint**, delete the DB file and restart:
```bash
rm server/data/journal.db*
```

---

## Trade journal field types

| Field | Type | Notes |
|---|---|---|
| Daily Bias | single tag | Stored as screenshot (`type = 'daily_bias'`), not text |
| Asset | single value | Select from fixed list: NQ, MNQ, ES, MES, NQ Backtest, MNQ Backtest, ES Backtest, MES Backtest |
| P&L | single value | Win / Loss / Breakeven — stored as text, NOT a dollar amount |
| Risk Reward Ratio | decimal | Optional, stored as REAL |
| Direction | single value | Long / Short |
| Entry Model | MULTISELECT | Multiple tags via `trade_entry_models` junction table |
| Why did I enter? | bullet list | Free text textarea (`why_entered`) |
| Psyche | bullet list | Emotional state (`psychology`) |
| How to improve? | bullet list | Actionable takeaways (`improvements`) |
| Risk Management | single tag | Low / Perfect / High |
| Time of Entry | datetime | `entry_time` TEXT (ISO format) |
| Day of the week | single value | Derived from `entry_time` via date-fns, not stored |

---

## Dashboard — current state

### Stat cards (7 total, `lg:grid-cols-7`)
Total Trades · Avg Trades/Week · Win Rate · Avg R:R · Wins · Losses · Breakevens

**Avg Trades/Week** counts only ISO weeks that have at least one trade (no empty-week dilution).

### Filters (collapsible card)
- Card uses `!p-0 overflow-hidden`, toggle button has `p-5`
- Collapsed state shows active filter summary chips
- Expand/collapse animation via CSS `grid-template-rows: 0fr ↔ 1fr` with `transition duration-300`
- **DOW filter** (Mon–Fri) is applied **client-side** — creates `displayTrades` from server-fetched `trades`
- All stats, charts, and the recent trades table use `displayTrades`, not `trades` directly

### Charts layout (`lg:grid-cols-3`)
- **Left (col-span-2):** Performance Curve — fixed `height={457}` — line chart, equity score
- **Right column (flex-col gap-4):**
  - **Win Rate donut** — fixed `height={220}`, `innerRadius={62}`, `outerRadius={88}`, win rate % centered via SVG `<text>`, no legend
  - **Win Rate by Day** — fixed `height={189}`, BarChart Mon–Fri, bars colored green (≥50%) or purple (<50%), `LabelList` labels in `COLOR_MAIN`

**Chart height rule:** Always use explicit pixel heights on `ResponsiveContainer`. `height="100%"` does NOT work without a pixel-height parent — avoids invisible charts.

**Visual alignment:** Left card total height = right column total height (calculated: 2 × 286px cards + 16px gap = 588px; left = 457 + 80px overhead = 537... adjust if re-tuning).

### Tooltip styling (all 3 charts)
```jsx
contentStyle={{ background: '#111111', border: '1px solid #2a2a2a', borderRadius: 12, fontSize: 12 }}
labelStyle={{ color: '#6b7280' }}
itemStyle={{ color: '#fff' }}
```
Use `itemStyle={{ color: '#fff' }}` — without it Recharts renders item text in black.

---

## Key rules

- **No Settings page.** Entry models are created inline inside TradeForm.
- **No dollar PnL.** The `pnl` field is `win | loss | breakeven` only.
- **Entry model multiselect uses AND logic.** Dashboard filters with `HAVING COUNT(DISTINCT entry_model_id) = N`.
- **Never nest `<form>` elements.** TradeForm has one outer form; model tag buttons use `type="button"`.
- **Stats computed client-side from `displayTrades`** (after DOW filter). Do not move stat computation to the server.
- **Screenshots served statically** at `/uploads/<filename>`. Client proxies `/uploads` → `:3001` in dev.
- **Asset list is hardcoded** in `TradeForm.jsx` and `TradeList.jsx`. Update both if adding assets.

### Tailwind color conventions
- `text-profit` = sky-400 (wins, long direction) — in CSS/Tailwind
- `text-loss` = orange-400 (losses, short direction) — in CSS/Tailwind
- `text-accent` = indigo-400 (UI highlights)
- `bg-surface-*` = dark background layers
- **`COLOR_MAIN = '#c6f135'`** — lime/yellow-green, used in charts for wins, labels, highlights (user calls it "limetková")
- **`COLOR_NEG = '#7c3aed'`** — purple, used in charts for losses

### `.card` class
`bg-surface-card border border-surface-border rounded-2xl p-5` — when making a button span the full card width (e.g. collapsible header), use `!p-0` on the card and add `p-5` to the inner button instead.

---

## CSV export & import

- **Export** — client-side, from currently filtered trades. `entry_models` joined as `name1;name2`.
- **Import** — `POST /api/trades/import`, JSON array, runs in `db.transaction()`. Returns `{ imported: N, errors: [] }`.
- **Import has a confirmation step** — banner shows row count, requires explicit click before DB write.
- Screenshots not included in CSV.

---

## User preferences

- **Přímá implementace** — small changes go straight to code, no planning needed. Use plan mode only for multi-file or architecturally complex tasks.
- **Barvy:** Prefer `COLOR_MAIN` (#c6f135, "limetková") for positive/highlight elements in charts. Don't use generic greens (#4ade80 etc.) — use the app's own palette.
- **Výšky grafů:** Always fixed pixel values. Recalculate manually when adding/removing charts to maintain visual alignment.
- **Animace:** Page transition animations (framer-motion) were tried and reverted — user did not like them. Collapsible section animations (CSS grid-rows trick) are fine.
- **Tooltip:** All Recharts tooltips must have `itemStyle={{ color: '#fff' }}` to avoid unreadable black text on dark background.
- **Datumy v tabulkách:** Full date including year — `format(parseISO(str), 'MMM d, yyyy HH:mm')`.

---

## Current goals / known gaps

- **Daily Bias** is screenshot-only (no text tag). Could add Bullish / Bearish / Neutral text field.
- **Risk Amount** field exists in the form but not shown in Dashboard stats.
- **TradeList setup filter** is single-select. Could upgrade to multiselect (same as Dashboard).
- **No PDF export** yet.
- **framer-motion** is installed in `client/` but not used — available if a specific micro-animation is wanted.
