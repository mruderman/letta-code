#!/usr/bin/env bash
# Run every registry gate that applies to the Letta entry as it would be merged
# (PR 472's files + license_url + the pin to the latest published letta-acp), against the
# registry's own scripts at a fixed commit. Read-only with respect to the registry: nothing
# is pushed or posted; the registry clone is only used to create throwaway worktrees.
#
#   REGISTRY_DIR=<clone>  E2E_WORK=<scratch>  OUT=<log dir>  bash run-final-entry-gates.sh
#
# Gates, matching .github/workflows in the registry:
#   R1 build_registry.py --dry-run     schema + icon + required fields   (build-registry.yml)
#   R2 license_url returns 200          (check-license-urls.yml)
#   R3 verify_agents.py --auth-check on a CI-like host                    (build-registry.yml)
#   R4 the same inside the registry's no-make Docker image               (run-registry-docker.sh)
#   R5 protocol_matrix.py on host                                         (daily-protocol-matrix.yml)
#   R6 protocol_matrix.py in the no-make Docker image
# Plus the gate the registry does NOT have: R7, one real prompt turn (turn-probe.mjs).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${REGISTRY_DIR:?}" "${E2E_WORK:?}" "${OUT:?}"
IMAGE="${REGISTRY_IMAGE:-acp-registry-tools-e2e}"
mkdir -p "$OUT"
wt="$E2E_WORK/wt-final-entry"
git -C "$REGISTRY_DIR" worktree remove --force "$wt" 2>/dev/null || true
git -C "$REGISTRY_DIR" worktree add -q --detach "$wt" "${REGISTRY_COMMIT:-b51a879}"
mkdir -p "$wt/letta-acp" && cp "$here"/letta-acp-entry/* "$wt/letta-acp/"
{ echo "registry commit: $(git -C "$wt" rev-parse HEAD)"; echo "entry:"; cat "$wt/letta-acp/agent.json"; } > "$OUT/entry.txt"
status() { echo "$1 exit=$2" | tee -a "$OUT/summary.txt"; }
# protocol_matrix.py exits 0 even when the agent fails to start, so the gate verdict is read from
# the matrix itself: initialize and session/new must both be "success" for letta-acp.
matrix_verdict() {
  python3 - "$1" <<'PY'
import json, sys
j = json.load(open(sys.argv[1] + "/latest.json"))
a = next(x for x in j["agents"] if x["id"] == "letta-acp")
ok = a["initialize"]["status"] == "success" and a["sessionNew"]["status"] == "success"
print(f"initialize={a['initialize']['status']} session/new={a['sessionNew']['status']} {a['initialize'].get('message') or ''}", file=sys.stderr)
sys.exit(0 if ok else 1)
PY
}
prune_snapshots() { find "$1/snapshots" -type f ! -name "$(date -u +%F).*" -delete 2>/dev/null; }
: > "$OUT/summary.txt"

(cd "$wt" && uv run --with jsonschema .github/workflows/build_registry.py --agents letta-acp --dry-run) > "$OUT/R1-build-dry-run.log" 2>&1
status R1-build-dry-run $?

url="$(python3 -c "import json;print(json.load(open('$wt/letta-acp/agent.json'))['license_url'])")"
raw="${url/github.com/raw.githubusercontent.com}"; raw="${raw/\/blob\//\/}"
{ echo "license_url: $url"; curl -sS -o /dev/null -w "blob url -> HTTP %{http_code}\n" -L "$url"; curl -sS -o /dev/null -w "raw url  -> HTTP %{http_code}\n" -L "$raw"; } > "$OUT/R2-license-url.log" 2>&1
status R2-license-url 0

(cd "$wt" && python3 .github/workflows/verify_agents.py --auth-check --agent letta-acp --verbose) > "$OUT/R3-auth-check-host.log" 2>&1
status R3-auth-check-host $?

(cd "$wt" && ACP_REGISTRY_IMAGE="$IMAGE" ACP_REGISTRY_BUILD_IMAGE=0 .github/workflows/scripts/run-registry-docker.sh \
  python3 .github/workflows/verify_agents.py --auth-check --agent letta-acp --verbose) > "$OUT/R4-auth-check-docker-nomake.log" 2>&1
status R4-auth-check-docker-nomake $?
cp "$(ls -t "$wt"/.docker-state/npm-cache/_logs/*debug*.log 2>/dev/null | head -1)" "$OUT/R4-npm-debug.log" 2>/dev/null || true

(cd "$wt" && python3 .github/workflows/protocol_matrix.py --agent letta-acp --sandbox-dir "$E2E_WORK/matrix-host" --output-dir "$OUT/R5-matrix-host" --init-timeout 120 --rpc-timeout 5) > "$OUT/R5-protocol-matrix-host.log" 2>&1
prune_snapshots "$OUT/R5-matrix-host"; matrix_verdict "$OUT/R5-matrix-host" 2>> "$OUT/R5-protocol-matrix-host.log"
status R5-protocol-matrix-host $?

(cd "$wt" && ACP_REGISTRY_IMAGE="$IMAGE" ACP_REGISTRY_BUILD_IMAGE=0 .github/workflows/scripts/run-registry-docker.sh \
  python3 .github/workflows/protocol_matrix.py --agent letta-acp --sandbox-dir .matrix-sandbox --output-dir .protocol-matrix --init-timeout 120 --rpc-timeout 5) > "$OUT/R6-protocol-matrix-docker-nomake.log" 2>&1
[ -d "$wt/.protocol-matrix" ] && cp -r "$wt/.protocol-matrix" "$OUT/R6-matrix-docker" 2>/dev/null
prune_snapshots "$OUT/R6-matrix-docker"; matrix_verdict "$OUT/R6-matrix-docker" 2>> "$OUT/R6-protocol-matrix-docker-nomake.log"
echo "R6-protocol-matrix-docker-nomake exit=$?" | tee -a "$OUT/summary.txt"

# R7: a real prompt turn through the entry exactly as listed (npx, pinned), local backend + fresh HOME.
h="$(mktemp -d)"
(cd "$h" && HOME="$h" LETTA_LOCAL_BACKEND_DIR="$h/backend" LETTA_ACP_BACKEND=local LETTA_ACP_MODEL="${LETTA_ACP_MODEL:-openai/gpt-5.6-luna}" \
  OPENAI_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 PROBE_TIMEOUT_MS="${PROBE_TIMEOUT_MS:-150000}" \
  node "$here/turn-probe.mjs" "$OUT/R7-turn" npx -y "$(python3 -c "import json;print(json.load(open('$wt/letta-acp/agent.json'))['distribution']['npx']['package'])")") > "$OUT/R7-prompt-turn.log" 2>&1
status R7-prompt-turn $?
git -C "$REGISTRY_DIR" worktree remove --force "$wt"
