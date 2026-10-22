# Ascend — Trading Journal

> Log your trades. Review your patterns. Actually get better.

---

## What is this?

Ascend is a personal trading journal I built to track my trades with more structure than a spreadsheet. You log each trade — what you entered, why, how it went, screenshots of the chart — and the dashboard gives you stats and charts to spot patterns in your performance.

It runs entirely locally. No accounts, no subscriptions, no cloud. Your data stays on your machine.

Built as a learning project to practice full-stack development with React + Node.js + SQLite.

---

## Tech Stack

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white&style=flat-square)
![React Router](https://img.shields.io/badge/React_Router-v6-CA4245?logo=reactrouter&logoColor=white&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v3-38B2AC?logo=tailwindcss&logoColor=white&style=flat-square)
![Recharts](https://img.shields.io/badge/Recharts-2.12-22b5bf?style=flat-square)
![date-fns](https://img.shields.io/badge/date--fns-3-770C56?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white&style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white&style=flat-square)
![Multer](https://img.shields.io/badge/Multer-file_uploads-ff6900?style=flat-square)

| Side | Stack |
|------|-------|
| Frontend | React 18, Vite, React Router v6 |
| Styling | Tailwind CSS v3 (light + dark theme) |
| Charts | Recharts (line, pie, bar) |
| Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` |
| File uploads | Multer (screenshots stored locally) |
| Backup | adm-zip (full DB + uploads export) |
| Dev runner | concurrently |

---

## Features

- **Trade logging** — asset, session type (live/backtest), direction (long/short), result (win/loss/breakeven), optional $ P&L, R:R ratio, risk amount (auto-calculated), entry time, risk management rating
- **Entry models** — create custom setup tags (e.g. "Break & Retest", "FVG Fill") inline in the form and attach multiple to each trade; drag to reorder
- **Trade notes** — three text fields per trade: why you entered, psychological state, and what to improve
- **Screenshot uploads** — attach LTF chart, HTF chart, and daily bias screenshots per trade; view them in a lightbox
- **Trade series** — group related trades into named series for campaign-style analysis
- **Dashboard stats** — total trades (+ avg per week), win rate (+ net R), avg R:R, avg $ risk, W/L/BE results
- **Performance curve** — equity score line chart showing progression over time
- **Win rate donut** — at-a-glance win/loss/breakeven breakdown
- **Win rate by day** — bar chart showing which days of the week you perform best on
- **Trade calendar** — monthly view with daily results, $ P&L, weekly summaries and highlighted days when a prop account was passed
- **Collapsible filters** — filter by session type, asset, series, direction, result, entry models (AND), date range and day of week; filters are kept in the URL
- **Trade list** — paginated (25/page), filterable table
- **Expenses** — track prop firm accounts (eval / funded / blown), purchase costs and payouts, net P&L, CSV export
- **Gamification** — XP system, levels (Bronze → Legend), daily logging streak, 10 unlockable achievements
- **Backup & restore** — download your entire database + screenshots as a ZIP, restore it anytime (on the Trades page)
- **Light & dark mode** — toggle in the sidebar, remembered per browser

---

## Screenshots

**Dashboard**
![Dashboard](screenshots/Screenshot%20from%202026-06-01%2011-37-30.png)

**Dashboard — filters expanded**
![Dashboard filters](screenshots/Screenshot%20from%202026-06-01%2011-37-40.png)

**Trade List**
![Trade List](screenshots/Screenshot%20from%202026-06-01%2011-37-47.png)

**New Trade Form**
![Trade Form](screenshots/Screenshot%20from%202026-06-01%2011-37-55.png)

---

## Getting Started

### Quick start

Run `Spustit.sh` (Linux/macOS) or `Spustit.bat` (Windows) — it checks Node.js, installs dependencies on first run, starts the app and opens the browser.

### Prerequisites

- Node.js v18+
- npm

### Install & Run

```bash
# 1. Clone the repo
git clone https://github.com/MatejSulic/ClaJournalApp.git
cd ClaJournalApp

# 2. Install all dependencies (root + server + client)
npm run install:all

# 3. Start the dev server
npm run dev
```

This starts:
- **Backend** on `http://localhost:3001`
- **Frontend** on `http://localhost:5173`

Open `http://localhost:5173` in your browser. The SQLite database is auto-created at `server/data/journal.db` on first run (migrations run automatically on startup).

### Build for production

```bash
cd client
npm run build
```

The static output lands in `client/dist/`. Serve it with any static host alongside the Express backend.

---

## Project Structure

```
ClaJournalApp/
├── package.json              # Root — runs server + client via concurrently
├── Spustit.sh / Spustit.bat  # One-click launchers
│
├── client/                   # React frontend (Vite)
│   └── src/
│       ├── api.js            # All fetch calls to /api/*
│       ├── App.jsx           # Route definitions
│       ├── contexts/
│       │   └── ThemeContext.jsx    # Light / dark mode
│       ├── components/
│       │   ├── Layout.jsx          # Sidebar nav, theme toggle, XP summary
│       │   ├── TradeCalendar.jsx   # Monthly trade calendar
│       │   ├── StatCard.jsx        # Reusable stat display card
│       │   ├── ConfirmDialog.jsx   # Confirmation modal
│       │   ├── XPBar.jsx / LevelBadge.jsx / XPToast.jsx
│       │   └── DatePicker.jsx
│       ├── hooks/
│       │   ├── useGamification.js  # XP / level / streak data
│       │   └── useThemeColors.js   # Theme-aware chart colors
│       └── pages/
│           ├── Dashboard.jsx   # Stats, charts, calendar, filters
│           ├── TradeForm.jsx   # Create / edit trade
│           ├── TradeDetail.jsx # Read-only trade view + lightbox
│           ├── TradeList.jsx   # Paginated table, backup / restore
│           ├── Series.jsx      # Trade series management
│           ├── Expenses.jsx    # Prop firm accounts & payouts
│           └── Profile.jsx     # Gamification stats + achievements
│
└── server/                   # Express backend
    ├── index.js              # App entry, mounts routes
    ├── db.js                 # SQLite schema + migrations + achievement seeding
    ├── gamification.js       # XP / level / streak / achievement logic
    ├── data/journal.db       # SQLite DB (auto-created)
    ├── uploads/              # Uploaded screenshots (gitignored)
    └── routes/
        ├── trades.js         # Trade CRUD, /stats, /equity
        ├── entryModels.js    # Entry model tags (+ reorder)
        ├── series.js         # Trade series CRUD
        ├── expenses.js       # Prop accounts + payouts
        ├── gamification.js   # Profile + level endpoints
        └── backup.js         # ZIP backup download + restore
```

---

## Database Schema

```sql
series              (id, name, description, created_at, updated_at)
entry_models        (id, name UNIQUE, sort_order)
trades              (id, asset, session_type, series_id, direction, pnl,
                     risk_reward, risk_amount, pnl_dollars, entry_time,
                     why_entered, psychology, improvements,
                     risk_management, created_at, updated_at)
trade_entry_models  (trade_id, entry_model_id)   -- junction table, multiselect
screenshots         (id, trade_id, type, filename, original_name, created_at)
prop_accounts       (id, firm_name, account_size, purchase_price, status,
                     purchased_at, passed_at, blown_at, notes, ...)
prop_payouts        (id, account_id, amount, payout_date, notes, created_at)
player_profile      (user_id, xp, level, streak_days, last_trade_date, ...)
achievements        (key, name, description, icon, xp_reward)
player_achievements (user_id, achievement_key, trade_id, unlocked_at)
xp_log              (user_id, trade_id, source, amount, created_at)
```

---

## What I Learned

- **SQLite is genuinely good for local apps.** `better-sqlite3`'s synchronous API made the server code much simpler than async alternatives. WAL mode handles concurrent reads without any extra configuration.
- **Recharts needs explicit pixel heights.** `height="100%"` silently renders nothing unless the parent has a fixed pixel height. Learned this the hard way and it's now the first thing I check when a chart disappears.
- **Client-side filtering on top of server data is a valid pattern.** The day-of-week filter runs entirely in the browser after the server fetch — no need to add a server query parameter for every filter dimension.
- **Gamification mechanics are harder to design than to implement.** Writing the XP logic took an afternoon. Deciding *what* to reward (consistency, reflection quality, risk discipline vs. just wins) took much longer and required iterating on the feel of it.
- **CSS `grid-template-rows: 0fr / 1fr` is an underrated collapsible trick.** No JavaScript height calculations, no resize observers, no libraries — the transition just works and adapts to content length automatically.

---

## Author

**Matěj Šulič**

[GitHub](https://github.com/MatejSulic) · [LinkedIn](https://linkedin.com/in/matej-sulic) · sul.matej@gmail.com

---

## License

Personal use and learning project. No license — do what you want with it.

---

*Partly vibe coded with [Anthropic Claude](https://claude.ai).*
