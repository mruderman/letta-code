#!/usr/bin/env bash
# Step 3 of TEST-PLAN.md in one command: build and serve the test chain, then run
# every check that needs no credentials. Requires Docker, Bun, Node and Python 3.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/00-env.sh"

bash "$here/10-build-letta-code.sh"
bash "$here/20-verdaccio.sh"
bash "$here/25-registry-images.sh"
bash "$here/30-build-publish-letta-acp.sh"
bash "$here/40-acp-scenario.sh" deterministic glibc det-glibc
bash "$here/40-acp-scenario.sh" deterministic musl det-musl
bash "$here/50-registry-validator.sh"
bash "$here/60-pty-smoke.sh"
bash "$here/70-toad.sh" deterministic toad-det
echo "sandbox phase complete"
