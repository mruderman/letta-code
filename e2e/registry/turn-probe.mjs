// Minimal ACP client for one prompt turn: initialize -> session/new -> session/prompt.
// Logs every JSON-RPC line (direction + ms since start) to <out>/wire.ndjson, approves
// permission requests once, and reports whether session/prompt returned within the timeout.
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
const [out, ...cmd] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const wire = `${out}/wire.ndjson`; writeFileSync(wire, ""); writeFileSync(`${out}/stderr.log`, "");
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 180000);
const t0 = Date.now(); const ms = () => Date.now() - t0;
const child = spawn(cmd[0], cmd.slice(1), { stdio: ["pipe", "pipe", "pipe"], env: process.env, detached: true });
child.stderr.on("data", (d) => appendFileSync(`${out}/stderr.log`, d));
let buf = "", nextId = 1; const pending = new Map(); let text = ""; const updates = {};
const send = (m) => { appendFileSync(wire, JSON.stringify({ t: ms(), dir: "c->a", m }) + "\n"); child.stdin.write(JSON.stringify(m) + "\n"); };
const request = (method, params) => new Promise((res) => { const id = nextId++; pending.set(id, res); send({ jsonrpc: "2.0", id, method, params }); });
child.stdout.on("data", (d) => {
  buf += d; const lines = buf.split("\n"); buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue; let m; try { m = JSON.parse(line); } catch { continue; }
    appendFileSync(wire, JSON.stringify({ t: ms(), dir: "a->c", m }) + "\n");
    if (m.method === "session/request_permission") { send({ jsonrpc: "2.0", id: m.id, result: { outcome: { outcome: "selected", optionId: "allow_once" } } }); continue; }
    if (m.method === "session/update") { const u = m.params.update; updates[u.sessionUpdate] = (updates[u.sessionUpdate] ?? 0) + 1; if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") text += u.content.text; continue; }
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
const finish = (result) => { const r = { ...result, seconds: Math.round(ms() / 1000), updates, agentText: text.slice(0, 300) }; writeFileSync(`${out}/result.json`, JSON.stringify(r, null, 1)); console.log(JSON.stringify(r)); try { process.kill(-child.pid, "SIGKILL"); } catch {} process.exit(result.returned ? 0 : 1); };
setTimeout(() => finish({ returned: false, note: `session/prompt did not return within ${timeoutMs / 1000}s` }), timeoutMs);
const init = await request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } } });
if (init.error) finish({ returned: false, note: "initialize error", error: init.error });
const sess = await request("session/new", { cwd: process.cwd(), mcpServers: [] });
if (sess.error) finish({ returned: false, note: "session/new error", error: sess.error });
const res = await request("session/prompt", { sessionId: sess.result.sessionId, prompt: [{ type: "text", text: "Reply with exactly the word VERIFY_OK and nothing else. Do not use any tools." }] });
finish({ returned: true, stopReason: res.result?.stopReason, error: res.error });
