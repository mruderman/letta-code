#!/usr/bin/env node
// Apply the PTY scenario's pass criteria to any ACP wire log: the one written by
// acp-client.mjs or by acp-tap.mjs under a third-party client such as Toad. Tool
// calls are rebuilt from session/update notifications; checks use the tools'
// rawInput/rawOutput, never the model's prose.
//
//   node check-wire.mjs --wire <wire.ndjson> --expect <glibc|musl> [--expect-permission yes]
// --expect-permission yes: the run was in standard mode, so the agent must have asked the
// client for permission to run the TTY probe (not applicable to a pre-approved Toad run).
import { readFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const entries = readFileSync(args.wire, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const expectLibc = args.expect ?? "glibc";

const calls = new Map();
const permissionRequests = [];
let promptId;
let stopReason;
for (const { direction, message } of entries) {
  if (direction === "client->agent" && message.method === "session/prompt") promptId = message.id;
  if (direction === "agent->client" && promptId !== undefined && message.id === promptId && !message.method) {
    stopReason = message.result?.stopReason;
  }
  if (direction === "agent->client" && message.method === "session/request_permission") {
    permissionRequests.push(message.params?.toolCall);
  }
  const update = direction === "agent->client" && message.method === "session/update" ? message.params?.update : null;
  if (update && (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update")) {
    calls.set(update.toolCallId, { ...(calls.get(update.toolCallId) ?? {}), ...update });
  }
}

const all = [...calls.values()];
const outputText = (call) => JSON.stringify(call?.rawOutput ?? call?.content ?? "");
const isExec = (c) => c.rawInput && typeof c.rawInput === "object" && "cmd" in c.rawInput;
const ttyStep = all.filter(isExec).find((c) => String(c.rawInput.cmd).includes("test -t 0"));
const stdinCall = all.find((c) => c.rawInput && typeof c.rawInput === "object" && "chars" in c.rawInput);
const allOutput = all.map(outputText).join("\n");

const checks = [
  ["turn ended normally (stopReason end_turn)", stopReason === "end_turn"],
  ["exec_command was called with tty: true for the TTY probe", ttyStep?.rawInput?.tty === true],
];
if (expectLibc === "glibc") {
  // Only glibc has a live PTY session to write to; on musl the command already finished
  // through the pipe fallback, so calling write_stdin is the model's choice.
  checks.push(
    ["write_stdin was called", Boolean(stdinCall)],
    ["TTY probe printed PTY_OK (a real PTY was allocated)", outputText(ttyStep).includes("PTY_OK")],
    ["input written via write_stdin was read (got:hello)", allOutput.includes("got:hello")],
  );
} else {
  checks.push(
    ["PTY refused on musl with the actionable fallback message", allOutput.includes("Falling back to a non-TTY pipe")],
    ["command still ran via pipe (NO_PTY)", outputText(ttyStep).includes("NO_PTY")],
  );
}
if (args["expect-permission"] === "yes") {
  checks.push([
    "agent requested permission to run the TTY probe (standard mode)",
    permissionRequests.some((c) => String(c?.rawInput?.cmd ?? "").includes("test -t 0")),
  ]);
}
let ok = true;
for (const [name, passed] of checks) {
  ok &&= passed;
  console.log(`  ${passed ? "ok  " : "FAIL"} ${name}`);
}
console.log(`[wire check] ${ok ? "PASS" : "FAIL"} (${all.length} tool calls, stopReason=${stopReason ?? "none"})`);
process.exit(ok ? 0 : 1);
