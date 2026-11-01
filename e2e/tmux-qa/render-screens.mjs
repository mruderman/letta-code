#!/usr/bin/env node
// Turn a run directory's screens/*.txt (raw tmux captures of Toad) into one readable SCREENS.md:
// each capture in its own fenced block, trailing blanks and Toad's empty sidebar rows removed.
//   node render-screens.mjs <run-dir> [more run dirs...]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
for (const dir of process.argv.slice(2)) {
  const shots = join(dir, "screens");
  if (!existsSync(shots)) continue;
  const out = [`# Screens: ${dir.split("/").slice(-2).join("/")}`, "", "Raw `tmux capture-pane` text of Toad, in the order taken. Empty sidebar rows are dropped.", ""];
  for (const f of readdirSync(shots).filter((x) => x.endsWith(".txt")).sort()) {
    const lines = readFileSync(join(shots, f), "utf8").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => !/^[ ▎]*$/.test(l));
    out.push(`## ${f.replace(/\.txt$/, "")}`, "", "```", ...lines, "```", "");
  }
  writeFileSync(join(dir, "SCREENS.md"), out.join("\n"));
}
