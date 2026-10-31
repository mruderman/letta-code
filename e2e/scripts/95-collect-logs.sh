#!/usr/bin/env bash
# Copy $E2E_WORK/logs into this branch's e2e/logs/<label>/, scrubbing secrets:
# the OpenAI key (if set), anything shaped like an API key, and the throwaway
# Verdaccio publish token. Fails if anything key-shaped survives.
#   usage: 95-collect-logs.sh <label>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/00-env.sh"
label="$1"
dest="$here/../logs/$label"
rm -rf "$dest" && mkdir -p "$dest"
cp -r "$E2E_WORK/logs/." "$dest/"

secrets=()
[ -n "${OPENAI_API_KEY:-}" ] && secrets+=("$OPENAI_API_KEY")
[ -n "${OPENAI_API_KEY_OR_ACCESS_TOKEN:-}" ] && secrets+=("$OPENAI_API_KEY_OR_ACCESS_TOKEN")
if [ -f "$E2E_WORK/npmrc-publish" ]; then
  secrets+=("$(sed -n 's/.*_authToken=//p' "$E2E_WORK/npmrc-publish")")
fi
SCRUB_SECRETS="$(printf '%s\n' "${secrets[@]}")" python3 -I - "$dest" <<'PY'
import os, re, sys, pathlib
secrets = [s for s in os.environ.get("SCRUB_SECRETS", "").splitlines() if len(s) >= 8]
pattern = re.compile(r"sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,}")
for path in pathlib.Path(sys.argv[1]).rglob("*"):
    if not path.is_file() or path.suffix in {".png", ".svg"}:
        continue
    text = path.read_text(errors="replace")
    clean = text
    for secret in secrets:
        clean = clean.replace(secret, "[REDACTED]")
    clean = pattern.sub("[REDACTED]", clean)
    if clean != text:
        path.write_text(clean)
leftover = [str(p) for p in pathlib.Path(sys.argv[1]).rglob("*") if p.is_file() and p.suffix not in {".png", ".svg"}
            and (pattern.search(p.read_text(errors="replace")) or any(s in p.read_text(errors="replace") for s in secrets))]
if leftover:
    sys.exit(f"secret-like content survived scrubbing: {leftover}")
print(f"collected and scrubbed logs into {sys.argv[1]}")
PY
