#!/usr/bin/env python3
"""K03: a full prompt turn through letta-acp from the official Python ACP SDK
(agent-client-protocol 0.12.1), which validates every message with pydantic models.

  python python-sdk-client.py --out DIR -- <agent command...>

Environment is inherited (HOME, LETTA_LOCAL_BACKEND_DIR, LETTA_ACP_BACKEND, ...).
Writes DIR/result.json and exits 0 only if the turn ended with end_turn, the shell tool
ran, and the reply contained the nonce.
"""
import argparse, asyncio, json, os, random, string, sys, tempfile
from acp import PROTOCOL_VERSION, spawn_agent_process, text_block
from acp.schema import AllowedOutcome, RequestPermissionResponse


class Client:
    def __init__(self):
        self.text, self.tools, self.permissions, self.update_types = "", {}, [], {}

    async def request_permission(self, session_id, tool_call, options, **kwargs):
        self.permissions.append(tool_call.title)
        allow = next(o for o in options if o.kind == "allow_once")
        return RequestPermissionResponse(outcome=AllowedOutcome(outcome="selected", option_id=allow.option_id))

    async def session_update(self, session_id, update, **kwargs):
        kind = type(update).__name__
        self.update_types[kind] = self.update_types.get(kind, 0) + 1
        if kind == "AgentMessageChunk" and getattr(update.content, "text", None):
            self.text += update.content.text
        if kind in ("ToolCallStart", "ToolCallProgress"):
            self.tools[update.tool_call_id] = {"title": getattr(update, "title", None), "status": getattr(update, "status", None)}

    async def write_text_file(self, *a, **k): raise NotImplementedError
    async def read_text_file(self, *a, **k): raise NotImplementedError
    async def create_terminal(self, *a, **k): raise NotImplementedError
    async def terminal_output(self, *a, **k): raise NotImplementedError
    async def release_terminal(self, *a, **k): raise NotImplementedError
    async def wait_for_terminal_exit(self, *a, **k): raise NotImplementedError
    async def kill_terminal(self, *a, **k): raise NotImplementedError
    async def ext_method(self, *a, **k): raise NotImplementedError
    async def ext_notification(self, *a, **k): raise NotImplementedError


async def main(out, command, timeout):
    os.makedirs(out, exist_ok=True)
    nonce = "PY" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    client = Client()
    result = {"client": "agent-client-protocol 0.12.1 (Python)", "nonce": nonce}
    cwd = tempfile.mkdtemp(prefix="py-client-")
    try:
        async with spawn_agent_process(client, *command, cwd=cwd, env=dict(os.environ)) as (conn, process):
            init = await asyncio.wait_for(conn.initialize(protocol_version=PROTOCOL_VERSION), 120)
            result["initialize"] = {"protocolVersion": init.protocol_version, "loadSession": init.agent_capabilities.load_session}
            session = await asyncio.wait_for(conn.new_session(cwd=cwd, mcp_servers=[]), 120)
            response = await asyncio.wait_for(
                conn.prompt(session_id=session.session_id, prompt=[text_block(f"Run `echo {nonce}` in the shell and tell me exactly what it printed.")]),
                timeout,
            )
            result.update(stopReason=str(response.stop_reason), reply=client.text[:200], tools=client.tools,
                          permissions=client.permissions, updateTypes=client.update_types)
            result["passed"] = str(response.stop_reason) == "end_turn" and nonce in client.text and len(client.tools) > 0
    except Exception as error:  # noqa: BLE001 - the harness reports every failure mode
        result.update(passed=False, error=f"{type(error).__name__}: {error}"[:400], reply=client.text[:200], tools=client.tools, updateTypes=client.update_types)
    with open(os.path.join(out, "result.json"), "w") as handle:
        json.dump(result, handle, indent=1)
    print(json.dumps(result))
    return 0 if result.get("passed") else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--timeout", type=int, default=240)
    parser.add_argument("command", nargs="+")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.out, args.command, args.timeout)))
