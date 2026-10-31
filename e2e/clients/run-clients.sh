#!/usr/bin/env bash
# K01, K03, K04: one real turn through independent ACP clients.
#   usage: run-clients.sh <agent-bin> <outdir>
# Needs: acpx (npm i acpx@0.21.1), the TypeScript SDK 2.x (npm i @agentclientprotocol/sdk@2.2.0) next to
# ts-sdk2-client.mjs, and a venv with agent-client-protocol==0.12.1 (PYACP=<venv>/bin/python).
# K02 (Toad, with its own permission dialog) is e2e/scripts/71-toad-permission.sh.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$1"; out="$2"; mkdir -p "$out"
ACPX="${ACPX:-acpx}"; PYACP="${PYACP:-python3}"; TS2DIR="${TS2DIR:-$here}"
env_for() { h="$(mktemp -d)"; mkdir -p "$h/w"; export HOME="$h" LETTA_LOCAL_BACKEND_DIR="$h/b" LETTA_ACP_BACKEND=local LETTA_ACP_MODEL="${LETTA_ACP_MODEL:-openai/gpt-5.6-luna}" OPENAI_API_KEY="${OPENAI_API_KEY:-proxy-injected}" NODE_USE_ENV_PROXY=1 LETTA_ACP_PERMISSION_MODE="$1"; }
results=()
add() { results+=("{\"id\":\"$1\",\"chain\":\"$2\",\"status\":\"$3\",\"level\":\"live model turn\",\"detail\":$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$4")}"); }

# K03 Python SDK
( env_for standard; timeout "${CLIENT_TIMEOUT:-240}" "$PYACP" "$here/python-sdk-client.py" --out "$out/k03-python" -- "$bin" > "$out/k03-python.out" 2>&1 )
if python3 -c "import json,sys;sys.exit(0 if json.load(open('$out/k03-python/result.json')).get('passed') else 1)" 2>/dev/null; then add K03 "${CHAIN:-lock-pinned}" pass "$(python3 -c "import json;r=json.load(open('$out/k03-python/result.json'));print(r['client'],'stop',r.get('stopReason'),'reply',r.get('reply'))")"; else add K03 "${CHAIN:-lock-pinned}" fail "$(tail -c 300 "$out/k03-python.out")"; fi

# K04 TypeScript SDK 2.x
# ESM resolves the SDK relative to the script, so run a copy that sits next to node_modules
[ "$TS2DIR" = "$here" ] || cp "$here/ts-sdk2-client.mjs" "$TS2DIR/ts-sdk2-client.mjs"
( env_for standard; cd "$TS2DIR" && ACP_SDK_VERSION="${TS2_VERSION:-2.2.0}" timeout "${CLIENT_TIMEOUT:-240}" node "$TS2DIR/ts-sdk2-client.mjs" --out "$out/k04-ts2" -- "$bin" > "$out/k04-ts2.out" 2>&1 )
if python3 -c "import json,sys;sys.exit(0 if json.load(open('$out/k04-ts2/result.json')).get('passed') else 1)" 2>/dev/null; then add K04 "${CHAIN:-lock-pinned}" pass "$(python3 -c "import json;r=json.load(open('$out/k04-ts2/result.json'));print(r['client'],'stop',r.get('stopReason'),'reply',r.get('reply'))")"; else add K04 "${CHAIN:-lock-pinned}" fail "$(tail -c 300 "$out/k04-ts2.out")"; fi

# K01 acpx
nonce="ACPX$RANDOM"
( env_for unrestricted; "$ACPX" --agent "$bin" --cwd "$h/w" --approve-all --timeout 150 --format json exec "Run \`echo $nonce\` in the shell and tell me exactly what it printed." > "$out/k01-acpx.wire.ndjson" 2> "$out/k01-acpx.stderr.log" )
if grep -q '"stopReason":"end_turn"' "$out/k01-acpx.wire.ndjson" && grep -q "$nonce" "$out/k01-acpx.wire.ndjson"; then add K01 "${CHAIN:-lock-pinned}" pass "acpx $($ACPX --version 2>/dev/null): end_turn, shell tool output and reply contain $nonce"; else add K01 "${CHAIN:-lock-pinned}" fail "no end_turn or nonce in acpx output"; fi

printf '{"checks":[%s]}\n' "$(IFS=,; echo "${results[*]}")" > "$out/results.json"
cat "$out/results.json"
