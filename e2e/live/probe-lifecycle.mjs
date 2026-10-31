// Characterises the fast-follow-up race: send prompt N+1 `delay` ms after prompt N's end_turn and
// check that each reply arrives in its own turn. Fresh adapter per delay.
import { freshHome, launch, sleep, nonce } from "./lib.mjs";
const outDir = process.env.OUT ?? "/tmp/e2e-work/probe5-out";
const delays = (process.env.DELAYS ?? "0,25,50,100,250,500,1000").split(",").map(Number);
for (const delay of delays) {
  const state = freshHome("lifecycle");
  const a = await launch({ name: `d${delay}`, state, outDir, permissionMode: "unrestricted", agentCmd: process.env.LETTA_ACP_CMD });
  await a.initialize();
  const s = await a.newSession();
  const words = [nonce("W"), nonce("W"), nonce("W")];
  const got = [];
  for (const w of words) {
    const t = await a.prompt(s.sessionId, `Reply with exactly ${w}`, { timeoutMs: 90000 });
    got.push(t.text);
    await sleep(delay);
  }
  const ok = got.every((text, i) => text.trim() === words[i]);
  console.log(`delay ${String(delay).padStart(4)}ms  ${ok ? "OK      " : "DESYNCED"}  ${JSON.stringify(got.map((g, i) => (g.trim() === words[i] ? "=" : g.slice(0, 12) || "(empty)")))}`);
  await a.stop({ graceMs: 3000 });
}
