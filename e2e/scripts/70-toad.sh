#!/usr/bin/env bash
# Run letta-acp inside Toad (batrachian.ai), an independent third-party ACP
# client, in the ACP Registry's no-make image. Toad launches the agent itself
# via `toad acp "<command>"`; acp-tap.mjs sits in that command to log the wire.
#   usage: 70-toad.sh <deterministic|pty> <run-name>
#   CHAIN_ROOT=<dir with node_modules/.bin/letta-acp>: run that installed chain (mounted read-only)
#   in the plain registry image instead of `npx` from the local Verdaccio (used for the 0.1.8 runs,
#   where the chain under test is the published package as npm resolves it today).
# The prompt comes from prompts.json, so Toad runs the same scenario as acp-client.mjs.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"
here="$(cd "$(dirname "$0")" && pwd)"
scenario="$1" name="$2"
prompt="$(python3 -I -c "import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$here/prompts.json" "$scenario")"
out="$E2E_WORK/logs/$name"
rm -rf "$out" && mkdir -p "$out" && chmod 777 "$out"
port="${TOAD_PORT:-8000}"

env_args=(-e HOME=/tmp/e2e-home -e LETTA_LOCAL_BACKEND_DIR=/tmp/e2e-home/letta-local-backend -e LETTA_CODE_TELEM=0
  -e UV_TOOL_DIR=/tmp/uv-tools -e UV_TOOL_BIN_DIR=/tmp/uv-bin -e UV_PYTHON_INSTALL_DIR=/tmp/uv-python)
if [ "$scenario" = deterministic ]; then
  env_args+=(-e LETTA_LOCAL_BACKEND_EXECUTOR=deterministic)
else
  : "${OPENAI_API_KEY:?the pty scenario needs OPENAI_API_KEY (a placeholder is fine when a proxy injects the real key)}"
  # Toad shows ACP permission prompts in its UI; this run pre-approves tools so
  # the scripted session is not blocked on a dialog. Permission handling itself
  # is exercised by acp-client.mjs (40-acp-scenario.sh).
  env_args+=(-e OPENAI_API_KEY -e LETTA_ACP_MODEL="${LETTA_ACP_MODEL:-openai/gpt-5.6-luna}" -e LETTA_ACP_PERMISSION_MODE=unrestricted "${LIVE_NET_ARGS[@]}")
fi

agent="node /e2e-scripts/acp-tap.mjs --log /e2e-out/wire.ndjson -- npx -y @letta-ai/letta-acp@$TEST_ACP_VERSION"
image="$REGISTRY_IMAGE_VERDACCIO"; chain_args=()
if [ -n "${CHAIN_ROOT:-}" ]; then
  agent="node /e2e-scripts/acp-tap.mjs --log /e2e-out/wire.ndjson -- /chain/node_modules/.bin/letta-acp"
  image="$REGISTRY_IMAGE"; chain_args=(-v "$CHAIN_ROOT:/chain:ro")
fi
docker rm -f e2e-toad >/dev/null 2>&1 || true
docker run -d --name e2e-toad --network host --entrypoint sh "${env_args[@]}" "${chain_args[@]}" \
  -v "$here:/e2e-scripts:ro" -v "$out:/e2e-out" "$image" -c '
    set -e
    uv tool install -q --python 3.14 batrachian-toad >/dev/null 2>&1
    /tmp/uv-bin/toad --version > /e2e-out/toad-version.txt
    mkdir -p /tmp/work "$HOME"
    exec /tmp/uv-bin/toad acp --title "Letta (e2e)" --project-dir /tmp/work \
      --serve --host 127.0.0.1 --port '"$port"' "'"$agent"'"
  ' >/dev/null

for _ in $(seq 1 300); do
  curl -sf --noproxy '*' "http://127.0.0.1:$port/" >/dev/null && break
  sleep 1
done
echo "Toad $(cat "$out/toad-version.txt" 2>/dev/null) serving on :$port"
set +e
node "$here/toad-drive.mjs" --url "http://127.0.0.1:$port" --wire "$out/wire.ndjson" --out "$out" --prompt "$prompt"
status=$?
set -e
docker logs e2e-toad > "$out/toad-container.log" 2>&1 || true
docker rm -f e2e-toad >/dev/null
if [ "$scenario" = pty ]; then
  # Same pass criteria as acp-client.mjs, applied to the tap's wire log.
  node "$here/check-wire.mjs" --wire "$out/wire.ndjson" --expect glibc || status=1
fi
exit $status
