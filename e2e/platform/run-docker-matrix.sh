#!/usr/bin/env bash
# All x64 Docker cells: Node 22/24 x glibc/musl x {published, lock-pinned}. arm64, macOS and Windows
# cells run in fork CI (see .github/workflows/e2e-platform-matrix.yml); no QEMU here.
here="$(cd "$(dirname "$0")" && pwd)"; out="${1:?outdir}"
for node in 22 24; do for libc in glibc musl; do for column in published lock-pinned; do
  bash "$here/run-docker-cell.sh" "$node" "$libc" "$column" "$out"
done; done; done
