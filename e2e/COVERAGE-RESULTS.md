# Coverage results

Generated 2026-10-31T09:43:06.274Z from the results files named on the command line. `·` = not run on that chain.

## The four metrics, side by side

| Metric | Passing | Failing | Not run | Not covered (by design) | Denominator |
|---|---|---|---|---|---|
| A. Letta-differentiator coverage (headline) | 14 | 6 | 0 | 3 | 23 |
| B. Registry-gate coverage | 5 | 2 | 0 | 0 | 7 |
| D. Generic ACP + client coverage | 23 | 8 | 0 | 6 | 37 |
| C. Platform/install matrix (cell × column; 4 of the passing cells include a live model turn, the rest stop at initialize + session/new) | 12 | 12 | 6 | 0 | 30 |

A check counts as passing if it passed on at least one chain; the per-chain tables below show where. Failures are findings, not hidden.

### The same metrics, one install chain at a time

| Metric | published | lock-pinned | node-pty-fix |
|---|---|---|---|
| A. Letta-differentiator coverage | 0 of 20 pass (20 blocked at the model gate) | 14 of 20 pass | not run |
| B. Registry-gate coverage | 4 of 7 pass | not run | 1 of 7 pass |
| D. Generic ACP + client coverage | 0 of 31 pass (27 blocked at the model gate) | 23 of 31 pass | not run |

## A. Letta-differentiator coverage (headline)

| Check | What | published | lock-pinned | node-pty-fix | Level reached |
|---|---|---|---|---|---|
| A01 | Agent identity persists: restarting the adapter with the same agent id reuses the agent (no new agent), new conversation | blocked | PASS | · | live model turn |
| A02 | Self-editing memory: the agent writes a durable fact to its own MemFS via memory tools | blocked | PASS | · | live model turn |
| A02b | The memory write is committed in the agent's MemFS git history | blocked | PASS | · | live model turn |
| A03 | Cross-conversation memory: a new conversation after a restart recalls the stored fact | blocked | PASS | · | live model turn |
| A04 | session/load restores a past conversation: history replayed and conversation-local context intact | blocked | PASS | · | live model turn |
| A05 | Switch model mid-conversation; the agent keeps its conversation state | blocked | PASS | · | live model turn |
| A06 | Toolset auto-selection: an OpenAI model gets the codex toolset (exec_command) | blocked | PASS | · | live model turn |
| A07 | Switch toolset live with /toolset | blocked | FAIL | · | - |
| A08 | Project skill (.agents/skills, the harness path) is discovered and obeyed | blocked | PASS | · | live model turn |
| A08b | Project skill in .claude/skills, the path the adapter advertises as slash commands, is obeyed | blocked | FAIL | · | - |
| A09 | Subagents: the Task/Agent tool launches a subagent and its result returns | blocked | PASS | · | live model turn |
| A09b | The subagent tool call reaches a terminal status in the client's view | blocked | FAIL | · | - |
| A10 | Past-conversation recall via the recall subagent when the fact is not in memory | blocked | FAIL | · | - |
| A10b | A10 again with the installed letta CLI on PATH (isolates the PATH problem from the feature) | blocked | PASS | · | live model turn |
| A11 | /remember saves a fact to memory | blocked | PASS | · | live model turn |
| A12 | /compact summarises the conversation and the agent still recalls facts | blocked | PASS | · | live model turn |
| A13 | Sleep-time reflection (dreaming) runs in the background and works on a MemFS branch | blocked | PASS | · | live model turn |
| A14 | Cross-agent memory guard: an agent's shell cannot read another agent's memory | blocked | FAIL | · | - |
| A15 | Agent-to-agent messaging between two agents on one machine | blocked | FAIL | · | - |
| A15b | A15 again with the installed letta CLI on PATH | blocked | PASS | · | live model turn |
| A16 | Letta Cloud backend end to end (login OAuth, cloud agent creation, memory, a turn) | not covered | not covered | not covered | needs Cloud credentials and a throwaway Cloud org; no key was provided |
| A17 | Reflection result merged into main memory (A13 proves the reflection run, not the merge) | not covered | not covered | not covered | reflection merge timing not yet instrumented |
| A18 | Memory and identity through the Letta Cloud backend across restarts (A01-A04 ran on the local backend) | not covered | not covered | not covered | same as A16 |

## D. Generic ACP + client coverage

| Check | What | published | lock-pinned | node-pty-fix | Level reached |
|---|---|---|---|---|---|
| D01 | initialize: protocol version, loadSession, session list, image, embeddedContext, MCP capabilities | blocked | PASS | · | real ACP client |
| D02 | session/new returns a session id, model and permission config options | blocked | PASS | · | real ACP client |
| D03 | Streaming: several agent_message_chunk updates before end_turn | blocked | PASS | · | live model turn |
| D04 | Permission request shows allow/reject options; allow_once runs the command | blocked | PASS | · | live model turn |
| D05 | Permission reject_once blocks the command and the turn ends cleanly | blocked | FAIL | · | - |
| D06 | allow_always suppresses later prompts for the same tool | blocked | PASS | · | live model turn |
| D07 | Switching the permission mode to unrestricted skips prompts | blocked | PASS | · | live model turn |
| D08 | Cancel mid-command: stopReason cancelled and the process is killed | blocked | PASS | · | live model turn |
| D08b | The turn after a cancel works normally (no stale interrupt) | blocked | FAIL | · | - |
| D09 | Cancel while a permission request is pending | blocked | PASS | · | live model turn |
| D10 | Client file-system delegation: fs/read_text_file is used when the client advertises it | blocked | PASS | · | live model turn |
| D11 | Client-supplied MCP server: the tool is called and its result used | blocked | PASS | · | live model turn |
| D12 | Image content block understood by the model | blocked | PASS | · | live model turn |
| D13 | session/load replays prior user and agent messages | blocked | PASS | · | live model turn |
| D14 | session/list returns the known sessions | blocked | PASS | · | live model turn |
| D15 | session/set_config_option echoes the requested model variant | blocked | FAIL | · | - |
| D16 | Embedded resource content block understood | blocked | PASS | · | live model turn |
| D17 | Shell tool runs under a PTY (ISATTY) where node-pty is available | blocked | FAIL | · | - |
| D18 | Errors: unknown session and unknown method return JSON-RPC errors and the adapter keeps working | blocked | PASS | · | real ACP client |
| D19 | Slash commands advertised via available_commands_update | blocked | PASS | · | real ACP client |
| D20 | tool_call_update.rawOutput is a JSON object (strict clients such as Toad reject strings) | blocked | FAIL | · | - |
| D21 | Shell tool calls are reported with kind execute | blocked | FAIL | · | - |
| D22 | File edits are reported with a structured diff content block | blocked | FAIL | · | - |
| D23 | Clean exit on stdin EOF | blocked | PASS | · | live model turn |
| D24 | Back-to-back prompts sent immediately after end_turn: each reply arrives in its own turn | blocked | FAIL | · | - |
| D25 | Two concurrent sessions in one adapter do not cross-talk | blocked | PASS | · | live model turn |
| D26 | Session cwd is honoured by the shell tool | blocked | PASS | · | live model turn |
| D27 | Client terminal delegation (terminal/create) used for shell commands | not covered | not covered | not covered | letta-acp runs commands itself; documented gap |
| D28 | authenticate() flow executed end to end (letta-login terminal auth); only the advertised method is checked at initialize | not covered | not covered | not covered | needs a Cloud account |
| D29 | Windows via ACP with a real client (fork CI covers the PTY artifact, not an ACP session) | not covered | not covered | not covered | no Windows host with ACP client |
| K01 | acpx real session (install via npx, prompt turn, tool call) | · | PASS | · | live model turn |
| K02 | Toad real session including its own permission dialog | · | PASS | · | live model turn |
| K03 | Python ACP SDK client: full turn | · | PASS | · | live model turn |
| K04 | TypeScript SDK 2.x client: full turn | · | PASS | · | live model turn |
| K05 | Zed session | not covered | not covered | not covered | manual checklist only; needs the editor |
| K06 | JetBrains session | not covered | not covered | not covered | manual checklist only |
| K07 | Obsidian ACP plugin session | not covered | not covered | not covered | manual checklist only |

## B. Registry-gate coverage

| Check | What | published | lock-pinned | node-pty-fix | Level reached |
|---|---|---|---|---|---|
| R1 | build_registry.py --dry-run: schema, required fields, icon | PASS | · | · | real registry script |
| R2 | license_url returns HTTP 200 | PASS | · | · | real registry script |
| R3 | verify_agents.py --auth-check on a CI-like host | PASS | · | · | real registry script |
| R4 | verify_agents.py --auth-check inside the registry's no-make Docker image | FAIL | · | PASS | real registry script |
| R5 | protocol_matrix.py on a CI-like host | PASS | · | · | real registry script |
| R6 | protocol_matrix.py inside the registry's no-make Docker image | FAIL | · | · | - |
| R7 | One real prompt turn through the entry as listed (not a registry gate; the registry stops at initialize) | FAIL | · | · | - |

## C. Platform/install matrix

| Cell | Column | How | Result | Level | Detail |
|---|---|---|---|---|---|
| n22-glibc-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-glibc-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-glibc-x64 | node-pty-fix | docker | pass | live model turn | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] v22.23.4 linux-x64 glibc; initialize=ok session/new=ok; t |
| n22-glibc-arm64 | published | docker-qemu | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v22.23.4 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n22-glibc-arm64 | lock-pinned | docker-qemu | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v22.23.4 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n22-glibc-arm64 | node-pty-fix | docker-qemu | not run | - |  |
| n22-musl-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-musl-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n22-musl-x64 | node-pty-fix | docker | pass | live model turn | [local Docker stock image, image: node v22.23.4 x86_64; make: absent; gcc: absent] v22.23.4 linux-x64 musl; initialize=ok session/new=ok; tu |
| n22-musl-arm64 | published | docker-qemu | fail | clean-room install | [fork CI runner, toolchain absent (alpine container)] npm install failed: npm error gyp ERR! not ok |
| n22-musl-arm64 | lock-pinned | docker-qemu | fail | clean-room install | [fork CI runner, toolchain absent (alpine container)] npm install failed: npm error gyp ERR! not ok |
| n22-musl-arm64 | node-pty-fix | docker-qemu | not run | - |  |
| n24-glibc-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-glibc-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-glibc-x64 | node-pty-fix | docker | pass | live model turn | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] v24.22.2 linux-x64 glibc; initialize=ok session/new=ok; t |
| n24-glibc-arm64 | published | docker-qemu | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v24.22.1 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n24-glibc-arm64 | lock-pinned | docker-qemu | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v24.22.1 linux-arm64 glibc; initialize=ok session/new=ok; node-pty loads=true |
| n24-glibc-arm64 | node-pty-fix | docker-qemu | not run | - |  |
| n24-musl-x64 | published | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-musl-x64 | lock-pinned | docker | fail | clean-room install | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] npm install failed: npm error gyp ERR! not ok || same cel |
| n24-musl-x64 | node-pty-fix | docker | pass | live model turn | [local Docker stock image, image: node v24.22.2 x86_64; make: absent; gcc: absent] v24.22.2 linux-x64 musl; initialize=ok session/new=ok; tu |
| n24-musl-arm64 | published | docker-qemu | fail | clean-room install | [fork CI runner, toolchain absent (alpine container)] npm install failed: npm error gyp ERR! not ok |
| n24-musl-arm64 | lock-pinned | docker-qemu | fail | clean-room install | [fork CI runner, toolchain absent (alpine container)] npm install failed: npm error gyp ERR! not ok |
| n24-musl-arm64 | node-pty-fix | docker-qemu | not run | - |  |
| macos-arm64-n22 | published | fork-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v22.23.2 darwin-arm64 darwin; initialize=ok session/new=ok; node-pty loads=true |
| macos-arm64-n22 | lock-pinned | fork-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v22.23.2 darwin-arm64 darwin; initialize=ok session/new=ok; node-pty loads=true |
| macos-arm64-n22 | node-pty-fix | fork-ci | not run | - |  |
| windows-x64-n22 | published | fork-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v22.23.4 win32-x64 win32; initialize=ok session/new=ok; node-pty loads=true |
| windows-x64-n22 | lock-pinned | fork-ci | pass | real ACP client (initialize + session/new, no model) | [fork CI runner, toolchain present] v22.23.4 win32-x64 win32; initialize=ok session/new=ok; node-pty loads=true |
| windows-x64-n22 | node-pty-fix | fork-ci | not run | - |  |

## Failure details

- **A07** (lock-pinned, fail): /toolset default replied "/toolset failed: Unknown command: toolset"; afterwards tools: exec_command: Run toolset probe
- **A08b** (lock-pinned, fail): skill dir .claude/skills; advertised as a slash command: true; reply "I’m here. What would you like to work on?"; tools: 
- **A09b** (lock-pinned, fail): final status of the subagent tool call as the client sees it: in_progress
- **A10** (lock-pinned, fail): codename in memory files before recall: false; replies "1. **Direct answer:** I couldn’t locate the project codename in the available past conversation transcripts.\n\n2. **Key findings:** The local transcript search only surfaced the current recall request "; tools: Agent: Recall project codename | Search past messages for codename | Scan local conversation transcripts for project references | ?
- **A14** (lock-pinned, fail): agents agent-local-0adb0116-5016-4cbb-bacd-0c93b02e84a1 / agent-local-13deb201-e901-47d4-a755-2e08832af891; shell call targeted the other agent's memory: true; other agent memory exposed: true; bwrap on host: true; LETTA_SANDBOX seen by the shell tool: SANDBOX=un; outputs: "Chunk ID: 1ce3dd\nWall time: 0.0270 seconds\nProcess exited with code 0\nOriginal token count: 343\nOutput:\n---\ndescription: What I'm learning 
- **A15** (lock-pinned, fail): reply "I couldn’t send the message: the `letta` command was not found (`/bin/bash: line 1: letta: command not found`)."; tools: Skill | exec_command: Ask another agent for codename
- **D05** (lock-pinned, fail): permission requests answered: ; deny.txt exists: false; stopReason end_turn; reply "I can’t run that command because shell execution is currently unavailable in this conversation."
- **D08b** (lock-pinned, fail): first shell call in the turn after a cancel: failed "Interrupted by user"; reply ""
- **D15** (lock-pinned, fail): requested gpt-5.6-terra-low, session/set_config_option returned currentValue=gpt-5.6-terra-none
- **D17** (lock-pinned, fail): shell reported: "Chunk ID: 092afc Wall time: 0.0270 seconds Process exited with code 0 Original token count: 2 Output: NOTTY " (ISATTY needs node-pty; NOTTY is the documented pipe fallback)
- **D20** (lock-pinned, fail): 2 tool_call_update messages carried rawOutput; 2 were not JSON objects (types: string). Toad 0.6.20 rejects non-object rawOutput with -32602
- **D21** (lock-pinned, fail): shell tool "exec_command: Print working directory" reported kind=other
- **D22** (lock-pinned, fail): file edited: true; tools: SetWorkingDirectory: /tmp/letta-e2e-diff-sh3GwF/work | ApplyPatch; updates with a diff content block: 0; kinds: other
- **D24** (lock-pinned, fail): 3 back-to-back prompts sent immediately after each end_turn; replies per turn: ["=","(empty)","RV64VZW"]
- **R4** (published, fail): R4-auth-check-docker-nomake exit=1
- **R6** (published, fail): R6-protocol-matrix-docker-nomake exit=1
- **R7** (published, fail): R7-prompt-turn exit=1
- **47 checks blocked on published**: model gate failed on this chain: agentInfo null; prompt timed out after 90000ms; stderr tail: cal-acabc1a5-1fcc-40ea-991f-87bf62b4aaa9 — set LETTA_AGENT_ID=agent-local-acabc1a5-1fcc-40ea-991f-87bf62b4aaa9 to keep using it [letta-acp] session local-conv-2 -> agent agent-local-acabc1a5-1fcc-40ea-991f-87bf62b4aaa9 (cwd: /tmp/letta-e2e-gate-GKvrbz/work) [letta-acp] advertising 34 slash commands 
