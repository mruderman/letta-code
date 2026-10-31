// Prints one RESULT_JSON line from platform-smoke's result.json, for CI logs (the fork has no artifact
// download path from this environment, so the job log is the record).  usage: emit-result.mjs <result.json> <cell> <column>
import { readFileSync } from "node:fs";
const [file, cell, column] = process.argv.slice(2);
const r = JSON.parse(readFileSync(file, "utf8"));
const ok = (x) => (x?.ok ? "ok" : "FAIL");
console.log(`RESULT_JSON:${JSON.stringify({ cell, column, status: r.status, level: r.level, detail: `${r.node} ${r.platform} ${r.libc}; initialize=${ok(r.initialize)} session/new=${ok(r.sessionNew)}; node-pty loads=${r.nodePty?.loads} ${r.nodePty?.error ?? ""} ${r.error ?? ""}`.trim() })}`);
