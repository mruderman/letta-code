#!/usr/bin/env bash
# Materialise the install chains the suite compares, each in its own directory under $1.
#   published    npm install @letta-ai/letta-acp@$ACP_VERSION, nothing else: what `npx` resolves today
#                (floating ^ ranges pick up newer @letta-ai/letta-agent-sdk and @agentclientprotocol/sdk)
#   lock-pinned  the same package with the two floating dependencies pinned to what letta-acp's own
#                bun.lock uses at that tag (0.1.11: letta-agent-sdk 0.7.2, @agentclientprotocol/sdk 1.3.0;
#                0.1.8: letta-agent-sdk 0.5.7, @agentclientprotocol/sdk 1.3.0). Override with LOCK_AGENT_SDK
#                and LOCK_ACP_SDK.
# Records the resolved tree in each directory's versions.txt.
set -euo pipefail
root="${1:?usage: make-chains.sh <dir>}"; ACP_VERSION="${ACP_VERSION:-0.1.11}"
case "$ACP_VERSION" in
  0.1.8) default_sdk=0.5.7 ;;
  *) default_sdk=0.7.2 ;;
esac
LOCK_AGENT_SDK="${LOCK_AGENT_SDK:-$default_sdk}"; LOCK_ACP_SDK="${LOCK_ACP_SDK:-1.3.0}"
mkdir -p "$root/published" "$root/lock-pinned"
(cd "$root/published" && npm init -y >/dev/null && npm install --no-audit --no-fund "@letta-ai/letta-acp@$ACP_VERSION" >/dev/null)
(cd "$root/lock-pinned" && npm init -y >/dev/null && npm install --no-audit --no-fund "@letta-ai/letta-acp@$ACP_VERSION" "@letta-ai/letta-agent-sdk@$LOCK_AGENT_SDK" "@agentclientprotocol/sdk@$LOCK_ACP_SDK" >/dev/null)
for chain in published lock-pinned; do
  (cd "$root/$chain" && npm ls --all --depth=2 2>/dev/null | grep -E "letta-acp|letta-agent-sdk|letta-code|agentclientprotocol|node-pty" | awk '!seen[$0]++' > versions.txt; echo "node $(node --version)" >> versions.txt)
  echo "== $chain"; cat "$root/$chain/versions.txt"
done
