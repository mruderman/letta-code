# QA walk, variant v018, 2026-11-01T03:57:51Z

Agent `agent-local-30fca004-345a-4bb1-a231-99052137b67e` (fresh, throwaway). Model `openai/gpt-5.6-luna`.

```
    `-- node-pty@1.1.0
  +-- @agentclientprotocol/sdk@1.9.0
  +-- @letta-ai/letta-agent-sdk@0.5.8
  `-- @letta-ai/letta-code@0.29.12
  |   `-- node-pty@1.1.0 deduped
  | `-- @letta-ai/letta-code@0.29.13
`-- @letta-ai/letta-acp@0.1.8
v018@1.0.0 /tmp/letta-tmux-qa-verify/variants/v018
```

| step | result | detail |
|---|---|---|
| Q01 | PASS | fact written to MemFS (1 file(s) contain it); reply: Saved your favourite colour as **AMBER05352**; I’ll remember **KESTREL05352** for this conversation only. |
| Q02 | PASS | dialog shown, allow-once pressed, file created, reply: CREATED |
| Q03 | PASS | dialog shown, reject pressed, file NOT created, agent said: I couldn’t run it because the shell action was rejected. |
| Q04 | PASS | check-wire.mjs passed on the slice (tty:true probe, write_stdin round trip); see q04-check-wire.txt |
| Q05 | PASS | 'Model switched to `openai/gpt-5.6-terra`.' then recalled the conversation-only code word on the new model |
| Q05b | FAIL | 'Model switched to `openai/gpt-5.6-terra-low`.' but the next turn failed: -32603: Unknown model "gpt-5.6-terra-low" for provider "openai". Choose an available model with /model. |
| Q05c | PASS | switching back to the plain handle restores working turns |
| Q06 | PASS | stopReason cancelled 1s after Esc Esc; the sleep process is gone |
| Q06b | PASS | session usable after a cancel (plain text turn) |
| Q06c | PASS | first tool call after a cancel completed (completed) |
| Q07 | PASS | after a full client restart the same agent (agent-local-30fca004-345a-4bb1-a231-99052137b67e) recalled the durable fact; reply: 'AMBER05352; UNKNOWN'; conversation-only code word recalled: no |

Turn completion over both wire logs: `2 wire logs; session/prompt answered 14/14; stopReasons {"end_turn":12,"error:-32603":1,"cancelled":1}; logs with an unanswered prompt: 0`
