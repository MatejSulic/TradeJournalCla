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
cleanup() { [[ -n "$PID" ]] && kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; rm -rf "$T"; }
trap cleanup EXIT

cp "$ROOT"/server/*.js "$ROOT/server/package.json" "$T/"
cp -r "$ROOT/server/routes" "$T/routes"
cp -r "$ROOT/server/node_modules" "$T/node_modules"
mkdir "$T/data" "$T/uploads"
cp "$DB_SRC" "$T/data/journal.db"
for s in -wal -shm; do [[ -f "$DB_SRC$s" ]] && cp "$DB_SRC$s" "$T/data/journal.db$s"; done

(cd "$T" && PORT="$PORT" exec node index.js >"$T/server.log" 2>&1) &
PID=$!

fail() { echo "FAIL: $*"; echo "--- server log ---"; cat "$T/server.log" 2>/dev/null || true; exit 1; }
ok() { echo "ok: $*"; }

for i in $(seq 1 50); do
  curl -sf "$B/api/trades" >/dev/null 2>&1 && break
  kill -0 "$PID" 2>/dev/null || fail "server exited during startup"
  sleep 0.2
  [[ $i == 50 ]] && fail "server did not start within 10s"
done
ok "server up on :$PORT"

# json <json> <js-expr using j>
json() { J="$1" node -pe "const j=JSON.parse(process.env.J); $2"; }
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

if [[ "${EXPECT_NO_GAMIFICATION:-}" == 1 ]]; then
  [[ "$(json "$TRADE_POST" "'gamification' in j")" == false ]] || fail "POST response still has gamification key"
  ok "POST response has no gamification key"
  req GET /api/gamification/profile
  [[ "$CODE" == 404 ]] || fail "GET /api/gamification/profile -> $CODE (expected 404)"
  ok "GET /api/gamification/profile -> 404"
fi

echo "ALL OK"
