# Task: Add Command-Line Flags to Start letta-code in Ralph Mode

You are implementing a feature for letta-code (github.com/letta-ai/letta-code) that adds CLI flags to start the application directly in Ralph mode, bypassing the need to enter the TUI first.

## References and resources outside this repo:
- Context7 MCP server tools for the letta-ai/letta-code repository
- Sequential thinking MCP server tools to facilitate planning, task management, and debugging.

## IMPORTANT: Build System

This project uses **Bun**, not npm/node. All commands use:
- `bun install` (not npm install)
- `bun run <script>` (not npm run)
- `bun test` (not npm test)
- `bun <file.ts>` (not ts-node or node)

## Phase 0: Repository Setup and Discovery

Before ANY implementation, you MUST complete these steps:

### 0.1 Clone the Repository
```bash
# git clone https://github.com/letta-ai/letta-code.git # Should already be cloned
# cd letta-code # Should already be in the working directory
bun install
```
### 0.2 Discover Build Scripts
```bash
cat package.json | grep -A 50 '"scripts"'
```
Document the actual script names in `IMPLEMENTATION_NOTES.md`:
- [ ] Build script name (e.g., `build`, `compile`, etc.)
- [ ] Test script name (e.g., `test`, `test:unit`, etc.)
- [ ] Type check script (if exists)
- [ ] Lint script (if exists)

### 0.3 Understand Ralph Mode Implementation
Read these files IN ORDER and document your findings:
```bash
# 1. How CLI args are currently parsed
cat src/index.ts

# 2. How headless mode works (pattern to follow)
cat src/headless.ts

# 3. How Ralph mode currently works in TUI
cat src/ralph/mode.ts

# 4. Any related Ralph files
find src -name "*ralph*" -type f
```

Create `IMPLEMENTATION_NOTES.md` with:
- Current CLI argument parsing approach
- How headless mode initializes and runs
- What Ralph mode needs: prompt, completion promise, max iterations, yolo flag
- Which functions/exports from ralph/mode.ts you'll reuse

**DO NOT PROCEED TO PHASE 1 UNTIL PHASE 0 IS COMPLETE**

## Requirements

### New CLI Flags
- `--ralph <prompt>` - Start in Ralph mode with given prompt
- `--yolo-ralph <prompt>` - Start in yolo-ralph mode (bypasses permissions)
- `--completion-promise <text>` - Optional completion promise (use existing default if omitted)
- `--max-iterations <n>` - Optional max iterations (0 or omit = unlimited)

### Behavior
- Flags must work standalone: `letta --ralph "task"`
- Flags must combine with existing flags: `letta --ralph "task" --agent <id>`
- `--yolo-ralph` and `--ralph` are mutually exclusive
- `--completion-promise` and `--max-iterations` require `--ralph` or `--yolo-ralph`
- Exit codes: 0 on completion promise match, 1 on max-iterations reached, 2 on error

## Phase 1: Add CLI Argument Parsing

Based on your Phase 0 findings:
- [ ] Add `--ralph`, `--yolo-ralph`, `--completion-promise`, `--max-iterations` to argument parser
- [ ] Match the existing argument parsing style in src/index.ts
- [ ] Add validation: mutual exclusivity, dependency checks
- [ ] Add help text for new flags
- [ ] Write unit tests for argument parsing (follow existing test patterns)

## Phase 2: Implement Ralph CLI Entry Point

- [ ] Create CLI-triggered Ralph mode handler (location based on existing patterns)
- [ ] Wire CLI args to Ralph mode initialization
- [ ] Reuse existing Ralph mode logic from src/ralph/mode.ts
- [ ] Ensure proper exit code handling
- [ ] Handle SIGINT/SIGTERM gracefully

## Phase 3: Integration and Testing

- [ ] Write integration tests for CLI Ralph mode
- [ ] Test flag combinations work correctly
- [ ] Test error cases (invalid args, missing prompt)
- [ ] Verify existing functionality unchanged (regression)

## Phase 4: Documentation and Cleanup

- [ ] Update README with new CLI flags
- [ ] Add usage examples
- [ ] Ensure code style matches project conventions
- [ ] Remove any debug/temporary code

## Verification Checklist

Run verification using the ACTUAL scripts you discovered in Phase 0:
```bash
# Replace <build-script>, <test-script>, etc. with actual names from package.json

# Build succeeds
bun run <build-script>

# Tests pass  
bun run <test-script>

# Type checking (if script exists)
bun run <typecheck-script>

# Lint (if script exists)
bun run <lint-script>

# Manual verification
./dist/letta --help | grep -q "ralph" || bun run src/index.ts --help | grep -q "ralph"
```

## Self-Correction Protocol

After each phase:
1. Run applicable verification checks
2. If any check fails, debug and fix before proceeding
3. Read your own `IMPLEMENTATION_NOTES.md` to maintain context
4. Update notes with blockers or decisions made
5. Commit working changes with descriptive messages

## If Stuck After 15 Iterations

If you cannot complete the task:
1. Document in `BLOCKED.md`:
   - What phase you're stuck on
   - Specific error messages
   - What approaches you've tried
   - Root cause analysis
   - Suggested alternative approaches or questions for maintainers
2. Commit all work-in-progress with `git add -A && git commit -m "WIP: Ralph CLI - blocked at phase X"`
3. Output: <promise>BLOCKED</promise>

## Completion Criteria

All of the following must be true:
- [ ] Phase 0 complete with documented findings
- [ ] All subsequent phases completed
- [ ] Build succeeds (using actual project build command)
- [ ] Tests pass (using actual project test command)
- [ ] `--ralph` flag works end-to-end
- [ ] `--yolo-ralph` flag works end-to-end
- [ ] Combined flags work (e.g., `--ralph "x" --max-iterations 5`)
- [ ] Exit codes correct
- [ ] Changes committed to git

When ALL criteria met, output: <promise>RALPH_CLI_COMPLETE</promise>