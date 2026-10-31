// Metric D: generic ACP behaviour any harness should get right, exercised live (real model,
// real client over stdio). These do not distinguish Letta from other agents; they show it
// is a well-behaved ACP citizen. Check ids are fixed in e2e/checks.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { freshHome, nonce, outputText, sleep } from "../lib.mjs";

const here = new URL(".", import.meta.url).pathname;
const toolTitles = (turn) => turn.toolCalls.map((c) => c.title ?? "?");
const pick = (kind) => (params) => params.options.find((o) => o.kind === kind)?.optionId ?? null;
const ranCommand = (turn, needle) => turn.toolCalls.some((c) => JSON.stringify(c.rawInput ?? {}).includes(needle) && ["completed", "failed", "in_progress"].includes(c.status));

function solidPng(r, g, b, size = 32) {
  const crc = (buf) => {
    let c;
    let crcValue = 0xffffffff;
    for (const byte of buf) {
      c = (crcValue ^ byte) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcValue = (crcValue >>> 8) ^ c;
    }
    return (crcValue ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** D01, D02, D19: handshake and session setup. No model is needed, so these also run on a chain whose turns hang. */
async function handshake(ctx) {
  const state = freshHome("handshake");
  const a = await ctx.launch({ name: "run", state, permissionMode: "unrestricted" });
  const init = await a.initialize();
  const caps = init.agentCapabilities ?? {};
  ctx.add("D01", init.protocolVersion === 1 && caps.loadSession === true && Boolean(caps.sessionCapabilities?.list) && caps.promptCapabilities?.image === true && caps.promptCapabilities?.embeddedContext === true && Boolean(caps.mcpCapabilities),
    `protocolVersion=${init.protocolVersion}; agentCapabilities=${JSON.stringify(caps)}; agentInfo=${JSON.stringify(init.agentInfo ?? null)}; authMethods=${JSON.stringify(init.authMethods)}`, "real ACP client");
  const session = await a.newSession(state.work);
  ctx.add("D02", /^local-conv-\d+$/.test(session.sessionId) && Array.isArray(session.configOptions) && session.configOptions.some((o) => o.id === "model") && session.configOptions.some((o) => o.id === "permissions"),
    `sessionId=${session.sessionId}; configOptions=${session.configOptions?.map((o) => `${o.id}=${o.currentValue}`).join(", ")}`, "real ACP client");
  const commands = a.updates.filter((u) => u.sessionUpdate === "available_commands_update").flatMap((u) => u.availableCommands.map((c) => c.name));
  ctx.add("D19", commands.length > 5 && ["model", "compact", "remember"].every((n) => commands.includes(n)), `${commands.length} commands advertised, including: ${commands.slice(0, 12).join(", ")}`, "real ACP client");
  await a.stop();
}

/** D18: errors are JSON-RPC errors and the adapter keeps working. No model is needed. */
async function errorHandling(ctx) {
  const state = freshHome("errors");
  const a = await ctx.launch({ name: "run", state, permissionMode: "unrestricted" });
  await a.initialize();
  const s1 = await a.newSession(state.work);
  const errors = [];
  try {
    await a.conn.prompt({ sessionId: "local-conv-99999", prompt: [{ type: "text", text: "hi" }] });
    errors.push("prompt on an unknown session succeeded");
  } catch (error) {
    errors.push(`unknown session -> ${error.code ?? "?"} ${String(error.message).slice(0, 60)}`);
  }
  let methodError;
  try {
    await a.conn.extMethod("e2e/not-a-method", {});
  } catch (error) {
    methodError = error;
  }
  errors.push(`unknown method -> ${methodError?.code ?? "no error"}`);
  let alive = false;
  let aliveDetail = "";
  try {
    const again = await a.newSession(state.work);
    alive = /^local-conv-\d+$/.test(again.sessionId) && again.sessionId !== s1.sessionId;
    aliveDetail = again.sessionId;
  } catch (error) {
    aliveDetail = String(error.message).slice(0, 80);
  }
  ctx.add("D18", errors[0].includes("->") && methodError?.code === -32601 && alive,
    `${errors.join("; ")}; session/new still works afterwards: ${alive} (${aliveDetail}); criterion changed from "answers a prompt afterwards" so it needs no model`, "real ACP client");
  await a.stop();
}

/** D03, D20, D21, D26: streaming, tool-call shapes, cwd. */
async function protocolShape(ctx) {
  const state = freshHome("shape");
  const a = await ctx.launch({ name: "run", state, permissionMode: "unrestricted" });
  await a.initialize();
  const session = await a.newSession(state.work);
  const turn = await a.prompt(session.sessionId, "Count from 1 to 12, separated by spaces, then stop.");
  const chunks = turn.updates.filter((u) => u.sessionUpdate === "agent_message_chunk").length;
  ctx.add("D03", turn.stopReason === "end_turn" && chunks >= 3 && turn.text.includes("12"), `${chunks} agent_message_chunk updates before end_turn; text ${JSON.stringify(turn.text.slice(0, 60))}`);
  const shell = await a.prompt(session.sessionId, "Run `pwd` in the shell and tell me the output.");
  const call = shell.toolCalls[0];
  ctx.add("D26", shell.text.includes(state.work) || toolTitles(shell).length > 0 && shell.toolCalls.some((c) => outputText(c).includes(state.work)), `session cwd ${state.work}; tool outputs: ${shell.toolCalls.map((c) => outputText(c).slice(0, 120)).join(" | ")}`);
  const updatesWithOutput = shell.updates.filter((u) => u.sessionUpdate === "tool_call_update" && u.rawOutput !== undefined);
  const nonObject = updatesWithOutput.filter((u) => typeof u.rawOutput !== "object" || u.rawOutput === null);
  ctx.add("D20", updatesWithOutput.length > 0 && nonObject.length === 0,
    `${updatesWithOutput.length} tool_call_update messages carried rawOutput; ${nonObject.length} were not JSON objects (types: ${[...new Set(updatesWithOutput.map((u) => typeof u.rawOutput))].join(",")}). Toad 0.6.20 rejects non-object rawOutput with -32602`, "real ACP client");
  ctx.add("D21", call?.kind === "execute", `shell tool "${call?.title}" reported kind=${call?.kind}`, "real ACP client");
  await a.stop();
}

/** D04-D07, D09: permission requests, deny, always, mode switch, cancel during a permission prompt. */
async function permissions(ctx) {
  const state = freshHome("perm");
  const stamp = nonce("P");
  const allow = await ctx.launch({ name: "allow", state, permissionMode: "standard", permission: pick("allow_once") });
  await allow.initialize();
  const s1 = await allow.newSession(state.work);
  const t1 = await allow.prompt(s1.sessionId, `Run \`echo ${stamp}-ALLOW > ${join(state.work, "allow.txt")}\` in the shell, then say done.`);
  ctx.add("D04", t1.permissions.length >= 1 && existsSync(join(state.work, "allow.txt")),
    `permission requests: ${t1.permissions.map((p) => `${p.title} options=${p.options?.join("/")} answered=${p.answered}`).join(" | ")}; file written: ${existsSync(join(state.work, "allow.txt"))}`);
  await allow.stop();

  const deny = await ctx.launch({ name: "deny", state, permissionMode: "standard", permission: pick("reject_once") });
  await deny.initialize();
  const s2 = await deny.newSession(state.work);
  const t2 = await deny.prompt(s2.sessionId, `Run \`echo ${stamp}-DENY > ${join(state.work, "deny.txt")}\` in the shell, then tell me what happened.`);
  ctx.add("D05", t2.permissions.length >= 1 && !existsSync(join(state.work, "deny.txt")) && t2.stopReason === "end_turn",
    `permission requests answered: ${t2.permissions.map((p) => p.answered).join(",")}; deny.txt exists: ${existsSync(join(state.work, "deny.txt"))}; stopReason ${t2.stopReason}; reply ${JSON.stringify(t2.text.slice(0, 120))}`);
  await deny.stop();

  const always = await ctx.launch({ name: "always", state, permissionMode: "standard", permission: pick("allow_always") });
  await always.initialize();
  const s3 = await always.newSession(state.work);
  const first = await always.prompt(s3.sessionId, `Run \`echo ${stamp}-A1 > ${join(state.work, "a1.txt")}\` in the shell.`);
  const second = await always.prompt(s3.sessionId, `Run \`echo ${stamp}-A2 > ${join(state.work, "a2.txt")}\` in the shell.`);
  ctx.add("D06", first.permissions.length >= 1 && second.permissions.length === 0 && existsSync(join(state.work, "a2.txt")),
    `first turn prompted ${first.permissions.length}x (answered ${first.permissions.map((p) => p.answered)}); second turn prompted ${second.permissions.length}x and ran: ${existsSync(join(state.work, "a2.txt"))}`);
  await always.stop();

  const mode = await ctx.launch({ name: "mode", state, permissionMode: "standard", permission: pick("allow_once") });
  await mode.initialize();
  const s4 = await mode.newSession(state.work);
  await mode.conn.setSessionConfigOption({ sessionId: s4.sessionId, configId: "permissions", value: "unrestricted" });
  const t4 = await mode.prompt(s4.sessionId, `Run \`echo ${stamp}-MODE > ${join(state.work, "mode.txt")}\` in the shell.`);
  ctx.add("D07", t4.permissions.length === 0 && existsSync(join(state.work, "mode.txt")), `after switching permissions -> unrestricted: ${t4.permissions.length} prompts; command ran: ${existsSync(join(state.work, "mode.txt"))}`);
  await mode.stop();

  let release;
  const held = new Promise((resolve) => (release = resolve));
  const cancel = await ctx.launch({ name: "cancel-perm", state, permissionMode: "standard", permission: async () => { await held; return null; } });
  await cancel.initialize();
  const s5 = await cancel.newSession(state.work);
  const pending = cancel.conn.prompt({ sessionId: s5.sessionId, prompt: [{ type: "text", text: `Run \`echo ${stamp}-CANCELPERM > ${join(state.work, "cancelperm.txt")}\` in the shell.` }] });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && !cancel.updates.some((u) => u.sessionUpdate === "tool_call")) await sleep(300);
  await sleep(1500);
  await cancel.conn.cancel({ sessionId: s5.sessionId });
  release();
  const response = await Promise.race([pending, sleep(30_000).then(() => ({ stopReason: "TIMEOUT" }))]);
  ctx.add("D09", response.stopReason === "cancelled" && !existsSync(join(state.work, "cancelperm.txt")), `stopReason after cancel during a pending permission request: ${response.stopReason}; command ran: ${existsSync(join(state.work, "cancelperm.txt"))}`);
  await cancel.stop();
}

/** D08, D17: cancel mid-command kills the process; shell tool runs under a PTY where available. */
async function cancelAndPty(ctx) {
  const state = freshHome("cancel");
  const seconds = 20000 + Math.floor(Math.random() * 9000);
  const a = await ctx.launch({ name: "run", state, permissionMode: "unrestricted" });
  await a.initialize();
  const session = await a.newSession(state.work);
  const pending = a.conn.prompt({ sessionId: session.sessionId, prompt: [{ type: "text", text: `Run \`sleep ${seconds}\` in the shell and wait for it to finish. Do not stop early.` }] });
  const deadline = Date.now() + 90_000;
  const running = () => {
    try {
      return execFileSync("pgrep", ["-f", `sleep ${seconds}`], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  while (Date.now() < deadline && running().length === 0) await sleep(300);
  const before = running();
  await sleep(500);
  const cancelledAt = Date.now();
  await a.conn.cancel({ sessionId: session.sessionId });
  const response = await Promise.race([pending, sleep(30_000).then(() => ({ stopReason: "TIMEOUT" }))]);
  await sleep(3000);
  const after = running();
  ctx.add("D08", before.length > 0 && response.stopReason === "cancelled" && after.length === 0,
    `process running before cancel: ${before.length > 0}; stopReason ${response.stopReason} after ${Date.now() - cancelledAt}ms; process still alive 3s later: ${after.length > 0}`);
  const afterCancel = await a.prompt(session.sessionId, "Run `echo AFTERCANCEL` in the shell and tell me the output.");
  ctx.add("D08b", afterCancel.toolCalls.some((c) => outputText(c).includes("AFTERCANCEL") && !/Interrupted/i.test(outputText(c))),
    `first shell call in the turn after a cancel: ${afterCancel.toolCalls.map((c) => `${c.status} ${outputText(c).replace(/\\n/g, " ").slice(0, 120)}`).join(" | ") || "none"}; reply ${JSON.stringify(afterCancel.text.slice(0, 80))}`);
  await a.stop();

  const fresh = freshHome("tty");
  const b = await ctx.launch({ name: "tty", state: fresh, permissionMode: "unrestricted" });
  await b.initialize();
  const sb = await b.newSession(fresh.work);
  const tty = await b.prompt(sb.sessionId, "Call your exec_command tool with tty set to true to run `test -t 1 && echo ISATTY || echo NOTTY`, and tell me the output.");
  const asked = tty.toolCalls.some((c) => c.rawInput?.tty === true);
  ctx.add("D17", asked && tty.toolCalls.some((c) => /ISATTY/.test(outputText(c))),
    `tty:true requested in the tool call: ${asked}; shell reported: ${tty.toolCalls.map((c) => outputText(c).replace(/\\n/g, " ").slice(0, 200)).join(" | ")} (NOTTY after tty:true means the PTY was not available; without node-pty the pipe fallback is documented; criterion fixed after review: the first version never asked for a tty)`);
  await b.stop();
}

/** D10, D11, D12, D16, D24, D25: client fs, MCP, image, embedded context, races, concurrency. */
async function clientFeatures(ctx) {
  const state = freshHome("client");
  const secret = nonce("MCPSECRET");
  const callLog = join(state.root, "mcp-calls.log");
  const a = await ctx.launch({ name: "run", state, permissionMode: "unrestricted", fsCaps: true });
  await a.initialize();
  const probeFile = join(state.work, "fs-probe.txt");
  const probeValue = nonce("FSPROBE");
  writeFileSync(probeFile, `${probeValue}\n`);
  const s1 = await a.newSession(state.work);
  const read = await a.prompt(s1.sessionId, `Read the file ${probeFile} and tell me its exact contents.`);
  const naturalFsCalls = a.fsCalls.length;
  const explicit = await a.prompt(s1.sessionId, `Now use your read_editor_buffer tool (the editor-delegated reader) on ${probeFile} and tell me what it returned.`);
  ctx.add("D10", a.fsCalls.some((c) => c.method === "fs/read_text_file") && explicit.text.includes(probeValue),
    `client fs requests: ${JSON.stringify(a.fsCalls)}; natural read used the client fs: ${naturalFsCalls > 0}; first reply ${JSON.stringify(read.text.slice(0, 60))}; explicit-tool reply ${JSON.stringify(explicit.text.slice(0, 80))}; tools: ${toolTitles(explicit).join(" | ")}`);
  await a.stop();

  const mcp = await ctx.launch({ name: "mcp", state, permissionMode: "unrestricted", extraEnv: {} });
  await mcp.initialize();
  const server = { name: "e2e", command: process.execPath, args: [join(here, "..", "assets", "e2e-mcp-server.mjs")], env: [{ name: "E2E_MCP_SECRET", value: secret }, { name: "E2E_MCP_CALL_LOG", value: callLog }] };
  const s2 = await mcp.newSession(state.work, [server]);
  const turn = await mcp.prompt(s2.sessionId, "Call your e2e_secret tool and tell me exactly what it returned.", { timeoutMs: 180_000 });
  ctx.add("D11", turn.text.includes(secret) && existsSync(callLog),
    `MCP server called: ${existsSync(callLog) ? readFileSync(callLog, "utf8").trim() : "never"}; reply ${JSON.stringify(turn.text.slice(0, 100))}; tools: ${toolTitles(turn).join(" | ")}`);

  const png = solidPng(255, 0, 0).toString("base64");
  const image = await mcp.prompt(s2.sessionId, [
    { type: "image", mimeType: "image/png", data: png },
    { type: "text", text: "What single colour fills this image? Answer with one word." },
  ]);
  ctx.add("D12", /red/i.test(image.text), `image block (32x32 solid red PNG) -> reply ${JSON.stringify(image.text.slice(0, 80))}`);

  const fact = nonce("EMBED");
  const embedded = await mcp.prompt(s2.sessionId, [
    { type: "resource", resource: { uri: "file:///notes/embedded.txt", mimeType: "text/plain", text: `The embedded passphrase is ${fact}.` } },
    { type: "text", text: "What is the embedded passphrase in the attached resource? Answer with only the value." },
  ]);
  ctx.add("D16", embedded.text.includes(fact), `resource block -> reply ${JSON.stringify(embedded.text.slice(0, 80))}`);

  await mcp.stop();

  const race = await ctx.launch({ name: "race", state, permissionMode: "unrestricted" });
  await race.initialize();
  const s3 = await race.newSession(state.work);
  const words = [nonce("R"), nonce("R"), nonce("R")];
  const got = [];
  for (const word of words) {
    const response = await race.conn.prompt({ sessionId: s3.sessionId, prompt: [{ type: "text", text: `Reply with exactly ${word}` }] });
    const own = race.updates.filter((u) => u.sessionUpdate === "agent_message_chunk" && u.sessionId === s3.sessionId);
    got.push({ stop: response.stopReason, text: own.map((u) => u.content.text).join("") });
    race.updates.length = 0;
  }
  const aligned = got.every((g, i) => g.text.trim() === words[i]);
  ctx.add("D24", aligned, `3 back-to-back prompts sent immediately after each end_turn; replies per turn: ${JSON.stringify(got.map((g, i) => (g.text.trim() === words[i] ? "=" : g.text.slice(0, 14) || "(empty)")))}`);
  await race.stop();

  const multi = await ctx.launch({ name: "multi", state, permissionMode: "unrestricted" });
  await multi.initialize();
  const sa = await multi.newSession(state.work);
  const sb = await multi.newSession(state.work);
  const [wa, wb] = [nonce("ALPHA"), nonce("BRAVO")];
  const [ra, rb] = await Promise.all([
    multi.prompt(sa.sessionId, `Reply with exactly ${wa}`, { settleMs: 0 }),
    multi.prompt(sb.sessionId, `Reply with exactly ${wb}`, { settleMs: 0 }),
  ]);
  ctx.add("D25", ra.text.includes(wa) && !ra.text.includes(wb) && rb.text.includes(wb) && !rb.text.includes(wa), `two concurrent sessions: ${sa.sessionId} -> ${JSON.stringify(ra.text.slice(0, 40))}; ${sb.sessionId} -> ${JSON.stringify(rb.text.slice(0, 40))}`);
  await multi.stop();
}

/** D22: file edits are reported with a structured diff the client can render. */
async function editDiff(ctx) {
  const state = freshHome("diff");
  const a = await ctx.launch({ name: "run", state, permissionMode: "unrestricted" });
  await a.initialize();
  const session = await a.newSession(state.work);
  const target = join(state.work, "edit-me.txt");
  writeFileSync(target, "alpha\nbeta\ngamma\n");
  const turn = await a.prompt(session.sessionId, `Edit ${target}: change the line "beta" to "BETA-EDITED". Use your file editing tool, not the shell.`);
  const diffs = turn.updates.filter((u) => (u.content ?? []).some?.((c) => c.type === "diff"));
  const changed = readFileSync(target, "utf8").includes("BETA-EDITED");
  ctx.add("D22", changed && diffs.length > 0, `file edited: ${changed}; tools: ${toolTitles(turn).join(" | ")}; updates with a diff content block: ${diffs.length}; kinds: ${[...new Set(turn.toolCalls.map((c) => c.kind))].join(",")}`);
  await a.stop();
}

export const genericScenarios = [
  { name: "handshake", declares: ["D01", "D02", "D19"], needsModel: false, run: handshake },
  { name: "error-handling", declares: ["D18"], needsModel: false, run: errorHandling },
  { name: "protocol-shape", declares: ["D03", "D20", "D21", "D26"], needsModel: true, run: protocolShape },
  { name: "permissions", declares: ["D04", "D05", "D06", "D07", "D09"], needsModel: true, run: permissions },
  { name: "cancel-and-pty", declares: ["D08", "D08b", "D17"], needsModel: true, run: cancelAndPty },
  { name: "client-features", declares: ["D10", "D11", "D12", "D16", "D24", "D25"], needsModel: true, run: clientFeatures, timeoutMs: 1_200_000 },
  { name: "edit-diff", declares: ["D22"], needsModel: true, run: editDiff },
];
