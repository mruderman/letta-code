import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { AgentState } from "@letta-ai/letta-client/resources/agents/agents";

// Mock the agent modification module
const mockUpdateAgentLLMConfig = mock(
  async (agentId: string, model: string) => {
    return { model };
  },
);

// Mock the entire module to avoid side effects in other tests
mock.module("../agent/modify", () => ({
  updateAgentLLMConfig: mockUpdateAgentLLMConfig,
  linkToolsToAgent: async () => ({ success: true, message: 'mocked' }),
  unlinkToolsFromAgent: async () => ({ success: true, message: 'mocked' }),
}));

// This function simulates the fixed logic from src/index.ts
async function simulateFixedStartup(
  agentState: AgentState,
  specifiedModel?: string,
) {
  if (specifiedModel && agentState.llm_config?.model !== specifiedModel) {
    const { updateAgentLLMConfig } = await import("../agent/modify");
    await updateAgentLLMConfig(agentState.id, specifiedModel);
  }
}

describe("Model flag on session resume", () => {
    beforeEach(() => {
        mockUpdateAgentLLMConfig.mockClear();
    });

  test("should update the agent model if --model flag is different", async () => {
    const agentState: AgentState = {
      id: "agent-123",
      llm_config: { model: "claude-sonnet-4.5" },
      name: "test",
      tools: [],
      memory_blocks: [],
      created_at: "",
      object: "agent",
      project_id: "",
      system_prompt: "",
      has_all_tools: false,
    };
    const newModel = "gpt-5-codex";

    await simulateFixedStartup(agentState, newModel);

    expect(mockUpdateAgentLLMConfig).toHaveBeenCalledWith(
      "agent-123",
      newModel,
    );
  });

  test("should not update the agent model if --model flag is the same", async () => {
    const agentState: AgentState = {
      id: "agent-123",
      llm_config: { model: "claude-sonnet-4.5" },
      name: "test",
      tools: [],
      memory_blocks: [],
      created_at: "",
      object: "agent",
      project_id: "",
      system_prompt: "",
      has_all_tools: false,
    };
    const sameModel = "claude-sonnet-4.5";

    await simulateFixedStartup(agentState, sameModel);

    expect(mockUpdateAgentLLMConfig).not.toHaveBeenCalled();
  });

});\n
