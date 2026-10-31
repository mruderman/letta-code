// Exercises both node-pty consumers through letta-code's real code, under Node:
//   1. shell-runner: startShellProcess({ tty: true }), which exec_command uses
//   2. terminal-handler: handleTerminalSpawn / handleTerminalInput, which the
//      websocket terminal uses (driven here with a recording socket instead of
//      a live app-server connection)
// Bundled from a letta-code checkout by 60-pty-smoke.sh; prints one JSON result.
import { startShellProcess } from "@/tools/impl/shell-runner";
import {
  handleTerminalInput,
  handleTerminalKill,
  handleTerminalSpawn,
} from "@/websocket/terminal-handler";

const shellOptions = { cwd: process.cwd(), env: process.env, timeoutMs: 10_000, tty: true };

async function shellRunner() {
  const probe = startShellProcess(["sh", "-c", "test -t 0 && echo PTY_OK || echo NO_PTY"], shellOptions);
  const probeResult = await probe.completion;
  const stdin = startShellProcess(["sh", "-c", "read x; echo got:$x"], shellOptions);
  stdin.process.write("hello\n");
  const stdinResult = await stdin.completion;
  return {
    effectiveTty: probe.tty,
    probe: probeResult,
    stdinEffectiveTty: stdin.tty,
    stdin: stdinResult,
  };
}

async function terminalHandler() {
  const messages: Record<string, unknown>[] = [];
  const socket = {
    readyState: 1, // WebSocket.OPEN
    send: (data: string) => messages.push(JSON.parse(data)),
  };
  const terminal_id = "e2e-terminal";
  handleTerminalSpawn({ terminal_id, cols: 80, rows: 24 }, socket as never, process.cwd());
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  await settle(1500);
  if (messages.some((m) => m.type === "terminal_spawned")) {
    handleTerminalInput({ terminal_id, data: "echo TERM_$((40+2))\r" });
    await settle(1500);
    handleTerminalKill({ terminal_id });
    await settle(300);
  }
  const output = messages
    .filter((m) => m.type === "terminal_output")
    .map((m) => String(m.data))
    .join("");
  return {
    spawned: messages.some((m) => m.type === "terminal_spawned"),
    exited: messages.find((m) => m.type === "terminal_exited") ?? null,
    // The shell must evaluate the arithmetic, so the echo of the typed input
    // alone cannot satisfy this check.
    evaluated: output.includes("TERM_42"),
    outputTail: output.slice(-300),
  };
}

const result = { shellRunner: await shellRunner(), terminalHandler: await terminalHandler() };
console.log(JSON.stringify(result));
process.exit(0);
