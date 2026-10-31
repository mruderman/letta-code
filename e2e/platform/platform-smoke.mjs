#!/usr/bin/env node
// One cell of the platform matrix, dependency-free so it runs in any clean image or CI runner:
//   node platform-smoke.mjs --out DIR [--turn] -- <letta-acp command...>
// Always: initialize + session/new over stdio, and whether node-pty loads from the install.
// With --turn (needs a model): one real prompt turn that must run a shell command and return
// within the timeout. Writes DIR/result.json; exit 0 when every requested step passed.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const out = argv[argv.indexOf("--out") + 1];
const wantTurn = argv.includes("--turn");
const command = argv.slice(argv.indexOf("--") + 1);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 120_000);
mkdirSync(out, { recursive: true });
const wire = join(out, "wire.ndjson");
writeFileSync(wire, "");
const t0 = Date.now();
const nonce = `PLAT${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
const result = { node: process.version, platform: `${process.platform}-${process.arch}`, libc: process.report?.getReport?.().header?.glibcVersionRuntime ? "glibc" : process.platform === "linux" ? "musl" : process.platform, nonce };

// Does node-pty load from this install? (the thing the unreleased fix is about)
try {
  // node_modules/.bin/letta-acp -> node_modules/@letta-ai/letta-code (packages hide package.json behind "exports")
  const letta = join(dirname(command[0]), "..", "@letta-ai", "letta-code");
  const probe = createRequire(join(letta, "package.json"));
  try { probe("node-pty"); result.nodePty = { loads: true }; } catch (error) { result.nodePty = { loads: false, error: String(error.message).split("\n")[0].slice(0, 160) }; }
} catch (error) {
  result.nodePty = { loads: null, error: `could not locate letta-code: ${String(error.message).slice(0, 100)}` };
}

const home = mkdtempSync(join(tmpdir(), "smoke-home-"));
const cwd = mkdtempSync(join(tmpdir(), "smoke-work-"));
const env = { ...process.env, HOME: home, USERPROFILE: home, LETTA_LOCAL_BACKEND_DIR: join(home, "backend"), LETTA_ACP_BACKEND: "local", LETTA_ACP_PERMISSION_MODE: "unrestricted", LETTA_CODE_TELEM: "0",
  LETTA_ACP_MODEL: process.env.LETTA_ACP_MODEL ?? "openai/gpt-5.6-luna", OPENAI_API_KEY: process.env.OPENAI_API_KEY || "proxy-injected", NODE_USE_ENV_PROXY: "1" };
delete env.LETTA_API_KEY;
const child = spawn(command[0], command.slice(1), { stdio: ["pipe", "pipe", "pipe"], env, cwd, shell: process.platform === "win32" });
let stderr = "";
child.stderr.on("data", (d) => (stderr += d));
let buf = "", id = 0, text = "", toolCalls = 0;
const pending = new Map();
const log = (dir, m) => appendFileSync(wire, `${JSON.stringify({ t: Date.now() - t0, dir, m })}\n`);
const send = (m) => { log("c->a", m); child.stdin.write(`${JSON.stringify(m)}\n`); };
const request = (method, params, ms = timeoutMs) => new Promise((resolve, reject) => {
  const mid = ++id;
  const timer = setTimeout(() => reject(new Error(`${method}: no response within ${ms}ms`)), ms);
  pending.set(mid, (r) => { clearTimeout(timer); resolve(r); });
  send({ jsonrpc: "2.0", id: mid, method, params });
});
child.stdout.on("data", (d) => {
  buf += d;
  const lines = buf.split("\n"); buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    log("a->c", m);
    if (m.method === "session/request_permission") { send({ jsonrpc: "2.0", id: m.id, result: { outcome: { outcome: "selected", optionId: m.params.options.find((o) => o.kind === "allow_once")?.optionId } } }); continue; }
    if (m.method === "session/update") { const u = m.params.update; if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") text += u.content.text; if (u.sessionUpdate === "tool_call") toolCalls++; continue; }
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
child.on("exit", (code) => { result.agentExit = code; });
const finish = (ok) => {
  result.status = ok ? "pass" : "fail";
  result.seconds = Math.round((Date.now() - t0) / 1000);
  result.stderrTail = stderr.split("\n").filter((l) => l.trim() && !/UNDICI|trace-warnings/.test(l)).slice(-6).join(" | ").slice(0, 500);
  result.level = wantTurn ? "live model turn" : "real ACP client (initialize + session/new, no model)";
  writeFileSync(join(out, "result.json"), `${JSON.stringify(result, null, 1)}\n`);
  console.log(JSON.stringify(result));
  try { child.kill("SIGKILL"); } catch {}
  process.exit(ok ? 0 : 1);
};
try {
  const init = await request("initialize", { protocolVersion: 1, clientCapabilities: {} });
  result.initialize = init.error ? { error: init.error } : { ok: true, authMethods: (init.result.authMethods ?? []).map((a) => a.id ?? a.type) };
  if (init.error) finish(false);
  const session = await request("session/new", { cwd, mcpServers: [] });
  result.sessionNew = session.error ? { error: session.error } : { ok: true };
  if (session.error) finish(false);
  if (wantTurn) {
    const turn = await request("session/prompt", { sessionId: session.result.sessionId, prompt: [{ type: "text", text: `Run \`echo ${nonce}\` in the shell and tell me exactly what it printed.` }] });
    result.turn = { returned: true, stopReason: turn.result?.stopReason, error: turn.error ?? null, toolCalls, nonceSeen: text.includes(nonce), reply: text.slice(0, 80) };
    finish(turn.result?.stopReason === "end_turn" && text.includes(nonce) && toolCalls > 0);
  }
  finish(true);
} catch (error) {
  result.error = String(error.message).slice(0, 300);
  if (wantTurn && result.sessionNew?.ok) result.turn = { returned: false, toolCalls, replyTextSoFar: text.slice(0, 80) };
  finish(false);
}
