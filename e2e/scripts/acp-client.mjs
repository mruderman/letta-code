#!/usr/bin/env node
// Scripted ACP client for the e2e tests. It launches the agent exactly the way an
// editor does (default: `npx -y @letta-ai/letta-acp@<version>`), records every
// JSON-RPC line in both directions, approves permission requests, and asserts on
// the tool calls' rawInput/rawOutput rather than on anything the model says.
//
// Usage: node acp-client.mjs --scenario <deterministic|pty> --out <dir>
//          [--expect <glibc|musl>] [--agent "<command line>"] [--timeout-ms N]
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const scenario = args.scenario;
const outDir = args.out;
const expectLibc = args.expect ?? "glibc";
const timeoutMs = Number(args["timeout-ms"] ?? 300_000);
const agentCommand =
  args.agent ?? `npx -y @letta-ai/letta-acp@${process.env.TEST_ACP_VERSION}`;
if (!["deterministic", "pty"].includes(scenario) || !outDir) {
  console.error("usage: acp-client.mjs --scenario <deterministic|pty> --out <dir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const wireLog = join(outDir, "wire.ndjson");
const transcriptLog = join(outDir, "transcript.log");
writeFileSync(wireLog, "");
writeFileSync(transcriptLog, "");
const note = (line) => {
  appendFileSync(transcriptLog, `${line}\n`);
  console.log(line);
};

// Prompts live in prompts.json so every client (including Toad) runs the same
// scenario. The assertions check what the tools actually received and returned,
// so model wording does not matter.
const prompts = JSON.parse(readFileSync(new URL("./prompts.json", import.meta.url), "utf8"));

// Tee each newline-delimited JSON-RPC message into the wire log.
function tap(direction) {
  let pending = "";
  return new Transform({
    transform(chunk, _encoding, done) {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) appendFileSync(wireLog, `${JSON.stringify({ direction, message: JSON.parse(line) })}\n`);
      }
      done(null, chunk);
    },
  });
}

const child = spawn("sh", ["-c", agentCommand], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});
child.stderr.on("data", (chunk) => appendFileSync(join(outDir, "agent-stderr.log"), chunk));
const toAgent = tap("client->agent");
toAgent.pipe(child.stdin);
const fromAgent = child.stdout.pipe(tap("agent->client"));
const stream = acp.ndJsonStream(
  Writable.toWeb(toAgent),
  Readable.toWeb(fromAgent),
);

const toolCalls = new Map();
const permissions = [];
let agentText = "";
let stopReason;

const deadline = setTimeout(() => {
  note(`[timeout] no completion within ${timeoutMs}ms`);
  finish(false);
}, timeoutMs);

function finish(passedRun, checks = []) {
  clearTimeout(deadline);
  const summary = {
    scenario,
    expectLibc,
    agentCommand,
    stopReason,
    passed: passedRun && checks.every((c) => c.passed),
    checks,
    toolCalls: [...toolCalls.values()],
    permissions,
  };
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  note(`[result] ${summary.passed ? "PASS" : "FAIL"}`);
  for (const check of checks) note(`  ${check.passed ? "ok  " : "FAIL"} ${check.name}`);
  child.kill();
  process.exit(summary.passed ? 0 : 1);
}

const outputText = (call) => JSON.stringify(call.rawOutput ?? call.content ?? "");

function scenarioChecks() {
  const calls = [...toolCalls.values()];
  const checks = [{ name: "turn ended normally (stopReason end_turn)", passed: stopReason === "end_turn" }];
  if (scenario === "deterministic") {
    // LETTA_LOCAL_BACKEND_EXECUTOR=deterministic selects letta-code's
    // DeterministicPongExecutor, which answers every turn with "pong" and makes
    // no tool calls. This proves install + adapter + SDK + app-server + local
    // backend wiring end to end; tool execution is covered by the live scenario.
    checks.push(
      { name: "local-backend deterministic executor answered over ACP ('pong')", passed: agentText.trim() === "pong" },
      { name: "no tool calls (none expected from this executor)", passed: calls.length === 0 },
    );
    return checks;
  }
  const execCalls = calls.filter((c) => c.rawInput && typeof c.rawInput === "object" && "cmd" in c.rawInput);
  const ttyStep = execCalls.find((c) => String(c.rawInput.cmd).includes("test -t 0"));
  const stdinCall = calls.find((c) => c.rawInput && typeof c.rawInput === "object" && "chars" in c.rawInput);
  checks.push(
    { name: "exec_command was called with tty: true for the TTY probe", passed: ttyStep?.rawInput?.tty === true },
    { name: "write_stdin was called", passed: Boolean(stdinCall) },
  );
  const allOutput = calls.map(outputText).join("\n");
  if (expectLibc === "glibc") {
    checks.push(
      { name: "TTY probe printed PTY_OK (a real PTY was allocated)", passed: outputText(ttyStep ?? {}).includes("PTY_OK") },
      { name: "input written via write_stdin was read (got:hello)", passed: allOutput.includes("got:hello") },
    );
  } else {
    checks.push(
      { name: "PTY refused on musl with the actionable fallback message", passed: allOutput.includes("Falling back to a non-TTY pipe") },
      { name: "command still ran via pipe (NO_PTY)", passed: outputText(ttyStep ?? {}).includes("NO_PTY") },
    );
  }
  return checks;
}

try {
  await acp
    .client({ name: "letta-acp-e2e-client" })
    .onRequest(acp.methods.client.session.requestPermission, (ctx) => {
      permissions.push({ title: ctx.params.toolCall.title, toolCallId: ctx.params.toolCall.toolCallId });
      note(`[permission] ${ctx.params.toolCall.title} -> allow_once`);
      return { outcome: { outcome: "selected", optionId: "allow_once" } };
    })
    .onRequest(acp.methods.client.fs.readTextFile, (ctx) => ({ content: readFileSync(ctx.params.path, "utf8") }))
    .onRequest(acp.methods.client.fs.writeTextFile, (ctx) => {
      writeFileSync(ctx.params.path, ctx.params.content);
      return {};
    })
    .onNotification(acp.methods.client.session.update, (ctx) => {
      const update = ctx.params.update;
      if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
        agentText += update.content.text;
      } else if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
        const call = { ...(toolCalls.get(update.toolCallId) ?? {}), ...update };
        toolCalls.set(update.toolCallId, call);
        note(`[${update.sessionUpdate}] ${call.title ?? update.toolCallId} status=${call.status ?? "-"}${update.rawInput ? ` input=${JSON.stringify(update.rawInput)}` : ""}${update.rawOutput ? ` output=${JSON.stringify(update.rawOutput).slice(0, 400)}` : ""}`);
      }
    })
    .connectWith(stream, async (ctx) => {
      const init = await ctx.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      });
      note(`[init] protocol v${init.protocolVersion}; auth methods: ${(init.authMethods ?? []).map((m) => m.id).join(", ") || "none"}`);
      const session = await ctx.request(acp.methods.agent.session.new, { cwd: process.cwd(), mcpServers: [] });
      note(`[session] ${session.sessionId}`);
      note(`[prompt] ${prompts[scenario]}`);
      const result = await ctx.request(acp.methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: prompts[scenario] }],
      });
      stopReason = result.stopReason;
      note(`[agent text] ${agentText.trim().slice(0, 1000)}`);
      note(`[done] stopReason=${stopReason}`);
    });
  finish(true, scenarioChecks());
} catch (error) {
  note(`[error] ${error instanceof Error ? error.stack : String(error)}`);
  finish(false, scenarioChecks());
}
