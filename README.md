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
| Styling | Tailwind CSS v3 (custom dark theme) |
| Charts | Recharts (line, pie, bar) |
| Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` |
| File uploads | Multer (screenshots stored locally) |
| Backup | adm-zip (full DB + uploads export) |
| Dev runner | concurrently |

---

## Features

- **Trade logging** — asset, direction (long/short), result (win/loss/breakeven), R:R ratio, risk amount, entry time, session type (live/backtest)
- **Entry models** — create custom setup tags (e.g. "Break & Retest", "FVG Fill") and attach multiple to each trade
- **Trade notes** — three text fields per trade: why you entered, psychological state, and what to improve
- **Screenshot uploads** — attach LTF chart, HTF chart, and daily bias screenshots per trade; view them in a lightbox
- **Trade series** — group related trades into named series for campaign-style analysis
- **Dashboard stats** — 7 cards: total trades, win rate, avg R:R, wins, losses, breakevens, avg trades/week
- **Performance curve** — equity score line chart showing progression over time
- **Win rate donut** — at-a-glance win/loss/breakeven breakdown
- **Win rate by day** — bar chart showing which days of the week you perform best on
- **Collapsible filters** — filter by asset, direction, PnL, entry model, date range, session type, series, and day of week
- **Trade list** — paginated (25/page), filterable table with full CSV export and import
- **Gamification** — XP system, levels (Bronze → Legend), daily logging streak, 10 unlockable achievements
- **Backup & restore** — download your entire database + screenshots as a ZIP, restore it anytime

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

Open `http://localhost:5173` in your browser. The SQLite database is auto-created at `server/data/journal.db` on first run.

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
│
├── client/                   # React frontend (Vite)
│   └── src/
│       ├── api.js            # All fetch calls to /api/*
│       ├── App.jsx           # Route definitions
│       ├── components/
│       │   ├── Layout.jsx    # Sidebar nav + background
│       │   ├── StatCard.jsx  # Reusable stat display card
│       │   ├── XPBar.jsx     # XP progress bar
│       │   ├── LevelBadge.jsx
│       │   └── DatePicker.jsx
│       ├── hooks/
│       │   └── useGamification.js  # XP / level / streak logic
│       └── pages/
│           ├── Dashboard.jsx   # Stats, charts, filters
│           ├── TradeForm.jsx   # Create / edit trade
│           ├── TradeDetail.jsx # Read-only trade view + lightbox
│           ├── TradeList.jsx   # Paginated table, CSV import/export
│           ├── Series.jsx      # Trade series management
│           └── Profile.jsx     # Gamification stats + achievements
│
└── server/                   # Express backend
    ├── index.js              # App entry, mounts routes
    ├── db.js                 # SQLite schema + migrations + achievement seeding
    ├── gamification.js       # XP award logic
    ├── data/journal.db       # SQLite DB (auto-created, gitignored)
    ├── uploads/              # Uploaded screenshots (gitignored)
    └── routes/
        ├── trades.js         # CRUD, /stats, /equity, CSV import
        ├── entryModels.js    # Entry model tag management
        ├── series.js         # Trade series CRUD
        ├── gamification.js   # Profile + level endpoints
        └── backup.js         # ZIP backup download + restore
```

---

## Database Schema

```sql
series              (id, name, description, created_at, updated_at)
entry_models        (id, name UNIQUE, sort_order)
trades              (id, asset, session_type, series_id, direction, pnl,
                     risk_reward, risk_amount, entry_time,
                     why_entered, psychology, improvements,
                     risk_management, created_at, updated_at)
trade_entry_models  (trade_id, entry_model_id)   -- junction table, multiselect
screenshots         (id, trade_id, type, filename, original_name, created_at)
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
