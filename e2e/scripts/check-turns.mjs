#!/usr/bin/env node
// Turn-completion check over ACP wire logs: did every session/prompt the client sent get a
// JSON-RPC response, and with which stopReason? This is the property the 0.1.11 hang breaks
// (reply text streams, the session/prompt request is never answered). Complements check-wire.mjs,
// which applies the PTY scenario's criteria to a single run.
//
//   node check-turns.mjs <wire.ndjson|dir> [...]     (directories are searched for *wire.ndjson)
// Understands the three wire formats in this suite: {at,direction,message} (live/lib.mjs,
// acp-client.mjs, acp-tap.mjs), {t,dir,m} (turn-probe.mjs) and acpx's --format json output.
// Exit 1 if any session/prompt was left unanswered.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(path, out = []) {
  if (statSync(path).isDirectory()) for (const e of readdirSync(path)) walk(join(path, e), out);
  else if (path.endsWith("wire.ndjson")) out.push(path);
  return out;
}
const files = process.argv.slice(2).flatMap((p) => walk(p)).sort();
let totalPrompts = 0, totalAnswered = 0, unansweredFiles = 0;
const stops = {};
for (const file of files) {
  const prompts = new Map(); // id -> answered stopReason | null
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    let dir = e.direction ?? e.dir; const m = e.message ?? e.m ?? (e.jsonrpc ? e : null);
    if (!m || typeof m !== "object") continue;
    if (dir === "c->a") dir = "client->agent"; if (dir === "a->c") dir = "agent->client";
    if (m.method === "session/prompt" && m.id !== undefined && dir !== "agent->client") prompts.set(m.id, null);
    else if (!m.method && m.id !== undefined && prompts.has(m.id) && dir !== "client->agent") prompts.set(m.id, m.error ? `error:${m.error.code}` : (m.result?.stopReason ?? "no-stopReason"));
  }
  const answered = [...prompts.values()].filter((v) => v !== null);
  totalPrompts += prompts.size; totalAnswered += answered.length;
  for (const s of answered) stops[s] = (stops[s] ?? 0) + 1;
  const missing = prompts.size - answered.length;
  if (missing) unansweredFiles++;
  console.log(`${missing ? "UNANSWERED" : "ok        "} ${answered.length}/${prompts.size}  ${file}${missing ? `  (${missing} session/prompt never answered)` : ""}`);
}
console.log(`\n${files.length} wire logs; session/prompt answered ${totalAnswered}/${totalPrompts}; stopReasons ${JSON.stringify(stops)}; logs with an unanswered prompt: ${unansweredFiles}`);
process.exit(unansweredFiles ? 1 : 0);
