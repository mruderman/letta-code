#!/usr/bin/env bash
# One clean-room Linux cell: a stock Node image, install a chain from npm, then run platform-smoke.mjs.
#   usage: run-docker-cell.sh <node-major> <variant> <published|lock-pinned|node-pty-fix> <outdir>
#
# Variants of the Linux matrix (metric C, see COVERAGE.md), cell id n<node>-<libc>-<toolchain>-<arch>:
#   glibc-slim   node:<major>-slim      Debian, no make/gcc/python3 (like the registry's tools image)
#   glibc-full   node:<major>           Debian with gcc, make, python3 (a developer box or CI runner)
#   musl-slim    node:<major>-alpine    Alpine, no toolchain
#   musl-full    node:<major>-alpine    plus `apk add build-base python3` (Alpine with a toolchain)
# Contrast variant (outside C's denominator):
#   glibc-desktop node:<major>-slim plus python3 only, no make/gcc: like a desktop Ubuntu or Debian
#                 install without build-essential, the most common state for an editor user
# Legacy variants (the 2026-10-31 runs; cell id n<node>-<libc>-x64, kept so old commands still work):
#   glibc = node:<major>-bookworm-slim, musl = node:<major>-alpine, glibc-toolchain = node:<major>-bookworm
#
# The arch is the Docker host's (x64 locally, arm64 on the fork's arm64 CI runners); no emulation.
# ACP_VERSION picks the letta-acp version; the lock-pinned column pins what that tag's bun.lock used.
# NO_TURN=1 skips the live model turn (CI has no model key). IMAGE_PREFIX defaults to the GCR mirror.
set -uo pipefail
node="$1" variant="$2" column="$3" out="$4"
mkdir -p "$out" && out="$(cd "$out" && pwd)"   # docker -v needs an absolute path
here="$(cd "$(dirname "$0")" && pwd)"
prefix="${IMAGE_PREFIX:-mirror.gcr.io/library}"
case "$(uname -m)" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; *) arch="$(uname -m)" ;; esac
toolchain_pkgs="" apt_extra=""
case "$variant" in
  glibc)           tag="$node-bookworm-slim"; cell="n$node-glibc-x64" ;;
  musl)            tag="$node-alpine";        cell="n$node-musl-x64" ;;
  glibc-toolchain) tag="$node-bookworm";      cell="n$node-glibc-toolchain-x64" ;;
  glibc-slim)      tag="$node-slim";          cell="n$node-glibc-slim-$arch" ;;
  glibc-full)      tag="$node";               cell="n$node-glibc-full-$arch" ;;
  musl-slim)       tag="$node-alpine";        cell="n$node-musl-slim-$arch" ;;
  musl-full)       tag="$node-alpine";        cell="n$node-musl-full-$arch"; toolchain_pkgs="build-base python3" ;;
  glibc-desktop)   tag="$node-slim";          cell="n$node-glibc-desktop-$arch"; apt_extra="python3" ;;
  *) echo "unknown variant $variant" >&2; exit 2 ;;
esac
image="$prefix/node:$tag"
acp="${ACP_VERSION:-0.1.11}"
lock_sdk=0.7.2; [ "$acp" = 0.1.8 ] && lock_sdk=0.5.7
case "$column" in
  published)   pkgs="@letta-ai/letta-acp@$acp" ;;
  lock-pinned) pkgs="@letta-ai/letta-acp@$acp @letta-ai/letta-agent-sdk@$lock_sdk @agentclientprotocol/sdk@1.3.0" ;;
  node-pty-fix) pkgs="@letta-ai/letta-acp@${TEST_ACP_VERSION:-0.1.99}"; registry="http://${VERDACCIO_HOST:-172.17.0.1}:${VERDACCIO_PORT:-4873}/" ;;
  *) echo "unknown column $column" >&2; exit 2 ;;
esac
turn="--turn"; [ "${NO_TURN:-0}" = 1 ] && turn=""
dir="$out/$cell.$column"; rm -rf "$dir"; mkdir -p "$dir"; chmod 777 "$dir"
registry="${registry:-}"; regflag=""; [ -n "$registry" ] && regflag="--registry $registry"
proxy=(); if [ -n "${HTTPS_PROXY:-}" ]; then proxy=(-e HTTPS_PROXY -e https_proxy -e NO_PROXY="${NO_PROXY:-},${VERDACCIO_HOST:-172.17.0.1}" -e no_proxy="${no_proxy:-},${VERDACCIO_HOST:-172.17.0.1}" -e NODE_EXTRA_CA_CERTS=/ca.crt -v "${EXTRA_CA_BUNDLE:-/root/.ccr/ca-bundle.crt}:/ca.crt:ro"); fi
echo "image: $image" > "$dir/image.txt"
docker run --rm --network host "${proxy[@]}" -e OPENAI_API_KEY="${OPENAI_API_KEY:-proxy-injected}" -e SMOKE_TIMEOUT_MS="${SMOKE_TIMEOUT_MS:-120000}" \
  -v "$here:/smoke:ro" -v "$dir:/out" "$image" sh -c '
    # git is a hard runtime requirement (MemFS): the stock images lack it and session/new fails with "spawn git ENOENT".
    # Installing it adds no compiler or make, so the no-toolchain condition under test is unchanged.
    # musl-full also installs build-base + python3, the Alpine equivalent of a C toolchain.
    if command -v apt-get >/dev/null; then (apt-get update -qq && apt-get install -y -qq git '"$apt_extra"') >/out/git-install.log 2>&1; else apk add --no-cache git bash '"$toolchain_pkgs"' >/out/git-install.log 2>&1; fi
    os="$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
    libcv="$( (ldd --version 2>&1 || true) | head -1 | sed "s/^ldd //")"
    echo "image: node $(node --version) $(uname -m); os: $os; libc: $libcv; make: $(command -v make || echo absent); gcc: $(command -v gcc || echo absent); python3: $(command -v python3 || echo absent)" > /out/env.txt
    mkdir -p /w && cd /w && npm init -y >/dev/null
    if ! npm install --no-audit --no-fund '"$regflag"' '"$pkgs"' > /out/install.log 2>&1; then echo INSTALL_FAILED > /out/install-status.txt; exit 3; fi
    npm ls --all --depth=1 2>/dev/null | grep -E "letta-acp|letta-agent-sdk|letta-code|agentclientprotocol|node-pty" | sort -u > /out/versions.txt
    node /smoke/platform-smoke.mjs --out /out '"$turn"' -- /w/node_modules/.bin/letta-acp
  ' > "$dir/run.log" 2>&1
code=$?
if [ -f "$dir/install-status.txt" ]; then
  python3 - "$dir" "$cell" "$column" <<'PY'
import json, sys
d, cell, column = sys.argv[1:4]
log = open(f"{d}/install.log").read()
# node-gyp's own cause line ("Could not find any Python", "not found: make") beats the generic "gyp ERR! not ok".
reason = next((l for l in log.splitlines() if "gyp ERR! stack Error:" in l), None) or next((l for l in reversed(log.splitlines()) if "npm error" in l and ("make" in l or "gyp" in l or "code" in l)), log.strip().splitlines()[-1] if log.strip() else "install failed")
env = open(f"{d}/env.txt").read().strip() if __import__("os").path.exists(f"{d}/env.txt") else ""
json.dump({"status": "fail", "level": "clean-room install", "detail": f"npm install failed: {reason[:200]}", "env": env}, open(f"{d}/cell.json", "w"))
PY
elif [ -f "$dir/result.json" ]; then
  python3 - "$dir" <<'PY'
import json, os, sys
d = sys.argv[1]
r = json.load(open(f"{d}/result.json"))
t = r.get("turn") or {}
turn = f"turn returned={t.get('returned')} stop={t.get('stopReason')} nonce={t.get('nonceSeen')}; " if t else "no turn requested; "
detail = f"{r['node']} {r['platform']} {r['libc']}; initialize={'ok' if r.get('initialize',{}).get('ok') else 'FAIL'} session/new={'ok' if r.get('sessionNew',{}).get('ok') else 'FAIL'}; {turn}node-pty loads={r.get('nodePty',{}).get('loads')} ({r.get('nodePty',{}).get('error','')}); {r.get('error','')}"
env = open(f"{d}/env.txt").read().strip() if os.path.exists(f"{d}/env.txt") else ""
json.dump({"status": r["status"], "level": r["level"], "detail": detail, "env": env}, open(f"{d}/cell.json", "w"))
PY
else
  echo '{"status":"fail","level":"clean-room install","detail":"no result produced; see run.log"}' > "$dir/cell.json"
fi
echo "$cell.$column: $(python3 -c "import json;print(json.load(open('$dir/cell.json'))['status'])")"
