#!/usr/bin/env bash
# Build letta-acp main with letta-code and letta-agent-sdk bumped together (as a
# grouped Dependabot update would), check it, and publish it to Verdaccio.
# Requires 20-verdaccio.sh: letta-code $TEST_CODE_VERSION exists only there.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"

acp_wt="$E2E_WORK/wt-letta-acp"
git -C "$LETTA_ACP_DIR" worktree remove --force "$acp_wt" 2>/dev/null || true

echo "== letta-acp main ($(git -C "$LETTA_ACP_DIR" rev-parse --short main)) as $TEST_ACP_VERSION"
git -C "$LETTA_ACP_DIR" worktree add -q --detach "$acp_wt" main
(
  cd "$acp_wt"
  python3 -I - "$TEST_ACP_VERSION" "$TEST_CODE_VERSION" "$TEST_SDK_RANGE" <<'PY'
import json, sys
acp, code, sdk = sys.argv[1:]
p = json.load(open("package.json"))
p["version"] = acp
p["dependencies"]["@letta-ai/letta-code"] = code
p["dependencies"]["@letta-ai/letta-agent-sdk"] = sdk
open("package.json", "w").write(json.dumps(p, indent=2) + "\n")
PY
  # letta-code $TEST_CODE_VERSION exists only in the local Verdaccio.
  BUN_CONFIG_REGISTRY="http://localhost:$VERDACCIO_PORT/" bun install >/dev/null
  bun run check
  npm publish --userconfig "$E2E_WORK/npmrc-publish" --ignore-scripts
)
