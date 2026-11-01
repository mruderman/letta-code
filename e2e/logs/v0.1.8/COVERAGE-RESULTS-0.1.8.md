# Coverage results

Generated 2026-11-01T01:29:09.139Z from the results files named on the command line. `·` = not run on that chain.

## Headline: the entry as listed, then the other install chains

Read the **published** column first. It is what `npx @letta-ai/letta-acp@0.1.8` resolves today, and so what a registry user gets. The other columns say where the failures come from; they are not what the listing delivers.

| Metric | published, as listed (what `npx` gives a registry user) | lock-pinned (adapter logic with dependency pins users do not get) | node-pty-fix (unreleased) |
|---|---|---|---|
| A. Letta-differentiator coverage (headline) | **15 of 20** pass, 5 fail | **16 of 20** pass, 4 fail | not run |
| B. Registry-gate coverage | **5 of 7** pass, 2 fail | not run | not run |
| D. Generic ACP + client coverage | **27 of 31** pass, 4 fail | **22 of 31** pass, 4 fail, 1 error, 4 not run | not run |
| C. Platform/install matrix (9 cells per column) | **3 of 9** pass (0 with a live model turn; the rest stop at initialize + session/new) | **3 of 9** pass (0 with a live model turn; the rest stop at initialize + session/new) | **0 of 9** pass (0 with a live model turn; the rest stop at initialize + session/new), 9 not run |

Denominators exclude the checks listed as *not covered*; those are named in `COVERAGE.md`. In C the published column passes on n22-glibc-arm64, n24-glibc-arm64, windows-x64-n22 (CI runners with a C toolchain), fails on n22-glibc-x64, n22-musl-x64, n22-musl-arm64, n24-glibc-x64, n24-musl-x64, n24-musl-arm64 (stock images without `make`, where node-pty has to be compiled; the x64 glibc cells pass on CI runners that have make, see the details). macos-arm64-n22 is left out of C on purpose: not a registry requirement (every registry workflow runs on ubuntu-latest, an npx entry has no platform field, and covering every OS is only recommended for binary entries), so it was dropped for 0.1.8. B's node-pty-fix column is empty on purpose: the one earlier fix-chain registry result ran against a different entry (see the README) and is not counted.

### Any-chain aggregate (for reference only)

A check counts here if it passed on **at least one** chain. That is more generous than anything a registry user gets. Do not quote this table on its own.

| Metric | Passing | Failing | Not run | Not covered (by design) | Denominator |
|---|---|---|---|---|---|
| A. Letta-differentiator coverage | 16 | 4 | 0 | 3 | 23 |
| B. Registry-gate coverage | 5 | 2 | 0 | 0 | 7 |
| D. Generic ACP + client coverage | 27 | 4 | 0 | 6 | 37 |

## A. Letta-differentiator coverage (headline)

| Check | What | published | lock-pinned | node-pty-fix | Level reached |
|---|---|---|---|---|---|
| A01 | Agent identity persists: restarting the adapter with the same agent id reuses the agent (no new agent), new conversation | PASS | PASS | · | live model turn |
| A02 | Self-editing memory: the agent writes a durable fact to its own MemFS via memory tools | PASS | PASS | · | live model turn |
| A02b | The memory write is committed in the agent's MemFS git history | PASS | PASS | · | live model turn |
| A03 | Cross-conversation memory: a new conversation after a restart recalls the stored fact | PASS | PASS | · | live model turn |
| A04 | session/load restores a past conversation: history replayed and conversation-local context intact | PASS | PASS | · | live model turn |
| A05 | Switch model mid-conversation; the agent keeps its conversation state | PASS | PASS | · | live model turn |
| A06 | Toolset auto-selection: an OpenAI model gets the codex toolset (exec_command) | PASS | PASS | · | live model turn |
| A07 | Switch toolset live with /toolset | FAIL | FAIL | · | - |
| A08 | Project skill (.agents/skills, the harness path) is discovered and obeyed | PASS | PASS | · | live model turn |
| A08b | Project skill in .claude/skills, the path the adapter advertises as slash commands, is obeyed | FAIL | FAIL | · | - |
| A09 | Subagents: the Task/Agent tool launches a subagent and its result returns | PASS | PASS | · | live model turn |
| A09b | The subagent tool call reaches a terminal status in the client's view | FAIL | FAIL | · | - |
| A10 | Past-conversation recall via the recall subagent, adapter launched by path (a global or direct install: `letta` is not on the shell tool's PATH). Not how the registry launches it | FAIL | PASS | · | live model turn |
| A10b | A10 as the registry launches the entry (npx puts `letta` on PATH); this is the result that applies to listing | PASS | PASS | · | live model turn |
| A11 | /remember saves a fact to memory | PASS | PASS | · | live model turn |
| A12 | /compact summarises the conversation and the agent still recalls facts | PASS | PASS | · | live model turn |
| A13 | Sleep-time reflection (dreaming) runs in the background and works on a MemFS branch | PASS | PASS | · | live model turn |
| A14 | Cross-agent memory guard with the shell sandbox switched on (LETTA_FS_SANDBOX=1, the documented opt-in): a shell cannot read another agent's memory | PASS | PASS | · | live model turn |
| A15 | Agent-to-agent messaging, adapter launched by path (`letta` not on PATH). Not how the registry launches it | FAIL | FAIL | · | - |
| A15b | A15 as the registry launches the entry (npx puts `letta` on PATH); this is the result that applies to listing | PASS | PASS | · | live model turn |
| A16 | Letta Cloud backend end to end (login OAuth, cloud agent creation, memory, a turn) | not covered | not covered | not covered | needs Cloud credentials and a throwaway Cloud org; no key was provided |
| A17 | Reflection result merged into main memory (A13 proves the reflection run, not the merge) | not covered | not covered | not covered | reflection merge timing not yet instrumented |
| A18 | Memory and identity through the Letta Cloud backend across restarts (A01-A04 ran on the local backend) | not covered | not covered | not covered | same as A16 |

## D. Generic ACP + client coverage

| Check | What | published | lock-pinned | node-pty-fix | Level reached |
|---|---|---|---|---|---|
| D01 | initialize: protocol version, loadSession, session list, image, embeddedContext, MCP capabilities | PASS | PASS | · | real ACP client |
| D02 | session/new returns a session id, model and permission config options | PASS | PASS | · | real ACP client |
| D03 | Streaming: several agent_message_chunk updates before end_turn | PASS | PASS | · | live model turn |
| D04 | Permission request shows allow/reject options; allow_once runs the command | PASS | PASS | · | live model turn |
| D05 | Permission reject_once blocks the command and the turn ends cleanly | PASS | PASS | · | live model turn |
| D06 | allow_always suppresses later prompts for the same tool | PASS | PASS | · | live model turn |
| D07 | Switching the permission mode to unrestricted skips prompts | PASS | PASS | · | live model turn |
| D08 | Cancel mid-command: stopReason cancelled and the process is killed | PASS | PASS | · | live model turn |
| D08b | The turn after a cancel works normally (no stale interrupt) | PASS | PASS | · | live model turn |
| D09 | Cancel while a permission request is pending | PASS | PASS | · | live model turn |
| D10 | Client file-system delegation: fs/read_text_file is used when the client advertises it | PASS | PASS | · | live model turn |
| D11 | Client-supplied MCP server: the tool is called and its result used | PASS | PASS | · | live model turn |
| D12 | Image content block understood by the model | PASS | PASS | · | live model turn |
| D13 | session/load replays prior user and agent messages | PASS | PASS | · | live model turn |
| D14 | session/list returns the known sessions | PASS | PASS | · | live model turn |
| D15 | session/set_config_option echoes the requested model variant | FAIL | FAIL | · | - |
| D16 | Embedded resource content block understood | PASS | PASS | · | live model turn |
| D17 | Shell tool called with tty:true runs under a PTY (ISATTY) where node-pty is available | PASS | PASS | · | live model turn |
| D18 | Errors: unknown session and unknown method return JSON-RPC errors and session/new still works afterwards (no model needed) | PASS | PASS | · | real ACP client |
| D19 | Slash commands advertised via available_commands_update | PASS | PASS | · | real ACP client |
| D20 | tool_call_update.rawOutput is a JSON object (strict clients such as Toad reject strings) | FAIL | FAIL | · | - |
| D21 | Shell tool calls are reported with kind execute | FAIL | FAIL | · | - |
| D22 | File edits are reported with a structured diff content block | FAIL | FAIL | · | - |
| D23 | Clean exit on stdin EOF | PASS | PASS | · | live model turn |
| D24 | Back-to-back prompts sent immediately after end_turn: each reply arrives in its own turn | PASS | PASS | · | live model turn |
| D25 | Two concurrent sessions in one adapter do not cross-talk | PASS | ERROR | · | live model turn |
| D26 | Session cwd is honoured by the shell tool | PASS | PASS | · | live model turn |
| D27 | Client terminal delegation (terminal/create) used for shell commands | not covered | not covered | not covered | letta-acp runs commands itself; documented gap |
| D28 | authenticate() flow executed end to end (letta-login terminal auth); only the advertised method is checked at initialize | not covered | not covered | not covered | needs a Cloud account |
| D29 | Windows via ACP with a real client (fork CI covers the PTY artifact, not an ACP session) | not covered | not covered | not covered | no Windows host with ACP client |
| K01 | acpx real session (install via npx, prompt turn, tool call) | PASS | · | · | live model turn |
| K02 | Toad real session including its own permission dialog | PASS | · | · | live model turn |
| K03 | Python ACP SDK client: full turn | PASS | · | · | live model turn |
| K04 | TypeScript SDK 2.x client: full turn | PASS | · | · | live model turn |
| K05 | Zed session | not covered | not covered | not covered | manual checklist only; needs the editor |
| K06 | JetBrains session | not covered | not covered | not covered | manual checklist only |
| K07 | Obsidian ACP plugin session | not covered | not covered | not covered | manual checklist only |

## B. Registry-gate coverage

| Check | What | published | lock-pinned | node-pty-fix | Level reached |
|---|---|---|---|---|---|
| R1 | build_registry.py --dry-run: schema, required fields, icon | PASS | · | · | real registry script |
| R2 | license_url returns HTTP 200 | PASS | · | · | real registry script |
| R3 | verify_agents.py --auth-check on a CI-like host | PASS | · | · | real registry script |
| R4 | verify_agents.py --auth-check inside the registry's no-make Docker image | FAIL | · | · | - |
| R5 | protocol_matrix.py on a CI-like host | PASS | · | · | real registry script |
| R6 | protocol_matrix.py inside the registry's no-make Docker image | FAIL | · | · | - |
| R7 | One real prompt turn through the entry as listed (not a registry gate; the registry stops at initialize) | PASS | · | · | live model turn |

## C. Platform/install matrix

| Cell | Column | How | Result | Level | Detail |
|---|---|---|---|---|---|
| n22-glibc-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-glibc-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-glibc-x64 | node-pty-fix | docker | not run | - |  |
| n22-glibc-arm64 | published | native-arm64-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI run 41240502689] v22.23.4 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n22-glibc-arm64 | lock-pinned | native-arm64-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI run 41240502689] v22.23.4 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n22-glibc-arm64 | node-pty-fix | native-arm64-ci | not run | - |  |
| n22-musl-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-musl-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-musl-x64 | node-pty-fix | docker | not run | - |  |
| n22-musl-arm64 | published | native-arm64-ci | fail | clean-room install | [fork CI run 41240502689] npm install failed: npm error gyp ERR! not ok |
| n22-musl-arm64 | lock-pinned | native-arm64-ci | fail | clean-room install | [fork CI run 41240502689] npm install failed: npm error gyp ERR! not ok |
| n22-musl-arm64 | node-pty-fix | native-arm64-ci | not run | - |  |
| n24-glibc-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-glibc-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-glibc-x64 | node-pty-fix | docker | not run | - |  |
| n24-glibc-arm64 | published | native-arm64-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI run 41240502689] v24.22.1 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n24-glibc-arm64 | lock-pinned | native-arm64-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI run 41240502689] v24.22.1 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n24-glibc-arm64 | node-pty-fix | native-arm64-ci | not run | - |  |
| n24-musl-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-musl-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-musl-x64 | node-pty-fix | docker | not run | - |  |
| n24-musl-arm64 | published | native-arm64-ci | fail | clean-room install | [fork CI run 41240502689] npm install failed: npm error gyp ERR! not ok |
| n24-musl-arm64 | lock-pinned | native-arm64-ci | fail | clean-room install | [fork CI run 41240502689] npm install failed: npm error gyp ERR! not ok |
| n24-musl-arm64 | node-pty-fix | native-arm64-ci | not run | - |  |
| windows-x64-n22 | published | fork-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI run 41240502689] v22.23.4 win32-x64 win32; initialize=ok session/new=ok; node-pty loads=true |
| windows-x64-n22 | lock-pinned | fork-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI run 41240502689] v22.23.4 win32-x64 win32; initialize=ok session/new=ok; node-pty loads=true |
| windows-x64-n22 | node-pty-fix | fork-ci | not run | - |  |

## Failure details

- **A07** (published, fail): /toolset default replied "/toolset failed: Unknown command: toolset"; afterwards tools: exec_command: Run toolset probe
- **A07** (lock-pinned, fail): /toolset default replied "/toolset failed: Unknown command: toolset"; afterwards tools: exec_command: Run toolset probe
- **A08b** (published, fail): skill dir .claude/skills; advertised as a slash command: true; reply "I can’t find a skill named `e2e-skill-s5qxt4b`."; tools: Skill
- **A08b** (lock-pinned, fail): skill dir .claude/skills; advertised as a slash command: true; reply "I don’t recognize `/e2e-skill-s5jjnim` as an available command or skill."; tools: 
- **A09b** (published, fail): final status of the subagent tool call as the client sees it: in_progress
- **A09b** (lock-pinned, fail): final status of the subagent tool call as the client sees it: in_progress
- **A10** (published, fail): codename in memory files before recall: false; replies "1. **Direct answer:** I couldn’t find the project codename in the available past conversation records.\n\n2. **Key findings:** The local conversation search CLI was unavailable, and inspecting the acces"; tools: Agent: Recall project codename | Search prior messages for codename | Inspect local conversation transcripts | ?
- **A15** (published, fail): reply "I couldn’t send the message because the `letta` command is unavailable in this environment:\n\n```text\n/bin/bash: line 1: letta: command not found\n```"; tools: Skill | exec_command: Ask another agent for the codename
- **A15** (lock-pinned, fail): reply "I couldn’t send the message: the `letta` command is unavailable in this environment (`command not found`)."; tools: Skill | exec_command: Ask the other agent for the codename
- **D15** (published, fail): requested gpt-5.6-terra-low, session/set_config_option returned currentValue=gpt-5.6-terra-none
- **D15** (lock-pinned, fail): requested gpt-5.6-terra-low, session/set_config_option returned currentValue=gpt-5.6-terra-none
- **D20** (published, fail): 2 tool_call_update messages carried rawOutput; 2 were not JSON objects (types: string). Toad 0.6.20 rejects non-object rawOutput with -32602
- **D20** (lock-pinned, fail): 2 tool_call_update messages carried rawOutput; 2 were not JSON objects (types: string). Toad 0.6.20 rejects non-object rawOutput with -32602
- **D21** (published, fail): shell tool "exec_command: Show current directory" reported kind=other
- **D21** (lock-pinned, fail): shell tool "exec_command: Show current directory" reported kind=other
- **D22** (published, fail): file edited: true; tools: ApplyPatch; updates with a diff content block: 0; kinds: other
- **D22** (lock-pinned, fail): file edited: true; tools: ApplyPatch; updates with a diff content block: 0; kinds: other
- **D25** (lock-pinned, error): Internal error
- **R4** (published, fail): R4-auth-check-docker-nomake exit=1
- **R6** (published, fail): R6-protocol-matrix-docker-nomake exit=1
