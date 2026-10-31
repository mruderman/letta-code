# ACP Protocol Adaptation Matrix — 2026-10-31

_Generated at 2026-10-31T20:42:05+00:00_

- Agents in report: **1**
- Probed this run: **1**
- Reused unchanged versions: **0**
- `initialize` success: **1**
- `session/new` returned `auth_required`: **0**

Legend: feature cells use `Signal/Probe` format. For `session/list`, `session/fork`, `session/resume`, and `session/stop`, `Y`/`N` means the capability was advertised. For `session/set_model`, `Y`/`N` means session responses exposed `models`. Probe values: `yes`, `no`, `auth`, `timeout`, `decode`, `err`, `-`.
`Capabilities` lists the capabilities advertised in the `initialize` response via `agentCapabilities` and `sessionCapabilities`.

```text
Agent      Version  Dist  Init  Auth      session/new  Capabilities               session/list  session/fork  session/resume  session/stop  session/set_model
---------  -------  ----  ----  --------  -----------  -------------------------  ------------  ------------  --------------  ------------  -----------------
letta-acp  0.1.8    npx   ok    terminal  ok           loadSession, session/list  Y/yes         N/no          N/no            N/no          N/no             
```

## Method Probe Summary

| Method | Supported | Auth Required | Method Not Found | Other |
| --- | ---: | ---: | ---: | ---: |
| `session/list` | 1 | 0 | 0 | 0 |
| `session/fork` | 0 | 0 | 1 | 0 |
| `session/resume` | 0 | 0 | 1 | 0 |
| `session/stop` | 0 | 0 | 1 | 0 |
| `session/set_model` | 0 | 0 | 1 | 0 |
