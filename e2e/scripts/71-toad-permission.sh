#!/usr/bin/env bash
# K02: Toad (third-party ACP client) with its OWN permission dialog. The adapter runs in "standard"
# mode, so a shell write must be approved; Toad shows the dialog, the driver presses Enter, and
# the wire log must show Toad answering with a selected option. A real model does the work.
#   usage: 71-toad-permission.sh <agent-bin> <run-name>
#   agent-bin: path to an installed letta-acp (mounted read-only), e.g. .../lock-pinned/node_modules/.bin/letta-acp
set -euo pipefail
. "$(dirname "$0")/00-env.sh"
here="$(cd "$(dirname "$0")" && pwd)"
bin="$1"; name="$2"
chain_root="$(cd "$(dirname "$bin")/../.." && pwd)"
out="$E2E_WORK/logs/$name"
rm -rf "$out" && mkdir -p "$out" && chmod 777 "$out"
port="${TOAD_PORT:-8001}"
stamp="TOADPERM$RANDOM"
prompt="Run \`echo $stamp > /tmp/work/toad-perm.txt\` in the shell, then run \`cat /tmp/work/toad-perm.txt\` and tell me exactly what it printed."
env_args=(-e HOME=/tmp/e2e-home -e LETTA_LOCAL_BACKEND_DIR=/tmp/e2e-home/letta-local-backend -e LETTA_CODE_TELEM=0 -e LETTA_ACP_BACKEND=local
  -e UV_TOOL_DIR=/tmp/uv-tools -e UV_TOOL_BIN_DIR=/tmp/uv-bin -e UV_PYTHON_INSTALL_DIR=/tmp/uv-python
  -e OPENAI_API_KEY -e LETTA_ACP_MODEL="${LETTA_ACP_MODEL:-openai/gpt-5.6-luna}" -e LETTA_ACP_PERMISSION_MODE=standard "${LIVE_NET_ARGS[@]}")
agent="node /e2e-scripts/acp-tap.mjs --log /e2e-out/wire.ndjson -- /chain/node_modules/.bin/letta-acp"
docker rm -f e2e-toad-perm >/dev/null 2>&1 || true
docker run -d --name e2e-toad-perm --network host --entrypoint sh "${env_args[@]}" \
  -v "$here:/e2e-scripts:ro" -v "$out:/e2e-out" -v "$chain_root:/chain:ro" "$REGISTRY_IMAGE" -c '
    set -e
    uv tool install -q --python 3.14 batrachian-toad >/dev/null 2>&1
    /tmp/uv-bin/toad --version > /e2e-out/toad-version.txt
    mkdir -p /tmp/work "$HOME"
    exec /tmp/uv-bin/toad acp --title "Letta (e2e)" --project-dir /tmp/work \
      --serve --host 127.0.0.1 --port '"$port"' "'"$agent"'"
  ' >/dev/null
for _ in $(seq 1 300); do curl -sf --noproxy '*' "http://127.0.0.1:$port/" >/dev/null && break; sleep 1; done
echo "Toad $(cat "$out/toad-version.txt" 2>/dev/null) serving on :$port; prompt: $prompt"
set +e
node "$here/toad-drive.mjs" --url "http://127.0.0.1:$port" --wire "$out/wire.ndjson" --out "$out" --prompt "$prompt" --permission 1 --timeout-ms 420000
status=$?
set -e
docker logs e2e-toad-perm > "$out/toad-container.log" 2>&1 || true
docker rm -f e2e-toad-perm >/dev/null
echo "stamp=$stamp" > "$out/stamp.txt"
exit $status
