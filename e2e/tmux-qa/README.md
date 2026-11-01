# Boots-on-the-ground QA of letta-acp in a real terminal client, driven through tmux

## Executive summary

A person sitting at a terminal and a script driving that terminal see the same thing here, because both go through tmux. Toad 0.6.20 (an independent, third-party ACP client with a terminal UI) is launched in a tmux window; `tmux-cli` (from claude-code-tools) types the prompts, captures the screen and closes the window; plain `tmux send-keys` supplies the keys `tmux-cli` has no verb for (`a`, `r`, `Esc Esc`). A transparent tap (`../scripts/acp-tap.mjs`) writes every JSON-RPC line to a wire log, and the scripts decide what to do next from that log rather than from screen scraping. Screens are kept as evidence.

**Part 1, the hang, reproduced live.** The same prompt (`Reply with exactly the word: pong`) was typed into Toad against three fresh npm installs. The published `@letta-ai/letta-acp@0.1.11` (which resolves `@letta-ai/letta-agent-sdk` 0.7.8) streams `pong` to the screen and then never answers `session/prompt`; 120 s later Toad is still showing its busy hourglass. The same 0.1.11 with only `letta-agent-sdk` pinned to 0.7.2 answers in under two seconds (1.4 s), and so does 0.1.8 (1.8 s). The screen alone does not give the hang away (the text is there either way); the hourglass in Toad's title and the unanswered request on the wire do.

**Part 2, a human-style QA walk** through the Letta differentiators and generic ACP flows, on the two variants that complete turns (0.1.8, and 0.1.11 with the SDK pinned to 0.7.2): a durable memory write, an approve dialog, a reject dialog, a real PTY command, a model switch that must keep conversation state, a cancel, and a full client restart against the same agent. Each variant has one fresh throwaway agent per run. Everything passes except three things, each reproduced more than once and each backed by the wire log:

1. **After a cancel, 0.1.11 answers the next prompt with an empty turn within milliseconds and the reply arrives one turn late** (`ALIVE_AFTER_CANCEL` shows up inside the *following* turn's text). 3 of 3 runs on 0.1.11 with the 0.7.2 SDK; 0 of 3 on 0.1.8. This is the same off-by-one shape as D24 in the main suite, here triggered by a cancel instead of by typing too fast. The two variants differ in several packages at once (see the version table), so this localises the change to "between 0.1.8 and 0.1.11 with SDK 0.7.2", not to a single package.
2. **`/model openai/gpt-5.6-terra-low` answers "Model switched", and the next turn fails** with `-32603 Unknown model "gpt-5.6-terra-low" for provider "openai"`. The id `gpt-5.6-terra-low` is one the session's own config options advertise ("GPT-5.6 Terra (low reasoning)"); `/model`'s list does not include it. 4 of 4 valid runs, both variants. Switching back to the plain handle recovers (the walk checks that).
3. **Toad rejects the agent's `tool_call_update` messages with `-32602`** (13 times per walk), the known `rawOutput`-is-a-string issue (D20 in the main suite). Nothing failed because of it in this walk; it is listed so the log noise is explained.

None of this was posted anywhere. It lives on the fork's `e2e-evidence` branch only.

## One command

```bash
cd e2e/tmux-qa
./run-all.sh          # about 15 minutes
```

It needs `tmux`, `uv`, Node 22+ with `npm`, a C toolchain (`make`, `gcc`, `python3`, because node-pty has to compile on 0.1.11 and 0.1.8), and network access to npm, PyPI and `api.openai.com`. The OpenAI key is never supplied: in this project's cloud sessions the egress proxy injects it for `api.openai.com`, and the scripts only set a placeholder so the SDK starts. Elsewhere, export a real `OPENAI_API_KEY` first. Use `QA_WORK=<dir>` to choose the scratch directory (default `/tmp/letta-tmux-qa`).

`run-all.sh` installs Toad, `tmux-cli` and the three letta-acp variants into `$QA_WORK`, runs the hang reproduction (three windows in parallel), then runs the QA walk on two variants in parallel, and prints and saves `OVERVIEW.md`. **To watch it live**, from another terminal:

```bash
tmux attach -t remote-cli-session      # or: tmux-cli attach     (Ctrl-b n / p switches windows)
```

Pieces can be run on their own: `./setup.sh`, `./hang-repro.sh [variant ...]`, `./qa-walk.sh [v018|v0111-sdk072|v0111]`.

### Doing it by hand with tmux-cli (what the scripts automate)

```bash
export PATH=$QA_WORK/tools/bin:$PATH
bash $QA_WORK/runs/<run>/hang/v0111/launch.sh      # or: tmux-cli launch "bash <that launch.sh>"
tmux-cli send "Reply with exactly the word: pong" --pane=remote-cli-session:1
tmux-cli capture --pane=remote-cli-session:1        # the screen
tmux send-keys -t remote-cli-session:1 a            # allow once in a permission dialog; r rejects
tmux send-keys -t remote-cli-session:1 Escape Escape   # cancel the running turn (Toad: Esc twice within 3 s)
node wire-state.mjs <run>/hang/v0111/wire.ndjson counts   # "<sent> <answered> <permissions asked> <answered>"
```

Toad specifics found while driving it: a typed slash command opens a completion list that swallows a typed space and, under load, drops keys, so the scripts paste the whole command as one bracketed paste, press `Esc` to close the list, check the input box, then `Enter`; an `Enter` pressed before Toad's `session/new` has been answered is silently ignored, so readiness is read from the wire; `^c` only interrupts Toad's own shell, the cancel gesture is `Esc Esc`.

## Results

Committed run: [`results/2026-11-01/final-run/`](results/2026-11-01/final-run/) (`OVERVIEW.md`, per-variant `REPORT.md`, `SCREENS.md` with every capture, wire logs, `results.tsv`). Model `openai/gpt-5.6-luna`, local backend, Toad 0.6.20, Node 22.23.4, Linux x64 with a C toolchain.

### Versions under test (from `npm ls` after a fresh install, no lockfile)

| variant | letta-acp | letta-agent-sdk | letta-code the SDK launches | ACP SDK |
|---|---|---|---|---|
| `v0111` (published, as `npx` resolves today) | 0.1.11 | **0.7.8** | 0.30.28 | 1.9.0 |
| `v0111-sdk072` | 0.1.11 | **0.7.2** (pinned) | 0.30.28 | 1.9.0 |
| `v018` (what registry PR 472 pins) | 0.1.8 | 0.5.8 | 0.29.13 | 1.9.0 |

### Part 1: one prompt, three installs (`hang-repro.sh`)

| variant | `session/prompt` answered within 120 s | text streamed | Toad hourglass after 120 s |
|---|---|---|---|
| `v0111` | **no** | `pong` | **yes** |
| `v0111-sdk072` | yes, `end_turn` | `pong` | no |
| `v018` | yes, `end_turn` | `pong` | no |

Repeat: `results/2026-11-01/repeat-runs/hang-2` gives the same three verdicts. (A first attempt typed the prompt before Toad's session was ready, so no `session/prompt` was ever sent in any of the three windows; that was a harness bug, fixed by waiting on the wire, and is not counted.)

### Part 2: the QA walk (`qa-walk.sh`), final run

| step | what a tester does in Toad | 0.1.8 | 0.1.11 + SDK 0.7.2 |
|---|---|---|---|
| Q01 memory write | asks it to save a colour to long-term memory and a code word for this conversation only | PASS (fact in `memory/system/human.md`) | PASS |
| Q02 approve | `touch` command, dialog appears, presses `a` | PASS (file created) | PASS |
| Q03 reject | same, presses `r` | PASS (file not created) | PASS |
| Q04 PTY | `exec_command` with `tty:true`, then `write_stdin` to a live `read` | PASS (`check-wire.mjs`) | PASS |
| Q05 model switch | `/model openai/gpt-5.6-terra`, then asks for the conversation-only code word | PASS (recalled) | PASS |
| Q05b model variant | `/model openai/gpt-5.6-terra-low`, then any prompt | **FAIL** (`Unknown model`) | **FAIL** |
| Q05c back to plain handle | `/model openai/gpt-5.6-terra`, then any prompt | PASS | PASS |
| Q06 cancel | keeps a turn open (polling a `sleep`), `Esc Esc` | PASS (`cancelled`, process gone) | PASS (`cancelled`, process gone) |
| Q06b next turn after cancel | plain-text prompt | PASS | **FAIL** (empty reply in 6 ms, text arrives one turn late) |
| Q06c first tool call after cancel | shell command | PASS | PASS |
| Q07 restart + memory | quits Toad, starts it again on the same agent, asks for both facts | PASS (colour recalled; code word `UNKNOWN`, as it should be) | PASS (same) |

All 14 `session/prompt` requests in each run were answered (`check-turns.mjs`: 12 `end_turn`, 1 `cancelled`, 1 `error -32603` from Q05b).

**Repeatability.** Q06b failed on 0.1.11 + SDK 0.7.2 in all three runs that reached it (`repeat-runs/walk-v0111-sdk072-2`, `-3`, and the final run) and passed on 0.1.8 in all three. Q05b failed in every run where the `/model` command actually arrived intact: `repeat-runs/walk-*-3` and the final run, both variants. The `-2` runs predate the paste fix, so their Q05 steps typed truncated commands and are not evidence for or against Q05; their cancel steps are valid. In one of the three 0.1.11 runs (`walk-v0111-sdk072-3`) the cancelled `sleep` was still running afterwards; in the other two, and in all three 0.1.8 runs, it was gone.

## What this does not show

- Nothing here touches Letta Cloud; everything is the local backend with a real OpenAI model, so the results hold for that path only. Zed, JetBrains and Obsidian were not run.
- The model is nondeterministic. One early 0.1.11 run (`walk-v0111-sdk072-2`, Q03) saw the model decline in prose to call the shell tool at all; the walk now retries once with different wording and records `INCONCLUSIVE` instead of `FAIL` when the tool is never attempted. Marker file names are neutral for the same reason.
- Q06b's cause is not isolated. It shows between two installs that differ in letta-agent-sdk, letta-code and letta-acp together.
- Q05b is a defect of `/model` accepting an id it cannot run. It is not a claim that selecting the same model from a client's model picker (the config-option path) fails; that path is exercised by A05 and D15 in the main suite.
- The post-restart wire log was renamed from `wire-after-restart.ndjson` to `restart-wire.ndjson` after the committed run so `check-turns.mjs` finds it, and `check-turns.txt`, `launch-2.sh` and the totals in `REPORT.md` and `OVERVIEW.md` were regenerated to match; no wire content changed.
- Earlier attempts whose harness bugs invalidated them (prompt typed before Toad was ready; slash commands truncated under load) are not committed, except the `-2` and `-3` walk logs used for repeatability above.
- No pass or fail here reaches the registry, a letta-ai repository, or a PR.

## Files

| file | purpose |
|---|---|
| `run-all.sh` | the one command |
| `setup.sh` | installs Toad, tmux-cli and the three variants into `$QA_WORK` |
| `hang-repro.sh` | Part 1 |
| `qa-walk.sh` | Part 2 |
| `lib.sh` | tmux-cli and tmux helpers (launch, type, keys, paste a slash command, capture, wait on the wire) |
| `wire-state.mjs` | reads the tap's wire log: prompt counts, pending permission, last turn's text and tool calls |
| `render-screens.mjs` | turns captured screens into `SCREENS.md` |
| `results/2026-11-01/` | committed evidence |

Uses `../scripts/acp-tap.mjs`, `../scripts/check-wire.mjs`, `../scripts/check-turns.mjs`, `../scripts/prompts.json` from this branch.
