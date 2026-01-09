// src/ralph/cli.ts
// Ralph Wiggum mode CLI handler - iterative development loop from command line

import type {
  AgentState,
  MessageCreate,
} from "@letta-ai/letta-client/resources/agents/agents";
import type { ApprovalCreate } from "@letta-ai/letta-client/resources/agents/messages";
import type { ApprovalResult } from "../agent/approval-execution";
import { getClient } from "../agent/client";
import { initializeLoadedSkillsFlag, setAgentContext } from "../agent/context";
import { createAgent } from "../agent/create";
import { sendMessageStream } from "../agent/message";
import { getModelUpdateArgs } from "../agent/model";
import { createBuffers, type Line, toLines } from "../cli/helpers/accumulator";
import { drainStreamWithResume } from "../cli/helpers/stream";
import { settingsManager } from "../settings-manager";
import { checkToolPermission } from "../tools/manager";
import { ralphMode } from "./mode";

// Build Ralph first-turn reminder (when activating)
// Matches format from src/cli/App.tsx
function buildRalphFirstTurnReminder(
  state: ReturnType<typeof ralphMode.getState>,
): string {
  const iterInfo =
    state.maxIterations > 0
      ? `${state.currentIteration}/${state.maxIterations}`
      : `${state.currentIteration}`;

  let reminder = `<system-reminder>
🔄 Ralph Wiggum mode activated (iteration ${iterInfo})
`;

  if (state.completionPromise) {
    reminder += `
═══════════════════════════════════════════════════════════
RALPH LOOP COMPLETION PROMISE
═══════════════════════════════════════════════════════════

To complete this loop, output this EXACT text:
  <promise>${state.completionPromise}</promise>

STRICT REQUIREMENTS (DO NOT VIOLATE):
  ✓ Use <promise> XML tags EXACTLY as shown above
  ✓ The statement MUST be completely and unequivocally TRUE
  ✓ Do NOT output false statements to exit the loop
  ✓ Do NOT lie even if you think you should exit

IMPORTANT - Do not circumvent the loop:
  Even if you believe you're stuck, the task is impossible,
  or you've been running too long - you MUST NOT output a
  false promise statement. The loop is designed to continue
  until the promise is GENUINELY TRUE. Trust the process.

  If the loop should stop, the promise statement will become
  true naturally. Do not force it by lying.
═══════════════════════════════════════════════════════════
`;
  } else {
    reminder += `
No completion promise set - loop runs until --max-iterations or interrupted.
`;
  }

  reminder += `</system-reminder>`;
  return reminder;
}

// Build Ralph continuation reminder (on subsequent iterations)
// Matches format from src/cli/App.tsx
function buildRalphContinuationReminder(
  state: ReturnType<typeof ralphMode.getState>,
): string {
  const iterInfo =
    state.maxIterations > 0
      ? `${state.currentIteration}/${state.maxIterations}`
      : `${state.currentIteration}`;

  const reminder = `<system-reminder>
🔄 Ralph Wiggum mode continuation (iteration ${iterInfo})

The previous work is preserved in files and git history.
Continue where you left off, building on what you've already done.
</system-reminder>`;

  return reminder;
}

/**
 * Handle Ralph mode command - iterative development loop from CLI
 * @returns Exit code: 0=completion matched, 1=max iterations reached, 2=error
 */
export async function handleRalphCommand(
  prompt: string,
  completionPromise: string | null | undefined,
  maxIterations: number,
  isYolo: boolean,
  model?: string,
  skillsDirectory?: string,
): Promise<number> {
  const settings = settingsManager.getSettings();

  // Activate Ralph mode
  ralphMode.activate(prompt, completionPromise, maxIterations, isYolo);
  const ralphState = ralphMode.getState();

  // Show activation message
  const promiseDisplay = ralphState.completionPromise
    ? `"${ralphState.completionPromise.slice(0, 50)}${ralphState.completionPromise.length > 50 ? "..." : ""}"`
    : "(none)";
  console.error(
    `🔄 ${isYolo ? "yolo-ralph" : "ralph"} mode started (iter 1/${maxIterations || "∞"})`,
  );
  console.error(`Promise: ${promiseDisplay}`);
  console.error();

  const client = await getClient();

  // Create or resume agent (similar logic to headless.ts)
  let agent: AgentState | null = null;
  const updateArgs = getModelUpdateArgs(model);
  const createOptions = {
    model,
    updateArgs,
    skillsDirectory,
    parallelToolCalls: true,
    enableSleeptime: settings.enableSleeptime,
    systemPromptPreset: undefined,
  };

  // Try to resume from project settings first
  await settingsManager.loadLocalProjectSettings();
  const localProjectSettings = settingsManager.getLocalProjectSettings();
  if (localProjectSettings?.lastAgent) {
    try {
      agent = await client.agents.retrieve(localProjectSettings.lastAgent);
    } catch {
      // Agent not found, will create new
    }
  }

  // Create new agent if couldn't resume
  if (!agent) {
    const result = await createAgent(createOptions);
    agent = result.agent;
  }

  // Save agent ID to both project and global settings
  await settingsManager.loadLocalProjectSettings();
  settingsManager.updateLocalProjectSettings({ lastAgent: agent.id });
  settingsManager.updateSettings({ lastAgent: agent.id });

  // Set agent context for tools that need it
  setAgentContext(agent.id, skillsDirectory);
  await initializeLoadedSkillsFlag();

  // Update skills in agent (same as headless.ts)
  try {
    const { discoverSkills, formatSkillsForMemory, SKILLS_DIR } = await import(
      "../agent/skills"
    );
    const { join } = await import("node:path");

    const resolvedSkillsDirectory =
      skillsDirectory || join(process.cwd(), SKILLS_DIR);
    const { skills, errors } = await discoverSkills(resolvedSkillsDirectory);

    if (errors.length > 0) {
      console.warn("Errors encountered during skill discovery:");
      for (const error of errors) {
        console.warn(`  ${error.path}: ${error.message}`);
      }
    }

    const formattedSkills = formatSkillsForMemory(
      skills,
      resolvedSkillsDirectory,
    );
    await client.agents.blocks.update("skills", {
      agent_id: agent.id,
      value: formattedSkills,
    });
  } catch (error) {
    console.warn(
      `Failed to update skills: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Clear any pending approvals (same as headless.ts)
  const { getResumeData } = await import("../agent/check-approval");
  while (true) {
    const freshAgent = await client.agents.retrieve(agent.id);
    const resume = await getResumeData(client, freshAgent);
    const pendingApprovals = resume.pendingApprovals || [];
    if (pendingApprovals.length === 0) break;

    // Auto-deny all pending approvals in Ralph mode
    const { executeApprovalBatch } = await import(
      "../agent/approval-execution"
    );
    const decisions = pendingApprovals.map((approval) => ({
      type: "deny" as const,
      approval,
      reason: "Tool requires approval (Ralph CLI mode)",
    }));

    const executedResults = await executeApprovalBatch(decisions);

    // Send denial to clear pending state
    const approvalInput: ApprovalCreate = {
      type: "approval",
      approvals: executedResults as ApprovalResult[],
    };

    const approvalStream = await sendMessageStream(agent.id, [approvalInput]);
    await drainStreamWithResume(approvalStream, createBuffers(), () => {});
  }

  // Build initial message with Ralph reminder
  const systemMsg = buildRalphFirstTurnReminder(ralphState);
  const messageContent = `${systemMsg}\n\n${prompt}`;

  // Main Ralph loop
  let currentInput: Array<MessageCreate | ApprovalCreate> = [
    {
      role: "user",
      content: [{ type: "text", text: messageContent }],
    },
  ];

  while (ralphMode.shouldContinue()) {
    const buffers = createBuffers();
    const stream = await sendMessageStream(agent.id, currentInput);

    // Process stream
    const result = await drainStreamWithResume(stream, buffers, () => {});

    // Extract last assistant message to check for promise
    const lines = toLines(buffers);
    const reversed = [...lines].reverse();

    const lastAssistant = reversed.find(
      (line): line is Extract<Line, { kind: "assistant" }> =>
        line.kind === "assistant" &&
        "text" in line &&
        typeof line.text === "string" &&
        line.text.trim().length > 0,
    );

    // Check if promise was found
    if (lastAssistant) {
      const assistantText = lastAssistant.text;
      if (ralphMode.checkForPromise(assistantText)) {
        console.error();
        console.error("✅ Completion promise matched - exiting successfully");
        return 0;
      }
    }

    // Check stop reason
    if (result.stopReason === "requires_approval") {
      const approvals = result.approvals || [];
      if (approvals.length === 0) {
        console.error("Unexpected empty approvals array");
        return 2;
      }

      // Process approvals (auto-approve allowed tools, auto-deny others)
      const { safeJsonParseOr } = await import("../cli/helpers/safeJsonParse");
      type Decision =
        | {
            type: "approve";
            approval: {
              toolCallId: string;
              toolName: string;
              toolArgs: string;
            };
          }
        | {
            type: "deny";
            approval: {
              toolCallId: string;
              toolName: string;
              toolArgs: string;
            };
            reason: string;
          };

      const decisions: Decision[] = [];

      for (const currentApproval of approvals) {
        const { toolName, toolArgs } = currentApproval;
        const parsedArgs = safeJsonParseOr<Record<string, unknown>>(
          toolArgs,
          {},
        );
        const permission = await checkToolPermission(toolName, parsedArgs);

        if (permission.decision === "deny" || permission.decision === "ask") {
          const denyReason =
            permission.decision === "ask"
              ? "Tool requires approval (Ralph CLI mode)"
              : `Permission denied: ${permission.matchedRule || permission.reason}`;
          decisions.push({
            type: "deny",
            approval: currentApproval,
            reason: denyReason,
          });
          continue;
        }

        // Verify required args
        const { getToolSchema } = await import("../tools/manager");
        const schema = getToolSchema(toolName);
        const required =
          (schema?.input_schema?.required as string[] | undefined) || [];
        const missing = required.filter(
          (key) => !(key in parsedArgs) || parsedArgs[key] == null,
        );
        if (missing.length > 0) {
          decisions.push({
            type: "deny",
            approval: currentApproval,
            reason: `Missing required parameter${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
          });
          continue;
        }

        // Approve
        decisions.push({
          type: "approve",
          approval: currentApproval,
        });
      }

      // Execute approved tools
      const { executeApprovalBatch } = await import(
        "../agent/approval-execution"
      );
      const executedResults = await executeApprovalBatch(decisions);

      // Continue with approval results
      currentInput = [
        {
          type: "approval",
          approvals: executedResults,
        },
      ];
      continue;
    }

    // Handle other stop reasons (error, llm_api_error, etc.)
    if (result.stopReason !== "end_turn") {
      const errorLines = lines.filter((line) => line.kind === "error");
      const errorMessages = errorLines
        .map((line) => ("text" in line ? line.text : ""))
        .filter(Boolean);

      const errorMessage =
        errorMessages.length > 0
          ? errorMessages.join("; ")
          : `Unexpected stop reason: ${result.stopReason}`;

      console.error();
      console.error(`❌ Error: ${errorMessage}`);
      return 2;
    }

    // Increment iteration and continue
    ralphMode.incrementIteration();
    const newState = ralphMode.getState();
    const iterInfo =
      newState.maxIterations > 0
        ? `${newState.currentIteration}/${newState.maxIterations}`
        : `${newState.currentIteration}`;

    console.error();
    console.error(`🔄 Iteration ${iterInfo}...`);

    // Build continuation message
    const continuationReminder = buildRalphContinuationReminder(newState);
    currentInput = [
      {
        role: "user",
        content: [
          { type: "text", text: `${continuationReminder}\n\n${prompt}` },
        ],
      },
    ];
  }

  // Max iterations reached
  console.error();
  console.error(`⚠️  Max iterations (${maxIterations}) reached`);
  return 1;
}
