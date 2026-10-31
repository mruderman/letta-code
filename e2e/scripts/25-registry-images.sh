#!/usr/bin/env bash
# Build the ACP Registry's own validator image from the registry clone, then a
# thin layer that points npm at the local Verdaccio holding the test builds.
#
# Deviations from the registry's image, both sandbox-only and both shown here:
#   1. If EXTRA_CA_BUNDLE is set, trust it (for sandboxes that intercept TLS).
#   2. npm's *builtin* config points at Verdaccio. The validator overrides HOME
#      and runs `npm exec --prefix <sandbox>`, which moves the user and global
#      config files; the builtin config is the one layer neither override moves.
# The no-make, no-compiler condition under test is untouched.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"

ctx="$REGISTRY_DIR/.github/workflows"
work="$E2E_WORK/registry-image"
rm -rf "$work" && mkdir -p "$work"
dockerfile="$ctx/docker/registry-tools.Dockerfile"
build_args=()
if [ -n "$EXTRA_CA_BUNDLE" ]; then
  bundle=/usr/local/share/ca-certificates/e2e-extra-ca.crt
  sed "/^FROM ubuntu:24.04\$/a\\
# --- e2e sandbox-only addition: trust the sandbox's TLS-intercepting CA bundle ---\\
COPY --from=extraca ca.crt $bundle\\
ENV PIP_CERT=$bundle SSL_CERT_FILE=$bundle REQUESTS_CA_BUNDLE=$bundle NODE_EXTRA_CA_CERTS=$bundle" \
    "$dockerfile" > "$work/Dockerfile"
  mkdir -p "$work/extraca" && cp "$EXTRA_CA_BUNDLE" "$work/extraca/ca.crt"
  build_args=(--build-context "extraca=$work/extraca")
  dockerfile="$work/Dockerfile"
  echo "== registry Dockerfile deviation:"; diff "$ctx/docker/registry-tools.Dockerfile" "$dockerfile" || true
fi
docker build -q "${build_args[@]}" -f "$dockerfile" -t "$REGISTRY_IMAGE" "$ctx" >/dev/null

cat > "$work/Dockerfile.verdaccio" <<EOF
FROM $REGISTRY_IMAGE
RUN echo 'registry=http://$VERDACCIO_HOST_FROM_CONTAINER:$VERDACCIO_PORT/' > /usr/local/lib/node_modules/npm/npmrc
EOF
docker build -q -f "$work/Dockerfile.verdaccio" -t "$REGISTRY_IMAGE_VERDACCIO" "$work" >/dev/null

docker run --rm --entrypoint sh "$REGISTRY_IMAGE_VERDACCIO" -c '
  echo "node $(node --version); make: $(command -v make || echo absent); gcc: $(command -v gcc || echo absent)"
  mkdir -p /tmp/p && echo "npm registry under --prefix with HOME overridden: $(HOME=/tmp/h npm --prefix /tmp/p config get registry)"'
