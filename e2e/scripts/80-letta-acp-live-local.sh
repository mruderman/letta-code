#!/usr/bin/env bash
# letta-acp's own live test (`bun run test:backend:live:local`, the one Letta's CI
# runs on main) against the letta-acp worktree from 30-build-publish-letta-acp.sh,
# whose node_modules hold the fixed letta-code test build.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"
: "${OPENAI_API_KEY:?needs OPENAI_API_KEY}"
cd "$E2E_WORK/wt-letta-acp"
# The package's exports map hides package.json from require(); read the file.
echo "letta-code under test: $(python3 -I -c 'import json; print(json.load(open("node_modules/@letta-ai/letta-code/package.json"))["version"])')"
env -u LETTA_API_KEY bun run test:backend:live:local
