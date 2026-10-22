# Visual Redesign + Gamification Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Ascend a calm, professional blue/coral design system (light-first, dark kept), restructure the sidebar and Dashboard after `inspiration/*.png`, restyle the other pages, and remove gamification and dead code.

**Architecture:** Colours live as CSS variables in `client/src/index.css`, mapped to Tailwind tokens; components (`.card`, `.btn-*`, `.input`, pill segmented) are redefined there, so most pages switch by token. Charts read colours only from `useThemeColors()`. Gamification is deleted end to end; its DB tables are left in place but no longer created or written.

**Tech Stack:** React 18 + Vite, Tailwind v3 (`darkMode: 'class'`), Recharts, Express + better-sqlite3, Docker compose.

**Spec:** `docs/superpowers/specs/2026-10-22-visual-redesign-design.md`

## Global Constraints

- Palette exactly as spec §1 table (light / dark): surface `#F2F4F8`/`#0F1420`, card `#FFFFFF`/`#171D2B`, raised `#EEF1F6`/`#1F2636`, border `#E4E8EF`/`#2A3245`, accent=profit `#2563EB`/`#4F7BFF`, accent-soft `#DBE6FE`/`#1E2B4D`, loss `#F04461`/`#FF5C78`, neutral `#94A3B8`/`#64748B`, hero gradient `#3B5BFD → #38BDF8`.
- No hardcoded colours in components; charts take colours from `useThemeColors()`; every Recharts tooltip sets `itemStyle` colour.
- Every UI works in light and dark.
- **Never touch the real DB** (`server/data/journal.db`) in tests — use `scripts/dev/api-smoke.sh` (scratch copy, port 3999). Do not `require('./server/db')` from the repo dir.
- **No git commits unless the user explicitly says so** — each task ends with a checkpoint, not a commit.
- UI copy in English; dates in tables `format(parseISO(str), 'MMM d, yyyy HH:mm')`.
- Chart `height="100%"` only with an unbroken `flex-1 min-h-0` parent chain; otherwise fixed px.

## Review Focus

- Filters that match **zero trades**: every stat card, gauge, bar chart and curve renders `—`/0 without `NaN`, `Infinity` or crashes (Task 5).
- Trades with **no `pnl_dollars`** at all: Total P&L card shows `—`, not `$0` (Task 5).
- **1366×768** viewport: Dashboard and TradeForm fit without page scroll and all charts are visible (Tasks 5, 7 screenshots).
- **Deleting an old trade** that still has `xp_log` / `player_achievements` rows after gamification code is gone succeeds (Task 2 smoke test).
- **Restoring an old backup ZIP** (pre-`day_type`, with gamification tables) still boots and migrates (Task 2 smoke test restores the 13:14 backup DB).

---

### Task 1: Verification harness

**Files:**
- Create: `scripts/dev/api-smoke.sh`
- Create: `scripts/dev/screenshots.mjs`

**Interfaces:**
- Produces: `scripts/dev/api-smoke.sh [db-file]` — exits 0 when all checks pass, prints `FAIL: <reason>` and exits 1 otherwise. `node scripts/dev/screenshots.mjs <outDir> [baseUrl=http://127.0.0.1:7420]` — writes `<page>_<theme>_<w>.png`, prints `<page> <theme> <w> errors: [...]`, exits 1 if any console error/warning or page error.

- [ ] **Step 1:** Write `api-smoke.sh`: copy `server/{*.js,routes,node_modules,package.json}` to `$(mktemp -d)`, copy DB (default `server/data/backups/journal_before_premarket_20261022_131424.db`) to `data/journal.db` there, start `PORT=3999 node index.js`, then assert with `curl` + `node -pe`:
  - `GET /api/trades` length equals `GET /api/trades?day_type=all` minus notrade count;
  - POST trade (`asset=NQ direction=long pnl=win entry_time=2026-10-21T10:00 risk_reward=2`) → 201; POST no-trade (`day_type=notrade entry_time=2026-10-21T09:00 no_trade_reason=x`) → 201 with `asset` null;
  - PUT each → 200; DELETE each → `{ok:true}`;
  - DELETE the oldest existing trade (has `xp_log` rows) → `{ok:true}`;
  - POST without asset for `day_type=trade` → 400.
  Kill the server on exit (`trap`).
- [ ] **Step 2:** Write `screenshots.mjs` with Playwright from root `node_modules/playwright`, `executablePath: '/usr/bin/chromium'`; theme via `localStorage.setItem('theme', t)` in an init script; viewports 1600×900 and 1366×768; pages: `/dashboard`, `/trades`, first trade detail (id from `/api/trades`), `/trades/new` (+ click "No-trade day" → `newnotrade`), `/series`, `/expenses`. Route `**/api/trades?day_type=notrade` to two fake no-trade days in the current month (no DB writes). Also record `document.documentElement.scrollHeight > innerHeight` for `/dashboard` and `/trades/new` as `pageScroll: true` in the output.
- [ ] **Step 3:** Run both against the current app. Expected: api-smoke passes; screenshots run, giving a baseline (current gamification response field is allowed at this point).
- [ ] **Step 4:** Checkpoint.

### Task 2: Remove gamification and dead code

**Files:**
- Delete: `server/gamification.js`, `server/routes/gamification.js`, `client/src/pages/Profile.jsx`, `client/src/pages/Settings.jsx`, `client/src/components/{XPBar,LevelBadge,XPToast}.jsx`, `client/src/hooks/useGamification.js`; `client/public/{background.png,background_vid.mp4,logo.mp4}` after `grep -r` shows no reference.
- Modify: `server/index.js` (unmount route), `server/routes/trades.js` (drop XP calls, `gamification` field, `/stats`, `/equity`), `server/db.js` (drop CREATE of `player_profile`, `achievements`, `player_achievements`, `xp_log` and achievement seeds), `client/src/api.js` (drop `getProfile`, `getStats`, `getEquity`), `client/src/App.jsx` (drop `/profile`), `client/src/components/Layout.jsx` (drop XP summary + Profile nav), `client/src/pages/TradeForm.jsx` (save → `navigate(afterNav)` directly), `client/package.json` (remove `framer-motion`, `npm install`), `scripts/dev/api-smoke.sh`.

**Interfaces:**
- Produces: trade POST/PUT responses = trade row + `entry_models` + `screenshots`, no `gamification` key. `/api/gamification/*`, `/api/trades/stats`, `/api/trades/equity` → 404 (stats/equity fall through to `GET /:id` → `{"error":"not found"}` is acceptable).

- [ ] **Step 1:** Add to `api-smoke.sh`: POST response has no `gamification` key; `GET /api/gamification/profile` status 404; boot also against a DB whose gamification tables exist (default backup) — still passes.
- [ ] **Step 2:** Run → FAIL on the `gamification` key.
- [ ] **Step 3:** Make the deletions/modifications above.
- [ ] **Step 4:** `cd client && npx vite build` passes; `grep -rnE "gamif|XPBar|LevelBadge|XPToast|getProfile|framer" client/src server --include=*.js --include=*.jsx` → no hits; api-smoke passes.
- [ ] **Step 5:** Checkpoint.

### Task 3: Design system

**Files:**
- Modify: `client/src/index.css`, `client/tailwind.config.js`, `client/src/hooks/useThemeColors.js`
- Create: `client/src/components/Logo.jsx`, `client/public/favicon.svg`; modify `client/index.html` (favicon link)

**Interfaces:**
- Produces: Tailwind colours `surface`, `surface-card`, `surface-raised`, `surface-border`, `accent`, `accent-soft`, `profit`, `loss`, `neutral` (all `rgb(var(--…) / <alpha-value>)`); classes `.card`, `.card-hero`, `.btn-primary`, `.btn-ghost`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`, `.seg` (pill track) + `.seg-item` / `.seg-item-active` (island) / `.seg-item-primary` (solid accent), `.stat-value` (`text-3xl font-semibold tabular-nums`), `.stat-label` (small muted); `--shadow-card` variable.
- `useThemeColors()` → `{ colorMain, colorNeg, breakeven, accentSoft, grid, tick, labelColor, tooltipBg, tooltipShadow, cursorStroke, isDark }` (add `isDark` so pages stop sniffing `tick`).
- `<Logo className />` — inline SVG of the Ascend mark (outer triangle outline + inner chevron, as in `public/ascend-logo.png`), `fill="currentColor"`.

- [ ] **Step 1:** Implement tokens/components per spec §1 (card: no border, `rounded-3xl p-6`, shadow `0 1px 2px rgb(15 23 42 / .04), 0 8px 24px rgb(15 23 42 / .06)`, none in dark; text on accent white; labels normal case).
- [ ] **Step 2:** Replace every old-palette literal: `grep -rnoiE "#c6f135|#65a30d|#7c3aed|#fb923c|orange-[0-9]+|198,241,53|text-black" client/src` must return nothing (use tokens / `useThemeColors`). Replace `colors.tick === '#4b5563'` checks with `colors.isDark`.
- [ ] **Step 3:** Build passes; run screenshots — zero console errors; visually: no lime/purple anywhere, both themes legible.
- [ ] **Step 4:** Checkpoint.

### Task 4: Sidebar

**Files:** Modify `client/src/components/Layout.jsx`

**Interfaces:** Consumes `Logo`, tokens from Task 3. Keeps `localStorage('sidebarPinned')` behaviour and 64px rail.

- [ ] **Step 1:** Card-coloured rail/overlay without hard border (`--shadow-card` in light), `<Logo className="w-8 h-8 text-accent" />` on top, nav items with active state `bg-accent-soft text-accent`, bottom: theme toggle + pin only.
- [ ] **Step 2:** Screenshots of dashboard (rail) + a hover-expanded state in both themes; no console errors.
- [ ] **Step 3:** Checkpoint.

### Task 5: Dashboard

**Files:**
- Modify: `client/src/pages/Dashboard.jsx`
- Create: `client/src/components/dashboard/StatCards.jsx`, `client/src/components/dashboard/WinRateGauge.jsx`, `client/src/components/dashboard/WinRateByDay.jsx`, `client/src/components/dashboard/PerformanceCurve.jsx`
- Delete: `client/src/components/StatCard.jsx` if unused afterwards

**Interfaces:**
- `computeStats(trades) → { total, perWeek, wins, losses, breakevens, winRate|null, netR, avgRR|null, avgRisk|null, totalDollars|null }` exported from `StatCards.jsx` (pure; existing Dashboard formulas: win rate = wins/(wins+losses), net R = Σ win R:R − losses, avg R:R ignores null/0, per week = ISO weeks with ≥1 trade, `totalDollars` = Σ `pnl_dollars` or `null` when no trade has it).
- `<StatCards stats />`, `<WinRateGauge winRate wins losses />`, `<WinRateByDay trades />`, `<PerformanceCurve trades />`.

- [ ] **Step 1:** Header per spec §2.1: Live/Backtest/All pill (`.seg`, writes `session_type` URL param, default live) moved out of the filter panel; Filters button with active-count badge toggling the existing grid-rows panel; collapsed → chips; primary New Trade.
- [ ] **Step 2:** `StatCards`: hero Net R (`card-hero`, `+6.73R`, sub `N trades · X / week`), Win Rate with 3-segment W/L/BE bar + counts, Avg R:R, Avg $ Risk, Total P&L $ (accent ≥0, loss <0, `—` when null). Empty set → `—` everywhere, no NaN.
- [ ] **Step 3:** `PerformanceCurve`: Recharts `AreaChart`, `type="monotone"`, accent stroke + vertical gradient fill to transparent, current score big top-right; +1/−1 score by `created_at`.
- [ ] **Step 4:** `WinRateGauge`: semicircle of ~30 tick segments (SVG), filled share = winRate in accent, rest neutral at low opacity, % centred, `—` when null.
- [ ] **Step 5:** `WinRateByDay`: Mon–Fri rounded bars in neutral, best day (highest win rate with ≥1 decided trade) accent with value label; no reference line.
- [ ] **Step 6:** Layout: two equal columns filling height; left = curve on top, gauge + by-day side by side below; right = calendar. Verify with screenshots at both viewports (`pageScroll: false`), plus a run with filters producing zero trades (`/dashboard?asset=MES&from=2099-01-01`) — no NaN text (`page.content()` must not contain `NaN`; add this check to `screenshots.mjs`).
- [ ] **Step 7:** Checkpoint.

### Task 6: Calendar heatmap

**Files:** Modify `client/src/components/TradeCalendar.jsx`

**Interfaces:** Props unchanged (`trades`, `noTradeDays`, `passedDates`).

- [ ] **Step 1:** Day tiles: rounded (`rounded-xl`) with `gap-1.5` grid instead of rule lines; win `bg-accent-soft`; strong win (net R ≥ 2, or ≥2 wins and 0 losses) `bg-accent text-white`; loss `bg-loss/10 text-loss`; BE `bg-neutral/10`; out-of-month hatched (existing pattern, new colours); NO TRADE dashed `border-neutral`; PASS `ring-2 ring-accent` + "PASS" tag. Weekly column, P&L toggle, legend, popup kept in new tokens.
- [ ] **Step 2:** Screenshots both themes/viewports; check a strong-win tile's text is readable in dark.
- [ ] **Step 3:** Checkpoint.

### Task 7: Restyle remaining pages

**Files:** Modify `client/src/pages/{TradeList,TradeDetail,TradeForm,Expenses,Series}.jsx`, `client/src/components/{ConfirmDialog,DatePicker}.jsx`

- [ ] **Step 1:** TradeList: no vertical rules, `divide-y divide-surface-border` rows, muted normal-case header; result pill W `bg-accent-soft text-accent`, L `bg-loss/10 text-loss`, BE `bg-neutral/15 text-neutral`; direction arrow; filters in `.seg`/`.input`.
- [ ] **Step 2:** TradeDetail: big asset + pills header; metrics as `.stat-value` / `.stat-label`; borderless note/screenshot cards.
- [ ] **Step 3:** TradeForm: layout unchanged; `Segmented` → `.seg` styles, Trade/No-trade and Live/Backtest toggles as `.seg`; tokens for result/direction.
- [ ] **Step 4:** Expenses: summary as stat cards with `card-hero` for Net P&L; status colours eval = neutral, funded = accent, blown = loss; table restyled like TradeList.
- [ ] **Step 5:** Series, ConfirmDialog, DatePicker: new card/input/button styles only.
- [ ] **Step 6:** Full screenshot run (all pages × 2 themes × 2 viewports): zero console errors, `/trades/new` `pageScroll: false`.
- [ ] **Step 7:** Checkpoint.

### Task 8: Docs, Docker, final verification

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1:** Update CLAUDE.md: colours table + `colorMain`/`colorNeg` rules (blue/coral), card/segmented conventions, Dashboard layout description, remove Gamification section / XP mentions / Profile route / `/api/gamification` / `/stats` `/equity`, note gamification tables left unused in DB, add `scripts/dev/*` usage.
- [ ] **Step 2:** `cd client && npx vite build`; `scripts/dev/api-smoke.sh` passes.
- [ ] **Step 3:** `docker compose up -d --build`; `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7420/dashboard` → `200`; full screenshot run against :7420 passes.
- [ ] **Step 4:** Report to the user with screenshots; wait for "commitni a pushni".
