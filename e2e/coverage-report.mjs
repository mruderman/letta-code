#!/usr/bin/env node
// Folds every results file into the four coverage metrics, against the fixed denominators in
// checks.json. Anything missing counts as NOT RUN. Usage:
//   node coverage-report.mjs --live lock-pinned=<dir> --live published=<dir> --live node-pty-fix=<dir> \
//        --registry <dir> --platform <dir> --clients <dir> [--out COVERAGE-RESULTS.md] [--acp-version 0.1.11]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, "checks.json"), "utf8"));
const args = process.argv.slice(2);
const live = {};
let registryDir, platformDir, clientsDir, out = join(here, "COVERAGE-RESULTS.md"), acpVersion = "0.1.11";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--live") { const [n, d] = args[++i].split("="); live[n] = d; }
  else if (args[i] === "--registry") registryDir = args[++i];
  else if (args[i] === "--platform") platformDir = args[++i];
  else if (args[i] === "--clients") clientsDir = args[++i];
  else if (args[i] === "--out") out = args[++i];
  else if (args[i] === "--acp-version") acpVersion = args[++i];
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
const names = { A: "A. Letta-differentiator coverage (headline)", B: "B. Registry-gate coverage", D: "D. Generic ACP + client coverage" };
const summary = {};
const chainLabel = { published: "published, as listed (what `npx` gives a registry user)", "lock-pinned": "lock-pinned (adapter logic with dependency pins users do not get)", "node-pty-fix": "node-pty-fix (unreleased)" };
const perChain = {};
for (const m of ["A", "B", "D"]) {
  const r = metric(m);
  summary[m] = { passing: r.covered.length, failing: r.failing.length, notRun: r.notRun.length, notCovered: r.nc.length, total: r.items.length };
  const items = r.items.filter((c) => c.source !== "not_covered");
  perChain[m] = {};
  for (const ch of chains) {
    const row = { pass: 0, fail: 0, blocked: 0, error: 0, notRun: 0 };
    for (const c of items) { const st = status[c.id]?.[ch]?.status; if (st === "pass") row.pass++; else if (st === "fail") row.fail++; else if (st === "blocked") row.blocked++; else if (st) row.error++; else row.notRun++; }
    row.of = items.length;
    perChain[m][ch] = row;
  }
}
// Metric C, needed for the headline table
const platforms = spec.platforms;
const pcells = [];
for (const p of platforms) for (const col of spec.columns) {
  const r = readJson(join(platformDir ?? "/nonexistent", `${p.id}.${col}.json`));
  pcells.push({ id: p.id, column: col, how: p.how, status: r?.status ?? "not run", level: r?.level ?? "-", detail: r?.detail ?? "" });
}
const cpass = pcells.filter((c) => c.status === "pass").length;
summary.C = { passing: cpass, failing: pcells.filter((c) => c.status === "fail").length, notRun: pcells.filter((c) => c.status === "not run").length, total: pcells.length };
summary.C.passingWithModelTurn = pcells.filter((c) => c.status === "pass" && c.level === "live model turn").length;
const cell1 = (m, ch) => { const r = perChain[m][ch]; const bits = [`**${r.pass} of ${r.of}** pass`]; if (r.fail) bits.push(`${r.fail} fail`); if (r.blocked) bits.push(`${r.blocked} blocked (no turn completes)`); if (r.error) bits.push(`${r.error} error`); if (r.notRun === r.of) return "not run"; if (r.notRun) bits.push(`${r.notRun} not run`); return bits.join(", "); };
const ccell = (ch) => { const cs = pcells.filter((c) => c.column === ch); const n = cs.filter((c) => c.status === "pass").length; const t = cs.filter((c) => c.status === "pass" && c.level === "live model turn").length; const nr = cs.filter((c) => c.status === "not run").length; return `**${n} of ${cs.length}** pass (${t} with a live model turn; the rest stop at initialize + session/new)${nr ? `, ${nr} not run` : ""}`; };
lines.push("## Headline: the entry as listed, then the other install chains", "",
  `Read the **published** column first. It is what \`npx @letta-ai/letta-acp@${acpVersion}\` resolves today, and so what a registry user gets. The other columns say where the failures come from; they are not what the listing delivers.`, "",
  `| Metric | ${chains.map((ch) => chainLabel[ch]).join(" | ")} |`, `|---|${chains.map(() => "---").join("|")}|`);
for (const m of ["A", "B", "D"]) lines.push(`| ${names[m]} | ${chains.map((ch) => cell1(m, ch)).join(" | ")} |`);
lines.push(`| C. Platform/install matrix (${platforms.length} cells per column) | ${chains.map(ccell).join(" | ")} |`, "");
const cText = acpVersion === "0.1.11"
  ? "In C the published and lock-pinned columns pass only where a C toolchain is present (macOS, Windows, glibc arm64 in CI); on the stock images without `make` they fail to install."
  : `In C the published column passes on ${pcells.filter((c) => c.column === "published" && c.status === "pass").map((c) => c.id).join(", ") || "no cell"} (CI runners with a C toolchain), fails on ${pcells.filter((c) => c.column === "published" && c.status === "fail").map((c) => c.id).join(", ") || "no cell"} (stock images without \`make\`, where node-pty has to be compiled; the x64 glibc cells pass on CI runners that have make, see the details), and was not run on ${pcells.filter((c) => c.column === "published" && c.status === "not run").map((c) => c.id).join(", ") || "no cell"}.`;
lines.push(`Denominators exclude the checks listed as *not covered*; those are named in \`COVERAGE.md\`. ${cText} B's node-pty-fix column is empty on purpose: the one earlier fix-chain registry result ran against a different entry (see the README) and is not counted.`, "");
lines.push("### Any-chain aggregate (for reference only)", "", `A check counts here if it passed on **at least one** chain. That is more generous than anything a registry user gets${acpVersion === "0.1.11" ? ", because every A and D pass in it comes from the lock-pinned chain" : ""}. Do not quote this table on its own.`, "", "| Metric | Passing | Failing | Not run | Not covered (by design) | Denominator |", "|---|---|---|---|---|---|");
for (const m of ["A", "B", "D"]) { const x = summary[m]; lines.push(`| ${names[m].replace(" (headline)", "")} | ${x.passing} | ${x.failing} | ${x.notRun} | ${x.notCovered} | ${x.total} |`); }
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
