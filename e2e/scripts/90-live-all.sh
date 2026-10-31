#!/usr/bin/env bash
# Step 4 of TEST-PLAN.md: the live-agent tests. Run after run-sandbox.sh (which
# builds and serves the test chain). Every run creates a fresh agent in a
# throwaway directory; no existing agent is touched.
#
# Credentials: either a real OPENAI_API_KEY / OPENAI_API_KEY_OR_ACCESS_TOKEN in the
# environment, or (in sessions where the key is a proxy-injected network secret for
# api.openai.com) nothing at all. In that case a placeholder key is used and the
# proxy swaps in the real one; the models check below proves the swap happens
# (OpenAI answers 401 to the placeholder on its own). No key is ever printed, and
# 95-collect-logs.sh scrubs key-shaped strings from every log before anything is
# committed.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/00-env.sh"
export OPENAI_API_KEY="${OPENAI_API_KEY:-${OPENAI_API_KEY_OR_ACCESS_TOKEN:-}}"
if [ -z "$OPENAI_API_KEY" ]; then
  if [ -z "${HTTPS_PROXY:-}" ]; then
    echo "No OPENAI_API_KEY, OPENAI_API_KEY_OR_ACCESS_TOKEN, or HTTPS_PROXY in this session." >&2
    exit 1
  fi
  export OPENAI_API_KEY="sk-placeholder-proxy-injects-the-real-key"
fi
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models)
if [ "$code" != 200 ]; then
  echo "OpenAI rejected the key (HTTP $code). If it is a ChatGPT access token rather than an API key, or the proxy is not injecting, the live tests cannot run." >&2
  exit 1
fi

results=()
step() {
  local name="$1"; shift
  echo "=================== $name"
  if "$@" > "$E2E_WORK/logs/$name.out" 2>&1; then results+=("PASS  $name"); else results+=("FAIL  $name"); fi
  tail -12 "$E2E_WORK/logs/$name.out"
}

step live-letta-acp-own-test bash "$here/80-letta-acp-live-local.sh"
for i in 1 2 3; do
  step "live-pty-glibc-$i" bash "$here/40-acp-scenario.sh" pty glibc "live-pty-glibc-$i"
  step "live-pty-musl-$i" bash "$here/40-acp-scenario.sh" pty musl "live-pty-musl-$i"
done
step live-toad-pty bash "$here/70-toad.sh" pty live-toad-pty

printf '\n== live summary\n'
printf '%s\n' "${results[@]}" | tee "$E2E_WORK/logs/live-summary.txt"
