# Plan: Prove the node-pty fix end-to-end with a live Letta agent, documented to a maintainer standard

## Context

The fix for letta-ai/letta-acp#50 (closed PR letta-ai/letta-code#3608) is ported, rebased, and pushed **to the user's forks only**:
- `mruderman/letta-code` → `fix/node-pty-prebuilds` (`35a6d52`, based on Letta `main` `d675435`; Letta `main` is now `4b57e62`)
- `mruderman/letta-acp` → `ci/dependabot-live-jobs` (`d6321cd`)

Already proven (Phase 1): the ACP Registry validator fails on published `letta-acp@0.1.11` and passes on the fixed chain, with node-pty installed from prebuilds; Alpine degrades instead of segfaulting; `bun run check` 13/13.

**Why more testing.** Letta's maintainers are overloaded. The user will only offer this work if it is *proven against a live Letta agent* and *documented well enough that reviewing it costs them almost nothing*. An untested PR would create grief, not help.

**Ground rules (from the user):**
- **Nothing is posted to any `letta-ai` repo.** All pushes, branches and PRs stay inside `mruderman/*`.
- **No existing agents are used.** Every live test creates a fresh, single-purpose agent in a throwaway directory, which is deleted afterwards.
- Every result is recorded verbatim; failures are reported as failures.

**What the fix touches, and therefore what must be exercised:** npm/npx installation without build tools; `exec_command` with `tty: true` plus `write_stdin` (the only PTY consumer; the Codex toolset auto-selected for GPT models); the websocket terminal handler; musl degradation. PTY code runs where the harness runs, which is the `local` and `cloud-oauth` backends only. `cloud`/`remote` runs would never exercise it, so they're excluded.

## Steps

### 1. Refresh the fork branch
Rebase `fix/node-pty-prebuilds` onto Letta's current `main`. Recompute `lettaRuntimeGraphSha512` over the merged shrinkwrap (the same splice-and-recompute as before, still exactly the 4 node-pty lines). Then a frozen `bun install`, `bun run check`, and the focused PTY tests. Push **to the fork branch only**, with `--force-with-lease` (a rebase rewrites the branch, which only we use).

### 2. Run Letta's own CI on the fork (needs two user clicks first)
User, on github.com/mruderman/letta-code: **Sync fork → Update branch** (the API for this is blocked from the sandbox), then **Actions tab → enable workflows**. I then open a **draft PR inside the fork** (`fix/node-pty-prebuilds` → `mruderman/letta-code:main`) via the GitHub connector. Draft status keeps Letta's review bot from running. That triggers Letta's own `ci.yml`: lint/typecheck, unit tests, Package on macOS arm64, Linux x64, Linux arm64 and Windows, the minimal-Linux artifact check on **both** Linux legs (`packaging_changed`), and the Windows ConPTY smoke. API jobs that need Letta's secrets will fail on the fork; they get listed as *expected, unrelated* in the report.

### 3. Sandbox matrix (no secrets; this session)
Use the refreshed build, packed as a non-prerelease test version and served from a local Verdaccio. Pair it with a letta-acp whose letta-code and agent-sdk are bumped together.
- **a. Registry validator** in the no-`make` Ubuntu image: re-run, and capture both the before (0.1.11) and after logs.
- **b. Deterministic ACP pipeline:** letta-acp → SDK → app-server → local backend, with `LETTA_LOCAL_BACKEND_EXECUTOR=deterministic`. No LLM, no agent persona. It proves install, startup, tool execution and the approval round trip through a real ACP client (`acpx`/`test-client.ts`). If letta-acp can't select that executor, drive letta-code headless directly and say so.
- **c. PTY unit-level smoke** on glibc and Alpine (the bundled `startShellProcess`): re-run on the refreshed build.
- **d. Terminal handler smoke:** under Node, start `letta.js --backend local app-server` and send `terminal_spawn` over the app-server protocol on glibc (expect output) and Alpine (expect a clean `terminal_exited` with the actionable message). If the protocol doesn't allow this headlessly, record it as not covered.
- **e. linux/arm64** via QEMU if the sandbox allows binfmt; otherwise covered by step 2's arm64 leg.

### 4. Live agent tests (new session; secret `OPENAI_API_KEY_OR_ACCESS_TOKEN`)
The user added the key as secret `OPENAI_API_KEY_OR_ACCESS_TOKEN`. It isn't visible in this session (secrets reach new sessions), so step 4 runs in a fresh session that starts from the `e2e-evidence` branch. Each run maps it explicitly, `OPENAI_API_KEY="$OPENAI_API_KEY_OR_ACCESS_TOKEN"`, and is never echoed or logged. First check: `GET /v1/models` returns 200. If it's a ChatGPT access token rather than an API key and OpenAI rejects it, stop and tell the user. Each run uses a temp `HOME` and `LETTA_LOCAL_BACKEND_DIR`, and a fresh agent that is deleted with the temp dir. Model: `openai/gpt-5.6-luna`, the one Letta's own live test uses, which gets the Codex toolset.
- **a.** letta-acp's own `bun run test:backend:live:local` against the bumped chain. This is the exact live test Letta's CI runs on `main`.
- **b. PTY scenario through ACP:** the client asks the agent to call `exec_command` with `tty: true` on `test -t 0 && echo PTY_OK || echo NO_PTY`, then `read x; echo got:$x` driven via `write_stdin`. Assertions come from the **ACP transcript** (the tool-call args show `tty: true`; the tool result contains `PTY_OK` / `got:…`), not from model prose. Run in the registry no-`make` image (expect `PTY_OK`) and Alpine (expect the fallback message and `NO_PTY`, with no crash), 3× each for stability. Commands are harmless, and approvals are granted by the test client.
- **c. Independent third-party ACP client: Toad** (batrachian.ai, a Python/Textual terminal UI, chosen by the user). Run the same PTY scenario through a client with no relationship to Letta, so the evidence isn't limited to Letta's own harness (`acpx` is a letta-acp devDependency). Install Toad as its users do, and register letta-acp through Toad's own agent configuration as `npx @letta-ai/letta-acp` (served from Verdaccio). Drive it headlessly with Textual's test pilot, or a pseudo-terminal recorder if Toad offers no scriptable entry point. Capture Toad's rendered screen (SVG screenshots, which Textual supports natively) plus the ACP wire log. **Feasibility check first, in this session, with the deterministic executor** (no key needed). If Toad can't run headlessly here, report that and propose the user run it on `pop-os` with a written checklist instead.
- Expected cost: cents.

### 5. Documentation
- **`e2e-evidence` branch on `mruderman/letta-code`**, kept separate from the fix branch so it never pollutes it:
  - `e2e/README.md` (the report: matrix table, exact versions and SHAs, commands, deviations, expected-fail CI jobs, what is *not* covered);
  - `e2e/scripts/` (Dockerfile layers for the CA and Verdaccio, Verdaccio config, the run scripts, the ACP client scenario);
  - `e2e/logs/`, scrubbed for keys and tokens before commit.
- A **private report page** (Artifact) summarizing it, shareable later only if the user chooses.
- This plan is committed to the evidence branch first, so a new session can continue from it.

## User actions
1. ~~Add the OpenAI key~~ **Done** (`OPENAI_API_KEY_OR_ACCESS_TOKEN`). After steps 1–3, start a **new session** on this environment so the secret is visible, and point it at the `e2e-evidence` branch's plan.
2. On `mruderman/letta-code`: **Sync fork**, and **enable Actions**.

## Out of scope (not selected)
Letta Cloud (`cloud-oauth`), the self-hosted server, Zed manual run, any post or PR to `letta-ai`, the registry #472 update.

## Verification of the plan itself
Done means: every row of the matrix has a verbatim log; fork CI results are linked, with failures classified; live runs show `tty: true` tool calls with `PTY_OK` on glibc and graceful `NO_PTY` on Alpine; the report states uncovered areas plainly.
