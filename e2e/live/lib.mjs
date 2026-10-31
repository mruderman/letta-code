// Shared harness for the live scenario suite. One `launch()` starts a real
// letta-acp process (the way an editor does), speaks ACP to it over stdio with the
// official SDK, and records the wire in both directions. Scenarios assert on what
// the tools received and returned and on files on disk, never on model prose alone.
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const nonce = (prefix = "N") => `${prefix}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

function tap(logFile, direction) {
  let pending = "";
  return new Transform({
    transform(chunk, _enc, done) {
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
      done(null, chunk);
    },
  });
}

/** A fresh, isolated Letta home: nothing shared with any real agent or config. */
export function freshHome(label) {
  const root = mkdtempSync(join(tmpdir(), `letta-e2e-${label}-`));
  const home = join(root, "home");
  const backendDir = join(root, "local-backend");
  const work = join(root, "work");
  for (const dir of [home, backendDir, work]) mkdirSync(dir, { recursive: true });
  return { root, home, backendDir, work };
}

/**
 * Start an adapter and connect to it.
 *   agentCmd    shell command line that runs letta-acp (default: $LETTA_ACP_CMD)
 *   outDir      where wire.ndjson / stderr.log go
 *   state       { home, backendDir, work } from freshHome(); reuse it to restart "the same machine"
 *   agentId     LETTA_AGENT_ID, to reuse an agent instead of creating one
 *   permission  async (params) => optionId | null (null = cancel); default allow_once
 *   fsCaps      advertise client fs capabilities (default false)
 *   terminalAuth advertise the terminal-auth capability
 *   extraEnv    extra environment for the adapter
 *   unstable    true to keep going after unsupported-method errors in probes
 */
export async function launch(opts) {
  const {
    name,
    agentCmd = process.env.LETTA_ACP_CMD,
    outDir,
    state,
    agentId,
    permissionMode = "standard",
    model = process.env.LETTA_ACP_MODEL ?? "openai/gpt-5.6-luna",
    permission,
    fsCaps = false,
    extraEnv = {},
    clientInfo = { name: "letta-acp-e2e-live", version: "1" },
    clientMeta,
  } = opts;
  if (!agentCmd) throw new Error("agentCmd or LETTA_ACP_CMD is required");
  mkdirSync(outDir, { recursive: true });
  const wireLog = join(outDir, `${name}.wire.ndjson`);
  const stderrLog = join(outDir, `${name}.stderr.log`);
  writeFileSync(wireLog, "");
  writeFileSync(stderrLog, "");

  const env = {
    ...process.env,
    HOME: state.home,
    LETTA_LOCAL_BACKEND_DIR: state.backendDir,
    LETTA_ACP_PERMISSION_MODE: permissionMode,
    LETTA_ACP_MODEL: model,
    LETTA_CODE_TELEM: "0",
    LETTA_ACP_BACKEND: "local",
    // Node only honors HTTPS_PROXY with this flag; the proxy is what injects the OpenAI key.
    NODE_USE_ENV_PROXY: "1",
    // The OpenAI key is injected by the egress proxy; the SDK only needs a placeholder.
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "proxy-injected",
    ...extraEnv,
  };
  delete env.LETTA_API_KEY;
  delete env.LETTA_AGENT_ID;
  if (agentId) env.LETTA_AGENT_ID = agentId;

  const child = spawn("sh", ["-c", agentCmd], { stdio: ["pipe", "pipe", "pipe"], env, cwd: state.work });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    appendFileSync(stderrLog, chunk);
  });
  const exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  const toAgent = tap(wireLog, "client->agent");
  toAgent.pipe(child.stdin);
  const fromAgent = child.stdout.pipe(tap(wireLog, "agent->client"));
  const stream = acp.ndJsonStream(Writable.toWeb(toAgent), Readable.toWeb(fromAgent));

  const updates = []; // every session/update, in order, across sessions
  const permissions = []; // every permission request and what we answered
  const fsCalls = []; // every client fs request the agent made
  const handle = { name, wireLog, stderrLog, updates, permissions, fsCalls, state, child, exited };

  const client = {
    async requestPermission(params) {
      const optionId = permission ? await permission(params) : "allow_once";
      permissions.push({
        toolCallId: params.toolCall?.toolCallId,
        title: params.toolCall?.title,
        kind: params.toolCall?.kind,
        rawInput: params.toolCall?.rawInput,
        options: params.options?.map((o) => o.optionId),
        answered: optionId,
      });
      return optionId ? { outcome: { outcome: "selected", optionId } } : { outcome: { outcome: "cancelled" } };
    },
    sessionUpdate(params) {
      updates.push({ at: Date.now(), sessionId: params.sessionId, ...params.update });
    },
    async readTextFile(params) {
      fsCalls.push({ method: "fs/read_text_file", path: params.path });
      return { content: readFileSync(params.path, "utf8") };
    },
    async writeTextFile(params) {
      fsCalls.push({ method: "fs/write_text_file", path: params.path, bytes: params.content.length });
      writeFileSync(params.path, params.content);
      return {};
    },
  };
  const conn = new acp.ClientSideConnection(() => client, stream);
  handle.conn = conn;

  handle.initialize = async (extra = {}) => {
    handle.initResult = await conn.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        ...(fsCaps ? { fs: { readTextFile: true, writeTextFile: true } } : {}),
        ...(clientMeta ? { _meta: clientMeta } : {}),
      },
      clientInfo,
      ...extra,
    });
    return handle.initResult;
  };
  handle.newSession = async (cwd = state.work, mcpServers = []) => {
    const session = await conn.newSession({ cwd, mcpServers });
    handle.lastSession = session;
    return session;
  };
  handle.agentId = () => stderr.match(/created agent (agent-[^\s]+)/)?.[1];
  handle.stderr = () => stderr;

  /** Send a prompt, wait for the turn, return what happened during it. */
  let lastTurnEnd = 0;
  handle.prompt = async (sessionId, prompt, { timeoutMs = 240_000, settleMs = 1500 } = {}) => {
    // Human-paced by default: a real user never sends a follow-up within milliseconds of end_turn.
    // The fast-follow-up race has its own scenario (D24) that bypasses this on purpose.
    const wait = lastTurnEnd + settleMs - Date.now();
    if (wait > 0) await sleep(wait);
    const blocks = typeof prompt === "string" ? [{ type: "text", text: prompt }] : prompt;
    const start = updates.length;
    const permStart = permissions.length;
    let timer;
    const response = await Promise.race([
      conn.prompt({ sessionId, prompt: blocks }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`prompt timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]).finally(() => {
      clearTimeout(timer);
      lastTurnEnd = Date.now();
    });
    return summarizeTurn(response, updates.slice(start), permissions.slice(permStart), sessionId);
  };

  handle.stop = async ({ graceMs = 15_000 } = {}) => {
    child.stdin.end();
    const result = await Promise.race([exited, sleep(graceMs).then(() => null)]);
    if (!result) {
      child.kill("SIGKILL");
      return exited;
    }
    return result;
  };
  return handle;
}

/** Fold a turn's session/update stream into the facts scenarios assert on. */
export function summarizeTurn(response, turnUpdates, turnPermissions, sessionId) {
  const own = turnUpdates.filter((u) => !sessionId || u.sessionId === sessionId);
  const text = own
    .filter((u) => u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text")
    .map((u) => u.content.text)
    .join("");
  const calls = new Map();
  for (const u of own) {
    if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") {
      calls.set(u.toolCallId, { ...(calls.get(u.toolCallId) ?? {}), ...u });
    }
  }
  return {
    stopReason: response?.stopReason,
    text,
    updates: own,
    toolCalls: [...calls.values()],
    permissions: turnPermissions,
  };
}

export const outputText = (call) => JSON.stringify(call?.rawOutput ?? call?.content ?? "");
export const toolNames = (turn) => turn.toolCalls.map((c) => c.title ?? "").filter(Boolean);

/** Run git in an agent's MemFS and return stdout ("" on failure). */
export function git(dir, ...args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

/** Accumulates named checks so a scenario can report each assertion separately. */
export class Checks {
  constructor() {
    this.list = [];
  }
  add(id, ok, detail = "") {
    this.list.push({ id, ok: Boolean(ok), detail: String(detail).slice(0, 600) });
    return Boolean(ok);
  }
}
