#!/usr/bin/env bash
# The Linux platform matrix (metric C) on this Docker host's architecture:
#   Node 22/24/26 x {glibc-slim, glibc-full, musl-slim, musl-full} x {published, lock-pinned}.
# Locally that is x64 with a live model turn; the fork's arm64 CI runners run run-docker-cell.sh per
# cell with NO_TURN=1 (see .github/workflows/e2e-platform-matrix.yml). No QEMU.
#   usage: run-docker-matrix.sh <outdir> [parallel jobs, default 4]   (NODES / COLUMNS narrow it)
# The 2026-10-31 runs used the legacy variants (Node 22/24 x glibc/musl): run-docker-cell.sh <n> glibc|musl ...
here="$(cd "$(dirname "$0")" && pwd)"; out="${1:?outdir}"; jobs="${2:-4}"
mkdir -p "$out"
for node in ${NODES:-22 24 26}; do for v in glibc-slim glibc-full musl-slim musl-full; do for column in ${COLUMNS:-published lock-pinned}; do
  while [ "$(jobs -rp | wc -l)" -ge "$jobs" ]; do wait -n; done
  bash "$here/run-docker-cell.sh" "$node" "$v" "$column" "$out" &
done; done; done
wait
