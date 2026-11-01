#!/usr/bin/env node
// Read an acp-tap wire log ({at,direction,message} per line) and report on it, so the tmux driver can
// decide what to do next from the protocol (not from scraping the screen).
//
//   node wire-state.mjs <wire.ndjson> counts   -> "<prompts sent> <answered> <permissions asked> <permissions answered>"
//   node wire-state.mjs <wire.ndjson> prompts  -> JSON array, one object per session/prompt (see below)
//   node wire-state.mjs <wire.ndjson> last     -> the last of those, as JSON
//   node wire-state.mjs <wire.ndjson> ready    -> 1 once session/new has been answered with a sessionId, else 0
//   node wire-state.mjs <wire.ndjson> lines    -> number of lines in the log
// Each prompt object: { id, text, stopReason (null while unanswered), error, agentText, toolCalls:[{title,kind,status,rawInput}],
//                        permissions:[{title,options,outcome}], sentAt, answeredAt }
import { existsSync, readFileSync } from "node:fs";

const [file, cmd = "counts"] = process.argv.slice(2);
const entries = existsSync(file)
  ? readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];
if (cmd === "ready") {
  // the client has opened a session: a session/new request has a response carrying a sessionId
  const ids = entries.filter((e) => e.direction === "client->agent" && e.message.method === "session/new").map((e) => e.message.id);
  console.log(entries.some((e) => e.direction === "agent->client" && ids.includes(e.message.id) && e.message.result?.sessionId) ? 1 : 0);
  process.exit(0);
}
if (cmd === "lines") { console.log(entries.length); process.exit(0); }

const prompts = [];
const permissionById = new Map();
let current = null;
for (const { at, direction, message: m } of entries) {
  if (direction === "client->agent" && m.method === "session/prompt") {
    current = { id: m.id, text: (m.params?.prompt ?? []).map((p) => p.text ?? "").join(""), stopReason: null, error: null, agentText: "", toolCalls: [], permissions: [], sentAt: at, answeredAt: null };
    prompts.push(current);
    continue;
  }
  if (direction === "agent->client" && !m.method && current && m.id === current.id) {
    current.stopReason = m.result?.stopReason ?? null;
    current.error = m.error ? `${m.error.code}: ${m.error.data?.error?.error?.message ?? m.error.message}` : null;
    current.answeredAt = at;
    continue;
  }
  if (!current) continue;
  if (direction === "agent->client" && m.method === "session/update") {
    const u = m.params?.update ?? {};
    if (u.sessionUpdate === "agent_message_chunk") current.agentText += u.content?.text ?? "";
    if (u.sessionUpdate === "tool_call") current.toolCalls.push({ id: u.toolCallId, title: u.title, kind: u.kind, status: u.status, rawInput: u.rawInput });
    if (u.sessionUpdate === "tool_call_update") {
      const call = current.toolCalls.find((c) => c.id === u.toolCallId);
      if (call && u.status) call.status = u.status;
    }
  }
  if (direction === "agent->client" && m.method === "session/request_permission") {
    const p = { title: m.params?.toolCall?.title, options: (m.params?.options ?? []).map((o) => `${o.kind}:${o.optionId}`), outcome: null };
    current.permissions.push(p);
    permissionById.set(m.id, p);
  }
  if (direction === "client->agent" && !m.method && permissionById.has(m.id)) {
    const o = m.result?.outcome;
    permissionById.get(m.id).outcome = o ? (o.outcome === "selected" ? `selected:${o.optionId}` : o.outcome) : "error";
  }
}
const answered = prompts.filter((p) => p.answeredAt).length;
const permsAsked = prompts.flatMap((p) => p.permissions);
if (cmd === "counts") console.log(`${prompts.length} ${answered} ${permsAsked.length} ${permsAsked.filter((p) => p.outcome).length}`);
else if (cmd === "prompts") console.log(JSON.stringify(prompts, null, 2));
else if (cmd === "last") console.log(JSON.stringify(prompts.at(-1) ?? null, null, 2));
else { console.error(`unknown command ${cmd}`); process.exit(2); }
