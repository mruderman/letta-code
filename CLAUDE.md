# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Letta Code is a CLI tool for interacting with stateful Letta AI agents from the terminal. Unlike session-based coding assistants, Letta Code maintains persistent agents that learn over time and are portable across different LLM models (Claude, GPT, Gemini, GLM, etc.).

## Tech Stack

- **Runtime**: Bun (preferred over Node.js - use `bun <file>` instead of `node <file>`)
- **Language**: TypeScript (ESNext target, strict mode)
- **UI Framework**: Ink (React for CLI/TUI)
- **Build**: Bun's native bundler
- **Linting/Formatting**: Biome (2-space indents, recommended rules)
- **Testing**: Bun test runner

## Development Commands

```bash
# Install dependencies
bun install

# Development (run from TypeScript sources)
bun run dev
bun run dev -- -p "Hello world"  # with arguments

# Build the standalone binary
bun run build

# Linting & formatting
bun run lint       # Check code with Biome
bun run fix        # Auto-fix issues with Biome

# Type checking
bun run typecheck  # TypeScript type checking

# Full check (lint + typecheck)
bun run check

# Run tests
bun test
```

## Architecture

### Entry Points

- **`src/index.ts`**: Main entry point - parses CLI args, handles modes (interactive TUI, headless, info, update), manages agent selection
- **`src/headless.ts`**: Headless mode implementation with JSON/streamable output

### Key Directories

- **`src/cli/`**: React/Ink TUI components
  - `App.tsx` - Main TUI application
  - `commands/` - CLI slash commands
  - `components/` - Reusable UI components
  - `hooks/` - React hooks
  - `helpers/` - Streaming, formatting utilities

- **`src/agent/`**: Agent lifecycle & management
  - `client.ts` - Letta API client initialization
  - `create.ts` - Agent creation logic
  - `skills.ts` - Skill discovery & management
  - `subagents/` - Subagent configurations

- **`src/tools/`**: Tool implementations
  - `impl/` - Individual tool implementations (Bash, Read, Edit, Glob, Grep, Write, etc.)
  - `manager.ts` - Tool loading & management
  - `toolDefinitions.ts` - Tool schemas
  - `toolset.ts` - Model-specific toolsets (Anthropic, OpenAI/Codex, Gemini)

- **`src/permissions/`**: Permission system
  - `checker.ts` - Permission validation
  - `analyzer.ts` - Static analysis for permissions
  - `mode.ts` - Permission modes (default, plan, bypass)

- **`src/auth/`**: OAuth 2.0 Device Code Flow authentication
- **`src/settings-manager.ts`**: Global/local settings management
- **`src/skills/`**: Bundled skills and skill learning

### Tools System

Tools are the primary way agents interact with the codebase. Each tool:
- Returns `{ toolReturn, status, stdout?, stderr? }`
- Requires permission checks before execution
- Has model-specific implementations via toolsets

Available tools include: Bash, Read, Write, Edit, Glob, Grep, Task, TodoWrite, AskUserQuestion, and more.

### Skills System

Skills are extensible capabilities discovered from 3 sources (priority order):
1. Project skills: `.skills/` in current project
2. Global skills: `~/.letta/skills/`
3. Bundled skills: `src/skills/builtin/`

Skills are formatted into the agent's memory as markdown with frontmatter metadata.

### Permissions

- **Modes**: `default`, `acceptEdits`, `plan`, `bypassPermissions` (--yolo flag)
- The permission system uses static analysis to determine if tools modify state
- Session-level permission state is tracked throughout the conversation

## Build Process

The `build.js` script:
1. Bundles TypeScript sources into `letta.js` using Bun's bundler
2. Adds shebang for executable permission
3. Copies bundled skills to `skills/` directory
4. Generates type declarations for protocol exports

## Configuration

- **`tsconfig.json`**: TypeScript configuration (ESNext, strict mode)
- **`biome.json`**: Linting and formatting rules
- **`bunfig.toml`**: Bun configuration
- **Global settings**: `~/.config/letta/settings.json`
- **Local project settings**: `.letta/settings.local.json`

## Environment Variables

- `LETTA_API_KEY`: API key for Letta Cloud
- `LETTA_BASE_URL`: Self-hosted Letta server URL
- `LETTA_DEBUG_TIMINGS`: Enable request timing diagnostics
