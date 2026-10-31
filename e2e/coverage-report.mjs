#!/usr/bin/env node
// Folds every results file into the four coverage metrics, against the fixed denominators in
// checks.json. Anything missing counts as NOT RUN. Usage:
//   node coverage-report.mjs --live lock-pinned=<dir> --live published=<dir> --live node-pty-fix=<dir> \
//        --registry <dir> --platform <dir> --clients <dir> [--out COVERAGE-RESULTS.md]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, "checks.json"), "utf8"));
const args = process.argv.slice(2);
const live = {};
let registryDir, platformDir, clientsDir, out = join(here, "COVERAGE-RESULTS.md");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--live") { const [n, d] = args[++i].split("="); live[n] = d; }
  else if (args[i] === "--registry") registryDir = args[++i];
  else if (args[i] === "--platform") platformDir = args[++i];
  else if (args[i] === "--clients") clientsDir = args[++i];
  else if (args[i] === "--out") out = args[++i];
}
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

// Status per (check, chain). Live chains first.
const status = {}; // id -> chain -> {status, level, detail}
for (const [chain, dir] of Object.entries(live)) {
  const r = readJson(join(dir, "results.json"));
  for (const c of r?.checks ?? []) (status[c.id] ??= {})[chain] = c;
}
if (registryDir) {
  const lines = existsSync(join(registryDir, "summary.txt")) ? readFileSync(join(registryDir, "summary.txt"), "utf8").trim().split("\n") : [];
  for (const line of lines) {
    const m = line.match(/^(R\d)-\S+ exit=(\d+)/);
    if (m) (status[m[1]] ??= {}).published = { status: m[2] === "0" ? "pass" : "fail", level: m[1] === "R7" ? "live model turn" : "real registry script", detail: line };
  }
  const fixSummary = readJson(join(registryDir, "fix-column.json"));
  for (const [id, v] of Object.entries(fixSummary ?? {})) (status[id] ??= {})["node-pty-fix"] = v;
}
if (clientsDir) {
  const r = readJson(join(clientsDir, "results.json"));
  for (const c of r?.checks ?? []) (status[c.id] ??= {})[c.chain ?? "lock-pinned"] = c;
}

const chains = ["published", "lock-pinned", "node-pty-fix"];
const best = (id) => {
  // A check is "covered" when at least one chain passed it; the per-chain table shows where.
  const s = status[id] ?? {};
  return Object.values(s).some((c) => c.status === "pass");
};
const metric = (m) => {
  const items = spec.checks.filter((c) => c.metric === m);
  const covered = items.filter((c) => c.source !== "not_covered" && best(c.id));
  const failing = items.filter((c) => c.source !== "not_covered" && !best(c.id) && Object.keys(status[c.id] ?? {}).length);
  const notRun = items.filter((c) => c.source !== "not_covered" && !Object.keys(status[c.id] ?? {}).length);
  const nc = items.filter((c) => c.source === "not_covered");
  return { items, covered, failing, notRun, nc };
};

const cell = (id, chain) => {
  const c = status[id]?.[chain];
  return c ? ({ pass: "PASS", fail: "FAIL", blocked: "blocked", error: "ERROR", skipped: "skip" }[c.status] ?? c.status) : "·";
};
const lines = [];
lines.push("# Coverage results", "", `Generated ${new Date().toISOString()} from the results files named on the command line. \`·\` = not run on that chain.`, "");
lines.push("## The four metrics, side by side", "", "| Metric | Passing | Failing | Not run | Not covered (by design) | Denominator |", "|---|---|---|---|---|---|");
const names = { A: "A. Letta-differentiator coverage (headline)", B: "B. Registry-gate coverage", D: "D. Generic ACP + client coverage" };
const summary = {};
for (const m of ["A", "B", "D"]) {
  const r = metric(m);
  summary[m] = { passing: r.covered.length, failing: r.failing.length, notRun: r.notRun.length, notCovered: r.nc.length, total: r.items.length };
  lines.push(`| ${names[m]} | ${r.covered.length} | ${r.failing.length} | ${r.notRun.length} | ${r.nc.length} | ${r.items.length} |`);
}
// Metric C
const platforms = spec.platforms;
const pcells = [];
for (const p of platforms) for (const col of spec.columns) {
  const r = readJson(join(platformDir ?? "/nonexistent", `${p.id}.${col}.json`));
  pcells.push({ id: p.id, column: col, how: p.how, status: r?.status ?? "not run", level: r?.level ?? "-", detail: r?.detail ?? "" });
}
const cpass = pcells.filter((c) => c.status === "pass").length;
summary.C = { passing: cpass, failing: pcells.filter((c) => c.status === "fail").length, notRun: pcells.filter((c) => c.status === "not run").length, total: pcells.length };
const cturn = pcells.filter((c) => c.status === "pass" && c.level === "live model turn").length;
summary.C.passingWithModelTurn = cturn;
lines.push(`| C. Platform/install matrix (cell × column; ${cturn} of the passing cells include a live model turn, the rest stop at initialize + session/new) | ${cpass} | ${summary.C.failing} | ${summary.C.notRun} | 0 | ${pcells.length} |`, "");
lines.push("A check counts as passing if it passed on at least one chain; the per-chain tables below show where. Failures are findings, not hidden.", "");
// Per-chain view of the same metrics, so "passed on at least one chain" cannot hide that the entry as listed passes nothing that needs a model.
lines.push("### The same metrics, one install chain at a time", "", `| Metric | ${chains.join(" | ")} |`, `|---|${chains.map(() => "---").join("|")}|`);
for (const m of ["A", "B", "D"]) {
  const items = spec.checks.filter((c) => c.metric === m && c.source !== "not_covered");
  const per = chains.map((ch) => {
    const n = items.filter((c) => status[c.id]?.[ch]?.status === "pass").length;
    const blocked = items.filter((c) => status[c.id]?.[ch]?.status === "blocked").length;
    const ran = items.filter((c) => status[c.id]?.[ch]).length;
    return ran ? `${n} of ${items.length} pass${blocked ? ` (${blocked} blocked at the model gate)` : ""}` : "not run";
  });
  lines.push(`| ${names[m].replace(" (headline)", "")} | ${per.join(" | ")} |`);
}
lines.push("");

for (const m of ["A", "D", "B"]) {
  lines.push(`## ${names[m]}`, "", `| Check | What | ${chains.join(" | ")} | Level reached |`, `|---|---|${chains.map(() => "---").join("|")}|---|`);
  for (const c of spec.checks.filter((x) => x.metric === m)) {
    if (c.source === "not_covered") { lines.push(`| ${c.id} | ${c.title} | not covered | not covered | not covered | ${c.why} |`); continue; }
    const levels = [...new Set(Object.values(status[c.id] ?? {}).filter((x) => x.status === "pass").map((x) => x.level))];
    lines.push(`| ${c.id} | ${c.title} | ${chains.map((ch) => cell(c.id, ch)).join(" | ")} | ${levels.join(", ") || "-"} |`);
  }
  lines.push("");
}
lines.push("## C. Platform/install matrix", "", "| Cell | Column | How | Result | Level | Detail |", "|---|---|---|---|---|---|");
for (const c of pcells) lines.push(`| ${c.id} | ${c.column} | ${c.how} | ${c.status} | ${c.level} | ${String(c.detail).slice(0, 140)} |`);
lines.push("", "## Failure details", "");
const blockedByChain = {}; const blockedDetail = {};
for (const c of spec.checks) for (const ch of chains) {
  const s = status[c.id]?.[ch];
  if (s && s.status === "blocked") { blockedByChain[ch] = (blockedByChain[ch] ?? 0) + 1; blockedDetail[ch] ??= String(s.detail); continue; }
  if (s && s.status !== "pass") lines.push(`- **${c.id}** (${ch}, ${s.status}): ${String(s.detail).replace(/\n/g, " ").slice(0, 420)}`);
}
for (const [ch, n] of Object.entries(blockedByChain)) lines.push(`- **${n} checks blocked on ${ch}**: ${blockedDetail[ch].replace(/\n/g, " ").slice(0, 420)}`);
writeFileSync(out, `${lines.join("\n")}\n`);
writeFileSync(out.replace(/\.md$/, ".json"), `${JSON.stringify({ summary, platformCells: pcells }, null, 1)}\n`);
console.log(JSON.stringify(summary));
