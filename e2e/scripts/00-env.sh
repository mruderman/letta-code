# Shared settings for the e2e scripts. Source this file; do not execute it.
#
# Every script works from $E2E_WORK (scratch space, never committed) and
# expects local clones at $LETTA_CODE_DIR, $LETTA_ACP_DIR and $REGISTRY_DIR.

: "${E2E_WORK:?set E2E_WORK to a scratch directory}"
: "${LETTA_CODE_DIR:?set LETTA_CODE_DIR to a letta-code clone}"
: "${LETTA_ACP_DIR:?set LETTA_ACP_DIR to a letta-acp clone}"
: "${REGISTRY_DIR:?set REGISTRY_DIR to an agentclientprotocol/registry clone}"

# The fix under test, and the published baseline it replaces.
FIX_REF="${FIX_REF:-fix/node-pty-prebuilds}"
BASELINE_ACP_VERSION="${BASELINE_ACP_VERSION:-0.1.11}"

# Test-only versions published to the local Verdaccio. They must be plain
# (non-prerelease) versions: semver ranges skip prereleases, and
# letta-agent-sdk's peer range on letta-code is >=0.34.x <0.35.0.
TEST_CODE_VERSION="${TEST_CODE_VERSION:-0.34.99}"
TEST_ACP_VERSION="${TEST_ACP_VERSION:-0.1.99}"
TEST_SDK_RANGE="${TEST_SDK_RANGE:-^0.8.64}"

# The client speaks the same ACP SDK line letta-acp itself depends on.
ACP_CLIENT_SDK_VERSION="${ACP_CLIENT_SDK_VERSION:-1.3.0}"

VERDACCIO_PORT="${VERDACCIO_PORT:-4873}"
# How containers reach Verdaccio published on the Docker host.
VERDACCIO_HOST_FROM_CONTAINER="${VERDACCIO_HOST_FROM_CONTAINER:-$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || echo 172.17.0.1)}"

# Optional: a CA bundle for sandboxes that intercept TLS. Leave empty elsewhere.
EXTRA_CA_BUNDLE="${EXTRA_CA_BUNDLE:-}"

REGISTRY_IMAGE="acp-registry-tools-e2e"
REGISTRY_IMAGE_VERDACCIO="acp-registry-tools-e2e-verdaccio"

mkdir -p "$E2E_WORK/tarballs" "$E2E_WORK/logs"
