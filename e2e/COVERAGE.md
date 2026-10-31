# What the suite covers, and how coverage is counted

Nothing here is a claim that letta-acp is "fully tested". This file says what each number means, what its denominator is, and what is **not** covered. The numbers themselves are generated into [`COVERAGE-RESULTS.md`](COVERAGE-RESULTS.md) by `coverage-report.mjs`, so they cannot drift from the evidence in `logs/`.

## Four metrics, reported side by side

| | Metric | What the denominator is | Where it comes from |
|---|---|---|---|
| **A** | **Letta-differentiator coverage** (headline) | Every feature that makes Letta different from other ACP harnesses (Claude Code, Codex, Gemini CLI): persistent agent identity, self-editing memory in a git-backed MemFS, memory that survives conversations, per-conversation history, live model and toolset switching, skills, subagents, past-conversation recall, `/remember` and `/compact`, background reflection ("dreaming"), the cross-agent memory guard, agent-to-agent messaging, and the Cloud backend. 21 entries, of which 3 are listed as **not covered**. | `checks.json` (`metric: A`), `live/scenarios/differentiators.mjs` |
| **B** | **Registry-gate coverage** | Every gate the ACP registry runs on a listing (schema and icon via the dry-run build, license URL, `--auth-check`, the nightly protocol matrix), each on a CI-like host **and** in the registry's own no-make Docker image, plus one real prompt turn, which the registry does not do. 7 entries. | `registry/run-final-entry-gates.sh`, logs in `logs/registry-final/` |
| **C** | **Platform and install matrix** | 10 cells (Node 22/24 × glibc/musl × x64/arm64, plus macOS arm64 and Windows x64) × 3 columns (published as listed, lock-pinned, with the unreleased node-pty fix) = 30. Each is a clean-room install followed by initialize, session/new and, where a model is reachable, one real turn. | `platform/`, `.github/workflows/e2e-platform-matrix.yml` |
| **D** | **Generic ACP coverage** | What any ACP agent should get right: handshake, streaming, permissions (allow, reject, always, mode switch, cancel), cancel mid-command, client file system and MCP, image and resource blocks, error handling, wire shapes strict clients depend on, concurrency, plus real sessions in four independent clients. 37 entries, 9 listed as **not covered**. | `checks.json` (`metric: D`), `live/scenarios/generic.mjs`, `clients/` |

Metric A is the headline because generic ACP behaviour proves letta-acp is a polite ACP citizen, not that Letta's reason to exist works through ACP.

Rules for counting:

1. **Denominators are fixed in `checks.json`.** A check that was not run counts as *not run*, never as passing. A scenario that throws marks every check it declared as `error`.
2. **A check counts as passing if at least one install chain passed it**, and the per-chain tables show which. This is deliberately generous, so the report also prints the chains side by side. The published chain is the one users get today.
3. **Failures stay in the table.** Several checks fail on purpose-built assertions because the product misbehaves (see the findings in the README). They are not tuned away.
4. **Checks that need a model turn are `blocked`, not skipped silently,** when a gate scenario shows the chain cannot complete a trivial turn.

## Validation levels

Every result is tagged with the highest level of evidence it actually reached, from weakest to strongest:

1. `unit` – a test against letta-acp source with mocks (none counted here; the adapter's own tests live in its repo).
2. `fake app server` – a real adapter process against a deterministic fake executor (`logs/head-9b2e784/det-*`).
3. `real ACP client` – a real adapter process, a real independent client over stdio, no model (initialize, session/new, auth-check, protocol matrix, platform smoke without a key).
4. `live Cloud` – the Letta Cloud backend with a real account. **Not reached by anything in this suite.**
5. `live model turn` – the local backend with a real model (`openai/gpt-5.6-luna`, reached through the session's key-injecting proxy). Letta Cloud is a different backend and is not covered by this level.

## Install chains (columns)

- **published** is exactly what `npx @letta-ai/letta-acp@0.1.11` resolves today. Its floating `^` dependencies pull `@letta-ai/letta-agent-sdk` 0.7.8 and `@agentclientprotocol/sdk` 1.9.0.
- **lock-pinned** is the same package with those two dependencies pinned to what letta-acp's own lockfile uses (0.7.2 and 1.3.0). It exists to separate "the adapter's logic works" from "the entry as listed works".
- **node-pty-fix** is letta-code `fix/node-pty-prebuilds` @ 9b2e784 with the adapter, from a local registry. It is unreleased and optional.

## Not covered

Listed so a reader can see the edge of the evidence instead of inferring it.

- **Letta Cloud backend, end to end.** Cloud login OAuth, cloud agent creation, cloud memory and identity across restarts (A16, A18, D28). All live evidence uses the local backend (`LETTA_ACP_BACKEND=local`). No Cloud credentials were available, and the rule is fresh throwaway agents only.
- **Reflection merge.** A13 shows a reflection run starts on its own MemFS branch; that its result is merged back into main memory (A17) is not measured.
- **Editors.** Zed, JetBrains and Obsidian (K05 to K07) have no automation here. A manual checklist is in the README; nothing is claimed.
- **Windows via a real ACP session with a model,** (D29). The Windows cell runs initialize and session/new in CI, and the PTY artifact is covered by the earlier fork CI, but there is no Windows model turn.
- **Client terminal delegation** (D27). letta-acp runs commands itself rather than through the client's `terminal/create`; that is a design gap, not tested.
- **Models other than one OpenAI model.** Every live turn uses `gpt-5.6-luna` on the Codex toolset. The Claude toolset (`Bash`), Gemini toolset and Anthropic models are not exercised. A07 (live toolset switching) cannot be shown on the published stack because `/toolset` is advertised but answered with "Unknown command".
- **arm64 live turns.** arm64 cells run in fork CI without a model key, so they reach `real ACP client` level only. No QEMU was available for local arm64 turns.
- **Load, long sessions, very large outputs, interrupted network, token-refresh and quota errors.**
- **Security review.** A14 probes one guard behaviour; this is not a security assessment.
- **Other agents' registry gates.** Only Letta's entry is exercised.
- **Registry gates re-run on the registry's real CI.** They run here with the registry's scripts at commit b51a879, not on the registry's runners; the license URL `blob` form is checked through this environment's proxy (see `logs/registry-final/R2-license-url.log`).

## How to reproduce

```
bash e2e/chains/make-chains.sh /tmp/chains
cd e2e/live && npm ci
LETTA_ACP_CMD=/tmp/chains/lock-pinned/node_modules/.bin/letta-acp node run.mjs --chain lock-pinned --out ../logs/live/lock-pinned --jobs 4
REGISTRY_DIR=<registry clone> E2E_WORK=<scratch> OUT=e2e/logs/registry-final bash e2e/registry/run-final-entry-gates.sh
node e2e/coverage-report.mjs --live lock-pinned=e2e/logs/live/lock-pinned --live published=e2e/logs/live/published --registry e2e/logs/registry-final --platform e2e/logs/platform --clients e2e/logs/clients
```

Live scenarios need a model: set `OPENAI_API_KEY` (or run behind a proxy that injects it). Every live scenario starts a fresh throwaway agent in a fresh `HOME` and local-backend directory; no existing agent is ever used.
