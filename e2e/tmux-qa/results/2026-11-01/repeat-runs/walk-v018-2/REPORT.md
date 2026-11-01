# QA walk, variant v018, 2026-11-01T03:39:44Z

Agent `agent-local-8a9428bf-bc2b-49bc-bef3-ccfa4d06a4f7` (fresh, throwaway). Model `openai/gpt-5.6-luna`.

```
    `-- node-pty@1.1.0
  +-- @agentclientprotocol/sdk@1.9.0
  +-- @letta-ai/letta-agent-sdk@0.5.8
  `-- @letta-ai/letta-code@0.29.12
  |   `-- node-pty@1.1.0 deduped
  | `-- @letta-ai/letta-code@0.29.13
`-- @letta-ai/letta-acp@0.1.8
v018@1.0.0 /tmp/letta-tmux-qa/variants/v018
```

| step | result | detail |
|---|---|---|
| Q01 | PASS | fact written to MemFS (1 file(s) contain it); reply: Saved your favourite colour as **AMBER04238**; for this conversation only, I’ll remember **KESTREL04238**. |
| Q02 | PASS | dialog shown, allow-once pressed, file created, reply: CREATED |
| Q03 | PASS | dialog shown, reject pressed, file NOT created, agent said: I didn’t run it because you rejected the shell command. |
| Q04 | PASS | check-wire.mjs passed on the slice (tty:true probe, write_stdin round trip); see q04-check-wire.txt |
| Q05 | FAIL | switch reply: 'Step 1 output: `PTY_OK` |
|  |  |  |
| Step 2 output: |  |  |
| ```text |  |  |
| hello |  |  |
| got:hello |  |  |
| ```'; recall reply: 'KESTREL04238' (stopReason end_turn null) |  |  |
| Q05b | PASS | 'KESTREL04238' and the next turn answered |
| Q05c | PASS | switching back to the plain handle restores working turns |
| Q06 | PASS | stopReason cancelled 1s after Esc Esc; the sleep process is gone |
| Q06b | PASS | session usable after a cancel (plain text turn) |
| Q06c | PASS | first tool call after a cancel completed (completed) |
| Q07 | PASS | after a full client restart the same agent (agent-local-8a9428bf-bc2b-49bc-bef3-ccfa4d06a4f7) recalled the durable fact; reply: 'AMBER04238; UNKNOWN'; conversation-only code word recalled: no |

Turn completion over both wire logs: `1 wire logs; session/prompt answered 10/10; stopReasons {"end_turn":9,"cancelled":1}; logs with an unanswered prompt: 0`
