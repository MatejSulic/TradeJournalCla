# Ascend — visual redesign + gamification removal

Date: 2026-10-22 · Scope: variant **B** (new design system everywhere, restructured Dashboard + sidebar, other pages restyled only)

## Why

The user dislikes how the app feels: too "gamer" / loud (lime + purple), generic, too many bordered boxes.
References: `inspiration/*.png` — light, airy dashboards: soft grey background, borderless white cards with
large radius and soft shadows, one confident blue accent + one contrast colour, big bold numbers with small
muted labels, smooth curves, pill segmented controls, one highlighted bar, heatmap grid with hatched empties,
1–2 gradient hero cards.

Success = the app reads as a calm, professional, characterful tool in both themes; no feature regressions
(except gamification, removed on purpose); no data touched.

## 1. Design system

### Colour tokens (CSS variables in `index.css`, mapped in `tailwind.config.js`)

| Token | Light | Dark |
|---|---|---|
| `surface` (page bg) | `#F2F4F8` | `#0F1420` |
| `surface-card` | `#FFFFFF` | `#171D2B` |
| `surface-raised` (hover, inputs) | `#EEF1F6` | `#1F2636` |
| `surface-border` (subtle dividers only) | `#E4E8EF` | `#2A3245` |
| `accent` = `profit` (wins, active, curve) | `#2563EB` | `#4F7BFF` |
| `accent-soft` (new) | `#DBE6FE` | `#1E2B4D` |
| `loss` | `#F04461` | `#FF5C78` |
| `neutral` / BE (new) | `#94A3B8` | `#64748B` |
| hero gradient | `#3B5BFD → #38BDF8` | same |

- `profit` and `accent` both map to the blue accent, so existing `text-profit` / `bg-accent` usages switch automatically.
- All hardcoded old-palette values (`#c6f135`, `#65a30d`, `#7c3aed`, `#fb923c`, `orange-*`, `text-black` on accent)
  are replaced by tokens (TradeCalendar, Expenses, Dashboard, TradeForm, TradeList, useThemeColors).
- Text on accent = white.

### Components (`index.css` `@layer components`)

- `.card`: no border, `rounded-3xl`, `p-6`, soft shadow (`0 1px 2px rgb(15 23 42 / .04), 0 8px 24px rgb(15 23 42 / .06)`);
  dark: no shadow, card colour carries the separation.
- New `.card-hero`: hero gradient, white text, same radius.
- `.btn-primary`: solid accent, white text. `.btn-ghost`: borderless, raised background on hover. `.btn-danger`: loss tint.
- `.input`: `surface-raised` fill, no border, accent focus ring.
- `.label` / section headings: normal case, `text-sm font-medium` muted — no uppercase + wide tracking.
- Pill segmented control: raised track, active option = card-coloured "island" (or solid accent where it is the primary choice).
- Big numbers: `text-3xl`/`text-4xl font-semibold tabular-nums` + small muted label.

### Charts

- `useThemeColors()` returns the new palette (`colorMain` = accent, `colorNeg` = loss, `breakeven` = neutral,
  plus `accentSoft`, grid/tick in slate tones).
- Tooltips: card-coloured bubble, no border, soft shadow, radius 12; `itemStyle` colour still required.

### Logo

Replace lime `ascend-logo.png` usage with an inline SVG of the same mark (triangle outline + chevron) using
`currentColor` → accent in sidebar. Favicon regenerated as SVG in accent blue.

## 2. Sidebar + Dashboard

### Sidebar (`Layout.jsx`)

Same behaviour (64px icon rail, hover slide-out overlay, pin in `localStorage('sidebarPinned')`).
Card-coloured, no hard edge (shadow in light, card colour in dark). Active item: `accent-soft` background + accent icon/text.
Top: SVG logo. Bottom: theme toggle + pin. XP summary removed. "Profile" nav item removed.

### Dashboard (`Dashboard.jsx`) — still fills the viewport (`flex-1 min-h-0` chain)

1. **Header:** title "Dashboard" + subtitle left. Right: pill **Live / Backtest / All** (moved out of the filter panel,
   still `session_type` URL param, default Live), **Filters** button with active-count badge, primary **New Trade**.
   The filter panel expands below the header (same grid-rows animation); when collapsed, active filters show as chips.
   Panel content unchanged except Session removed.
2. **Stats row (5 cards):**
   - **Hero (gradient): Net R** — big `+6.73R`, sub `30 trades · 3.3 / week`.
   - **Win Rate** — big `%`, thin 3-segment W/L/BE bar with counts (replaces the Results card).
   - **Avg R:R**.
   - **Avg $ Risk**.
   - **Total P&L $** — sum of `pnl_dollars` (new), accent if ≥0, loss if <0, `—` if no dollar data.
3. **Bottom area**, two equal columns:
   - Left top: **Performance Curve** — smooth `monotone` area with accent gradient fill, current score big in the corner.
     Metric unchanged (+1 win / −1 loss, sorted by `created_at`).
   - Left bottom, side by side: **Win Rate gauge** (semicircle of tick segments, accent filled share, % centred)
     replacing the donut; **Win Rate by Day** — rounded neutral bars, best day solid accent with value label,
     no 50% reference line.
   - Right: **TradeCalendar as heatmap** — rounded day tiles with gaps instead of grid lines; win day `accent-soft`,
     strong win day (net R ≥ 2 or ≥2 wins with no losses) solid accent with white text, loss day loss tint, BE neutral tint,
     out-of-month hatched; weekly summary column kept; NO TRADE stays dashed; PASS = accent ring + "PASS" tag;
     P&L toggle and legend kept in new colours.

All stats remain client-side from `displayTrades`.

## 3. Other pages (restyle, same layout)

- **TradeList:** table without vertical rules, subtle row dividers, header in muted normal case; result as tinted pill
  (W accent, L loss, BE neutral), direction arrow; filters in new pill/input style.
- **TradeDetail:** header with big asset + pills; metrics as big numbers with small labels; notes/screenshots as borderless cards.
- **TradeForm:** layout unchanged; new cards, pill `Segmented`, inputs; result/direction colours via tokens.
- **Expenses:** summary as stat cards with hero for Net P&L; accounts table + payouts restyled; status colours
  eval = neutral, funded = accent, blown = loss.
- **Series, ConfirmDialog, DatePicker:** restyle only.

## 4. Removals

- **Gamification, client:** `pages/Profile.jsx` + `/profile` route + nav item, `XPBar`, `LevelBadge`, `XPToast`,
  `hooks/useGamification.js`, `getProfile` in `api.js`, XP toast flow in TradeForm (save → navigate directly).
- **Gamification, server:** `server/gamification.js`, `routes/gamification.js` + mount, `awardXP`/`recalcNoteXP`/`revokeXP`
  calls and `gamification` field in trade responses.
- **DB:** gamification tables (`player_profile`, `achievements`, `player_achievements`, `xp_log`) are **left in place**
  (unused, harmless). Their `CREATE TABLE` and achievement seeds in `db.js` are removed so nothing new is written.
  `xp_log`/`player_achievements` FKs to `trades` are `ON DELETE SET NULL`, so deleting trades still works.
- **Dead code:** `pages/Settings.jsx`, `/trades/stats`, `/trades/equity` (+ `getStats`/`getEquity`), `framer-motion`
  dependency, unused `public/background.png`, `background_vid.mp4`, `logo.mp4` (verify unreferenced first).
- `StatCard.jsx` reused/reworked for the new stat cards or removed if unused.

## 5. Testing

- `vite build` passes.
- Headless Chromium screenshots of every page (dashboard, trades, trade detail, new trade + no-trade mode,
  series, expenses) in light + dark at 1600×900 and 1366×768; zero console errors/warnings.
- Create / edit / delete of a trade and a no-trade day against a **scratch copy** of the DB on a temporary port
  (never the real DB); confirm responses no longer carry gamification and deletes succeed with leftover `xp_log` rows.
- Rebuild Docker (`docker compose up -d --build`) and smoke-test http://localhost:7420.
- Update `CLAUDE.md` (palette, colour rules, removed gamification, removed endpoints).

## Out of scope

New features beyond Total P&L $ card; layout changes of TradeForm/TradeList/TradeDetail/Expenses; dropping DB tables.
