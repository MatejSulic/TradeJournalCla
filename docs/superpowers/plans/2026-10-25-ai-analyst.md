# AI Analyst Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `/ai` page: filter journal trades + no-trade days, freeze them into a saved conversation, and chat with Gemini / Claude about them with streamed answers.

**Architecture:** Express route `/api/ai` with provider adapters (`server/ai/`) behind one `stream()` interface, SSE to the client, two new SQLite tables. Client gets a shared `TradeFilters` component (extracted from Dashboard) and an `AiAnalyst` page with history sidebar, selection list and chat.

**Tech Stack:** Node 22 / Express / better-sqlite3, `@google/genai`, `@anthropic-ai/sdk`, `node:test`; React 18 / Tailwind tokens, `react-markdown` + `remark-gfm`; Playwright (root `node_modules`, `/usr/bin/chromium`) for UI checks.

**Spec:** `docs/superpowers/specs/2026-10-25-ai-analyst-design.md` — read it; this plan does not repeat its tables, context format, prompt rules or UI copy.

## Global Constraints

- **Never touch `server/data/journal.db`.** `require('./server/db')` runs migrations on it. All server tests use a scratch DB: set `DB_PATH` env (added in Task 3) or use `scripts/dev/api-smoke.sh` with a backup copy (`server/data/backups/*.db`). Unit tests in Tasks 1–2 must not import `db.js`.
- Keys only server-side; `GET /api/ai/status` never returns them. `.env` gitignored.
- Default models: `gemini-2.5-flash`, `claude-sonnet-5-5` (overridable via `GEMINI_MODEL` / `ANTHROPIC_MODEL`).
- Provider order: `AI_PROVIDER` → anthropic (key set) → gemini (key set) → none.
- No images/screenshots sent to AI.
- Every UI works in light + dark; colours via tokens / `useThemeColors`, no hex. `ConfirmDialog` for deletes. No nested `<form>`. Dates in lists: `format(parseISO(s), 'MMM d, yyyy HH:mm')`.
- New pages fit the viewport (no page scroll); inner panes scroll.
- Migrations follow `runSchema()` idempotent pattern.
- Commit after each task (message ends with the Co-Authored-By line from the session). Do not push.

## Review Focus

1. **Switching conversation / leaving the page mid-stream** → stream is aborted, partial answer not saved and never appears in the other conversation. (Task 6 interaction test.)
2. **Double submit** (Ctrl+Enter twice, Ask clicked while streaming) → exactly one user message + one answer. Composer disabled while streaming. (Task 6 test + Task 3 smoke: second POST while streaming → 409.)
3. **Provider key removed after a conversation was created** → follow-up returns 409 JSON, UI shows readable error, history still readable. (Task 3 smoke.)
4. **`#id` of a trade deleted later** → link still renders, TradeDetail shows its existing not-found state, no crash; notes containing `#` / markdown don't break serialization. (Task 1 unit test with `#` in notes; Task 6 check.)
5. **Large selection** (all trades + all no-trade days) → estimate shown, request accepted (express json limit is fine for id arrays), no UI jank in the selection list. (Task 5 check with the backup DB's full set.)

---

### Task 1: Context serialization + system prompt

**Files:**
- Create: `server/ai/context.js`, `server/ai/prompt.js`
- Test: `server/test/ai-context.test.js`
- Modify: `server/package.json` — script `"test": "node --test test/"`

**Interfaces:**
- Produces: `buildContext(trades, noTradeDays) → { text: string, summary: { trades, wins, losses, breakevens, winRate|null, netR, notrade, from|null, to|null } }`; `estimateTokens(text) → number`; `SYSTEM_PROMPT: string`.
- Input rows = DB rows shape from `hydrateTrade` plus `series_name` (`entry_models: [{id,name}]`).

- [ ] **Step 1: Write failing tests** — fixtures inline (2 wins with R:R 2 and 1.5, 1 loss, 1 BE with `be_outcome:'win'`, 1 no-trade). Assert:
  - `text` starts with `SUMMARY: 4 trades (2W / 1L / 1BE, win rate 67%, net +2.5R) · 1 no-trade days · <from> → <to>`
  - contains `TRADE #<id> · 2026-10-23 Thu 09:41 · NQ · Short · LOSS`, `BREAKEVEN (would have been WIN)`, `Entry models: FVG, OB`, `NO-TRADE DAY #<id> · …`, `Why no trade: …`
  - empty/null fields produce no line (no `Psychology:` when null)
  - output ordered by `entry_time` ascending regardless of input order
  - notes containing `#12`, `**bold**`, newlines are kept verbatim inside their field
  - zero trades + 1 no-trade → summary `0 trades`, `win rate —`, no NaN anywhere
  - `estimateTokens('a'.repeat(35)) === 10`
- [ ] **Step 2:** `cd server && node --test test/` → FAIL (module missing).
- [ ] **Step 3:** Implement per spec "Context serialization" + "System prompt". Net R = Σ win `risk_reward` (null → 0) − losses; win rate rounds, `—` when no decided trades. Server has no date-fns: day name from `new Date(Date.UTC(y, m-1, d)).getUTCDay()` with components parsed from the `YYYY-MM-DD` part of `entry_time` (no timezone shift); time = `HH:MM` substring when present.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat(ai): context serialization and system prompt`.

### Task 2: Provider adapters + env loading

**Files:**
- Create: `server/ai/index.js`, `server/ai/gemini.js`, `server/ai/anthropic.js`, `server/ai/mock.js`, `server/test/ai-provider.test.js`
- Modify: `server/index.js` (load `.env` first line), `server/package.json` (deps `@google/genai`, `@anthropic-ai/sdk`), `docker-compose.yml` (`env_file: [{ path: .env, required: false }]`), `.gitignore` (`.env`), add `.env.example` (all keys from spec, empty values)

**Interfaces:**
- Produces (`server/ai/index.js`): `getStatus(env = process.env) → { providers: [{id, model}], default: string|null }`; `getProvider(id, env = process.env) → adapter | null`; `defaultProvider(env) → adapter | null`.
- Adapter: `{ id, model, async stream({ system, context, messages, signal, onText }) → { text } }`; throws `AiError` (`class AiError extends Error { code }`, exported from `index.js`) with `code ∈ auth|rate_limit|unavailable|bad_request|aborted`.
- `mock`: available only when `AI_PROVIDER=mock`; streams `MOCK_REPLY = 'Mock analysis: trade #<first id found in context> lost because …'` in ≥3 `onText` chunks with 20 ms gaps; honours `signal` (throws `aborted`). If `env.MOCK_FAIL === '1'` (env read at call time), throws `AiError('rate_limit')` after the first chunk.

- [ ] **Step 1: Failing tests** for selection matrix: `{}` → default null, providers []; `{GEMINI_API_KEY:'x'}` → gemini, model `gemini-2.5-flash`; both keys → default anthropic, both listed; `{…, GEMINI_MODEL:'m'}` → model `m`; `AI_PROVIDER=gemini` with both keys → default gemini; `AI_PROVIDER=mock` → `[{id:'mock'}]`; `getProvider('anthropic', {GEMINI_API_KEY:'x'})` → null. Mock: collects chunks, joined === returned `text`, contains `#5` for a context containing `TRADE #5`; aborting the signal rejects with `code 'aborted'`; with `MOCK_FAIL=1` rejects with `code 'rate_limit'` after ≥1 chunk.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Gemini: `new GoogleGenAI({ apiKey })`, `ai.models.generateContentStream({ model, contents, config: { systemInstruction: system + '\n\n' + context, abortSignal: signal } })`, roles `assistant→'model'`. Anthropic: `client.messages.stream({ model, max_tokens: 4096, system: [{type:'text',text:system},{type:'text',text:context,cache_control:{type:'ephemeral'}}], messages }, { signal })`, `on('text')`. Map SDK errors by HTTP status: 401/403→auth, 429→rate_limit, 5xx/network→unavailable, 400→bad_request, abort→aborted. Env load in `server/index.js`: `try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}` before anything reads env. `npm install` in `server/`.
- [ ] **Step 4:** Tests PASS; `docker compose config` shows `env_file`.
- [ ] **Step 5:** Commit `feat(ai): gemini/anthropic/mock providers and .env loading`.

### Task 3: DB tables + `/api/ai` routes + smoke tests

**Files:**
- Modify: `server/db.js` (two tables in `runSchema()`; honour `process.env.DB_PATH` if set, else current path), `server/index.js` (mount `app.use('/api/ai', require('./routes/ai'))`)
- Create: `server/routes/ai.js`
- Modify: `scripts/dev/api-smoke.sh` (copy `server/ai` too; start server with `AI_PROVIDER=mock`; new AI section)

**Interfaces:**
- Consumes: Task 1 `buildContext`, `estimateTokens`, `SYSTEM_PROMPT`; Task 2 `getStatus`, `getProvider`, `defaultProvider`, `AiError`.
- Produces: HTTP API exactly as the spec table, SSE events `delta` / `done` / `error` as spec. Additionally `409 {error:'busy'}` when a stream for that conversation is already running (in-memory `Set` of active conversation ids).

- [ ] **Step 1: Write failing smoke checks** in `api-smoke.sh` (after existing checks), using `curl -N` for SSE:
  - `GET /api/ai/status` → `default == "mock"`, body has no `key`
  - `POST /estimate` with 2 trade ids → `tokens > 0`, counts 2/0
  - `POST /conversations` `{}` → 400; with nonexistent ids only → 400; with a notrade id in `trade_ids` → that id ignored
  - create valid → 201/200 with id; `GET /conversations` lists it first
  - stream message → output has ≥1 `"type":"delta"` and one `"type":"done"`; `GET /conversations/:id` has 2 messages, assistant content contains `#`
  - `retry:true` when last is assistant → 400
  - a second `POST …/messages` sent while the first is still streaming → 409 `busy`
  - `PATCH` title → reflected; `DELETE` → 404 on get
  - restart server with `MOCK_FAIL=1` → stream ends with `"type":"error"`, no assistant message saved (last message is user); restart without it → `retry:true` → `done`
  - restart server with `AI_PROVIDER=gemini` and no key → `POST …/messages` on the mock conversation → 409 JSON
  - unknown id → 404 on get/patch/delete/messages
- [ ] **Step 2:** `scripts/dev/api-smoke.sh <backup.db>` → FAIL at first AI check.
- [ ] **Step 3:** Implement `routes/ai.js`. Load rows for context with the same query as `GET /api/trades/:id` (`series_name` join) + `entry_models`; validate ids (positive ints, correct `day_type`). SSE: `res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'})`; `AbortController` aborted on `req.on('close')` when not finished; save assistant message + bump `updated_at` only on success; always remove id from active set in `finally`. Smoke script restarts the scratch server per scenario (factor the start/stop into a function).
- [ ] **Step 4:** Smoke script passes end to end; `cd server && node --test test/` still passes.
- [ ] **Step 5:** Commit `feat(ai): conversation tables and /api/ai routes with SSE`.

### Task 4: Extract shared `TradeFilters` from Dashboard (no visible change)

**Files:**
- Create: `client/src/components/TradeFilters.jsx`
- Modify: `client/src/pages/Dashboard.jsx`

**Interfaces:**
- Produces: `useTradeFilters() → { filters, dowFilter, apiFilters, set, clearAll, searchParams, setSearchParams }` (parses URL exactly as Dashboard does today, `apiFilters` maps `session_type:'all'→''`); `<TradeFilters models setModels seriesList extraChips? />` renders session `.seg`, Filters button + floating popover (all fields, entry-model drag reorder → `reorderEntryModels`, outside-click / Escape close incl. `#dp-portal` exemption) and the collapsed chip row. `extraChips: [{key,label,clear}]` are prepended (Dashboard passes the `statsMonth` chip and hides from/to chips when it is active — keep current behaviour).
- `New Trade` button stays in Dashboard header (rendered next to `TradeFilters` via a `children`/`actions` slot prop `actions`).

- [ ] **Step 1:** Baseline: `node scripts/dev/screenshots.mjs /tmp/…/before --only=dashboard,dashboard-empty` against Docker (`:7420`); keep the folder.
- [ ] **Step 2:** Move code; Dashboard uses the hook + component. No behaviour change.
- [ ] **Step 3:** Run dev client against Docker API (`cd client && API_TARGET=http://127.0.0.1:7420 npx vite --port 5190`), take `after` screenshots with base `http://127.0.0.1:5190`; compare visually with `before` (identical layout). Playwright check: open filters, pick asset → panel stays open + URL updated, click outside → closes, chip × removes, calendar Stats → `October 2026`-style chip, Escape closes. No console errors.
- [ ] **Step 4:** Commit `refactor: extract TradeFilters from Dashboard`.

### Task 5: AI page — routing, API client, new-analysis view

**Files:**
- Modify: `client/src/api.js`, `client/src/App.jsx` (`/ai`, `/ai/:id` → `AiAnalyst`), `client/src/components/Layout.jsx` (nav item `AI Analyst`, sparkle icon, after Expenses), `client/package.json` (`react-markdown`, `remark-gfm`)
- Create: `client/src/pages/AiAnalyst.jsx`, `client/src/components/ai/ConversationList.jsx`, `client/src/components/ai/SelectionList.jsx`, `client/src/components/ai/Composer.jsx`

**Interfaces:**
- Consumes: Task 3 API; Task 4 `useTradeFilters`, `TradeFilters`.
- Produces (`api.js`): `getAiStatus()`, `estimateAi({trade_ids, notrade_ids})`, `getAiConversations()`, `getAiConversation(id)`, `createAiConversation({trade_ids, notrade_ids, filters, title})`, `renameAiConversation(id, title)`, `deleteAiConversation(id)`, `streamAiMessage(id, { content } | { retry: true }, { onDelta, signal }) → Promise<message>` rejecting with `Error` that has `.code`. SSE parser splits on `\n\n`, handles chunks split mid-event.
- `<Composer value onChange onSubmit disabled suggestions? />` (Ctrl/Cmd+Enter submits, Enter = newline), `<ConversationList activeId onChanged />`, `<SelectionList trades noTradeDays excluded onToggle onAll onNone />`.

- [ ] **Step 1:** Implement api functions + routes + nav. Page `/ai`: status fetch → no provider ⇒ not-configured card (spec copy). Otherwise `TradeFilters` + "Include no-trade days" checkbox (`nt=0` param), trades via `getTrades(apiFilters)` + DOW filter, no-trade days via `getTrades({day_type:'notrade'})` filtered client-side by `from`/`to` (inclusive whole day) and DOW. `excluded: Set<id>` kept across filter changes. Summary bar with debounced (400 ms) `estimateAi`. Ask → `createAiConversation` (title = question trimmed to 60 chars, filters = `Object.fromEntries(searchParams)`), `navigate('/ai/'+id, { state: { firstQuestion } })`.
- [ ] **Step 2:** Run against smoke-style scratch server (`AI_PROVIDER=mock`, scratch DB) + dev client with `API_TARGET`; Playwright: page renders, filters change list, unchecking updates count + estimate, Ask disabled with 0 selected, Ask navigates to `/ai/:id`. With all trades + no-trade days selected, estimate appears and list scrolls internally (Review Focus 5). No console errors / page scroll.
- [ ] **Step 3:** Commit `feat(ai): AI Analyst page with trade selection`.

### Task 6: Conversation view (chat, streaming, history)

**Files:**
- Modify: `client/src/pages/AiAnalyst.jsx`
- Create: `client/src/components/ai/ChatMessages.jsx`, `client/src/components/ai/Markdown.jsx`

**Interfaces:**
- Consumes: Task 5 api + components.
- `<Markdown text />` — `react-markdown` + `remark-gfm`, token-styled elements (headings, lists, bold, code, tables); text nodes: `#(\d+)` → `<Link to={`/trades/${n}`} className="text-accent font-medium">#n</Link>`.

- [ ] **Step 1:** `/ai/:id`: load conversation; header per spec (title inline-renamable, counts, provider · model, created date, filter chips read-only). If `location.state.firstQuestion` and no messages → send it once (guard with ref so StrictMode double-effect doesn't send twice; clear state via `navigate(…, {replace:true, state:null})`). Streaming: optimistic user bubble, assistant bubble filled by `onDelta`, caret while streaming, composer disabled, autoscroll unless user scrolled up >80px. `AbortController` aborted on unmount / `id` change. Error → message under last user bubble + Retry (`{retry:true}`). After `done`, refresh `ConversationList`. Delete via `ConfirmDialog` → `/ai`.
- [ ] **Step 2:** Playwright (mock provider, scratch server): ask → deltas appear progressively, final text persisted after reload; `#id` link navigates to `/trades/:id`; Ctrl+Enter pressed twice quickly → one user + one assistant message (Review Focus 2); navigate to another conversation mid-stream → no partial message saved in the first, none shown in the second (Review Focus 1); with `MOCK_FAIL=1` server → error + Retry works after restart without it; link to a nonexistent trade id renders and TradeDetail doesn't crash (Review Focus 4); rename + delete. Light + dark, 1600 + 1366, no console errors, no page scroll.
- [ ] **Step 3:** Commit `feat(ai): conversation chat with streaming and history`.

### Task 7: Screenshot coverage, docs, Docker

**Files:**
- Modify: `scripts/dev/screenshots.mjs` (pages `ai` → `/ai`, `NO_SCROLL` includes `ai`), `CLAUDE.md` (structure, routes, API table, schema, `.env`/provider rules, AI page, `npm test` in server), `README.md` (short "AI Analyst" setup: copy `.env.example` → `.env`)

- [ ] **Step 1:** Update docs + script. Run `node scripts/dev/screenshots.mjs <out> --only=ai,dashboard` against Docker after `docker compose up -d --build` (no key → not-configured card) → PASS, inspect PNGs.
- [ ] **Step 2:** Full verification: `cd server && npm test`, `scripts/dev/api-smoke.sh <backup.db>`, `cd client && npx vite build`.
- [ ] **Step 3:** Commit `docs: AI Analyst`.

### Task 8: Real provider check (with the user)

- [ ] User adds `GEMINI_API_KEY` to `.env`; `docker compose up -d --build`.
- [ ] In the browser: select ~5 trades, ask one short question; confirm streamed answer with `#id` links and that it is saved. Report cost-relevant numbers (context tokens shown).
