#!/usr/bin/env bash
# Run pty-smoke.ts against the published-shape letta-code test package on glibc
# (the registry's no-make image) and musl (node:22-alpine), and assert per libc.
# Requires 10-build-letta-code.sh (its worktree) and 20-verdaccio.sh.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"
here="$(cd "$(dirname "$0")" && pwd)"

code_wt="$E2E_WORK/wt-letta-code"
out="$E2E_WORK/pty-smoke" && rm -rf "$out" && mkdir -p "$out"
cp "$here/pty-smoke.ts" "$code_wt/e2e-pty-smoke.ts"
(cd "$code_wt" && bun build e2e-pty-smoke.ts --target=node --format=esm --external node-pty --outfile "$out/smoke.mjs" >/dev/null)
rm "$code_wt/e2e-pty-smoke.ts"

ca_args=()
if [ -n "$EXTRA_CA_BUNDLE" ]; then
  ca_args=(-v "$EXTRA_CA_BUNDLE:/e2e-ca.crt:ro" -e NODE_EXTRA_CA_CERTS=/e2e-ca.crt)
fi
status=0
for libc in glibc musl; do
  case "$libc" in
    glibc) image="$REGISTRY_IMAGE_VERDACCIO" ;;
    musl) image="mirror.gcr.io/library/node:22-alpine" ;;
  esac
  log="$E2E_WORK/logs/pty-smoke-$libc.json"
  docker run --rm --entrypoint sh "${ca_args[@]}" \
    -e npm_config_registry="http://$VERDACCIO_HOST_FROM_CONTAINER:$VERDACCIO_PORT/" \
    -v "$out/smoke.mjs:/smoke/smoke.mjs:ro" "$image" -c '
      set -e
      mkdir -p /app && cd /app && npm init -y >/dev/null 2>&1
      # node-pty arrives through letta-code'"'"'s published shrinkwrap, as for users.
      npm install --no-audit --no-fund --silent @letta-ai/letta-code@'"$TEST_CODE_VERSION"' >/dev/null 2>&1
      cp /smoke/smoke.mjs /app/smoke.mjs
      pty=node_modules/node-pty
      echo "{\"libc\": \"$(ldd --version 2>&1 | head -1)\", \"nodePty\": \"$(node -p "require(\"./$pty/package.json\").version")\", \"prebuildUsed\": $([ -d $pty/prebuilds ] && [ ! -d $pty/build ] && echo true || echo false), \"make\": \"$(command -v make || echo absent)\"}" > /tmp/env.json
      node /app/smoke.mjs > /tmp/result.json
      node -e "console.log(JSON.stringify({environment: require(\"/tmp/env.json\"), ...require(\"/tmp/result.json\")}, null, 2))"
    ' > "$log"
  python3 -I - "$libc" "$log" <<'PY' || status=1
import json, sys
libc, path = sys.argv[1], sys.argv[2]
r = json.load(open(path))
sr, th, env = r["shellRunner"], r["terminalHandler"], r["environment"]
checks = [("node-pty 1.2.0-beta.14 installed from its prebuild (nothing compiled)", env["nodePty"] == "1.2.0-beta.14" and env["prebuildUsed"])]
if libc == "glibc":
    checks += [
        ("shell-runner allocated a real PTY (tty=true, PTY_OK)", sr["effectiveTty"] is True and "PTY_OK" in sr["probe"]["stdout"]),
        ("input written to the PTY was read (got:hello)", "got:hello" in sr["stdin"]["stdout"]),
        ("terminal handler spawned a PTY shell", th["spawned"]),
        ("terminal shell evaluated typed input (TERM_42)", th["evaluated"]),
    ]
else:
    exited = th["exited"] or {}
    checks += [
        ("shell-runner refused the glibc prebuild and fell back to a pipe (tty=false)", sr["effectiveTty"] is False),
        ("command still ran via the pipe (NO_PTY)", "NO_PTY" in sr["probe"]["stdout"]),
        ("fallback reason reported on stderr", "Falling back to a non-TTY pipe" in sr["probe"]["stderr"]),
        ("terminal handler reported an actionable terminal_exited instead of crashing", not th["spawned"] and "musl" in str(exited.get("error", ""))),
    ]
print(f"== pty smoke on {libc} ({env['libc']}; make: {env['make']})")
ok = True
for name, passed in checks:
    ok &= bool(passed)
    print(f"  {'ok  ' if passed else 'FAIL'} {name}")
sys.exit(0 if ok else 1)
PY
done
exit $status
