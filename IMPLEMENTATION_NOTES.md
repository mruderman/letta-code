# Ralph CLI Mode Implementation Notes

## Project Build Scripts (from package.json)

- **Build script**: `bun run build` (runs `node scripts/postinstall-patches.js && bun run build.js`)
- **Test script**: `bun test` (Bun test runner)
- **Type check script**: `bun run typecheck` (runs `tsc --noEmit`)
- **Lint script**: `bun run lint` (runs Biome check)
- **Fix script**: `bun run fix` (runs Biome check --write)
- **Check script**: `bun run check` (runs combined check script)
- **Dev script**: `bun run dev` (runs TypeScript sources directly with Bun)

## Current CLI Argument Parsing Approach

The project uses Node.js's built-in `parseArgs` utility (from `node:util`) for CLI argument parsing.

**Location**: `src/index.ts` lines 326-361

**Current flags** (excerpt from index.ts):
```typescript
const parsed = parseArgs({
  args: process.argv,
  options: {
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
    info: { type: "boolean" },
    continue: { type: "boolean", short: "c" },
    new: { type: "boolean" },
    agent: { type: "string", short: "a" },
    model: { type: "string", short: "m" },
    prompt: { type: "boolean", short: "p" },
    yolo: { type: "boolean" },
    // ... and more
  },
  strict: true,
  allowPositionals: true,
});
```

**Entry point flow**:
1. `src/index.ts` is the main entry point (shebang: `#!/usr/bin/env bun`)
2. Parse CLI args with `parseArgs()`
3. Determine mode: interactive TUI vs headless (`isHeadless = values.prompt || values.run || !process.stdin.isTTY`)
4. If headless: call `handleHeadlessCommand()` from `src/headless.ts`
5. If interactive: render React/Ink TUI from `src/cli/App.tsx`

## How Headless Mode Works

**Location**: `src/headless.ts`

**Entry point**: `handleHeadlessCommand(argv, model, skillsDirectory)`

**Key characteristics**:
1. Re-parses args (to filter out flags already processed in index.ts)
2. Gets prompt from positional args or stdin
3. Creates/resumes agent using same logic as interactive mode
4. Sends message and processes stream
5. Outputs result in text/json/stream-json format
6. Exits after completion

**What Ralph mode needs to reuse**:
- Agent creation/resume logic (lines 169-400)
- Model resolution
- Permission handling
- Message sending via `sendMessageStream()`
- Stream processing and result extraction

## Ralph Mode Implementation

### Location
- **State management**: `src/ralph/mode.ts`
- **TUI integration**: `src/cli/App.tsx` (lines 360+ for command parsing, 3239+ for activation)
- **Slash command registry**: `src/cli/commands/registry.ts` (lines 291-306)

### RalphModeManager (src/ralph/mode.ts)

**Exports**:
- `ralphMode` - singleton instance
- `DEFAULT_COMPLETION_PROMISE` - default promise text

**Key methods**:
```typescript
class RalphModeManager {
  activate(
    prompt: string,
    completionPromise: string | null | undefined,  // undefined=use default, null=no check
    maxIterations: number,  // 0 = unlimited
    isYolo: boolean
  ): void;

  deactivate(): void;
  getState(): RalphState;
  incrementIteration(): void;
  checkForPromise(text: string): boolean;
  shouldContinue(): boolean;
}
```

**State structure**:
```typescript
type RalphState = {
  isActive: boolean;
  isYolo: boolean;
  originalPrompt: string;
  completionPromise: string | null;
  maxIterations: number;
  currentIteration: number;
};
```

### Current TUI Activation (from App.tsx)

1. User types `/ralph` or `/yolo-ralph` command (with optional args)
2. `parseRalphArgs()` extracts:
   - `prompt` - inline task description (optional, can be provided after slash command)
   - `completionPromise` - from `--completion-promise "text"` flag
   - `maxIterations` - from `--max-iterations N` flag
3. `ralphMode.activate()` is called
4. If yolo mode, `permissionMode.setMode("bypassPermissions")` is set
5. Agent receives message with Ralph reminder prepended

### Ralph Reminders (from App.tsx)

**First turn reminder** (`buildRalphFirstTurnReminder`):
- Shows iteration info (e.g., "iteration 1/30" or "iteration 1" for unlimited)
- Shows completion promise block if set
- Warns about truthfulness requirements

**Continuation reminder** (`buildRalphContinuationReminder`):
- Shorter format for subsequent iterations
- Shows current iteration number
- References previous work in files/git history

## Implementation Plan for CLI Ralph Flags

### New CLI Flags to Add

1. `--ralph <prompt>` - Start in Ralph mode with given prompt
2. `--yolo-ralph <prompt>` - Start in yolo-ralph mode (bypasses permissions)
3. `--completion-promise <text>` - Optional completion promise (use default if omitted)
4. `--max-iterations <n>` - Optional max iterations (0 or omit = unlimited)

### Validation Rules

1. `--ralph` and `--yolo-ralph` are mutually exclusive
2. `--completion-promise` and `--max-iterations` require `--ralph` or `--yolo-ralph`
3. Prompt is required for `--ralph` and `--yolo-ralph`

### Exit Codes

- `0` - Completion promise matched
- `1` - Max iterations reached
- `2` - Error occurred

### Implementation Location

Create new file: `src/ralph/cli.ts` - Ralph CLI mode handler

**Pattern to follow**: Similar to `src/headless.ts` but with Ralph loop logic

### Key Functions to Reuse

From `src/ralph/mode.ts`:
- `ralphMode.activate()`
- `ralphMode.checkForPromise()`
- `ralphMode.shouldContinue()`
- `ralphMode.incrementIteration()`
- `ralphMode.deactivate()`

From `src/agent/`:
- `getClient()`
- `createAgent()`
- `sendMessageStream()`
- Permission system integration

### Ralph Loop Logic

1. Activate Ralph mode with provided config
2. Create/resume agent (reusing headless.ts logic)
3. Loop:
   - Build message with Ralph reminder + original prompt
   - Send to agent
   - Process stream
   - Check for promise in assistant response
   - If promise found: exit 0
   - Check iteration limit
   - If max reached: exit 1
   - Increment iteration
   - Continue loop

## Files to Modify

1. **src/index.ts** - Add CLI flag parsing and validation
2. **src/ralph/cli.ts** - New file for Ralph CLI mode handler
3. **README.md** - Add documentation for new flags

## Functions to Export from ralph/cli.ts

```typescript
export async function handleRalphCommand(
  prompt: string,
  completionPromise: string | null | undefined,
  maxIterations: number,
  isYolo: boolean,
  model?: string,
  skillsDirectory?: string,
): Promise<number>;  // Returns exit code
```

## Testing Strategy

1. Unit tests for argument parsing validation
2. Integration tests for CLI flag combinations
3. Manual testing of loop behavior with iteration limits
4. Test exit codes for all scenarios
