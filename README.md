# Agent

A command-line AI agent tool built with Bun and Claude 3 Sonnet that provides an interactive interface for executing various tasks through natural language commands.

## Features

- **AI-Powered Command Execution**: Uses Anthropic's Claude 3 Sonnet model to interpret and execute commands
- **Permission-Based Security**: Asks for permission before executing potentially dangerous operations
- **Built-in Tools**:
  - `agent`: Runs sub-agents for complex, multi-step tasks
  - `bash`: Executes shell commands with permission controls
  - `glob`: Finds files based on pattern matching
  - `grep`: Searches for patterns in file contents
  - `ls`: Lists files and directories
  - `file_read`: Reads the contents of files
  - `file_edit`: Makes targeted edits to specific files
  - `file_write`: Creates or overwrites files

## Installation

To install dependencies:

```bash
bun install
```

## Usage

Run the agent with a prompt:

```bash
bun run index.ts "your prompt here"
```

Or use the dev script:

```bash
bun dev "your prompt here"
```

## Compilation

You can compile the agent to a standalone binary:

```bash
bun compile
```

This will create an executable file named `agent` that you can run directly.

## Dependencies

- `@ai-sdk/anthropic`: Integration with Anthropic's Claude models
- `ai`: Core AI functionality and tools
- `yocto-spinner`: Terminal spinner for visual feedback
- `yoctocolors`: Terminal color formatting
- `zod`: Schema validation for tool parameters

## Environment Variables

- `YOLO`: If set, bypasses permission prompts (use with caution)

## Development

This project was created using `bun init` in bun v1.2.4. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

