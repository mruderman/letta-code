#!/usr/bin/env node
// Transparent ACP wire tap for third-party clients. The client launches this in
// place of the agent; it runs the real agent command, forwards every byte in both
// directions unchanged, and appends each JSON-RPC line to a log.
//
//   node acp-tap.mjs --log <wire.ndjson> -- <agent command...>
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const logIndex = argv.indexOf("--log");
if (split < 0 || logIndex < 0 || logIndex > split) {
  console.error("usage: acp-tap.mjs --log <file> -- <command...>");
  process.exit(2);
}
const logFile = argv[logIndex + 1];
const command = argv.slice(split + 1).join(" ");

function record(direction) {
  let pending = "";
  return (chunk) => {
    pending += chunk.toString("utf8");
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        message = { unparsed: line };
      }
      appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), direction, message })}\n`);
    }
  };
}

const agent = spawn("sh", ["-c", command], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
agent.stderr.on("data", (chunk) => {
  appendFileSync(`${logFile}.stderr.log`, chunk);
  process.stderr.write(chunk);
});
const fromClient = record("client->agent");
const fromAgent = record("agent->client");
process.stdin.on("data", (chunk) => {
  fromClient(chunk);
  agent.stdin.write(chunk);
});
process.stdin.on("end", () => agent.stdin.end());
agent.stdout.on("data", (chunk) => {
  fromAgent(chunk);
  process.stdout.write(chunk);
});
agent.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
