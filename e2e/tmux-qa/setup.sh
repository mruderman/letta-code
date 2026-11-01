#!/usr/bin/env bash
# Install what the QA scripts need into $QA_WORK (default /tmp/letta-tmux-qa), touching nothing else:
#   - Toad 0.6.20 (a real third-party ACP client, a terminal UI) and tmux-cli (claude-code-tools), via uv
#   - three fresh npm installs of the letta-acp variants under test (no lockfile, so npm resolves what a user gets today)
# Requires: tmux, uv (https://docs.astral.sh/uv), node 22+ and npm, and a C toolchain (make/gcc/python3) for node-pty on 0.1.11/0.1.8.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
for tool in tmux uv node npm make gcc; do command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 1; }; done
mkdir -p "$QA_WORK/variants" "$QA_TOOLS"
export UV_TOOL_DIR="$QA_TOOLS/uv-tools" UV_TOOL_BIN_DIR="$QA_TOOLS/bin"
[ -x "$QA_TOOLS/bin/toad" ] || uv tool install -q --python 3.14 "batrachian-toad==0.6.20"
[ -x "$QA_TOOLS/bin/tmux-cli" ] || uv tool install -q claude-code-tools
log "toad $(toad --version), tmux $(tmux -V), tmux-cli at $(command -v tmux-cli)"

install_variant() { # <dir-name> <npm specs...>
  local name="$1"; shift; local d="$QA_WORK/variants/$name"
  [ -e "$d/.installed" ] && { log "$name already installed"; return; }
  rm -rf "$d"; mkdir -p "$d"; (cd "$d" && npm init -y >/dev/null && npm install --no-audit --no-fund --save-exact "$@" >install.log 2>&1)
  (cd "$d" && npm ls @letta-ai/letta-acp @letta-ai/letta-agent-sdk @letta-ai/letta-code @agentclientprotocol/sdk node-pty 2>&1 | grep -E 'letta|agentclient|node-pty' | sort -u > versions.txt)
  touch "$d/.installed"; log "$name installed"
}
install_variant v0111        @letta-ai/letta-acp@0.1.11 &
install_variant v0111-sdk072 @letta-ai/letta-acp@0.1.11 @letta-ai/letta-agent-sdk@0.7.2 &
install_variant v018         @letta-ai/letta-acp@0.1.8 &
wait
for v in v0111 v0111-sdk072 v018; do echo "== $v"; cat "$QA_WORK/variants/$v/versions.txt"; done
