# Ascend — CLAUDE.md

## What this project is

A personal trading journal web app called **Ascend**. The user logs trades with structured metadata (asset, direction, result, entry models, psychology, screenshots) and reviews performance through a dashboard with filterable stats, a win/loss performance curve, and a Win/Loss/BE pie chart.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Styling | Tailwind CSS v3 (dark theme, custom colors) |
| Charts | Recharts (LineChart, PieChart) |
| Date utils | date-fns |
| Backend | Node.js, Express |
| Database | SQLite via better-sqlite3 |
| File uploads | Multer (screenshots stored in `server/uploads/`) |
| Dev runner | concurrently (runs server + client together) |

**Run dev:** `npm run dev` from root (starts both server on :3001 and client on :5173)

---

## Project structure

```
ClaJournalApp/
├── package.json              # Root: runs both server and client via concurrently
├── client/                   # React frontend
│   ├── src/
│   │   ├── api.js            # All fetch calls to /api/*
│   │   ├── App.jsx           # Routes: /dashboard, /trades, /trades/new, /trades/:id, /trades/:id/edit
│   │   ├── components/
│   │   │   ├── Layout.jsx    # Sidebar nav (Dashboard + Trades + Profile)
│   │   │   └── StatCard.jsx  # Reusable stat display card
│   │   └── pages/
│   │       ├── Dashboard.jsx # Filterable stats + performance curve + pie chart + recent trades
│   │       ├── TradeForm.jsx # Create/edit trade form (also handles inline entry model creation)
│   │       ├── TradeDetail.jsx # Read-only trade view with screenshots + lightbox
│   │       └── TradeList.jsx # Filterable + paginated trade table (25/page), CSV export & import
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
entry_models        (id, name UNIQUE)
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

**If you change any CHECK constraint**, you must delete the DB file and restart the server so it recreates fresh:
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

## Key rules

- **No Settings page.** Entry models are created inline inside TradeForm. Never route the user to a separate settings page for this.
- **No dollar PnL.** The `pnl` field is `win | loss | breakeven` only. There is no dollar amount stored. Do not add one without explicit request.
- **Entry model multiselect uses AND logic.** When filtering by multiple setups on the Dashboard, only trades that have ALL selected setups are returned (SQL: `GROUP BY trade_id HAVING COUNT(DISTINCT entry_model_id) = N`).
- **Never nest `<form>` elements.** TradeForm has one outer form. Adding model tags uses a `<div>` with `type="button"` buttons — not a nested form.
- **Stats are always computed client-side from filtered trades.** The `/api/trades/stats` and `/api/trades/equity` endpoints exist but the Dashboard fetches `/api/trades` with filters and computes stats from the response. Do not add server-side stat filtering.
- **Screenshots are served statically** at `/uploads/<filename>` from `server/uploads/`. The client proxies `/uploads` to `:3001` in dev (see `vite.config.js`).
- **Tailwind color conventions:**
  - `text-profit` = sky-400 (wins, long direction)
  - `text-loss` = orange-400 (losses, short direction)
  - `text-accent` = indigo-400 (UI highlights)
  - `bg-surface-*` = dark background layers
- **Asset list is hardcoded** in both `TradeForm.jsx` and `TradeList.jsx` as a constant array. If you add assets, update both.
- **`btn-secondary`** class exists in `index.css` — use it for secondary actions (e.g. Export/Import buttons). Style: dark card background, slate text, border.

---

## CSV export & import

- **Export** — client-side only, generates CSV from currently displayed (filtered) trades. `entry_models` joined as `name1;name2` (semicolon separator).
- **Import** — server endpoint `POST /api/trades/import` accepts a JSON array. Entry models are looked up or created by name. Runs in a `db.transaction()`. Returns `{ imported: N, errors: [{row, message}] }`.
- **Import flow has a confirmation step** — after selecting a file, a banner shows the row count and requires explicit "Importovat" click before anything is written to the DB.
- Screenshots are not included in CSV export/import.

---

## Current goals / known gaps

- **Daily Bias** is currently screenshot-only (no text tag field). Could be extended to also store a text value (Bullish / Bearish / Neutral).
- **Risk Amount** field exists in the form but is not shown in the Dashboard stats.
- **TradeList setup filter** is still single-select. Could be upgraded to multiselect toggle buttons (same as Dashboard) if requested.
- **No PDF export** yet.
