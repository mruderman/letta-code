#!/usr/bin/env bash
# Build a test tarball of the fix: letta-code $FIX_REF, versioned $TEST_CODE_VERSION.
# Built in a throwaway git worktree so the real branch stays untouched.
set -euo pipefail
. "$(dirname "$0")/00-env.sh"

code_wt="$E2E_WORK/wt-letta-code"
git -C "$LETTA_CODE_DIR" worktree remove --force "$code_wt" 2>/dev/null || true

echo "== letta-code $FIX_REF ($(git -C "$LETTA_CODE_DIR" rev-parse --short "$FIX_REF")) as $TEST_CODE_VERSION"
git -C "$LETTA_CODE_DIR" worktree add -q --detach "$code_wt" "$FIX_REF"
(
  cd "$code_wt"
  # Only the top-level and shrinkwrap-root version fields change; the
  # runtime-graph digest excludes the root version, so it stays valid.
  python3 -I - "$TEST_CODE_VERSION" <<'PY'
import json, sys
new = sys.argv[1]
for path, count in (("package.json", 1), ("npm-shrinkwrap.json", 2)):
    raw = open(path, encoding="utf-8").read()
    old = json.loads(raw)["version"]
    raw = raw.replace(f'"version": "{old}"', f'"version": "{new}"', count)
    data = json.loads(raw)
    assert data["version"] == new, path
    if "packages" in data:
        assert data["packages"][""]["version"] == new
    open(path, "w", encoding="utf-8").write(raw)
PY
  bun install --frozen-lockfile >/dev/null
  bun run runtime-graph:verify
  bun run build >/dev/null
  test "$(./letta.js --version | cut -d' ' -f1)" = "$TEST_CODE_VERSION"
  npm pack --pack-destination "$E2E_WORK/tarballs" >/dev/null
)
ls -1 "$E2E_WORK/tarballs"
