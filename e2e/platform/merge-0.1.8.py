#!/usr/bin/env python3
"""Merge the 0.1.8 platform cells into <cell>.<column>.json files for coverage-report.mjs.
x64 cells: the local Docker stock image (no make), with the same cell on a CI runner (make present)
noted in the detail. arm64 and Windows: fork CI. macOS: CI cancelled the jobs, so no file (= not run).
usage: merge-0.1.8.py <logs/v0.1.8/platform>"""
import json, re, sys
from pathlib import Path
d = Path(sys.argv[1])
ci = {}
for line in (d / "ci-run-41240502689.txt").read_text().splitlines():
    if line.startswith("RESULT_JSON:"):
        r = json.loads(line[len("RESULT_JSON:"):]); ci[(r["cell"], r["column"])] = r
merged = d / "merged"; merged.mkdir(exist_ok=True)
for (cell, column), r in ci.items():
    local = d / f"{cell}.{column}" / "cell.json"
    if local.exists():
        loc = json.loads(local.read_text())
        env = (d / f"{cell}.{column}" / "env.txt").read_text().strip()
        ci_note = f"same cell on a CI runner that HAS make and gcc: {r['status']} ({r['level']})" if "musl" not in cell else f"same cell in CI (node:alpine container, no make): {r['status']}"
        out = {"status": loc["status"], "level": loc["level"], "detail": f"[local Docker stock image, {env}] {loc['detail']} || {ci_note}"}
    else:
        out = {"status": r["status"], "level": r["level"], "detail": f"[fork CI run 41240502689] {r['detail']}"}
    (merged / f"{cell}.{column}.json").write_text(json.dumps(out, indent=1) + "\n")
    print(cell, column, out["status"])
