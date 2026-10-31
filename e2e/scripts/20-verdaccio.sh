#!/usr/bin/env bash
# Start a throwaway Verdaccio registry and publish the letta-code test tarball.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"
here="$(cd "$(dirname "$0")" && pwd)"

storage="$E2E_WORK/verdaccio-storage"
rm -rf "$storage" && mkdir -p "$storage" && chmod 777 "$storage"
ca_args=()
if [ -n "$EXTRA_CA_BUNDLE" ]; then
  ca_args=(-v "$EXTRA_CA_BUNDLE:/ca.crt:ro" -e NODE_EXTRA_CA_CERTS=/ca.crt)
fi
docker rm -f e2e-verdaccio >/dev/null 2>&1 || true
docker run -d --name e2e-verdaccio -p "$VERDACCIO_PORT:4873" \
  -v "$here/docker/verdaccio-config.yaml:/verdaccio/conf/config.yaml:ro" \
  -v "$storage:/verdaccio/storage" "${ca_args[@]}" verdaccio/verdaccio:6 >/dev/null
for _ in $(seq 1 30); do
  curl -sf --noproxy '*' "http://localhost:$VERDACCIO_PORT/-/ping" >/dev/null && break
  sleep 1
done

# A local-only publish user; the token never leaves this machine.
token=$(curl -s --noproxy '*' -X PUT -H 'content-type: application/json' \
  -d '{"name":"e2e","password":"e2e-local-only"}' \
  "http://localhost:$VERDACCIO_PORT/-/user/org.couchdb.user:e2e" |
  python3 -I -c 'import sys, json; print(json.load(sys.stdin)["token"])')
printf 'registry=http://localhost:%s/\n//localhost:%s/:_authToken=%s\n' \
  "$VERDACCIO_PORT" "$VERDACCIO_PORT" "$token" > "$E2E_WORK/npmrc-publish"

NO_PROXY="localhost,${NO_PROXY:-}" npm publish \
  "$E2E_WORK/tarballs/letta-ai-letta-code-$TEST_CODE_VERSION.tgz" \
  --userconfig "$E2E_WORK/npmrc-publish" --ignore-scripts
curl -s --noproxy '*' "http://localhost:$VERDACCIO_PORT/@letta-ai%2fletta-code" |
  python3 -I -c 'import sys, json; print("letta-code versions in Verdaccio:", list(json.load(sys.stdin)["versions"]))'
