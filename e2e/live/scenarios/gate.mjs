// The gate: can this install complete one trivial model turn through ACP at all?
// Every other model-backed scenario is recorded as `blocked` (not silently passed or
// dropped) when it cannot, so a hung chain shows up as what it is.
import { freshHome, nonce } from "../lib.mjs";

async function gate(ctx) {
  const state = freshHome("gate");
  const word = nonce("GATE");
  const a = await ctx.launch({ name: "run", state, permissionMode: "unrestricted" });
  const init = await a.initialize();
  const session = await a.newSession();
  let detail;
  let ok = false;
  try {
    const turn = await a.prompt(session.sessionId, `Reply with exactly ${word} and nothing else.`, { timeoutMs: 90_000 });
    ok = turn.stopReason === "end_turn" && turn.text.includes(word);
    detail = `agentInfo ${JSON.stringify(init.agentInfo ?? null)}; stopReason=${turn.stopReason}; reply ${JSON.stringify(turn.text.slice(0, 80))}`;
  } catch (error) {
    detail = `agentInfo ${JSON.stringify(init.agentInfo ?? null)}; ${error.message}; stderr tail: ${a.stderr().slice(-300).replace(/\s+/g, " ")}`;
  }
  ctx.add("G01", ok, detail);
  await a.stop({ graceMs: 3000 });
}

export const gateScenarios = [{ name: "gate", declares: ["G01"], needsModel: true, run: gate, timeoutMs: 150_000 }];
