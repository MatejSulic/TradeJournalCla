# AI Analyst — design

Date: 2026-10-25 · Status: approved in chat, awaiting spec review

## Goal

A new page where the user filters their journal (same filters as the Dashboard), picks the trades / no-trade days to analyse, and chats with an AI about them — e.g. *"What do these trades have in common and why do they lose?"*. Conversations are saved and can be reopened.

**Success criteria**
- Filter → select → ask → streamed answer that cites concrete trades (clickable `#id`).
- Follow-up questions in the same conversation work on the same frozen data.
- Conversations survive reload, are listed in a history sidebar, can be renamed/deleted, and are included in the existing ZIP backup.
- Works with only `GEMINI_API_KEY`; Anthropic is enabled just by adding `ANTHROPIC_API_KEY`.
- No API key → the app still runs; the AI page shows a "not configured" card.
- Keys never reach the browser.

**Non-goals (v1):** screenshots / images (explicitly not wanted), tool use / letting the AI query the DB itself, multi-user, cost accounting beyond a token estimate.

---

## Configuration

`.env` in the repo root (gitignored, added to `.gitignore`):

```
# comments on their own lines only (docker compose keeps an inline "# ..." after an empty value as the value)
GEMINI_API_KEY=...
# optional
ANTHROPIC_API_KEY=...
# optional overrides
GEMINI_MODEL=gemini-2.5-flash
ANTHROPIC_MODEL=claude-sonnet-5-5
# optional force: gemini | anthropic | mock (only used if its key is set)
AI_PROVIDER=
```

- Values are trimmed; empty or `#`-prefixed values are treated as unset.

- Server loads it at startup with Node 22's built-in `process.loadEnvFile()` (wrapped in try — missing file is fine). Path: repo root `.env` (`path.join(__dirname, '..', '.env')`).
- Docker: `docker-compose.yml` gets `env_file: [{ path: .env, required: false }]`.
- Provider selection: `AI_PROVIDER` if set; else **anthropic** if its key is set; else **gemini** if its key is set; else none. The provider + model used are stored on each conversation; follow-ups use the conversation's provider **and stored model** (error if its key has since been removed).
- No CORS; cross-origin non-GET `/api` requests get 403 (`server/sameOrigin.js`).
- `mock` provider (tests only): streams a canned answer containing a `#id` reference, no network.

## Backend

### Files

```
server/ai/
  index.js       # getStatus(), getProvider(name), defaultProvider()
  gemini.js      # @google/genai adapter
  anthropic.js   # @anthropic-ai/sdk adapter
  mock.js        # deterministic test adapter
  context.js     # buildContext(trades, noTradeDays) → { text, summary }; estimateTokens(text)
  prompt.js      # SYSTEM_PROMPT
server/routes/ai.js
server/test/ai-context.test.js, ai-provider.test.js   # node:test
```

New deps (server): `@google/genai`, `@anthropic-ai/sdk`.

### Adapter interface

```js
// each adapter exports:
{ id: 'gemini', model, async stream({ system, context, messages, signal, onText }) → { text } }
// messages: [{ role: 'user'|'assistant', content }]
```

- **Gemini:** `systemInstruction = system + '\n\n' + context`; `generateContentStream`; roles mapped `assistant → model`. (Implicit caching handles repeated context.)
- **Anthropic:** `messages.stream`, `system: [{ type:'text', text: system }, { type:'text', text: context, cache_control: { type:'ephemeral' } }]`, `max_tokens: 4096`.
- Adapters throw normalised errors: `{ code: 'auth' | 'rate_limit' | 'unavailable' | 'bad_request', message }`.

### Context serialization (`context.js`)

Input: full trade rows (with entry model names) and no-trade rows, sorted by `entry_time` ascending. Output is compact plain text, empty fields omitted:

```
SUMMARY: 23 trades (14W / 6L / 3BE, win rate 70%, net +9.4R) · 4 no-trade days · 2026-10-01 → 2026-10-31

TRADE #123 · 2026-10-23 Thu 09:41 · NQ · Short · LOSS · R:R 2.0 · -$300 · Live · Series: Oct eval
Entry models: FVG, OB
Risk management: high
Premarket: …
Why entered: …
Psychology: …
Improvements: …

NO-TRADE DAY #130 · 2026-10-24 Fri
Premarket: …
Why no trade: …
Faded setups: …
```

- BE trades show `BREAKEVEN (would have been WIN)` when `be_outcome` set.
- Summary uses the same rules as `computeStats` (net R = Σ win R:R − losses).
- `estimateTokens(text) = Math.ceil(text.length / 3.5)`.

### System prompt (`prompt.js`)

Trading coach analysing the user's own journal. Ground every claim in the data; cite trades as `#id` (exactly that form); look for patterns across entry models, days/times, direction, risk management, psychology notes; distinguish correlation from small-sample noise (say when n is small); be concise, use short headings/bullets; answer in the language of the question; never invent trades.

### DB (`runSchema()` in `db.js`, `CREATE TABLE IF NOT EXISTS`)

```sql
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  filters TEXT,                -- JSON snapshot of the URL filters (display only)
  context TEXT NOT NULL,       -- frozen serialized data
  trade_count INTEGER NOT NULL,
  notrade_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```
Timestamps follow the existing `db.js` convention (ISO UTC strings). No `user_id` column (no other table has one).

### API (`/api/ai`, mounted in `server/index.js`)

| Endpoint | Body / result |
|---|---|
| `GET /status` | `{ providers: [{ id, model }], default: 'gemini' \| null }` — never keys |
| `POST /estimate` | `{ trade_ids, notrade_ids }` → `{ tokens, trade_count, notrade_count }` |
| `GET /conversations` | list `{ id, title, provider, model, trade_count, notrade_count, created_at, updated_at }`, newest first |
| `POST /conversations` | `{ trade_ids, notrade_ids, filters, title }` → creates with frozen `context`; 400 if both id lists empty or no provider; ids that don't exist are ignored; 400 if none resolve |
| `GET /conversations/:id` | conversation (without `context`) + `messages` + `context_tokens` |
| `PATCH /conversations/:id` | `{ title }` |
| `DELETE /conversations/:id` | cascades messages |
| `POST /conversations/:id/messages` | `{ content }` → **SSE** stream (see below) |

Ids are validated as positive integers; `trade_ids` must be `day_type='trade'`, `notrade_ids` must be `day_type='notrade'`.

**Streaming (`POST …/messages`)** — response `Content-Type: text/event-stream`:
1. Validate (404 conversation, 400 empty content, 409 if provider unavailable) **before** opening the stream (plain JSON errors).
2. Insert the user message, bump `updated_at`.
3. Events: `data: {"type":"delta","text":"…"}` …, then `data: {"type":"done","message":{id, role, content, created_at}}` after the assistant message is saved; or `data: {"type":"error","code":"rate_limit","message":"…"}` (assistant message NOT saved; the user message stays so Retry re-sends history without duplicating it).
4. Client disconnect → `AbortController` aborts the provider call; partial answer not saved.

**Retry:** `POST …/messages` with `{ retry: true }` (no content) re-runs the model on the existing history when the last message is a user message; 400 otherwise.

Title on creation: client sends the first question truncated to 60 chars.

## Frontend

### Routing & nav
- `Layout.jsx`: new nav item **AI Analyst** (sparkle icon) → `/ai`.
- `App.jsx`: `/ai` (new analysis) and `/ai/:id` (conversation).
- `api.js`: `getAiStatus`, `estimateAi`, `getAiConversations`, `getAiConversation`, `createAiConversation`, `renameAiConversation`, `deleteAiConversation`, `streamAiMessage(id, body, { onDelta, signal })` (fetch + ReadableStream SSE parser; resolves with the `done` message, rejects with `{ code, message }`).

### Shared filters refactor
- Extract the Dashboard header filters (session `.seg`, Filters button + popover with all fields incl. entry-model drag-reorder, outside-click/Escape close, chips) into `components/TradeFilters.jsx`, driven by URL search params exactly as today. Dashboard renders it with no visible change; AI page reuses it. A `useTradeFilters()` hook (same file) returns `{ filters, dowFilter, apiFilters, set, clearAll }` and is the single source of filter parsing for both pages. Calendar-specific `statsMonth` / `setStatsMonth` stay in Dashboard (the month chip is passed into `TradeFilters` as an optional extra chip).
- Regression-checked with before/after screenshots.

### Page `pages/AiAnalyst.jsx` (+ `components/ai/*`)
Viewport-fitting (`h-full flex min-h-0`, no page scroll), two columns:

- **Left (≈260px) `ConversationList`:** `+ New analysis`, conversations (title, date, `23T · 4N`), active highlighted, rename inline, delete via `ConfirmDialog`. Scrolls internally.
- **Right — new analysis (`/ai`):**
  - `TradeFilters` + checkbox **Include no-trade days** (default on, URL param `nt=0` to turn off). No-trade days are fetched with `day_type=notrade` and filtered client-side by date range + DOW only.
  - Summary bar: `23 trades · 4 no-trade days · ~6k tokens` (debounced `POST /estimate`), select all / none.
  - Selection list (internal scroll): compact rows — checkbox, date, asset, direction, result chip (theme colours), R, entry models; no-trade rows dashed with "No trade". Unchecking is kept in state keyed by id; filter changes keep unchecked ids unchecked.
  - Composer: suggestion chips (*"What do my losing trades have in common?"*, *"Which setups work best and why?"*, *"Patterns in my psychology notes?"*, *"Why did I skip trades on no-trade days?"*), textarea, **Ask** (disabled with 0 selected or no provider). Ctrl/Cmd+Enter submits. Submitting creates the conversation, navigates to `/ai/:id`, and streams the first answer.
- **Right — conversation (`/ai/:id`):**
  - Header: title, `23 trades · 4 no-trade days · Gemini · gemini-2.5-flash · created Oct 25`, filters snapshot as read-only chips.
  - Messages: user bubbles right (accent-soft), assistant left rendered with `react-markdown` + `remark-gfm`, styled via theme tokens; `#123` in assistant text becomes a `<Link to="/trades/123">`. Streaming message shows a caret; auto-scroll to bottom unless the user scrolled up.
  - Error under the last user message with **Retry**.
  - Composer at the bottom (same as above, without chips after the first message).
- **No provider:** card "AI is not configured — add `GEMINI_API_KEY` to `.env` and restart (`docker compose up -d --build`)". History still viewable.

New client deps: `react-markdown`, `remark-gfm`.

All UI in light + dark via tokens; no hardcoded hex.

## Testing

- **Unit (`node --test server/test`)**: context serialization (fields, omission of empty, BE outcome, no-trade format, summary math, ordering), `estimateTokens`, provider selection matrix (`AI_PROVIDER`, keys present/absent).
- **API smoke**: extend `scripts/dev/api-smoke.sh` (copy `server/ai` too, run with `AI_PROVIDER=mock`): status, estimate, create (+ 400 cases), stream (delta…done, message persisted), retry rules, list/get/rename/delete (cascade), 404s. Never on the live DB.
- **UI**: `scripts/dev/screenshots.mjs --only=ai` (new page in light/dark × 1600/1366; no console errors / NaN / page scroll) + Playwright interaction script against mock: filter → uncheck → ask → streamed answer → `#id` link → history → delete. Dashboard before/after screenshots + filter interaction for the `TradeFilters` refactor.
- **Real API**: one short Gemini question on a few trades once the user adds the key.

## Docs
Update `CLAUDE.md`: structure, routes, API table, schema, `.env` + provider rules, AI page description.
