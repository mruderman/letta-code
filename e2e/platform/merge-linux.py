#!/usr/bin/env python3
"""Merge the Linux platform matrix into <cell>.<column>.json files for coverage-report.mjs.
  x64 Docker cells: run locally by run-docker-matrix.sh (one directory per cell, with cell.json).
  arm64 Docker cells and Ubuntu runner cells: RESULT_JSON lines saved from the fork CI job logs.
usage: merge-linux.py <local x64 dir> <saved CI RESULT_JSON file> <merged out dir>"""
import json, re, sys
from pathlib import Path

local, ci_file, merged = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
merged.mkdir(parents=True, exist_ok=True)
for f in sorted(local.glob("*/cell.json")):
    cell, column = f.parent.name.rsplit(".", 1)
    c = json.loads(f.read_text())
    log = f.parent / "install.log"
    cause = next((l.split("Error:", 1)[1].strip() for l in log.read_text().splitlines() if "gyp ERR! stack Error:" in l), "") if log.exists() else ""
    detail = c["detail"] + (f" (node-gyp: {cause})" if cause and cause not in c["detail"] else "")
    out = {"status": c["status"], "level": c["level"], "detail": f"[local Docker, {c.get('env', '')}] {detail}"}
    (merged / f"{cell}.{column}.json").write_text(json.dumps(out, indent=1) + "\n")
    print("local", cell, column, c["status"])
m = re.search(r"^# run (\d+)", ci_file.read_text(), re.M)
run = m.group(1) if m else "?"
for line in ci_file.read_text().splitlines():
    if not line.startswith("RESULT_JSON:"):
        continue
    r = json.loads(line[len("RESULT_JSON:"):])
    out = {"status": r["status"], "level": r["level"], "detail": f"[fork CI run {run}, {r.get('env', '')}] {r['detail']}"}
    (merged / f"{r['cell']}.{r['column']}.json").write_text(json.dumps(out, indent=1) + "\n")
    print("ci", r["cell"], r["column"], r["status"])
