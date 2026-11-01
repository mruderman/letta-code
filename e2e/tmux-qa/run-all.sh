#!/usr/bin/env bash
# One command: install, reproduce the hang in three variants, then walk the two variants that complete turns through the QA script.
#   ./run-all.sh                 (about 15 minutes; needs tmux, uv, node 22+, npm, a C toolchain, and network access to npm, PyPI and api.openai.com)
# Watch it live from another terminal:   tmux attach -t remote-cli-session
# Everything lands in $QA_WORK/runs/<name>; the summary of the whole run is printed at the end and written to $QA_WORK/runs/<stamp>/OVERVIEW.md.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"; OUT="$QA_WORK/runs/$STAMP"; mkdir -p "$OUT"
"$QA_DIR/setup.sh" || exit 1
RUN="$OUT/hang" "$QA_DIR/hang-repro.sh" > "$OUT/hang.log" 2>&1
RUN="$OUT/walk-v018" "$QA_DIR/qa-walk.sh" v018 > "$OUT/walk-v018.log" 2>&1 &
RUN="$OUT/walk-v0111-sdk072" "$QA_DIR/qa-walk.sh" v0111-sdk072 > "$OUT/walk-v0111-sdk072.log" 2>&1 &
wait
{ echo "# Letta ACP tmux QA run $STAMP"; echo; cat "$OUT/hang/SUMMARY.md" | sed '/^versions:/,/^```$/{/^versions:/d;/^  /d}'; echo
  cat "$OUT/walk-v018/REPORT.md"; echo; cat "$OUT/walk-v0111-sdk072/REPORT.md"; } > "$OUT/OVERVIEW.md"
cat "$OUT/OVERVIEW.md"; echo; echo "evidence: $OUT"
