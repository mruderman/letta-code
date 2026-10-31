#!/usr/bin/env node
// K04: a full prompt turn through letta-acp from the @agentclientprotocol/sdk 2.x client API
// (client()/connectWith, the line the registry's own tooling will move to), not the 1.x
// ClientSideConnection the rest of the suite uses.
//   node ts-sdk2-client.mjs --out DIR -- <agent command...>      (run `npm i @agentclientprotocol/sdk@2.2.0` next to it)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const argv = process.argv.slice(2);
const out = argv[argv.indexOf("--out") + 1];
const command = argv.slice(argv.indexOf("--") + 1);
mkdirSync(out, { recursive: true });
const nonce = `TS2${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
const cwd = mkdtempSync(join(tmpdir(), "ts2-client-"));
const result = { client: `@agentclientprotocol/sdk ${process.env.ACP_SDK_VERSION ?? "2.x"} client()/connectWith`, nonce };
const text = [];
const tools = new Map();
const permissions = [];
const child = spawn("sh", ["-c", command.join(" ")], { stdio: ["pipe", "pipe", "inherit"], env: process.env, cwd });
const stream = acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));

const app = acp.client({ name: "letta-acp-e2e-ts2", version: "1" });
app.onRequest(acp.methods.client.session.requestPermission, async ({ params }) => {
  permissions.push(params.toolCall?.title);
  const allow = params.options.find((o) => o.kind === "allow_once");
  return { outcome: { outcome: "selected", optionId: allow.optionId } };
});
app.onNotification(acp.methods.client.session.update, ({ params }) => {
  const u = params.update;
  if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") text.push(u.content.text);
  if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") tools.set(u.toolCallId, { ...(tools.get(u.toolCallId) ?? {}), status: u.status, title: u.title });
});

const timer = setTimeout(() => {
  result.passed = false;
  result.error = "timed out after 240s";
  finish(1);
}, 240_000);
function finish(code) {
  clearTimeout(timer);
  result.reply = text.join("").slice(0, 200);
  result.tools = Object.fromEntries(tools);
  result.permissions = permissions;
  writeFileSync(join(out, "result.json"), `${JSON.stringify(result, null, 1)}\n`);
  console.log(JSON.stringify(result));
  child.kill("SIGKILL");
  process.exit(code);
}
try {
  await app.connectWith(stream, async (ctx) => {
    const init = await ctx.request(acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} });
    result.initialize = { protocolVersion: init.protocolVersion, loadSession: init.agentCapabilities?.loadSession };
    const session = await ctx.request(acp.methods.agent.session.new, { cwd, mcpServers: [] });
    const response = await ctx.request(acp.methods.agent.session.prompt, { sessionId: session.sessionId, prompt: [{ type: "text", text: `Run \`echo ${nonce}\` in the shell and tell me exactly what it printed.` }] });
    result.stopReason = response.stopReason;
    result.passed = response.stopReason === "end_turn" && text.join("").includes(nonce) && tools.size > 0;
  });
} catch (error) {
  result.passed = false;
  result.error = `${error?.name}: ${error?.message}`.slice(0, 400);
}
finish(result.passed ? 0 : 1);
