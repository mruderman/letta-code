# QA walk, variant v0111-sdk072, 2026-11-01T03:44:23Z

Agent `agent-local-43852ed1-9278-4426-b4c7-a6f134a03c88` (fresh, throwaway). Model `openai/gpt-5.6-luna`.

```
  `-- @letta-ai/letta-code@0.30.28 deduped
+-- @letta-ai/letta-acp@0.1.11
`-- @letta-ai/letta-agent-sdk@0.7.2
v0111-sdk072@1.0.0 /tmp/letta-tmux-qa/variants/v0111-sdk072
|   `-- node-pty@1.1.0
| +-- @agentclientprotocol/sdk@1.9.0
| +-- @letta-ai/letta-agent-sdk@0.7.2 deduped
| `-- @letta-ai/letta-code@0.30.28
```

| step | result | detail |
|---|---|---|
| Q01 | PASS | fact written to MemFS (1 file(s) contain it); reply: Saved your durable favourite colour as **AMBER04545**; I’ll remember **KESTREL04545** for this conversation only. |
| Q02 | PASS | dialog shown, allow-once pressed, file created, reply: CREATED |
| Q03 | PASS | dialog shown, reject pressed, file NOT created, agent said: I couldn’t run it because the shell tool call was rejected. |
| Q04 | PASS | check-wire.mjs passed on the slice (tty:true probe, write_stdin round trip); see q04-check-wire.txt |
| Q05 | PASS | 'Model switched to `openai/gpt-5.6-terra`.' then recalled the conversation-only code word on the new model |
| Q05b | FAIL | 'Model switched to `openai/gpt-5.6-terra-low`.' but the next turn failed: -32603: Unknown model "gpt-5.6-terra-low" for provider "openai". Choose an available model with /model. |
| Q05c | PASS | switching back to the plain handle restores working turns |
| Q06 | PASS | stopReason cancelled 1s after Esc Esc; the sleep process is STILL RUNNING (2) |
| Q06b | FAIL | next turn after cancel: '' null |
| Q06c | PASS | first tool call after a cancel completed (completed) |
| Q07 | PASS | after a full client restart the same agent (agent-local-43852ed1-9278-4426-b4c7-a6f134a03c88) recalled the durable fact; reply: 'AMBER04545; UNKNOWN'; conversation-only code word recalled: no |

Turn completion over both wire logs: `1 wire logs; session/prompt answered 13/13; stopReasons {"end_turn":11,"error:-32603":1,"cancelled":1}; logs with an unanswered prompt: 0`
