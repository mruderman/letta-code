import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_COMPLETION_PROMISE,
  ralphMode,
  type RalphState,
} from "../ralph/mode";

// Clean up after each test
afterEach(() => {
  ralphMode.deactivate();
});

// ============================================================================
// Ralph Mode: Basic Activation/Deactivation
// ============================================================================

describe("Ralph Mode - Basic Operations", () => {
  test("default state is inactive", () => {
    const state = ralphMode.getState();
    expect(state.isActive).toBe(false);
    expect(state.isYolo).toBe(false);
    expect(state.originalPrompt).toBe("");
    expect(state.completionPromise).toBe(null);
    expect(state.maxIterations).toBe(0);
    expect(state.currentIteration).toBe(0);
  });

  test("activate sets state correctly with default promise", () => {
    ralphMode.activate("Test prompt", undefined, 5, false);

    const state = ralphMode.getState();
    expect(state.isActive).toBe(true);
    expect(state.isYolo).toBe(false);
    expect(state.originalPrompt).toBe("Test prompt");
    expect(state.completionPromise).toBe(DEFAULT_COMPLETION_PROMISE);
    expect(state.maxIterations).toBe(5);
    expect(state.currentIteration).toBe(1);
  });

  test("activate with custom promise", () => {
    const customPromise = "All tests are passing";
    ralphMode.activate("Test prompt", customPromise, 10, false);

    const state = ralphMode.getState();
    expect(state.isActive).toBe(true);
    expect(state.completionPromise).toBe(customPromise);
    expect(state.maxIterations).toBe(10);
  });

  test("activate with null promise (no promise check)", () => {
    ralphMode.activate("Test prompt", null, 0, false);

    const state = ralphMode.getState();
    expect(state.isActive).toBe(true);
    expect(state.completionPromise).toBe(null);
  });

  test("activate with empty string promise (no promise check)", () => {
    ralphMode.activate("Test prompt", "", 0, false);

    const state = ralphMode.getState();
    expect(state.isActive).toBe(true);
    expect(state.completionPromise).toBe(null);
  });

  test("activate with 'none' string (no promise check)", () => {
    ralphMode.activate("Test prompt", "none", 0, false);

    const state = ralphMode.getState();
    expect(state.isActive).toBe(true);
    expect(state.completionPromise).toBe(null);
  });

  test("activate with yolo mode", () => {
    ralphMode.activate("Test prompt", undefined, 0, true);

    const state = ralphMode.getState();
    expect(state.isActive).toBe(true);
    expect(state.isYolo).toBe(true);
  });

  test("deactivate resets state", () => {
    ralphMode.activate("Test prompt", "Custom promise", 5, true);
    ralphMode.deactivate();

    const state = ralphMode.getState();
    expect(state.isActive).toBe(false);
    expect(state.isYolo).toBe(false);
    expect(state.originalPrompt).toBe("");
    expect(state.completionPromise).toBe(null);
    expect(state.maxIterations).toBe(0);
    expect(state.currentIteration).toBe(0);
  });
});

// ============================================================================
// Ralph Mode: Iteration Management
// ============================================================================

describe("Ralph Mode - Iteration Management", () => {
  test("incrementIteration increases counter", () => {
    ralphMode.activate("Test prompt", undefined, 5, false);

    expect(ralphMode.getState().currentIteration).toBe(1);

    ralphMode.incrementIteration();
    expect(ralphMode.getState().currentIteration).toBe(2);

    ralphMode.incrementIteration();
    expect(ralphMode.getState().currentIteration).toBe(3);
  });

  test("shouldContinue returns true when active and under limit", () => {
    ralphMode.activate("Test prompt", undefined, 5, false);
    expect(ralphMode.shouldContinue()).toBe(true);
  });

  test("shouldContinue returns false when inactive", () => {
    expect(ralphMode.shouldContinue()).toBe(false);
  });

  test("shouldContinue returns false when max iterations reached", () => {
    ralphMode.activate("Test prompt", undefined, 3, false);

    expect(ralphMode.shouldContinue()).toBe(true);

    ralphMode.incrementIteration(); // 2
    expect(ralphMode.shouldContinue()).toBe(true);

    ralphMode.incrementIteration(); // 3
    expect(ralphMode.shouldContinue()).toBe(false);
  });

  test("shouldContinue returns true when unlimited iterations (0)", () => {
    ralphMode.activate("Test prompt", undefined, 0, false);

    for (let i = 0; i < 100; i++) {
      expect(ralphMode.shouldContinue()).toBe(true);
      ralphMode.incrementIteration();
    }
  });
});

// ============================================================================
// Ralph Mode: Promise Checking
// ============================================================================

describe("Ralph Mode - Promise Checking", () => {
  test("checkForPromise returns false when no promise set", () => {
    ralphMode.activate("Test prompt", null, 0, false);

    const text = "<promise>Some promise text</promise>";
    expect(ralphMode.checkForPromise(text)).toBe(false);
  });

  test("checkForPromise returns true for exact match", () => {
    const promise = "Task is complete";
    ralphMode.activate("Test prompt", promise, 0, false);

    const text = `Some text before\n<promise>${promise}</promise>\nSome text after`;
    expect(ralphMode.checkForPromise(text)).toBe(true);
  });

  test("checkForPromise handles whitespace normalization", () => {
    const promise = "Task is complete";
    ralphMode.activate("Test prompt", promise, 0, false);

    // Extra whitespace and newlines inside promise tags
    const text = `<promise>  Task   is\ncomplete  </promise>`;
    expect(ralphMode.checkForPromise(text)).toBe(true);
  });

  test("checkForPromise is case insensitive for tags", () => {
    const promise = "Task is complete";
    ralphMode.activate("Test prompt", promise, 0, false);

    const text1 = `<PROMISE>${promise}</PROMISE>`;
    expect(ralphMode.checkForPromise(text1)).toBe(true);

    const text2 = `<Promise>${promise}</Promise>`;
    expect(ralphMode.checkForPromise(text2)).toBe(true);
  });

  test("checkForPromise returns false for partial match", () => {
    const promise = "Task is complete";
    ralphMode.activate("Test prompt", promise, 0, false);

    const text = `<promise>Task is</promise>`;
    expect(ralphMode.checkForPromise(text)).toBe(false);
  });

  test("checkForPromise returns false for wrong promise", () => {
    const promise = "Task is complete";
    ralphMode.activate("Test prompt", promise, 0, false);

    const text = `<promise>Different promise text</promise>`;
    expect(ralphMode.checkForPromise(text)).toBe(false);
  });

  test("checkForPromise returns false when no promise tags", () => {
    const promise = "Task is complete";
    ralphMode.activate("Test prompt", promise, 0, false);

    const text = `Task is complete but not in tags`;
    expect(ralphMode.checkForPromise(text)).toBe(false);
  });

  test("checkForPromise handles multiline promise content", () => {
    const promise =
      "The task is complete. All requirements have been implemented and verified working.";
    ralphMode.activate("Test prompt", promise, 0, false);

    const text = `<promise>
The task is complete.
All requirements have been implemented and verified working.
</promise>`;
    expect(ralphMode.checkForPromise(text)).toBe(true);
  });

  test("checkForPromise uses first match when multiple promise tags", () => {
    const promise = "First promise";
    ralphMode.activate("Test prompt", promise, 0, false);

    const text = `<promise>First promise</promise>\n<promise>Second promise</promise>`;
    expect(ralphMode.checkForPromise(text)).toBe(true);
  });
});

// ============================================================================
// Ralph Mode: State Persistence (Singleton)
// ============================================================================

describe("Ralph Mode - State Persistence", () => {
  test("state persists across multiple getState calls", () => {
    ralphMode.activate("Test prompt", "Custom promise", 5, false);

    const state1 = ralphMode.getState();
    const state2 = ralphMode.getState();

    expect(state1).toEqual(state2);
    expect(state1.originalPrompt).toBe("Test prompt");
    expect(state2.originalPrompt).toBe("Test prompt");
  });

  test("state changes are visible immediately", () => {
    ralphMode.activate("Test prompt", undefined, 5, false);
    expect(ralphMode.getState().currentIteration).toBe(1);

    ralphMode.incrementIteration();
    expect(ralphMode.getState().currentIteration).toBe(2);

    ralphMode.incrementIteration();
    expect(ralphMode.getState().currentIteration).toBe(3);
  });
});

// ============================================================================
// Ralph Mode: Edge Cases
// ============================================================================

describe("Ralph Mode - Edge Cases", () => {
  test("activate can be called multiple times (overwrite)", () => {
    ralphMode.activate("First prompt", "First promise", 5, false);
    const state1 = ralphMode.getState();
    expect(state1.originalPrompt).toBe("First prompt");
    expect(state1.completionPromise).toBe("First promise");

    ralphMode.activate("Second prompt", "Second promise", 10, true);
    const state2 = ralphMode.getState();
    expect(state2.originalPrompt).toBe("Second prompt");
    expect(state2.completionPromise).toBe("Second promise");
    expect(state2.maxIterations).toBe(10);
    expect(state2.isYolo).toBe(true);
  });

  test("incrementIteration works when inactive", () => {
    // Should not throw, just increment the counter
    expect(() => ralphMode.incrementIteration()).not.toThrow();
    expect(ralphMode.getState().currentIteration).toBe(1);
  });

  test("checkForPromise with malformed promise tags", () => {
    const promise = "Task complete";
    ralphMode.activate("Test prompt", promise, 0, false);

    // Missing closing tag
    const text1 = `<promise>${promise}`;
    expect(ralphMode.checkForPromise(text1)).toBe(false);

    // Missing opening tag
    const text2 = `${promise}</promise>`;
    expect(ralphMode.checkForPromise(text2)).toBe(false);

    // Self-closing tag
    const text3 = `<promise />`;
    expect(ralphMode.checkForPromise(text3)).toBe(false);
  });

  test("shouldContinue with negative iterations treated as unlimited", () => {
    ralphMode.activate("Test prompt", undefined, -1, false);

    // Negative should be treated same as 0 (unlimited)
    // Based on code: maxIterations > 0 check means negative = unlimited
    for (let i = 0; i < 10; i++) {
      expect(ralphMode.shouldContinue()).toBe(true);
      ralphMode.incrementIteration();
    }
  });

  test("empty promise string after normalization", () => {
    ralphMode.activate("Test prompt", "   ", 0, false);

    // Should be normalized but not set to null
    const state = ralphMode.getState();
    const text = "<promise>   </promise>";
    // This would match because both are normalized to empty
    expect(ralphMode.checkForPromise(text)).toBe(true);
  });
});

// ============================================================================
// Ralph Mode: Default Completion Promise
// ============================================================================

describe("Ralph Mode - Default Completion Promise", () => {
  test("DEFAULT_COMPLETION_PROMISE is well-formed", () => {
    expect(DEFAULT_COMPLETION_PROMISE).toBeDefined();
    expect(typeof DEFAULT_COMPLETION_PROMISE).toBe("string");
    expect(DEFAULT_COMPLETION_PROMISE.length).toBeGreaterThan(0);

    // Should contain key phrases
    expect(DEFAULT_COMPLETION_PROMISE).toContain("task is complete");
    expect(DEFAULT_COMPLETION_PROMISE).toContain("requirements");
    expect(DEFAULT_COMPLETION_PROMISE).toContain("production-ready");
  });

  test("undefined promise uses DEFAULT_COMPLETION_PROMISE", () => {
    ralphMode.activate("Test prompt", undefined, 0, false);

    const state = ralphMode.getState();
    expect(state.completionPromise).toBe(DEFAULT_COMPLETION_PROMISE);
  });
});
