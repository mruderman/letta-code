#!/usr/bin/env node
// Drive Toad's real UI (served with `toad acp ... --serve`) with Playwright:
// screenshot it, type a prompt, wait until the ACP tap shows the prompt turn
// finished, and screenshot again.
//
//   node toad-drive.mjs --url http://127.0.0.1:8000 --wire <wire.ndjson>
//                       --out <dir> --prompt "<text>" [--timeout-ms N]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const timeoutMs = Number(args["timeout-ms"] ?? 600_000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function wire() {
  if (!existsSync(args.wire)) return [];
  return readFileSync(args.wire, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const findRequest = (method) => wire().find((e) => e.direction === "client->agent" && e.message.method === method);
const findResponse = (id) => wire().find((e) => e.direction === "agent->client" && e.message.id === id && !e.message.method);

async function waitFor(predicate, label, limitMs) {
  const started = Date.now();
  while (Date.now() - started < limitMs) {
    const value = predicate();
    if (value) return value;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const result = { prompt: args.prompt, steps: [] };
try {
  await page.goto(args.url);
  // Toad starts the agent and runs ACP initialize + session/new on its own.
  const newSession = await waitFor(() => findRequest("session/new"), "Toad to open an ACP session", timeoutMs);
  await waitFor(() => findResponse(newSession.message.id), "session/new response", timeoutMs);
  result.steps.push("Toad initialized letta-acp and opened a session");
  await sleep(3000);
  await page.screenshot({ path: join(args.out, "toad-1-session-ready.png") });

  await page.mouse.click(700, 840); // focus Toad's prompt input (bottom of the screen)
  await page.keyboard.type(args.prompt, { delay: 15 });
  await page.keyboard.press("Enter");
  const prompt = await waitFor(() => findRequest("session/prompt"), "Toad to send session/prompt", 60_000);
  result.steps.push("Toad sent the typed prompt as session/prompt");
  if (args.permission) {
    // A real permission dialog: the agent asks, Toad's own UI shows it, we press the key that
    // accepts the highlighted option, and the wire must show Toad answering with a selection.
    const ask = await waitFor(() => wire().find((e) => e.direction === "agent->client" && e.message.method === "session/request_permission"), "the agent's permission request", 180_000);
    result.permissionRequest = { title: ask.message.params?.toolCall?.title, options: ask.message.params?.options?.map((o) => `${o.kind}:${o.optionId}`) };
    await sleep(2500);
    await page.screenshot({ path: join(args.out, "toad-3-permission-dialog.png") });
    await page.keyboard.press(args["permission-key"] ?? "Enter");
    const answer = await waitFor(() => wire().find((e) => e.direction === "client->agent" && e.message.id === ask.message.id && !e.message.method), "Toad to answer the permission request", 60_000);
    result.permissionAnswer = answer.message.result ?? answer.message.error;
    result.steps.push(`Toad answered the permission dialog: ${JSON.stringify(result.permissionAnswer)}`);
  }
  const done = await waitFor(() => findResponse(prompt.message.id), "the prompt turn to finish", timeoutMs);
  result.stopReason = done.message.result?.stopReason ?? null;
  result.error = done.message.error ?? null;
  result.steps.push(`prompt turn finished: ${JSON.stringify(done.message.result ?? done.message.error)}`);
  await sleep(3000);
  await page.screenshot({ path: join(args.out, "toad-2-turn-finished.png") });
  result.passed = result.stopReason === "end_turn" && (!args.permission || result.permissionAnswer?.outcome?.outcome === "selected");
} catch (error) {
  result.passed = false;
  result.error = String(error);
  await page.screenshot({ path: join(args.out, "toad-error.png") }).catch(() => {});
} finally {
  await browser.close();
}
writeFileSync(join(args.out, "toad-drive.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
