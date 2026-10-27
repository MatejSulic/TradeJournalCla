#!/usr/bin/env bash
# API smoke test on a SCRATCH copy of the server + a copied DB. Never touches server/data/journal.db.
# Usage: scripts/dev/api-smoke.sh [db-file]
#   EXPECT_NO_GAMIFICATION=1  also assert gamification has been removed
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_SRC="${1:-$ROOT/server/data/backups/journal_before_premarket_20261022_131424.db}"
PORT="${SMOKE_PORT:-3999}"
if (echo >"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  echo "FAIL: port $PORT already in use (set SMOKE_PORT)"; exit 1
fi
B="http://127.0.0.1:$PORT"

DB_SRC_ABS="$(readlink -f "$DB_SRC")"
if [[ "$DB_SRC_ABS" == "$(readlink -f "$ROOT/server/data/journal.db" 2>/dev/null || true)" ]]; then
  echo "FAIL: refusing to use the live DB as source"; exit 1
fi
[[ -f "$DB_SRC" ]] || { echo "FAIL: db file not found: $DB_SRC"; exit 1; }

T="$(mktemp -d)"
PID=""
cleanup() { [[ -n "$PID" ]] && { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }; rm -rf "$T"; }
trap cleanup EXIT

cp "$ROOT"/server/*.js "$ROOT/server/package.json" "$T/"
cp -r "$ROOT/server/routes" "$T/routes"
cp -r "$ROOT/server/ai" "$T/ai"
cp -r "$ROOT/server/node_modules" "$T/node_modules"
mkdir "$T/data" "$T/uploads"
cp "$DB_SRC" "$T/data/journal.db"
for s in -wal -shm; do [[ -f "$DB_SRC$s" ]] && cp "$DB_SRC$s" "$T/data/journal.db$s"; done

fail() { echo "FAIL: $*"; echo "--- server log ---"; cat "$T/server.log" 2>/dev/null || true; exit 1; }
ok() { echo "ok: $*"; }

# start_server [VAR=value ...] -> boots the scratch server with the given env. The caller's AI vars
# are dropped (env -u) and keys are set blank so neither the shell nor a stray .env can enable a real provider.
AI_VARS=(GEMINI_API_KEY ANTHROPIC_API_KEY GEMINI_MODEL ANTHROPIC_MODEL AI_PROVIDER MOCK_FAIL MOCK_DELAY_MS DB_PATH UPLOADS_DIR)
UNSET=(); for v in "${AI_VARS[@]}"; do UNSET+=(-u "$v"); done
start_server() {
  (cd "$T" && exec env "${UNSET[@]}" PORT="$PORT" GEMINI_API_KEY= ANTHROPIC_API_KEY= "$@" node index.js >>"$T/server.log" 2>&1) &
  PID=$!
  for i in $(seq 1 50); do
    curl -sf "$B/api/trades" >/dev/null 2>&1 && return 0
    kill -0 "$PID" 2>/dev/null || fail "server exited during startup"
    sleep 0.2
  done
  fail "server did not start within 10s"
}
stop_server() { [[ -n "$PID" ]] && { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; }; PID=""; }

start_server AI_PROVIDER=mock
ok "server up on :$PORT"

# json <json> <js-expr using j>
# (JSON goes via stdin: a big body would exceed the per-variable env limit)
json() { printf '%s' "$1" | node -pe "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); $2"; }
# req METHOD URL [curl args...] -> sets BODY and CODE
req() {
  local m="$1" u="$2"; shift 2
  local out; out="$(curl -s -X "$m" -w $'\n%{http_code}' "$@" "$B$u")"
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}

req GET /api/trades;                 ALL_T="$BODY"
req GET "/api/trades?day_type=all";  ALL_A="$BODY"
req GET "/api/trades?day_type=notrade"; ALL_N="$BODY"
nT=$(json "$ALL_T" 'j.length'); nA=$(json "$ALL_A" 'j.length'); nN=$(json "$ALL_N" 'j.length')
[[ "$nT" -eq $((nA - nN)) ]] || fail "day_type counts: trade=$nT all=$nA notrade=$nN"
ok "day_type filter counts (trade=$nT notrade=$nN all=$nA)"
OLDEST=$(json "$ALL_T" 'j.length ? Math.min(...j.map(t=>t.id)) : ""')

TRADE_F=(-F asset=NQ -F direction=long -F pnl=win -F entry_time=2026-10-21T10:00 -F risk_reward=2)
NOTRADE_F=(-F day_type=notrade -F entry_time=2026-10-21T09:00 -F no_trade_reason=x)

req POST /api/trades "${TRADE_F[@]}"
[[ "$CODE" == 201 ]] || fail "POST trade -> $CODE $BODY"
TRADE_POST="$BODY"; TID=$(json "$BODY" 'j.id')
ok "POST trade -> 201 (id $TID)"

req POST /api/trades "${NOTRADE_F[@]}"
[[ "$CODE" == 201 ]] || fail "POST notrade -> $CODE $BODY"
[[ "$(json "$BODY" 'j.asset === null')" == true ]] || fail "notrade asset not null: $BODY"
NID=$(json "$BODY" 'j.id')
ok "POST no-trade -> 201, asset null (id $NID)"

req PUT "/api/trades/$TID" "${TRADE_F[@]}";   [[ "$CODE" == 200 ]] || fail "PUT trade -> $CODE $BODY"; ok "PUT trade -> 200"
req PUT "/api/trades/$NID" "${NOTRADE_F[@]}"; [[ "$CODE" == 200 ]] || fail "PUT notrade -> $CODE $BODY"; ok "PUT no-trade -> 200"

for id in "$TID" "$NID"; do
  req DELETE "/api/trades/$id"
  [[ "$(json "$BODY" 'j.ok === true')" == true ]] || fail "DELETE $id -> $CODE $BODY"
  ok "DELETE $id -> ok"
done

if [[ -n "$OLDEST" ]]; then
  req DELETE "/api/trades/$OLDEST"
  [[ "$(json "$BODY" 'j.ok === true')" == true ]] || fail "DELETE oldest $OLDEST -> $CODE $BODY"
  ok "DELETE oldest pre-existing trade $OLDEST -> ok"
else
  echo "skip: no pre-existing trades to delete"
fi

req POST /api/trades -F day_type=trade -F direction=long -F pnl=win -F entry_time=2026-10-21T10:00
[[ "$CODE" == 400 ]] || fail "POST trade without asset -> $CODE $BODY (expected 400)"
ok "POST trade without asset -> 400"

req POST /api/trades -F asset=NQ -F direction=long -F pnl=bogus -F entry_time=2026-10-21T10:00
[[ "$CODE" == 400 ]] || fail "POST trade with pnl=bogus -> $CODE (expected 400)"
ok "POST trade with invalid pnl -> 400"

# Trade with an LTF screenshot, then convert it to a no-trade day: LTF shot must be dropped
PNG="$T/shot.png"; printf '\x89PNG\r\n\x1a\n' >"$PNG"
req POST /api/trades -F asset=NQ -F direction=long -F pnl=win -F entry_time=2026-10-20T10:00 -F "ltf_screenshots=@$PNG"
[[ "$CODE" == 201 ]] || fail "POST trade with LTF -> $CODE $BODY"
CID="$(json "$BODY" "j.id")"
req PUT "/api/trades/$CID" -F day_type=notrade -F entry_time=2026-10-20T09:00
[[ "$CODE" == 200 && "$(json "$BODY" "j.screenshots.filter(s => s.type === 'ltf').length")" == 0 ]] \
  || fail "convert to no-trade kept LTF screenshots: $BODY"
ok "convert trade -> no-trade drops LTF screenshots"

req POST /api/trades -F day_type=notrade -F entry_time=2026-10-20T11:00
[[ "$CODE" == 400 ]] || fail "second no-trade day on same date -> $CODE (expected 400)"
ok "duplicate no-trade day same date -> 400"
req DELETE "/api/trades/$CID"

# Breakeven outcome: kept only for BE trades, filterable via pnl=be_win / be_loss
req POST /api/trades -F asset=NQ -F direction=long -F pnl=breakeven -F be_outcome=win -F entry_time=2026-10-19T10:00
[[ "$CODE" == 201 && "$(json "$BODY" "j.be_outcome")" == win ]] || fail "POST BE with be_outcome=win -> $CODE $BODY"
BID="$(json "$BODY" "j.id")"
req GET "/api/trades?pnl=be_win"
[[ "$(json "$BODY" "j.some(t => t.id === $BID) && j.every(t => t.pnl === 'breakeven' && t.be_outcome === 'win')")" == true ]] \
  || fail "filter pnl=be_win wrong: $BODY"
req PUT "/api/trades/$BID" -F asset=NQ -F direction=long -F pnl=win -F be_outcome=win -F entry_time=2026-10-19T10:00
[[ "$CODE" == 200 && "$(json "$BODY" "j.be_outcome === null")" == true ]] || fail "be_outcome kept on non-BE trade: $BODY"
req POST /api/trades -F asset=NQ -F direction=long -F pnl=breakeven -F be_outcome=maybe -F entry_time=2026-10-19T10:00
[[ "$CODE" == 400 ]] || fail "invalid be_outcome -> $CODE (expected 400)"
req DELETE "/api/trades/$BID"
ok "BE outcome stored, filtered, dropped on non-BE, validated"

if [[ "${EXPECT_NO_GAMIFICATION:-}" == 1 ]]; then
  [[ "$(json "$TRADE_POST" "'gamification' in j")" == false ]] || fail "POST response still has gamification key"
  ok "POST response has no gamification key"
  req GET /api/gamification/profile
  [[ "$CODE" == 404 ]] || fail "GET /api/gamification/profile -> $CODE (expected 404)"
  ok "GET /api/gamification/profile -> 404"
fi

# ---------------- Strategies ----------------
JH=(-H 'Content-Type: application/json')
# emodel NAME -> id of a fresh entry model
emodel() { req POST /api/entry-models "${JH[@]}" -d "{\"name\":\"$1\"}"; [[ "$CODE" == 201 ]] || fail "POST entry model $1 -> $CODE $BODY"; json "$BODY" 'j.id'; }
MA=$(emodel "SmA$$"); MB=$(emodel "SmB$$")

req POST /api/strategies "${JH[@]}" -d '{"name":"NoRules","rules":[]}'
[[ "$CODE" == 400 ]] || fail "strategy without rules -> $CODE $BODY (expected 400)"
req POST /api/strategies "${JH[@]}" -d '{"name":"EmptyRule","rules":[{"label":null,"entry_model_ids":[]}]}'
[[ "$CODE" == 400 ]] || fail "strategy with empty rule -> $CODE $BODY (expected 400)"
req POST /api/strategies "${JH[@]}" -d "{\"name\":\"  \",\"rules\":[{\"entry_model_ids\":[$MA]}]}"
[[ "$CODE" == 400 ]] || fail "strategy with empty name -> $CODE $BODY (expected 400)"
ok "strategy validation -> 400 (no rules / empty rule / empty name)"

STRAT_BODY="{\"name\":\"S$$\",\"rules\":[{\"label\":null,\"entry_model_ids\":[$MA]},{\"label\":\"Entry\",\"entry_model_ids\":[$MA,$MB]}]}"
req POST /api/strategies "${JH[@]}" -d "$STRAT_BODY"
[[ "$CODE" == 201 && "$(json "$BODY" "j.rules.length === 2 && j.rules[1].options.length === 2 && j.rules[1].label === 'Entry' && j.archived === false && j.trade_count === 0")" == true ]] \
  || fail "POST strategy -> $CODE $BODY"
SID=$(json "$BODY" 'j.id')
req POST /api/strategies "${JH[@]}" -d "$STRAT_BODY"
[[ "$CODE" == 409 ]] || fail "duplicate strategy name -> $CODE $BODY (expected 409)"
ok "POST /strategies -> 201 (id $SID), duplicate name -> 409"

req PUT "/api/strategies/$SID" "${JH[@]}" -d "{\"name\":\"S$$\",\"archived\":true,\"rules\":[{\"label\":\"Entry\",\"entry_model_ids\":[$MA,$MB]}]}"
[[ "$CODE" == 200 && "$(json "$BODY" "j.archived === true && j.rules.length === 1")" == true ]] || fail "PUT strategy -> $CODE $BODY"
req GET /api/strategies
[[ "$(json "$BODY" "j.some(s => s.id === $SID && s.archived === true)")" == true ]] || fail "GET /strategies lacks $SID: $BODY"
ok "PUT /strategies/:id archives + replaces rules, GET lists it"

# Deleting an entry model that is the only option of a rule deletes that rule
req POST /api/strategies "${JH[@]}" -d "{\"name\":\"S2_$$\",\"rules\":[{\"entry_model_ids\":[$MB]},{\"entry_model_ids\":[$MA]}]}"
[[ "$CODE" == 201 ]] || fail "POST strategy S2 -> $CODE $BODY"
SID2=$(json "$BODY" 'j.id')
req DELETE "/api/entry-models/$MB"
req GET "/api/strategies/$SID2"
[[ "$CODE" == 200 && "$(json "$BODY" "j.rules.length === 1 && j.rules[0].options[0].id === $MA")" == true ]] || fail "empty rule not removed: $CODE $BODY"
ok "deleting an entry model removes rules left without options"

req DELETE "/api/strategies/$SID2"
[[ "$CODE" == 200 ]] || fail "DELETE strategy -> $CODE $BODY"
req GET "/api/strategies/$SID2"
[[ "$CODE" == 404 ]] || fail "GET deleted strategy -> $CODE (expected 404)"
req DELETE "/api/strategies/$SID"
ok "DELETE /strategies/:id -> 404 afterwards"

# Trades with a strategy: rules enforced on save, filter, archived still savable, cleared / dropped correctly
MA=$(emodel "SmC$$"); MB=$(emodel "SmD$$")
req POST /api/strategies "${JH[@]}" -d "{\"name\":\"TS$$\",\"rules\":[{\"entry_model_ids\":[$MA]},{\"label\":\"Entry\",\"entry_model_ids\":[$MB]}]}"
SID=$(json "$BODY" 'j.id')
STRAT_F=(-F "strategy_id=$SID")
SDATE=2026-08-$((10 + RANDOM % 18))

req POST /api/trades "${TRADE_F[@]}" "${STRAT_F[@]}" -F "entry_model_ids=$MA"
[[ "$CODE" == 400 && "$(json "$BODY" "j.error.includes('Entry')")" == true ]] || fail "unmet strategy rule -> $CODE $BODY (expected 400 naming 'Entry')"
req POST /api/trades "${TRADE_F[@]}" "${STRAT_F[@]}" -F "entry_model_ids=$MA" -F "entry_model_ids=$MB"
[[ "$CODE" == 201 && "$(json "$BODY" "j.strategy.id === $SID && typeof j.strategy.name === 'string'")" == true ]] || fail "POST trade with met strategy -> $CODE $BODY"
STID=$(json "$BODY" 'j.id')
ok "trade with strategy: unmet rule -> 400, met -> 201 + strategy"

req POST /api/strategies "${JH[@]}" -d "{\"name\":\"TS1_$$\",\"rules\":[{\"entry_model_ids\":[$MA]}]}"
SID1=$(json "$BODY" 'j.id')
req POST /api/trades "${TRADE_F[@]}" -F "strategy_id=$SID1" -F "entry_model_ids=$MA"
[[ "$CODE" == 201 ]] || fail "single entry_model_ids (string in multipart) -> $CODE $BODY"
req DELETE "/api/trades/$(json "$BODY" 'j.id')"
req DELETE "/api/strategies/$SID1"
ok "single entry model in multipart satisfies a one-rule strategy"

req POST /api/trades "${TRADE_F[@]}" -F strategy_id=999999 -F "entry_model_ids=$MA"
[[ "$CODE" == 400 ]] || fail "unknown strategy_id -> $CODE $BODY (expected 400)"
ok "unknown strategy_id -> 400"

req GET "/api/trades?strategy_id=$SID"
[[ "$(json "$BODY" "j.length >= 1 && j.every(t => t.strategy && t.strategy.id === $SID)")" == true ]] || fail "filter strategy_id=$SID wrong: $BODY"
req GET "/api/trades?strategy_id=none"
[[ "$(json "$BODY" "j.length >= 1 && j.every(t => t.strategy === null)")" == true ]] || fail "filter strategy_id=none wrong: $BODY"
ok "GET /trades?strategy_id=<id> and =none"

req PUT "/api/strategies/$SID" "${JH[@]}" -d "{\"name\":\"TS$$\",\"archived\":true,\"rules\":[{\"entry_model_ids\":[$MA]},{\"label\":\"Entry\",\"entry_model_ids\":[$MB]}]}"
[[ "$CODE" == 200 ]] || fail "archive strategy -> $CODE $BODY"
req PUT "/api/trades/$STID" "${TRADE_F[@]}" "${STRAT_F[@]}" -F "entry_model_ids=$MA" -F "entry_model_ids=$MB"
[[ "$CODE" == 200 && "$(json "$BODY" "j.strategy.id === $SID")" == true ]] || fail "PUT with archived strategy -> $CODE $BODY"
ok "PUT trade keeps an archived strategy"

req PUT "/api/trades/$STID" "${TRADE_F[@]}" -F "entry_model_ids=$MA"
[[ "$CODE" == 200 && "$(json "$BODY" "j.strategy === null && j.strategy_id === null")" == true ]] || fail "PUT without strategy_id -> $CODE $BODY"
ok "PUT without strategy_id clears the strategy"

req PUT "/api/trades/$STID" "${TRADE_F[@]}" "${STRAT_F[@]}" -F "entry_model_ids=$MA" -F "entry_model_ids=$MB"
[[ "$CODE" == 200 && "$(json "$BODY" "j.strategy.id === $SID")" == true ]] || fail "re-assign strategy -> $CODE $BODY"
req PUT "/api/trades/$STID" -F day_type=notrade -F "entry_time=${SDATE}T09:00" "${STRAT_F[@]}" -F "entry_model_ids=$MA"
[[ "$CODE" == 200 && "$(json "$BODY" "j.strategy === null && j.entry_models.length === 0")" == true ]] || fail "trade -> no-trade kept strategy/models: $CODE $BODY"
ok "switching to a no-trade day drops strategy and entry models"

req PUT "/api/trades/$STID" "${TRADE_F[@]}" "${STRAT_F[@]}" -F "entry_model_ids=$MA" -F "entry_model_ids=$MB"
[[ "$CODE" == 200 ]] || fail "back to trade with strategy -> $CODE $BODY"
req DELETE "/api/strategies/$SID"
req GET "/api/trades/$STID"
[[ "$(json "$BODY" "j.strategy === null && j.strategy_id === null")" == true ]] || fail "deleting a strategy left it on the trade: $BODY"
req DELETE "/api/trades/$STID"
ok "deleting a strategy -> trade.strategy null, trade kept"

# ---------------- AI Analyst (/api/ai, mock provider) ----------------
# sse URL JSON -> sets SSE (raw stream body) and CODE
sse() {
  local out; out="$(curl -sN -X POST "${JH[@]}" -d "$2" -w $'\n%{http_code}' "$B$1")"
  CODE="${out##*$'\n'}"; SSE="${out%$'\n'*}"
}
nmatch() { grep -o "$2" <<<"$1" | wc -l | tr -d ' '; }

req GET /api/ai/status
[[ "$CODE" == 200 && "$(json "$BODY" "j.default")" == mock ]] || fail "GET /api/ai/status -> $CODE $BODY"
grep -qi 'key' <<<"$BODY" && fail "status leaks a key field: $BODY"
ok "GET /api/ai/status -> default mock, no keys"

req GET /api/trades
T1=$(json "$BODY" 'j[0].id'); T2=$(json "$BODY" 'j[1].id')
req POST /api/trades -F day_type=notrade -F entry_time=2026-09-01T09:00 -F 'no_trade_reason=chop #fake' ; N1=$(json "$BODY" 'j.id')
req POST /api/trades -F day_type=notrade -F entry_time=2026-09-02T09:00 -F 'faded_setups=**FVG**' ;     N2=$(json "$BODY" 'j.id')
[[ "$N1" =~ ^[0-9]+$ && "$N2" =~ ^[0-9]+$ ]] || fail "creating no-trade fixtures failed: $BODY"

req POST /api/ai/estimate "${JH[@]}" -d "{\"trade_ids\":[$T1,$T2],\"notrade_ids\":[]}"
[[ "$CODE" == 200 && "$(json "$BODY" 'j.tokens > 0 && j.trade_count === 2 && j.notrade_count === 0')" == true ]] \
  || fail "POST /api/ai/estimate -> $CODE $BODY"
ok "POST /estimate -> tokens>0, counts 2/0"

req POST /api/ai/conversations "${JH[@]}" -d '{}'
[[ "$CODE" == 400 ]] || fail "POST /conversations {} -> $CODE $BODY (expected 400)"
req POST /api/ai/conversations "${JH[@]}" -d '{"trade_ids":[99999999],"notrade_ids":[99999998]}'
[[ "$CODE" == 400 ]] || fail "POST /conversations unknown ids -> $CODE $BODY (expected 400)"
req POST /api/ai/conversations "${JH[@]}" -d '{"trade_ids":["abc",-1]}'
[[ "$CODE" == 400 ]] || fail "POST /conversations invalid ids -> $CODE $BODY (expected 400)"
ok "POST /conversations empty / unknown / invalid ids -> 400"

req POST /api/ai/conversations "${JH[@]}" \
  -d "{\"trade_ids\":[$T1,$N1,99999999],\"notrade_ids\":[$N2],\"filters\":{\"asset\":\"NQ\"},\"title\":\"Why do I lose?\"}"
[[ "$CODE" == 201 ]] || fail "POST /conversations valid -> $CODE $BODY (expected 201)"
[[ "$(json "$BODY" "j.trade_count === 1 && j.notrade_count === 1 && j.provider === 'mock' && j.model === 'mock'
   && Array.isArray(j.messages) && j.messages.length === 0 && j.context_tokens > 0 && !('context' in j)
   && j.title === 'Why do I lose?'")" == true ]] || fail "created conversation shape wrong: $BODY"
CONV=$(json "$BODY" 'j.id')
ok "POST /conversations -> 201 (id $CONV), notrade id in trade_ids ignored, no context in body"

req GET /api/ai/conversations
[[ "$CODE" == 200 && "$(json "$BODY" "j[0].id === $CONV && !('context' in j[0]) && j[0].trade_count === 1")" == true ]] \
  || fail "GET /conversations does not list $CONV first: $BODY"
ok "GET /conversations lists it first"

req POST "/api/ai/conversations/$CONV/messages" "${JH[@]}" -d '{"content":"   "}'
[[ "$CODE" == 400 ]] || fail "empty content -> $CODE $BODY (expected 400)"
ok "empty message content -> 400"

sse "/api/ai/conversations/$CONV/messages" '{"content":"Why do I lose?"}'
[[ "$CODE" == 200 ]] || fail "stream -> $CODE $SSE"
[[ "$(nmatch "$SSE" '"type":"delta"')" -ge 1 && "$(nmatch "$SSE" '"type":"done"')" == 1 ]] || fail "stream events wrong: $SSE"
req GET "/api/ai/conversations/$CONV"
[[ "$(json "$BODY" "j.messages.length === 2 && j.messages[0].role === 'user' && j.messages[1].role === 'assistant'
   && j.messages[1].content.includes('#')")" == true ]] || fail "messages not persisted: $BODY"
ok "stream delta…done, user + assistant messages persisted (assistant cites #id)"

req POST "/api/ai/conversations/$CONV/messages" "${JH[@]}" -d '{"retry":true}'
[[ "$CODE" == 400 ]] || fail "retry after assistant -> $CODE $BODY (expected 400)"
ok "retry when last message is assistant -> 400"

# Double submit: two POSTs at once -> exactly one streams, the other gets 409 busy
UP="/api/ai/conversations/$CONV/messages"; U="$B$UP"
curl -sN -X POST "${JH[@]}" -d '{"content":"A"}' -w $'\n%{http_code}' "$U" >"$T/s1" &
C1=$!
curl -sN -X POST "${JH[@]}" -d '{"content":"B"}' -w $'\n%{http_code}' "$U" >"$T/s2" &
C2=$!
wait "$C1" "$C2"
S1="$(cat "$T/s1")"; S2="$(cat "$T/s2")"
codes="$(tail -n1 <<<"$S1") $(tail -n1 <<<"$S2")"
[[ "$codes" == "200 409" || "$codes" == "409 200" ]] || fail "concurrent POSTs codes: $codes / $S1 / $S2"
grep -q '"busy"' <<<"$S1$S2" || fail "409 body is not {error:'busy'}: $S1 / $S2"
req GET "/api/ai/conversations/$CONV"
[[ "$(json "$BODY" "j.messages.length === 4 && j.messages[2].role === 'user' && j.messages[3].role === 'assistant'")" == true ]] \
  || fail "double submit stored wrong messages: $BODY"
ok "second POST while streaming -> 409 busy, exactly one user + one assistant message added"

# Client disconnect mid-stream -> partial answer not saved
out="$(curl -sN -X POST "${JH[@]}" -d '{"content":"disconnect"}' --max-time 0.03 "$U" || true)"
if grep -q '"type":"done"' <<<"$out"; then
  echo "skip: disconnect check (stream finished before client timeout)"
else
  sleep 0.3
  req GET "/api/ai/conversations/$CONV"
  [[ "$(json "$BODY" "j.messages.at(-1).role === 'user' && j.messages.at(-1).content === 'disconnect'")" == true ]] \
    || fail "partial answer saved after disconnect: $BODY"
  sse "$UP" '{"retry":true}'
  [[ "$CODE" == 200 && "$(nmatch "$SSE" '"type":"done"')" == 1 ]] || fail "retry after disconnect -> $CODE $SSE"
  ok "client disconnect -> nothing saved, conversation not left busy (retry -> done)"
fi

# Follow-ups use the model stored on the conversation, not today's env model
sqlq() { (cd "$T" && node -e "const D=require('better-sqlite3');const r=new D('data/journal.db').prepare(process.argv[1]).run(...process.argv.slice(2));" "$@"); }
sqlq "UPDATE ai_conversations SET model = 'mock-pinned' WHERE id = ?" "$CONV"
sse "$UP" '{"content":"which model?"}'
[[ "$CODE" == 200 && "$(nmatch "$SSE" '"type":"done"')" == 1 ]] || fail "follow-up with pinned model -> $CODE $SSE"
grep -q 'model mock-pinned' <<<"$SSE" || fail "follow-up did not use the stored model: $SSE"
sqlq "UPDATE ai_conversations SET model = 'mock' WHERE id = ?" "$CONV"
ok "follow-up uses the conversation's stored model"

# Cross-origin writes are refused (no CORS + same-origin guard); same-origin and curl are fine
req POST "/api/ai/conversations/$CONV/messages" -H 'Origin: https://evil.example' -H 'Sec-Fetch-Site: cross-site' \
  -H 'Content-Type: application/x-www-form-urlencoded' -d 'content=spend+my+quota'
[[ "$CODE" == 403 ]] || fail "cross-site POST -> $CODE $BODY (expected 403)"
req POST "/api/ai/conversations/$CONV/messages" -H 'Origin: https://evil.example' "${JH[@]}" -d '{"content":"x"}'
[[ "$CODE" == 403 ]] || fail "foreign Origin POST -> $CODE $BODY (expected 403)"
hdr="$(curl -s -o /dev/null -D - -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' "$B/api/ai/status")"
grep -qi '^access-control-allow-origin' <<<"$hdr" && fail "CORS header still sent: $hdr"
req GET "/api/ai/conversations/$CONV"
[[ "$(json "$BODY" "!j.messages.some(m => m.content === 'spend my quota' || m.content === 'x')")" == true ]] \
  || fail "cross-origin message was stored: $BODY"
req GET /api/ai/status -H 'Origin: https://evil.example'
[[ "$CODE" == 200 ]] || fail "GET with foreign Origin -> $CODE"
ok "cross-origin POST -> 403 (nothing stored), no Access-Control-Allow-Origin header"

req GET "/api/ai/conversations/$CONV"; UPD_BEFORE=$(json "$BODY" 'j.updated_at')
sqlq "UPDATE ai_conversations SET updated_at = '2000-01-01 00:00:00' WHERE id = ?" "$CONV"
req PATCH "/api/ai/conversations/$CONV" "${JH[@]}" -d '{"title":"Renamed"}'
[[ "$CODE" == 200 ]] || fail "PATCH title -> $CODE $BODY"
[[ "$(json "$BODY" "j.updated_at === '2000-01-01 00:00:00'")" == true ]] || fail "rename bumped updated_at: $BODY"
sqlq "UPDATE ai_conversations SET updated_at = ? WHERE id = ?" "$UPD_BEFORE" "$CONV"
ok "rename does not bump updated_at"
req PATCH "/api/ai/conversations/$CONV" "${JH[@]}" -d '{"title":"  "}'
[[ "$CODE" == 400 ]] || fail "PATCH empty title -> $CODE $BODY (expected 400)"
req GET "/api/ai/conversations/$CONV"
[[ "$(json "$BODY" "j.title === 'Renamed'")" == true ]] || fail "title not renamed: $BODY"
ok "PATCH title -> reflected, empty title -> 400"

# Provider failure mid-stream -> error event, assistant not saved; retry later succeeds
stop_server; start_server AI_PROVIDER=mock MOCK_FAIL=1
req GET "/api/ai/conversations/$CONV"; NB=$(json "$BODY" 'j.messages.length')
sse "$UP" '{"content":"fail please"}'
[[ "$CODE" == 200 && "$(nmatch "$SSE" '"type":"error"')" == 1 && "$(nmatch "$SSE" '"type":"done"')" == 0 ]] \
  || fail "MOCK_FAIL stream -> $CODE $SSE"
grep -q '"code":"rate_limit"' <<<"$SSE" || fail "error event lacks code rate_limit: $SSE"
req GET "/api/ai/conversations/$CONV"
[[ "$(json "$BODY" "j.messages.length === $NB + 1 && j.messages.at(-1).role === 'user'")" == true ]] \
  || fail "assistant saved after provider error: $BODY"
ok "provider error -> error event (rate_limit), only the user message saved"

stop_server; start_server AI_PROVIDER=mock
sse "$UP" '{"retry":true}'
[[ "$CODE" == 200 && "$(nmatch "$SSE" '"type":"done"')" == 1 ]] || fail "retry -> $CODE $SSE"
req GET "/api/ai/conversations/$CONV"
[[ "$(json "$BODY" "j.messages.length === $NB + 2 && j.messages.at(-1).role === 'assistant'
   && j.messages.filter(m => m.content === 'fail please').length === 1")" == true ]] || fail "retry result wrong: $BODY"
ok "retry:true re-runs history -> done, user message not duplicated"

# Provider removed after the conversation was created -> 409 JSON, history readable
stop_server; start_server AI_PROVIDER=gemini
req GET /api/ai/status
[[ "$(json "$BODY" 'j.default === null && j.providers.length === 0')" == true ]] || fail "status without keys: $BODY"
req POST "/api/ai/conversations/$CONV/messages" "${JH[@]}" -d '{"content":"still there?"}' -D "$T/h"
[[ "$CODE" == 409 && "$(json "$BODY" 'typeof j.error')" == string ]] || fail "messages without provider -> $CODE $BODY (expected 409 JSON)"
grep -qi '^content-type: application/json' "$T/h" || fail "409 is not JSON: $(cat "$T/h")"
req POST /api/ai/conversations "${JH[@]}" -d "{\"trade_ids\":[$T1]}"
[[ "$CODE" == 400 ]] || fail "create without provider -> $CODE $BODY (expected 400)"
req GET "/api/ai/conversations/$CONV"
[[ "$CODE" == 200 && "$(json "$BODY" "j.messages.at(-1).content !== 'still there?'")" == true ]] || fail "history after 409: $CODE $BODY"
ok "no provider: follow-up -> 409 JSON (nothing saved), create -> 400, history readable"

for u in "/api/ai/conversations/99999999" "/api/ai/conversations/abc"; do
  req GET "$u";    [[ "$CODE" == 404 ]] || fail "GET $u -> $CODE"
  req PATCH "$u" "${JH[@]}" -d '{"title":"x"}'; [[ "$CODE" == 404 ]] || fail "PATCH $u -> $CODE"
  req DELETE "$u"; [[ "$CODE" == 404 ]] || fail "DELETE $u -> $CODE"
  req POST "$u/messages" "${JH[@]}" -d '{"content":"x"}'; [[ "$CODE" == 404 ]] || fail "POST $u/messages -> $CODE"
done
ok "unknown conversation id -> 404 on get/patch/delete/messages"

req DELETE "/api/ai/conversations/$CONV"
[[ "$CODE" == 200 ]] || fail "DELETE conversation -> $CODE $BODY"
req GET "/api/ai/conversations/$CONV"
[[ "$CODE" == 404 ]] || fail "GET after delete -> $CODE (expected 404)"
left=$(cd "$T" && node -e "const D=require('better-sqlite3');console.log(new D('data/journal.db').prepare('SELECT COUNT(*) c FROM ai_messages WHERE conversation_id=?').get($CONV).c)")
[[ "$left" == 0 ]] || fail "messages not cascaded on delete ($left left)"
ok "DELETE conversation -> 404 afterwards, messages cascaded"

# DB_PATH isolation: uploads go next to the scratch DB, not into <server>/uploads
stop_server
mkdir "$T/alt"
(cd "$T" && node -e "new (require('better-sqlite3'))('data/journal.db').backup('alt/journal.db').then(()=>{})")
before=$(ls "$T/uploads" | wc -l)
start_server AI_PROVIDER=mock DB_PATH="$T/alt/journal.db"
[[ -d "$T/alt/uploads" ]] || fail "DB_PATH set but $T/alt/uploads was not created"
req POST /api/trades -F asset=NQ -F direction=long -F pnl=win -F entry_time=2026-10-18T10:00 -F "ltf_screenshots=@$PNG"
[[ "$CODE" == 201 ]] || fail "POST trade with LTF on DB_PATH server -> $CODE $BODY"
SID=$(json "$BODY" 'j.id'); FN=$(json "$BODY" "j.screenshots[0].filename")
[[ -f "$T/alt/uploads/$FN" ]] || fail "upload not stored in DB_PATH uploads dir"
[[ ! -e "$T/uploads/$FN" && "$(ls "$T/uploads" | wc -l)" == "$before" ]] || fail "upload leaked into server uploads dir"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "$B/uploads/$FN")" == 200 ]] || fail "/uploads not served from DB_PATH uploads dir"
req DELETE "/api/trades/$SID"
[[ ! -e "$T/alt/uploads/$FN" ]] || fail "screenshot not deleted from DB_PATH uploads dir"
ok "DB_PATH server: uploads stored/served/deleted in <dbdir>/uploads, server uploads dir untouched"

echo "ALL OK"
