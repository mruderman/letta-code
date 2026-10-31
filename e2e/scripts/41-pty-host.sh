#!/usr/bin/env bash
# The PTY scenario (acp-client.mjs) run on the host against an already-installed letta-acp,
# with a fresh HOME and local-backend dir per run. Used for the 0.1.8 evaluation, where the
# chain under test is the published package as npm resolves it today, installed on a host
# that has make (so node-pty 1.1.0 builds); the no-make case is covered by the registry gates.
#   usage: 41-pty-host.sh <letta-acp-bin> <out-dir> [deterministic|pty] [glibc|musl]
# Needs e2e/live/node_modules (npm ci in e2e/live) for the ACP client SDK.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$1"; out="$(mkdir -p "$2" && cd "$2" && pwd)"; scenario="${3:-pty}"; expect="${4:-glibc}"
runner="$(mktemp -d)"; cp "$here/acp-client.mjs" "$here/prompts.json" "$runner/"
ln -s "$here/../live/node_modules" "$runner/node_modules"
h="$(mktemp -d)"; mkdir -p "$h/home" "$h/work"
extra=()
[ "$scenario" = deterministic ] && extra=(LETTA_LOCAL_BACKEND_EXECUTOR=deterministic LETTA_LOCAL_BACKEND_EXPERIMENTAL=1)
cd "$h/work" && git init -q .
env HOME="$h/home" LETTA_LOCAL_BACKEND_DIR="$h/home/letta-local-backend" LETTA_CODE_TELEM=0 LETTA_ACP_BACKEND=local \
  LETTA_ACP_MODEL="${LETTA_ACP_MODEL:-openai/gpt-5.6-luna}" LETTA_ACP_PERMISSION_MODE=standard \
  OPENAI_API_KEY="${OPENAI_API_KEY:-proxy-injected}" NODE_USE_ENV_PROXY=1 "${extra[@]}" \
  node "$runner/acp-client.mjs" --scenario "$scenario" --expect "$expect" --out "$out" --agent "$bin" --timeout-ms 300000 2> "$out/client-stderr.log"
status=$?
{ echo "bin: $bin"; echo "node: $(node --version)"; echo "scenario: $scenario expect: $expect"; uname -srm; ldd --version 2>&1 | head -1; } > "$out/environment.txt"
rm -rf "$runner"
exit $status
