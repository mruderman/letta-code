# Hang reproduction, 2026-11-01T03:34:00Z

## v0111
```
variant:   v0111
verdict:   NOT_ANSWERED (waited up to 120s after the prompt)
reply text streamed to the client: "pong"
stopReason: (session/prompt never answered)
versions:
      `-- node-pty@1.1.0
    +-- @agentclientprotocol/sdk@1.9.0
    +-- @letta-ai/letta-agent-sdk@0.7.8
    `-- @letta-ai/letta-code@0.30.28
    | `-- @letta-ai/letta-code@0.30.28 deduped
  `-- @letta-ai/letta-acp@0.1.11
  v0111@1.0.0 /tmp/letta-tmux-qa/variants/v0111
```

## v0111-sdk072
```
variant:   v0111-sdk072
verdict:   ANSWERED (waited up to 120s after the prompt)
reply text streamed to the client: "pong"
stopReason: end_turn
versions:
    `-- @letta-ai/letta-code@0.30.28 deduped
  +-- @letta-ai/letta-acp@0.1.11
  `-- @letta-ai/letta-agent-sdk@0.7.2
  v0111-sdk072@1.0.0 /tmp/letta-tmux-qa/variants/v0111-sdk072
  |   `-- node-pty@1.1.0
  | +-- @agentclientprotocol/sdk@1.9.0
  | +-- @letta-ai/letta-agent-sdk@0.7.2 deduped
  | `-- @letta-ai/letta-code@0.30.28
```

## v018
```
variant:   v018
verdict:   ANSWERED (waited up to 120s after the prompt)
reply text streamed to the client: "pong"
stopReason: end_turn
versions:
      `-- node-pty@1.1.0
    +-- @agentclientprotocol/sdk@1.9.0
    +-- @letta-ai/letta-agent-sdk@0.5.8
    `-- @letta-ai/letta-code@0.29.12
    |   `-- node-pty@1.1.0 deduped
    | `-- @letta-ai/letta-code@0.29.13
  `-- @letta-ai/letta-acp@0.1.8
  v018@1.0.0 /tmp/letta-tmux-qa/variants/v018
```

