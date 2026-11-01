# letta-acp 0.1.8, as a fresh install resolves it today

**Question.** Registry PR agentclientprotocol/registry#472 pins `@letta-ai/letta-acp@0.1.8`. The newest release, 0.1.11, never finishes a prompt turn on a fresh install (agent-sdk 0.7.8). Does 0.1.8 work for a registry user who installs it today, with no lockfile? Tested 2026-10-31 on the local backend (letta-acp's default) with a real model (`openai/gpt-5.6-luna`), a fresh throwaway agent per run, and the same four metrics as the 0.1.11 suite.

**Answer.** Yes: 0.1.8 does not hang. Every `session/prompt` sent in this evaluation was answered: 254 of 254 across all 158 wire logs, 179 of 179 across the 110 logs from the published install (`scripts/check-turns.mjs`), four independent clients finish turns, and the entry passes the registry's merge gates once `license_url` is added. **But the listing would not stay on 0.1.8.** The registry's hourly `update-versions.yml` job bumps every non-quarantined entry to the newest stable npm version. A dry run of its own `update_versions.py` against the 0.1.8 entry proposes `0.1.8 -> 0.1.11` (log: `logs/v0.1.8/registry/update-versions-dry-run.json`), and before committing a bump the job checks only `build_registry.py --agents <id>` (schema) and `verify_agents.py --auth-check` (which stops at `initialize`); 0.1.11 passes both. So merging 472 at 0.1.8 would hand users the hanging version on the next successful hourly run, usually within one to two hours, unless something else changes first (see "What this means for 472").

## Headline numbers

Published column = what `npx @letta-ai/letta-acp@<version>` installs today. Full tables: [`logs/v0.1.8/COVERAGE-RESULTS-0.1.8.md`](logs/v0.1.8/COVERAGE-RESULTS-0.1.8.md).

| Metric | 0.1.8 published | 0.1.8 lock-pinned (reference) | 0.1.11 published (earlier run) |
|---|---|---|---|
| A. Letta differentiators | **15 of 20** | 16 of 20 | 0 of 20 (all blocked) |
| B. Registry gates (entry + `license_url`) | **5 of 7** | not run | 4 of 7 |
| D. Generic ACP and clients | **27 of 31** | 22 of 31 (clients not run, 1 error) | 4 of 31 |
| C. Linux platform cells (30 per column) | **18 of 30** | 18 of 30 | see main README (earlier 10-cell set) |

C splits exactly on one variable: **whether the machine has a C toolchain.** Every cell with one passes (18 of 18: glibc and musl, x64 and arm64, Node 22, 24 and 26, including Ubuntu 24.04 runners like the registry's own CI), and every cell without one fails to install (0 of 12), because npm has to compile node-pty and node-gyp finds no Python or no `make`. The 6 published x64 cells with a toolchain also completed a live model turn; the arm64 and runner cells stop at `initialize` + `session/new` because fork CI has no model key. Libc, architecture and Node version made no difference. The breakdown by variant is in `logs/v0.1.8/COVERAGE-RESULTS-0.1.8.md`.

## What a fresh install resolves

letta-acp 0.1.8 declares `@letta-ai/letta-code 0.29.12` (exact), `@letta-ai/letta-agent-sdk ^0.5.7`, `@agentclientprotocol/sdk ^1.3.0`. Today that resolves to (`logs/v0.1.8/registry/npx-resolved-tree.txt`, the tree `npx` built during the registry run):

| Package | Resolved | Note |
|---|---|---|
| letta-agent-sdk | **0.5.8** | `^0.5.7` means `<0.6.0`. 0.5.8 (2026-07-31) is the last 0.5.x; the hanging 0.7.3+ line is out of range. |
| ACP SDK | 1.9.0 | Same as 0.1.11 published; the verifier showed 1.9.0 is not the cause of the hang. Still floats within 1.x. |
| letta-code (harness) | **0.29.13** | Nested under agent-sdk 0.5.8, which pins it exactly; the SDK's `require.resolve` finds this copy, so the harness that runs is 0.29.13, not the 0.29.12 letta-acp declares. |
| letta-code (top level) | 0.29.12 | Only reached as the `letta` binary on PATH (npx adds `node_modules/.bin`). |
| node-pty | 1.1.0 | Needs `node-gyp` (make + compiler) on Linux; same as every published version. |

Lock-pinned (0.1.8's own `bun.lock`): agent-sdk 0.5.7, ACP SDK 1.3.0, letta-code 0.29.12.

## Findings, each with its log

**Turn completion (the 0.1.11 defect).** Deterministic executor: `end_turn` in 4 s (`logs/v0.1.8/pty/published-det-1/`). Real model gate G01: `end_turn` in 6 to 7 s in every run. `check-turns.mjs` over all 158 wire logs under `logs/v0.1.8/`: 254 of 254 prompts answered (242 `end_turn`, 9 `cancelled` from the cancel tests, 3 JSON-RPC errors that D18 provokes on purpose). The published install alone: 179 of 179 over 110 logs. (Before the Linux platform cells were added on 2026-11-01 these were 242 of 242 over 146 logs and 173 of 173 over 104; the 12 new cell logs each answered their one prompt.) (The first version of this file said 169 of 169 over 100 logs; that count left out a few published directories and the lock-pinned logs.) The same checker on the 0.1.11 published logs reports the gate's prompt as never answered.

**Registry gates** (registry `main` @ `bee0da3`, `logs/v0.1.8/registry/entry-0.1.8-license-url/`):

| Gate | 0.1.8 + `license_url` | PR 472 as submitted |
|---|---|---|
| R1 `build_registry.py --dry-run` | pass | **fail**: `'license_url' is a required property` |
| R2 `license_url` reachable | pass (raw URL 200; the `blob` URL returns 403 through this environment's proxy) | n/a |
| R3 `verify_agents.py --auth-check` (host) | pass: `Auth OK: letta-login(terminal)` | pass |
| R4 same, registry's no-make image | fail: node-pty 1.1.0 `node-gyp rebuild` exits 1 | fail |
| R5 `protocol_matrix.py` (host) | pass: initialize and session/new `success` | pass |
| R6 same, no-make image | fail: process exits before `initialize` | fail |
| R7 one real prompt turn via `npx` (not a registry gate) | pass: `VERIFY_OK`, `end_turn`, 33 s including install | pass |

**Letta differentiators (A, `logs/v0.1.8/live/published/`).** Memory, identity across restarts, history replay, model switch, toolset auto-selection, skills in `.agents/skills`, subagents, conversation recall, `/remember`, `/compact`, reflection branch, the cross-agent sandbox (with the opt-in, now that `bwrap` is installed) and agent-to-agent messaging with `letta` on PATH all pass. Failing, identical to 0.1.11's lock-pinned run: A07 `/toolset` "Unknown command"; A08b skills in `.claude/skills` advertised but not found; A09b subagent tool call left `in_progress`; A15 (direct-binary launch, `letta` not on PATH; A15b, the npx-equivalent, passes). A10 (direct-binary launch) failed in this run and passed in the first run and in lock-pinned; it was flaky on 0.1.11 too; A10b passes.

**Generic ACP (D).** Failing, identical to 0.1.11: D15 (`-low` variant echoed as `-none`), D20 (`rawOutput` is a string; Toad rejects it with -32602, visible in `logs/v0.1.8/clients/*/wire.ndjson`), D21 (shell tool kind `other`), D22 (`ApplyPatch` sends no diff). Two 0.1.11 failures do **not** occur on 0.1.8:

- *D24, fast follow-up prompt:* passes in 5 of 5 published runs (0.1.11 lock-pinned shifted replies by one turn).
- *D08b, first tool call after a cancel:* passes by its criterion in 5 of 5 runs, but the defect underneath is still there. In every run the first shell call fails "Interrupted by user"; the model retries and the turn recovers. On 0.1.11 the turn ended with an empty reply.

**Clients (K).** acpx 0.21.1, the Python SDK 0.12.1 client, the TypeScript SDK 2.2.0 client and Toad 0.6.20 (with its own permission dialog, answered `allow_once`) all finish a turn on published 0.1.8 (`logs/v0.1.8/clients/`). Toad's screenshot after the PTY scenario shows `PTY_OK` and `got:hello`; `check-wire.mjs` passes on its wire log.

**PTY scenario (`scripts/41-pty-host.sh`, host has make so node-pty 1.1.0 builds).** 4 of 6 runs pass `check-wire.mjs --expect glibc --expect-permission yes` (`logs/v0.1.8/pty/check-wire.txt`). Run 3: `write_stdin` returned the echoed `hello` and "Process exited with code 0" but not the `got:hello` the process printed before exiting, so the final output chunk was lost (1 of 6). Run 5: the checker reads the first TTY-probe call, which the harness rejected for a missing `description` parameter; the model's retry printed `PTY_OK`. Run 5 is a checker limitation; the checker was not changed after seeing it.

**Platform (C).** C is Linux-only since 2026-11-01. macOS and Windows were dropped because the registry does not require them: every registry workflow (merge build, auth matrix, hourly updater, nightly protocol matrix, license check) runs on `ubuntu-latest`; an `npx` entry has no platform field in `agent.schema.json`; and "builds for all operating systems" is only *recommended*, for `binary` entries, where `build_registry.py` prints a warning rather than an error when one is missing (registry main `1c35b86`, 2026-11-01). The matrix covers the Linux variants a registry user realistically has: Node 22 (maintenance LTS), 24 (LTS) and 26 (the LTS since 2026-10-28, and what the registry's `setup-node lts/*` installs today); glibc (`node:<n>-slim` and `node:<n>`, i.e. Debian 12 for Node 22 and 24 and Debian 13 for Node 26) and musl (Alpine 3.24, without and with `build-base python3`); x64 locally in Docker with a live model turn and arm64 on native arm64 runners in fork CI ([run 41264328909](https://github.com/mruderman/letta-code/actions/runs/41264328909), which repeats [run 41263351337](https://github.com/mruderman/letta-code/actions/runs/41263351337) cell for cell with sharper failure messages); plus Ubuntu 24.04 runners on x64 and arm64 with `setup-node`, the registry's own CI environment. Published 0.1.8 passes in all 18 cells that have a C toolchain and fails to install in all 12 that do not, with the same result on the lock-pinned column. Two contrast cells outside the denominator imitate a desktop Debian or Ubuntu install without `build-essential` (Python present, no `make` or `gcc`), the most common state for an editor user; both fail with node-gyp's `not found: make` (`logs/v0.1.8/platform-linux/contrast/`). macOS never ran for 0.1.8 (its CI jobs were cancelled twice before the drop), and the 0.1.11 run's single macOS and Windows cells are kept only as history. Saved CI lines: `logs/v0.1.8/platform-linux/ci-run-41264328909.txt` (and the first run, `ci-run-41263351337.txt`); the earlier 10-cell results remain in `logs/v0.1.8/platform/`.

## What this means for 472

1. 0.1.8 itself is a working listing on hosts with a C toolchain, and with `license_url` it clears the registry's merge gates (R1 to R3, R5). The no-toolchain failures (R4, R6, and every Linux cell without a C toolchain, glibc or musl alike) are the node-pty issue every published version has; with a toolchain, musl works too.
2. The pin will not hold. `update-versions.yml` runs hourly on `main`; before committing a stable bump it runs `build_registry.py --agents <id>` (schema validation) and `verify_agents.py --auth-check` on the new version. The auth check stops at `initialize`, and 0.1.11 passes both (R1 and R3 in the 0.1.11 run). `update_versions.py` already proposes `0.1.8 -> 0.1.11` for this entry, so the bump would land on the next successful hourly run, usually within one to two hours of the merge. Deprecating 0.1.9 to 0.1.11 on npm would not stop it (the script reads every version in the packument).

   Only two things keep users off the hanging version, and neither is ours to do. **(a) Letta publishes a working 0.1.12** (for example one that pins agent-sdk 0.7.2); the bot would then move the entry to 0.1.12 instead. **(b) Registry maintainers add `letta-acp` to `quarantine.json`.** `update_versions.py` and `verify_agents.py` skip quarantined entries, and `build_registry.py` does not read the file, so the entry stays listed at 0.1.8 with no further bumps (read from the code at `bee0da3`, not observed). A fixed agent-sdk 0.7.x release would also help on its own terms, because 0.1.11's `^0.7.2` range would pick it up on fresh installs, but it does not stop the bump; it makes the version the bot bumps to work.
3. 0.1.8 is older than 0.1.11 by three releases (harness 0.29.13 against 0.30.28), so anything Letta added since is absent; the suite found no feature 0.1.8 lacks that it tests, apart from the differences above.

## Disclosures

1. The first full published run (`logs/v0.1.8/live/run1-host-without-bwrap/`) ran on a host without `bwrap`, so A14's opt-in sandbox could not engage; `bubblewrap` was installed and the whole suite re-run. The counted run is `logs/v0.1.8/live/published/`; the first is kept. The only other difference between the two runs is A10, flaky as noted.
2. The first registry run wrote R5's matrix into the temporary worktree because `OUT` was relative; it was stopped and re-run after `run-final-entry-gates.sh` was changed to resolve `OUT`. Only the re-run is kept.
3. Lock-pinned D25 errored once: `session/new` failed with `could not lock config file .git/config: File exists` right after the previous adapter on the same HOME was stopped. It passed on re-run (`logs/v0.1.8/live/lock-pinned-reruns/run-1/`) and in all 5 published runs.
4. R2 rests on the raw license URL; the `blob` URL returns 403 through this environment's proxy, as in the 0.1.11 run.
5. The host chain was installed with `make` present, so node-pty compiled; the live suite therefore measures behaviour, not installability, which C and R4/R6 cover. Toad runs mount that chain into the registry's image.
6. Live checks are nondeterministic. Re-runs: `logs/v0.1.8/live/published-reruns/run-{1,2,3}/` (client features, cancel and PTY scenarios).
7. Nothing was posted to any `letta-ai` repository or to the registry. The registry clone was used read-only, and the update-versions dry run was made without `--apply`.

## Reproduce

```
ACP_VERSION=0.1.8 bash e2e/chains/make-chains.sh /tmp/chains018
cd e2e/live && npm ci
node run.mjs --chain published-0.1.8 --agent-cmd /tmp/chains018/published/node_modules/.bin/letta-acp --out ../logs/v0.1.8/live/published --jobs 4
REGISTRY_DIR=<registry clone> REGISTRY_COMMIT=bee0da3 E2E_WORK=<scratch> OUT=$PWD/e2e/logs/v0.1.8/registry/entry-0.1.8-license-url \
  ENTRY_DIR=$PWD/e2e/registry/letta-acp-entry-0.1.8 bash e2e/registry/run-final-entry-gates.sh
bash e2e/scripts/41-pty-host.sh /tmp/chains018/published/node_modules/.bin/letta-acp <out> pty glibc
node e2e/scripts/check-turns.mjs e2e/logs/v0.1.8
ACP_VERSION=0.1.8 bash e2e/platform/run-docker-matrix.sh e2e/logs/v0.1.8/platform-linux/x64      # then the e2e-platform-matrix workflow for arm64 and runners
ACP_VERSION=0.1.8 bash e2e/platform/run-docker-cell.sh 26 glibc-desktop published e2e/logs/v0.1.8/platform-linux/contrast
python3 e2e/platform/merge-linux.py e2e/logs/v0.1.8/platform-linux/x64 e2e/logs/v0.1.8/platform-linux/ci-run-41264328909.txt e2e/logs/v0.1.8/platform-linux/merged
node e2e/coverage-report.mjs --acp-version 0.1.8 --live published=e2e/logs/v0.1.8/live/published --live lock-pinned=e2e/logs/v0.1.8/live/lock-pinned \
  --registry e2e/logs/v0.1.8/registry/entry-0.1.8-license-url --platform e2e/logs/v0.1.8/platform-linux/merged --clients e2e/logs/v0.1.8/clients \
  --out e2e/logs/v0.1.8/COVERAGE-RESULTS-0.1.8.md
```
