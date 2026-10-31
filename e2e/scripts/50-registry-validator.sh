#!/usr/bin/env bash
# Run the ACP Registry's own validator (verify_agents.py --auth-check) against:
#   before: the published letta-acp $BASELINE_ACP_VERSION, from npmjs
#   after:  letta-acp $TEST_ACP_VERSION + letta-code $TEST_CODE_VERSION, from Verdaccio
# The Letta entry comes from agentclientprotocol/registry#472, with only its
# version changed, in a throwaway worktree of the registry clone.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"

git -C "$REGISTRY_DIR" rev-parse -q --verify pr-472 >/dev/null ||
  git -C "$REGISTRY_DIR" fetch -q --depth=5 origin pull/472/head:pr-472

run() {
  local label="$1" version="$2" image="$3"
  local wt="$E2E_WORK/wt-registry-$label"
  git -C "$REGISTRY_DIR" worktree remove --force "$wt" 2>/dev/null || true
  git -C "$REGISTRY_DIR" worktree add -q --detach "$wt" main
  git -C "$wt" checkout -q pr-472 -- letta-acp
  sed -i -E "s/\"version\": \"[^\"]+\"/\"version\": \"$version\"/; s/@letta-ai\/letta-acp@[0-9.]+/@letta-ai\/letta-acp@$version/" "$wt/letta-acp/agent.json"
  echo "== $label: $(grep -o '"package": "[^"]*"' "$wt/letta-acp/agent.json") on $image"
  set +e
  (cd "$wt" && ACP_REGISTRY_IMAGE="$image" ACP_REGISTRY_BUILD_IMAGE=0 \
    .github/workflows/scripts/run-registry-docker.sh \
    python3 .github/workflows/verify_agents.py --auth-check --agent letta-acp --verbose) \
    > "$E2E_WORK/logs/registry-$label.log" 2>&1
  local status=$?
  set -e
  echo "exit=$status" >> "$E2E_WORK/logs/registry-$label.log"
  # npm's own debug log names the failing install script, which the validator
  # only reports as an initialize timeout.
  cp "$(ls -t "$wt"/.docker-state/npm-cache/_logs/*debug*.log | head -1)" "$E2E_WORK/logs/registry-$label-npm-debug.log" 2>/dev/null || true
  sed -n '/^Verifying/,$p' "$E2E_WORK/logs/registry-$label.log"
  git -C "$REGISTRY_DIR" worktree remove --force "$wt"
}

run before "$BASELINE_ACP_VERSION" "$REGISTRY_IMAGE"
run after "$TEST_ACP_VERSION" "$REGISTRY_IMAGE_VERDACCIO"
