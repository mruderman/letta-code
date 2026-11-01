#!/usr/bin/env bash
# Part 1: the hang, observed the way a user sees it. For each variant: open Toad (a real ACP client) in a tmux window,
# type one prompt, and watch. Screens are captured at fixed times; the wire log decides the verdict.
#
#   v0111         published @letta-ai/letta-acp@0.1.11 as npm resolves it today (letta-agent-sdk 0.7.8)  -> expected: HANGS
#   v0111-sdk072  the same install with letta-agent-sdk pinned to 0.7.2                                  -> expected: works
#   v018          @letta-ai/letta-acp@0.1.8 (the version registry PR 472 pins)                          -> expected: works
#
#   usage: hang-repro.sh [variant ...]    (default: all three, in parallel windows)   env: HANG_WAIT=120 (seconds to wait for a reply)
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RUN="${RUN:-$QA_WORK/runs/hang-$(date -u +%Y%m%dT%H%M%SZ)}"
HANG_WAIT="${HANG_WAIT:-120}"
PROMPT="Reply with exactly the word: pong"
variants=("$@"); [ ${#variants[@]} -gt 0 ] || variants=(v0111 v0111-sdk072 v018)
mkdir -p "$RUN"

one() {
  local v="$1" d="$RUN/$1"; mkdir -p "$d/screens"
  local home="$d/home" work="$d/work" wire="$d/wire.ndjson"
  cp "$QA_WORK/variants/$v/versions.txt" "$d/versions.txt"
  qa_toad_script "$d/launch.sh" "$QA_WORK/variants/$v" "$home" "$work" "$wire"
  local pane; pane="$(qa_launch "$d/launch.sh")"
  qa_wait_ready "$pane" "$wire" 90 || { echo "toad never became ready" > "$d/verdict.txt"; qa_shot "$pane" "$d/screens" not-ready; return; }
  qa_shot "$pane" "$d/screens" 1-session-ready >/dev/null
  qa_type "$pane" "$PROMPT"
  local t0=$SECONDS verdict=""
  for mark in 6 30 75; do
    while (( SECONDS - t0 < mark )); do sleep 1; done
    qa_shot "$pane" "$d/screens" "2-prompt-plus-${mark}s" >/dev/null
  done
  # one pass to see whether it finishes: keep waiting up to HANG_WAIT in total
  qa_settle "$pane" "$wire" $(( HANG_WAIT - (SECONDS - t0) > 1 ? HANG_WAIT - (SECONDS - t0) : 1 )) "" && verdict=ANSWERED || verdict=NOT_ANSWERED
  qa_shot "$pane" "$d/screens" "3-final-after-${HANG_WAIT}s" >/dev/null
  $WIRE_STATE "$wire" last > "$d/last-turn.json"
  node "$E2E_DIR/scripts/check-turns.mjs" "$wire" > "$d/check-turns.txt" 2>&1
  local streamed; streamed=$(node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(t&&t.agentText?JSON.stringify(t.agentText.slice(0,60)):"")' "$d/last-turn.json")
  { echo "variant:   $v"; echo "verdict:   $verdict (waited up to ${HANG_WAIT}s after the prompt)"; echo "reply text streamed to the client: ${streamed:-none}"
    echo "stopReason: $(node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(t&&t.stopReason||"(session/prompt never answered)")' "$d/last-turn.json")"
    echo "versions:"; sed 's/^/  /' "$d/versions.txt"; } > "$d/verdict.txt"
  tmux-cli kill --pane="$pane" >/dev/null 2>&1
  pkill -f "$d/wire.ndjson" 2>/dev/null || true
  log "$v: $verdict"
}
for v in "${variants[@]}"; do one "$v" & done
wait
{ echo "# Hang reproduction, $(date -u +%FT%TZ)"; echo
  for v in "${variants[@]}"; do echo "## $v"; echo '```'; cat "$RUN/$v/verdict.txt"; echo '```'; echo; done; } > "$RUN/SUMMARY.md"
for v in "${variants[@]}"; do node "$QA_DIR/render-screens.mjs" "$RUN/$v"; done
cat "$RUN/SUMMARY.md"; echo "evidence: $RUN"
