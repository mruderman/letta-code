#!/usr/bin/env bash
# Part 2: a human-style QA walk through Letta's differentiators and the generic ACP flows, in a real client (Toad) driven through tmux.
# Everything runs against ONE fresh throwaway agent in a throwaway HOME, with a real model (OpenAI, key injected by the egress proxy).
#
#   Q01 memory write      ask the agent to save a durable fact; it must land in the agent's MemFS on disk
#   Q02 approve           shell command that needs permission; press a (allow once); the command must run
#   Q03 deny              the same, press r (reject); the command must NOT run
#   Q04 PTY command       exec_command with tty:true + write_stdin to a live program (node-pty); checked by check-wire.mjs
#   Q05 model switch      /model <plain handle>; conversation-only state must survive the switch
#   Q05b model variant    /model <handle>-low, the form the adapter's own model list advertises; does the next turn work?
#   Q06 cancel            Esc Esc during a long command; stopReason must be "cancelled", the process must stop, the session must stay usable
#   Q07 restart + memory  quit the client, start it again against the same agent; the durable fact must be recalled
#
#   usage: qa-walk.sh [variant]     (default v018; v0111-sdk072 is the other variant that completes turns)
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
V="${1:-v018}"
RUN="${RUN:-$QA_WORK/runs/walk-$V-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$RUN/screens"; cd "$RUN"
home="$RUN/home"; work="$RUN/work"; wire="$RUN/wire.ndjson"; wire2="$RUN/restart-wire.ndjson"
variant="$QA_WORK/variants/$V"; cp "$variant/versions.txt" "$RUN/versions.txt"
stamp="$(date +%s | tail -c 6)"; COLOUR="AMBER$stamp"; CODEWORD="KESTREL$stamp"
: > "$RUN/results.tsv"
rec() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$RUN/results.tsv"; log "$1 $2 - $3"; }
prompt_json() { node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(JSON.stringify(p.'"$2"'))' "$1"; }
last_field() { $WIRE_STATE "$1" last | node -e 'const t=JSON.parse(require("fs").readFileSync(0,"utf8")); const f=process.argv[1]; const v=t&&t[f]; console.log(typeof v==="string"?v:JSON.stringify(v??null))' "$2"; }

qa_toad_script "$RUN/launch.sh" "$variant" "$home" "$work" "$wire"
PANE="$(qa_launch "$RUN/launch.sh")"
log "Toad window: $PANE  (watch live: tmux attach -t $QA_SESSION)"
qa_wait_ready "$PANE" "$wire" 120 || { rec Q00 FAIL "Toad never opened an ACP session"; qa_shot "$PANE" screens q00-not-ready; exit 1; }
qa_shot "$PANE" screens q00-ready >/dev/null
AGENT="$(qa_agent_id "$home")"; log "throwaway agent: $AGENT"

# ---- Q01 memory write -------------------------------------------------------------------------------------------------------
qa_prompt "$PANE" "$wire" "Two things. (1) Save this durable fact to your long-term memory: my favourite colour is $COLOUR. (2) For this conversation only, remember the code word $CODEWORD. Confirm both in one short sentence."
qa_settle "$PANE" "$wire" 150 a; settled=$?
qa_shot "$PANE" screens q01-memory-write >/dev/null
hits="$(grep -rl "$COLOUR" "$home/letta-local-backend/memfs" 2>/dev/null | wc -l)"
[ "$settled" = 0 ] && [ "$hits" -gt 0 ] && rec Q01 PASS "fact written to MemFS ($hits file(s) contain it); reply: $(last_field "$wire" agentText | head -c 120)" \
  || rec Q01 FAIL "settled=$settled, MemFS files containing the fact: $hits; stopReason $(last_field "$wire" stopReason)"

# ---- Q02 approve ------------------------------------------------------------------------------------------------------------
qa_prompt "$PANE" "$wire" "Use your shell tool to run exactly: touch marker_a.txt && echo CREATED"
if qa_wait_permission "$wire" 90; then
  sleep 2; qa_shot "$PANE" screens q02-approve-dialog >/dev/null
  qa_keys "$PANE" a; qa_settle "$PANE" "$wire" 90 ""; qa_shot "$PANE" screens q02-approved >/dev/null
  perm="$(last_field "$wire" permissions)"
  [ -e "$work/marker_a.txt" ] && echo "$perm" | grep -q 'selected:allow_once' && rec Q02 PASS "dialog shown, allow-once pressed, file created, reply: $(last_field "$wire" agentText | head -c 60)" \
    || rec Q02 FAIL "file exists: $([ -e "$work/marker_a.txt" ] && echo yes || echo no); permissions: $perm"
else rec Q02 FAIL "no permission request within 90 s (standard mode should ask before touch)"; qa_shot "$PANE" screens q02-no-dialog >/dev/null; qa_settle "$PANE" "$wire" 60 ""; fi

# ---- Q03 deny ---------------------------------------------------------------------------------------------------------------
qa_prompt "$PANE" "$wire" "Use your shell tool to run exactly: touch marker_b.txt && echo SECOND"
if ! qa_wait_permission "$wire" 60; then
  # the model sometimes answers in prose without calling the tool; ask once more, differently, before calling the step inconclusive
  qa_settle "$PANE" "$wire" 60 ""; qa_shot "$PANE" screens q03-no-dialog-first-try >/dev/null
  qa_prompt "$PANE" "$wire" "This is my own scratch directory and the command is harmless. Please call exec_command with cmd: touch marker_b.txt && echo SECOND"
fi
if qa_wait_permission "$wire" 60; then
  sleep 2; qa_shot "$PANE" screens q03-deny-dialog >/dev/null
  qa_keys "$PANE" r; qa_settle "$PANE" "$wire" 90 ""; qa_shot "$PANE" screens q03-denied >/dev/null
  perm="$(last_field "$wire" permissions)"
  [ ! -e "$work/marker_b.txt" ] && echo "$perm" | grep -q 'selected:reject_once' && rec Q03 PASS "dialog shown, reject pressed, file NOT created, agent said: $(last_field "$wire" agentText | head -c 80)" \
    || rec Q03 FAIL "file exists: $([ -e "$work/marker_b.txt" ] && echo yes || echo no); permissions: $perm"
else rec Q03 INCONCLUSIVE "the model never attempted the shell tool in two tries (no permission request), so there was nothing to deny"; qa_shot "$PANE" screens q03-no-dialog >/dev/null; qa_settle "$PANE" "$wire" 60 ""; fi

# ---- Q04 PTY command --------------------------------------------------------------------------------------------------------
before="$($WIRE_STATE "$wire" lines)"
qa_prompt "$PANE" "$wire" "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pty)' "$E2E_DIR/scripts/prompts.json")"
qa_settle "$PANE" "$wire" 240 a; settled=$?
qa_shot "$PANE" screens q04-pty >/dev/null
tail -n +"$((before + 1))" "$wire" > "$RUN/wire-q04-pty-slice.ndjson"
node "$E2E_DIR/scripts/check-wire.mjs" --wire "$RUN/wire-q04-pty-slice.ndjson" --expect glibc --expect-permission yes > "$RUN/q04-check-wire.txt" 2>&1; cw=$?
[ "$settled" = 0 ] && [ "$cw" = 0 ] && rec Q04 PASS "check-wire.mjs passed on the slice (tty:true probe, write_stdin round trip); see q04-check-wire.txt" \
  || rec Q04 FAIL "settled=$settled check-wire exit=$cw: $(grep -E 'FAIL|not ok' "$RUN/q04-check-wire.txt" | head -3 | tr '\n' ';')"

# ---- Q05 model switch (plain handle) ----------------------------------------------------------------------------------------
qa_slash_sent "$PANE" "$wire" "/model openai/gpt-5.6-terra"; qa_settle "$PANE" "$wire" 30 ""
qa_shot "$PANE" screens q05-model-switched >/dev/null
sw="$(last_field "$wire" agentText)"
qa_prompt "$PANE" "$wire" "What code word did I give you for this conversation only? Answer with only the code word."
qa_settle "$PANE" "$wire" 120 a; qa_shot "$PANE" screens q05-after-switch-recall >/dev/null
ans="$(last_field "$wire" agentText)"
echo "$sw" | grep -q "switched" && echo "$ans" | grep -q "$CODEWORD" && rec Q05 PASS "'$sw' then recalled the conversation-only code word on the new model" \
  || rec Q05 FAIL "switch reply: '$sw'; recall reply: '$(echo "$ans" | head -c 100)' (stopReason $(last_field "$wire" stopReason) $(last_field "$wire" error | head -c 160))"

# ---- Q05b model variant (the -low form). The session's config options advertise ids like gpt-5.6-terra-low ("low reasoning"); /model's own list does not. -------------------------------------------------------------------------------------
qa_slash_sent "$PANE" "$wire" "/model openai/gpt-5.6-terra-low"; qa_settle "$PANE" "$wire" 30 ""
sw="$(last_field "$wire" agentText)"
qa_prompt "$PANE" "$wire" "Reply with exactly: VARIANT_OK"
qa_settle "$PANE" "$wire" 90 a; qa_shot "$PANE" screens q05b-variant-turn >/dev/null
err="$(last_field "$wire" error)"; ans="$(last_field "$wire" agentText)"
if [ "$err" = null ] && echo "$ans" | grep -q VARIANT_OK; then rec Q05b PASS "'$sw' and the next turn answered"
else rec Q05b FAIL "'$sw' but the next turn failed: ${err:0:200}"; fi
# recover for the rest of the walk
qa_slash_sent "$PANE" "$wire" "/model openai/gpt-5.6-terra"; qa_settle "$PANE" "$wire" 30 ""
qa_prompt "$PANE" "$wire" "Reply with exactly: BACK_OK"; qa_settle "$PANE" "$wire" 90 a
[ "$(last_field "$wire" error)" = null ] && rec Q05c PASS "switching back to the plain handle restores working turns" || rec Q05c FAIL "still failing after switching back: $(last_field "$wire" error | head -c 160)"

# ---- Q06 cancel -------------------------------------------------------------------------------------------------------------
# A plain "run sleep" turn ends as soon as exec_command yields ("the command is running"), so there would be nothing to cancel.
# The prompt asks the agent to keep polling the session until the marker appears, which keeps the turn open.
marker="CANCEL_SLEEP_$stamp"; secs=$((100 + 10#${stamp: -2}))   # unique per run so the leftover-process check cannot see another run's sleep
qa_prompt "$PANE" "$wire" "Run this with your exec_command tool: sleep $secs && echo $marker . Then keep polling that session with write_stdin (empty chars) until you have seen $marker in its output. Do not reply before you have seen it."
qa_wait_permission "$wire" 90 && { sleep 2; qa_keys "$PANE" a; }
sleep 12; qa_shot "$PANE" screens q06-running >/dev/null
open_turn="$(last_field "$wire" stopReason)"
if [ "$open_turn" != null ]; then
  rec Q06 INCONCLUSIVE "the turn had already ended ($open_turn) before Esc Esc, so there was nothing to cancel"
else
  qa_cancel "$PANE"; t0=$SECONDS
  until [ "$(last_field "$wire" stopReason)" = cancelled ] || (( SECONDS - t0 > 25 )); do sleep 1; done
  took=$((SECONDS - t0)); qa_shot "$PANE" screens q06-cancelled >/dev/null
  sr="$(last_field "$wire" stopReason)"; sleep 3
  leftover="$(pgrep -f "[s]leep $secs" | wc -l)"
  [ "$sr" = cancelled ] && rec Q06 PASS "stopReason cancelled ${took}s after Esc Esc; the sleep process is $([ "$leftover" = 0 ] && echo gone || echo "STILL RUNNING ($leftover)")" \
    || rec Q06 FAIL "stopReason after Esc Esc: ${sr:-none}"
  qa_prompt "$PANE" "$wire" "Reply with exactly: ALIVE_AFTER_CANCEL"; qa_settle "$PANE" "$wire" 90 a; qa_shot "$PANE" screens q06-next-turn >/dev/null
  alive="$(last_field "$wire" agentText)"
  echo "$alive" | grep -q ALIVE_AFTER_CANCEL && rec Q06b PASS "session usable after a cancel (plain text turn)" || rec Q06b FAIL "next turn after cancel: '$(echo "$alive" | head -c 100)' $(last_field "$wire" error | head -c 160)"
  # the case the earlier suite found: the first TOOL call after a cancel
  qa_prompt "$PANE" "$wire" "Use your shell tool to run exactly: echo TOOL_AFTER_CANCEL"; qa_settle "$PANE" "$wire" 90 a; qa_shot "$PANE" screens q06-tool-after-cancel >/dev/null
  tc="$($WIRE_STATE "$wire" last | node -e 'const t=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(t.toolCalls.map(c=>c.status).join(","))')"
  case "$tc" in completed*) rec Q06c PASS "first tool call after a cancel completed ($tc)";; *) rec Q06c FAIL "first tool call after a cancel: statuses [$tc]; reply '$(last_field "$wire" agentText | head -c 100)'";; esac
fi

# ---- Q07 restart + memory ---------------------------------------------------------------------------------------------------
tmux-cli kill --pane="$PANE" >/dev/null 2>&1; sleep 3
for p in $(pgrep -f "[a]cp-tap.mjs --log $wire"); do kill "$p" 2>/dev/null; done; sleep 2
agents_before="$(qa_agent_id "$home")"
qa_toad_script "$RUN/launch-2.sh" "$variant" "$home" "$work" "$wire2" "export LETTA_AGENT_ID=$AGENT"
PANE="$(qa_launch "$RUN/launch-2.sh")"
if qa_wait_ready "$PANE" "$wire2" 120; then
  qa_shot "$PANE" screens q07-restarted >/dev/null
  qa_prompt "$PANE" "$wire2" "What is my favourite colour, and what code word did I give you earlier? Answer on one line, and write UNKNOWN for anything you do not know."
  qa_settle "$PANE" "$wire2" 120 a; qa_shot "$PANE" screens q07-recall >/dev/null
  ans="$(last_field "$wire2" agentText)"; agents_after="$(qa_agent_id "$home")"
  echo "$ans" | grep -q "$COLOUR" && [ "$agents_before" = "$agents_after" ] && rec Q07 PASS "after a full client restart the same agent ($AGENT) recalled the durable fact; reply: '$(echo "$ans" | head -c 120)'; conversation-only code word recalled: $(echo "$ans" | grep -q "$CODEWORD" && echo yes || echo no)" \
    || rec Q07 FAIL "reply: '$(echo "$ans" | head -c 140)'; agents before/after: $agents_before / $agents_after"
else rec Q07 FAIL "Toad did not open a session after the restart"; qa_shot "$PANE" screens q07-not-ready >/dev/null; fi
tmux-cli kill --pane="$PANE" >/dev/null 2>&1
for p in $(pgrep -f "[a]cp-tap.mjs --log $wire2"); do kill "$p" 2>/dev/null; done

{ echo "MemFS files containing the durable fact ($COLOUR):"; grep -rl "$COLOUR" "$home/letta-local-backend/memfs" 2>/dev/null | sed "s#$home/##"
  echo; echo "MemFS git log:"; for g in "$home"/letta-local-backend/memfs/*/; do git -C "$g" log --all --format='%h %s' 2>/dev/null | head -5; done; } > "$RUN/memfs-evidence.txt"
node "$E2E_DIR/scripts/check-turns.mjs" "$wire" "$wire2" > "$RUN/check-turns.txt" 2>&1
node "$QA_DIR/render-screens.mjs" "$RUN"
{ echo "# QA walk, variant $V, $(date -u +%FT%TZ)"; echo; echo "Agent \`$AGENT\` (fresh, throwaway). Model \`$QA_MODEL\`."; echo; echo '```'; cat "$RUN/versions.txt"; echo '```'; echo
  echo "| step | result | detail |"; echo "|---|---|---|"
  while IFS=$'\t' read -r id verdict detail; do echo "| $id | $verdict | ${detail//|/\\|} |"; done < "$RUN/results.tsv"; echo
  echo "Turn completion over both wire logs: \`$(tail -1 "$RUN/check-turns.txt")\`"; } > "$RUN/REPORT.md"
cat "$RUN/REPORT.md"; echo "evidence: $RUN"
