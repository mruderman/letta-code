#!/usr/bin/env bash
# Step 4 of TEST-PLAN.md: the live-agent tests. Run after run-sandbox.sh (which
# builds and serves the test chain). Every run creates a fresh agent in a
# throwaway directory; no existing agent is touched.
#
# The key comes from OPENAI_API_KEY or the session secret
# OPENAI_API_KEY_OR_ACCESS_TOKEN. It is never printed, and 95-collect-logs.sh
# scrubs it from every log before anything is committed.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/00-env.sh"
export OPENAI_API_KEY="${OPENAI_API_KEY:-${OPENAI_API_KEY_OR_ACCESS_TOKEN:-}}"
if [ -z "$OPENAI_API_KEY" ]; then
  echo "No OPENAI_API_KEY or OPENAI_API_KEY_OR_ACCESS_TOKEN in this session." >&2
  exit 1
fi
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models)
if [ "$code" != 200 ]; then
  echo "OpenAI rejected the key (HTTP $code). If it is a ChatGPT access token rather than an API key, the live tests cannot use it." >&2
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
