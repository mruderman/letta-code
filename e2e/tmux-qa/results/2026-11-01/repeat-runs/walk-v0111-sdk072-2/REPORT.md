# QA walk, variant v0111-sdk072, 2026-11-01T03:41:05Z

Agent `agent-local-9ed2f6b7-c7af-4f25-b64d-33852fac47e1` (fresh, throwaway). Model `openai/gpt-5.6-luna`.

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
| Q01 | PASS | fact written to MemFS (1 file(s) contain it); reply: Saved your favourite colour as **AMBER04238** and will remember **KESTREL04238** for this conversation only. |
| Q02 | PASS | dialog shown, allow-once pressed, file created, reply: CREATED |
| Q03 | FAIL | no permission request within 90 s |
| Q04 | PASS | check-wire.mjs passed on the slice (tty:true probe, write_stdin round trip); see q04-check-wire.txt |
| Q05 | FAIL | switch reply: 'PTY_OK |
|  |  |  |
| hello   |  |  |
| got:hello'; recall reply: 'KESTREL04238' (stopReason end_turn null) |  |  |
| Q05b | PASS | 'KESTREL04238' and the next turn answered |
| Q05c | PASS | switching back to the plain handle restores working turns |
| Q06 | PASS | stopReason cancelled 1s after Esc Esc; the sleep process is gone |
| Q06b | FAIL | next turn after cancel: '' null |
| Q06c | PASS | first tool call after a cancel completed (completed) |
| Q07 | PASS | after a full client restart the same agent (agent-local-9ed2f6b7-c7af-4f25-b64d-33852fac47e1) recalled the durable fact; reply: 'AMBER04238; UNKNOWN'; conversation-only code word recalled: no |

Turn completion over both wire logs: `1 wire logs; session/prompt answered 10/10; stopReasons {"end_turn":9,"cancelled":1}; logs with an unanswered prompt: 0`
