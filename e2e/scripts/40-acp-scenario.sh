#!/usr/bin/env bash
# Run acp-client.mjs in a clean container. letta-acp is installed via `npx` from
# Verdaccio, exactly as an editor launches it.
#   usage: 40-acp-scenario.sh <deterministic|pty> <glibc|musl> <run-name>
# Every run uses a fresh, empty HOME and Letta backend directory inside the
# container, so each agent is created for the run and disappears with it.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"
here="$(cd "$(dirname "$0")" && pwd)"
scenario="$1" libc="$2" name="$3"
out="$E2E_WORK/logs/$name"
rm -rf "$out" && mkdir -p "$out"

case "$libc" in
  glibc) image="$REGISTRY_IMAGE_VERDACCIO" ;;  # the ACP Registry's no-make Ubuntu image
  musl) image="mirror.gcr.io/library/node:22-alpine" ;;
  *) echo "libc must be glibc or musl" >&2; exit 2 ;;
esac

env_args=(
  -e TEST_ACP_VERSION="$TEST_ACP_VERSION"
  -e npm_config_registry="http://$VERDACCIO_HOST_FROM_CONTAINER:$VERDACCIO_PORT/"
  -e HOME=/tmp/e2e-home
  -e LETTA_LOCAL_BACKEND_DIR=/tmp/e2e-home/letta-local-backend
  -e LETTA_ACP_PERMISSION_MODE=standard
  -e LETTA_CODE_TELEM=0
)
if [ "$scenario" = deterministic ]; then
  # No model and no agent persona: the local backend's deterministic executor
  # (DeterministicPongExecutor) answers every turn with "pong" and calls no tools.
  env_args+=(-e LETTA_LOCAL_BACKEND_EXECUTOR=deterministic)
else
  : "${OPENAI_API_KEY:?the pty scenario needs OPENAI_API_KEY}"
  env_args+=(-e OPENAI_API_KEY -e LETTA_ACP_MODEL="${LETTA_ACP_MODEL:-openai/gpt-5.6-luna}")
fi
ca_args=()
if [ -n "$EXTRA_CA_BUNDLE" ]; then
  ca_args=(-v "$EXTRA_CA_BUNDLE:/e2e-ca.crt:ro" -e NODE_EXTRA_CA_CERTS=/e2e-ca.crt)
fi

docker run --rm --entrypoint sh "${env_args[@]}" "${ca_args[@]}" \
  -v "$here:/e2e-scripts:ro" -v "$out:/e2e-out" "$image" -c '
    set -e
    # letta-code'"'"'s local backend needs git, and bash for its memory-store git hook
    # (the registry image has both; node:22-alpine has neither).
    # apk verifies package signatures, so plain-HTTP mirrors are fine here.
    if command -v apk >/dev/null && ! command -v bash >/dev/null; then
      sed -i "s#^https://#http://#" /etc/apk/repositories
      apk add --no-cache git bash >/dev/null
    fi
    mkdir -p /client "$HOME" && cp /e2e-scripts/acp-client.mjs /e2e-scripts/prompts.json /client/
    cd /client && npm init -y >/dev/null 2>&1
    npm install --no-audit --no-fund --silent @agentclientprotocol/sdk@'"$ACP_CLIENT_SDK_VERSION"' >/dev/null
    {
      echo "image: '"$image"'"; uname -m
      ldd --version 2>&1 | head -1
      echo "node $(node --version)"
      echo "make: $(command -v make || echo absent)"
    } > /e2e-out/environment.txt
    mkdir -p /tmp/work && cd /tmp/work
    node /client/acp-client.mjs --scenario '"$scenario"' --expect '"$libc"' --out /e2e-out
  '
