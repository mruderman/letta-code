#!/usr/bin/env node
// Runner for the live scenario suite.
//
//   node run.mjs --chain lock-pinned --agent-cmd "/path/to/letta-acp" --out ../logs/live/lock-pinned
//   node run.mjs --chain published --agent-cmd "npx -y @letta-ai/letta-acp@0.1.11" --only gate
//   node run.mjs --list
//
// Each scenario declares the check ids it can produce. A declared check that a scenario
// never reports (because it threw or timed out) is recorded as `error`, never silently
// dropped, so the denominators in the coverage report stay fixed. Checks that need a model
// turn are recorded as `blocked` when the gate scenario shows the chain cannot complete one.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch } from "./lib.mjs";
import { scenarios } from "./scenarios/index.mjs";

function parseArgs(argv) {
  const args = { chain: "unnamed", jobs: 1, only: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--chain") args.chain = argv[++i];
    else if (flag === "--agent-cmd") args.agentCmd = argv[++i];
    else if (flag === "--out") args.out = argv[++i];
    else if (flag === "--only") args.only = argv[++i].split(",");
    else if (flag === "--jobs") args.jobs = Number(argv[++i]);
    else if (flag === "--list") args.list = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.list) {
  for (const s of scenarios) console.log(`${s.name.padEnd(24)} ${s.declares.join(" ")}${s.needsModel ? "  [model]" : ""}`);
  process.exit(0);
}
const agentCmd = args.agentCmd ?? process.env.LETTA_ACP_CMD;
if (!agentCmd) throw new Error("--agent-cmd or LETTA_ACP_CMD is required");
const outRoot = resolve(args.out ?? `./results/${args.chain}`);
mkdirSync(outRoot, { recursive: true });

const results = [];
let modelGate = { passed: null, detail: "gate not run" };

function record(scenario, id, status, detail, level) {
  results.push({ id, scenario: scenario.name, status, level: level ?? scenario.level ?? "real ACP client", detail: String(detail).slice(0, 700) });
}

async function runScenario(scenario) {
  const started = Date.now();
  const handles = [];
  const seen = new Set();
  const outDir = join(outRoot, scenario.name);
  mkdirSync(outDir, { recursive: true });
  const ctx = {
    outDir,
    chain: args.chain,
    agentCmd,
    async launch(opts) {
      const handle = await launch({ agentCmd, outDir, ...opts });
      handles.push(handle);
      return handle;
    },
    add(id, ok, detail = "", level) {
      if (!scenario.declares.includes(id)) throw new Error(`${scenario.name} reported undeclared check ${id}`);
      seen.add(id);
      record(scenario, id, ok ? "pass" : "fail", detail, level ?? (scenario.needsModel ? "live model turn" : undefined));
    },
    skip(id, detail, level) {
      seen.add(id);
      record(scenario, id, "skipped", detail, level);
    },
  };
  if (scenario.needsModel && modelGate.passed === false && scenario.name !== "gate") {
    for (const id of scenario.declares) record(scenario, id, "blocked", `model gate failed on this chain: ${modelGate.detail}`, "live model turn");
    console.log(`[${scenario.name}] blocked by model gate`);
    return;
  }
  let error;
  try {
    await Promise.race([
      scenario.run(ctx),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`scenario timed out after ${scenario.timeoutMs ?? 900_000}ms`)), scenario.timeoutMs ?? 900_000)),
    ]);
  } catch (caught) {
    error = caught;
  }
  for (const handle of handles) {
    try {
      await handle.stop({ graceMs: 3000 });
    } catch {
      /* already gone */
    }
  }
  for (const id of scenario.declares) {
    if (!seen.has(id)) record(scenario, id, "error", error ? `${error.message}` : "scenario finished without reporting this check", scenario.needsModel ? "live model turn" : undefined);
  }
  const mine = results.filter((r) => r.scenario === scenario.name);
  console.log(`[${scenario.name}] ${mine.map((r) => `${r.id}=${r.status}`).join(" ")}  (${Math.round((Date.now() - started) / 1000)}s)${error ? `  ERROR: ${error.message}` : ""}`);
  if (scenario.name === "gate") {
    const gate = results.find((r) => r.id === "G01");
    modelGate = { passed: gate?.status === "pass", detail: gate?.detail ?? "no result" };
  }
}

const selected = scenarios.filter((s) => !args.only || args.only.includes(s.name));
const gate = selected.find((s) => s.name === "gate") ?? scenarios.find((s) => s.name === "gate");
if (gate && !args.only?.every((n) => n === "gate") && !selected.includes(gate)) selected.unshift(gate);
const ordered = [...selected.filter((s) => s.name === "gate"), ...selected.filter((s) => s.name !== "gate")];

// The gate always runs first and alone; the rest can run in parallel (each has its own state dir).
const queue = ordered.filter((s) => s.name !== "gate");
if (ordered[0]?.name === "gate") await runScenario(ordered[0]);
const workers = Array.from({ length: Math.max(1, args.jobs) }, async () => {
  while (queue.length) await runScenario(queue.shift());
});
await Promise.all(workers);

const summary = {
  chain: args.chain,
  agentCmd,
  finishedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  counts: results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}),
  checks: results.sort((a, b) => a.id.localeCompare(b.id)),
};
writeFileSync(join(outRoot, "results.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\n${args.chain}: ${JSON.stringify(summary.counts)} -> ${join(outRoot, "results.json")}`);
process.exit(0);
