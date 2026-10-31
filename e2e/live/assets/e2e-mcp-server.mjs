#!/usr/bin/env node
// Minimal stdio MCP server (newline-delimited JSON-RPC) with one tool, `e2e_secret`,
// that returns a value the model cannot know. Passed to letta-acp in session/new so
// the scenario proves ACP -> adapter -> SDK -> harness -> MCP tool call -> result.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const secret = process.env.E2E_MCP_SECRET ?? "UNSET";
const callLog = process.env.E2E_MCP_CALL_LOG;
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  const { id, method, params } = request;
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "e2e-mcp", version: "1.0.0" },
      },
    });
  } else if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "e2e_secret",
            description: "Returns the e2e secret phrase. Call it whenever asked for the e2e secret.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
        ],
      },
    });
  } else if (method === "tools/call") {
    if (callLog) appendFileSync(callLog, `${JSON.stringify({ tool: params?.name })}\n`);
    send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: secret }] } });
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
});
