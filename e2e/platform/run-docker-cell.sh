#!/usr/bin/env bash
# One clean-room cell: a stock Node image (no compiler, no make: like the registry's tools image),
# install a chain from npm, then run platform-smoke.mjs.
#   usage: run-docker-cell.sh <node-major> <glibc|musl> <published|lock-pinned> <outdir>
set -uo pipefail
node="$1" libc="$2" column="$3" out="$4"
here="$(cd "$(dirname "$0")" && pwd)"
variant=bookworm-slim; [ "$libc" = musl ] && variant=alpine
image="mirror.gcr.io/library/node:$node-$variant"
acp="${ACP_VERSION:-0.1.11}"
case "$column" in
  published)   pkgs="@letta-ai/letta-acp@$acp" ;;
  lock-pinned) pkgs="@letta-ai/letta-acp@$acp @letta-ai/letta-agent-sdk@0.7.2 @agentclientprotocol/sdk@1.3.0" ;;
  *) echo "unknown column $column" >&2; exit 2 ;;
esac
cell="n$node-$libc-x64"; dir="$out/$cell.$column"; mkdir -p "$dir"; chmod 777 "$dir"
proxy=(); if [ -n "${HTTPS_PROXY:-}" ]; then proxy=(-e HTTPS_PROXY -e https_proxy -e NO_PROXY -e no_proxy -e NODE_EXTRA_CA_CERTS=/ca.crt -v "${EXTRA_CA_BUNDLE:-/root/.ccr/ca-bundle.crt}:/ca.crt:ro"); fi
docker run --rm --network host "${proxy[@]}" -e OPENAI_API_KEY="${OPENAI_API_KEY:-proxy-injected}" -e SMOKE_TIMEOUT_MS="${SMOKE_TIMEOUT_MS:-120000}" \
  -v "$here:/smoke:ro" -v "$dir:/out" "$image" sh -c '
    echo "image: node $(node --version) $(uname -m); make: $(command -v make || echo absent); gcc: $(command -v gcc || echo absent)" > /out/env.txt
    mkdir -p /w && cd /w && npm init -y >/dev/null
    if ! npm install --no-audit --no-fund '"$pkgs"' > /out/install.log 2>&1; then echo INSTALL_FAILED > /out/install-status.txt; exit 3; fi
    npm ls --all --depth=1 2>/dev/null | grep -E "letta-acp|letta-agent-sdk|letta-code|agentclientprotocol|node-pty" | sort -u > /out/versions.txt
    node /smoke/platform-smoke.mjs --out /out --turn -- /w/node_modules/.bin/letta-acp
  ' > "$dir/run.log" 2>&1
code=$?
if [ -f "$dir/install-status.txt" ]; then
  python3 - "$dir" "$cell" "$column" <<'PY'
import json, sys
d, cell, column = sys.argv[1:4]
log = open(f"{d}/install.log").read()
reason = next((l for l in reversed(log.splitlines()) if "npm error" in l and ("make" in l or "gyp" in l or "code" in l)), log.strip().splitlines()[-1] if log.strip() else "install failed")
json.dump({"status": "fail", "level": "clean-room install", "detail": f"npm install failed: {reason[:200]}"}, open(f"{d}/cell.json", "w"))
PY
elif [ -f "$dir/result.json" ]; then
  python3 - "$dir" <<'PY'
import json, sys
d = sys.argv[1]
r = json.load(open(f"{d}/result.json"))
t = r.get("turn") or {}
detail = f"{r['node']} {r['platform']} {r['libc']}; initialize={'ok' if r.get('initialize',{}).get('ok') else 'FAIL'} session/new={'ok' if r.get('sessionNew',{}).get('ok') else 'FAIL'}; turn returned={t.get('returned')} stop={t.get('stopReason')} nonce={t.get('nonceSeen')}; node-pty loads={r.get('nodePty',{}).get('loads')} ({r.get('nodePty',{}).get('error','')}); {r.get('error','')}"
json.dump({"status": r["status"], "level": r["level"], "detail": detail}, open(f"{d}/cell.json", "w"))
PY
else
  echo '{"status":"fail","level":"clean-room install","detail":"no result produced; see run.log"}' > "$dir/cell.json"
fi
echo "$cell.$column: $(python3 -c "import json;print(json.load(open('$dir/cell.json'))['status'])")"
