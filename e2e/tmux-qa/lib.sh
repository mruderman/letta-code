#!/usr/bin/env bash
# Shared helpers for the tmux QA scripts. Source this file; do not execute it.
#
# The driver is `tmux-cli` (claude-code-tools) for launching windows, typing prompts, capturing screens and killing windows,
# and plain `tmux send-keys` for the keys tmux-cli has no verb for (a single letter in a dialog, Esc Esc, Ctrl+...).
# Both address the same tmux session, so a human can watch live with `tmux attach -t remote-cli-session`
# (or `tmux-cli attach`). Decisions (is the turn finished? is a permission dialog waiting?) are taken from the ACP wire log
# written by acp-tap.mjs, not by scraping the screen; screens are captured as evidence.

QA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "$QA_DIR/.." && pwd)"
export QA_WORK="${QA_WORK:-/tmp/letta-tmux-qa}"
export QA_TOOLS="${QA_TOOLS:-$QA_WORK/tools}"
export PATH="$QA_TOOLS/bin:$PATH"
export QA_SESSION="remote-cli-session"       # the session tmux-cli manages when run outside tmux
export QA_COLS="${QA_COLS:-140}" QA_ROWS="${QA_ROWS:-45}"
export QA_MODEL="${QA_MODEL:-openai/gpt-5.6-luna}"
WIRE_STATE="node $QA_DIR/wire-state.mjs"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# qa_launch <script> -> prints the tmux target of a new window running `bash <script>`
qa_launch() {
  local target
  target="$(tmux-cli launch "bash $1" 2>/dev/null | tail -1)"
  tmux set-option -t "$QA_SESSION" window-size manual >/dev/null 2>&1 || true
  tmux resize-window -t "$target" -x "$QA_COLS" -y "$QA_ROWS" >/dev/null 2>&1 || true
  echo "$target"
}
# qa_type <pane> <text>   type a prompt and press Enter (tmux-cli waits 1.5 s before Enter, like a human pause)
qa_type() { tmux-cli send "$2" --pane="$1" >/dev/null 2>&1; }
# qa_keys <pane> <key...>   raw tmux keys (a, r, Escape, C-c, Enter ...)
qa_keys() { local p="$1"; shift; tmux send-keys -t "$p" "$@"; }
# qa_slash <pane> </command args>   Toad opens a completion list while a slash command is typed key by key, and under load it drops or
# reorders keys ("/model x" arrived as "/m x"). Pasting the whole command as one bracketed paste avoids that: it is a single event.
# Then Escape closes the list, the input box is checked for the full command, and only then Enter. Retries three times.
qa_slash() {
  local pane="$1" cmd="$2" try
  for try in 1 2 3; do
    tmux send-keys -t "$pane" C-a C-k; sleep 0.5
    tmux set-buffer -b "qa-$$" "$cmd"; tmux paste-buffer -p -d -b "qa-$$" -t "$pane"; sleep 1.2
    tmux send-keys -t "$pane" Escape; sleep 1
    if tmux capture-pane -p -t "$pane" | grep -qF "❯ $cmd"; then tmux send-keys -t "$pane" Enter; return 0; fi
  done
  return 1
}
# qa_clear_input <pane>
qa_clear_input() { tmux send-keys -t "$1" C-a C-k; }
# qa_cancel <pane>   Toad's cancel gesture: Esc twice within 3 s (its first Esc only flashes a hint)
qa_cancel() { tmux send-keys -t "$1" Escape; sleep 0.5; tmux send-keys -t "$1" Escape; }

# qa_shot <pane> <dir> <name>   save the visible screen as <dir>/NN-<name>.txt (plain text) and print its path
qa_shot() {
  local n; mkdir -p "$2"; n=$(printf '%02d' $(( $(ls "$2"/*.txt 2>/dev/null | wc -l) + 1 )))
  tmux capture-pane -p -t "$1" > "$2/$n-$3.txt"
  echo "$2/$n-$3.txt"
}

# qa_base <wire>  -> how many session/prompt requests the client has sent so far
qa_base() { $WIRE_STATE "$1" counts | cut -d' ' -f1; }
# qa_await_sent <wire> <base> [timeout-s]   wait until the client has sent one more session/prompt than <base>
qa_await_sent() {
  local wire="$1" base="$2" limit="${3:-30}" start=$SECONDS
  while (( SECONDS - start < limit )); do [ "$(qa_base "$wire")" -gt "$base" ] && return 0; sleep 1; done
  return 1
}
# qa_prompt <pane> <wire> <text>   type a prompt and wait until Toad has actually sent it
qa_prompt() { local base; base="$(qa_base "$2")"; qa_type "$1" "$3"; qa_await_sent "$2" "$base" 30; }
# qa_slash_sent <pane> <wire> </command args>   a slash command is sent as a session/prompt too
qa_slash_sent() {
  local base sent; base="$(qa_base "$2")"
  qa_slash "$1" "$3" && qa_await_sent "$2" "$base" 30 || return 1
  sent="$($WIRE_STATE "$2" last | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).text)')"
  [ "$sent" = "$3" ] || { log "slash command arrived as '$sent', wanted '$3'"; return 1; }
}

# qa_settle <pane> <wire> <timeout-s> [permission-key]
# Wait until every session/prompt in the wire has a response. If the agent asks for permission and a key is given, press it
# once per request (a = allow once, A = always, r = reject). Returns 0 when settled, 1 on timeout.
qa_settle() {
  local pane="$1" wire="$2" limit="$3" key="${4:-}" start=$SECONDS sent ans asked given pressed=0
  while (( SECONDS - start < limit )); do
    read -r sent ans asked given < <($WIRE_STATE "$wire" counts)
    if [ "${sent:-0}" -gt 0 ] && [ "$sent" = "$ans" ]; then return 0; fi
    if [ -n "$key" ] && [ "${asked:-0}" -gt "${given:-0}" ] && [ "$pressed" -lt "$asked" ]; then
      sleep 2; qa_keys "$pane" "$key"; pressed=$asked; sleep 2
    fi
    sleep 2
  done
  return 1
}

# qa_wait_permission <wire> <timeout-s>   wait for an unanswered session/request_permission
qa_wait_permission() {
  local wire="$1" limit="$2" start=$SECONDS asked given
  while (( SECONDS - start < limit )); do
    read -r _ _ asked given < <($WIRE_STATE "$wire" counts)
    [ "${asked:-0}" -gt "${given:-0}" ] && return 0
    sleep 1
  done
  return 1
}

# qa_toad_script <out.sh> <variant-dir> <home> <work> <wire> [extra export lines...]
# Writes the script a window runs: an isolated HOME and local-backend directory, the variant's node_modules/.bin on PATH
# (npm puts `letta` there, as `npx` would), and Toad launching letta-acp through the wire tap.
qa_toad_script() {
  local out="$1" variant="$2" home="$3" work="$4" wire="$5"; shift 5
  cat > "$out" <<SCRIPT
export PATH="$QA_TOOLS/bin:$variant/node_modules/.bin:\$PATH"
export HOME="$home" LETTA_LOCAL_BACKEND_DIR="$home/letta-local-backend" LETTA_CODE_TELEM=0
export LETTA_ACP_BACKEND=local LETTA_ACP_MODEL="$QA_MODEL" NODE_USE_ENV_PROXY=1
# The OpenAI key never exists here: the session's egress proxy injects it for api.openai.com. A placeholder satisfies the SDK.
export OPENAI_API_KEY=placeholder
unset LETTA_API_KEY LETTA_AGENT_ID
$(printf '%s\n' "$@")
mkdir -p "$home" "$work"; cd "$work"
exec toad acp --title "Letta" --project-dir "$work" "node $QA_DIR/../scripts/acp-tap.mjs --log $wire -- letta-acp"
SCRIPT
}

# qa_agent_id <home>   id of the (single) local agent created under that HOME
qa_agent_id() {
  node -e '
    const fs=require("fs"),p=process.argv[1]+"/letta-local-backend/agents";
    const f=fs.existsSync(p)?fs.readdirSync(p).filter(x=>x.endsWith(".json")):[];
    console.log(f.map(x=>Buffer.from(x.slice(0,-5),"base64").toString()).join(" "));' "$1"
}

# qa_wait_ready <pane> <wire> <timeout-s>   Toad has opened its ACP session: the wire shows session/new answered
# (the prompt box is drawn earlier, and an Enter pressed before that is silently ignored)
qa_wait_ready() {
  local pane="$1" wire="$2" limit="$3" start=$SECONDS
  while (( SECONDS - start < limit )); do
    [ "$($WIRE_STATE "$wire" ready)" = 1 ] && tmux capture-pane -p -t "$pane" | grep -q "How can I help you today" && { sleep 2; return 0; }
    sleep 1
  done
  return 1
}
